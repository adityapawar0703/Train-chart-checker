const { v4: uuidv4 } = require("uuid");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });
require("dotenv").config();
const { isChartPrepared } = require("./irctcService");
const {
  sendChartPreparedEmail,
  sendIRCTCServerErrorEmail,
} = require("./resendService");

// Normal check interval when IRCTC website is working normally: default 8 minutes (480,000 ms)
const NORMAL_CHECK_INTERVAL_MS = Number(process.env.CHECK_INTERVAL_MS || 8 * 60 * 1000);

// Error retry interval when IRCTC website returns error or takes too long: 15 minutes (900,000 ms)
const ERROR_RETRY_INTERVAL_MS = Number(process.env.ERROR_RETRY_INTERVAL_MS || 15 * 60 * 1000);

// Maximum continuous error duration before sending error email alert: 1 hour (3,600,000 ms)
const MAX_ERROR_WINDOW_MS = Number(process.env.MAX_ERROR_WINDOW_MS || 60 * 60 * 1000);

/**
 * In-memory task repository.
 * Key: Task ID (UUID)
 * Value: Task object
 *
 * NOTE (Database-free Architecture Limitation):
 * All active and past tasks are held in Node.js process memory.
 * If the server restarts or shuts down, in-memory tasks are wiped.
 */
const taskMap = new Map();

/**
 * Calculates the monitoring start time.
 * IRCTC charts are typically prepared 4 hours before train departure.
 * Monitoring is scheduled to start ~30 minutes before that (4.5 hours before departure).
 * 
 * If the journey date is today and within or past the window, returns now (immediate).
 * If the journey date is in the future, calculates 4.5 hours before the train date/time.
 */
function calculateMonitoringStartTime(journeyDate, departureTimeStr = "08:00") {
  const now = new Date();
  
  // Parse journeyDate (YYYY-MM-DD)
  const [year, month, day] = journeyDate.split("-").map(Number);
  const [hours, minutes] = departureTimeStr.split(":").map(Number);

  // Approximate departure datetime in local time
  const departureDate = new Date(year, month - 1, day, hours, minutes, 0, 0);

  // Chart preparation happens ~4 hours before departure;
  // monitoring starts 30 minutes before chart preparation (4.5 hours before departure).
  const preChartWindowMs = (4 * 60 + 30) * 60 * 1000;
  const targetStartTime = new Date(departureDate.getTime() - preChartWindowMs);

  // If the target start time has already passed or is within 1 minute from now, start immediately
  if (targetStartTime.getTime() <= now.getTime()) {
    return now;
  }

  return targetStartTime;
}

/**
 * Finds an existing active or scheduled task matching the same parameters to prevent duplicates.
 */
function findDuplicateTask(trainNo, boardingStation, journeyDate, email) {
  const cleanTrain = String(trainNo).trim();
  const cleanStation = String(boardingStation).trim().toUpperCase();
  const cleanDate = String(journeyDate).trim();
  const cleanEmail = String(email).trim().toLowerCase();

  for (const task of taskMap.values()) {
    if (
      task.trainNo === cleanTrain &&
      task.boardingStation === cleanStation &&
      task.journeyDate === cleanDate &&
      task.email === cleanEmail &&
      ["scheduled", "active", "checking"].includes(task.taskStatus)
    ) {
      return task;
    }
  }
  return null;
}

/**
 * Formats a task for public API responses, excluding internal timer references.
 */
function sanitizeTask(task) {
  if (!task) return null;
  const { timerRef, ...safeTask } = task;
  return safeTask;
}

/**
 * Executes a single chart preparation check for a task.
 * 
 * Reliability & Error-Handling Rules:
 * 1. If IRCTC is working normally:
 *    - If chart prepared -> send prepared email immediately, mark completed, stop checks.
 *    - If not prepared -> schedule next check in 8 minutes.
 * 2. If IRCTC website returns an error, times out, or returns an empty response:
 *    - Does NOT send an error email immediately.
 *    - Enters a 15-minute retry loop.
 *    - Keeps checking every 15 minutes until IRCTC recovers.
 *    - If IRCTC remains broken/unresponsive for 1 full hour (60 minutes):
 *      - Marks task as 'failed'.
 *      - Dispatches the IRCTC Server Error email alert to the user.
 *      - Stops further monitoring.
 */
async function performCheck(taskId) {
  const task = taskMap.get(taskId);
  if (!task) return;

  // If the task was stopped, completed, or failed, do not execute
  if (task.taskStatus === "stopped" || task.taskStatus === "completed" || task.taskStatus === "failed") {
    return;
  }

  task.taskStatus = "checking";
  task.displayStatus = "Checking chart preparation status.";
  task.lastCheckedTime = new Date().toISOString();
  task.checkCount = (task.checkCount || 0) + 1;

  console.log(
    `[taskManager] Checking IRCTC chart status for task ${taskId} (Train: ${task.trainNo}, Station: ${task.boardingStation}, Check #${task.checkCount})...`
  );

  let result = null;
  let checkError = null;

  try {
    result = await isChartPrepared(task.trainNo, task.journeyDate, task.boardingStation);

    // Validate result has actual data
    if (!result || !result.raw) {
      throw new Error("IRCTC chart website returned an empty response.");
    }
  } catch (err) {
    checkError = err;
  }

  // Safeguard: Check if task was stopped while async request was awaiting
  if (task.taskStatus === "stopped" || task.taskStatus === "completed") {
    return;
  }

  // --- CASE 1: IRCTC website returned an error, timed out, or returned no data ---
  if (checkError) {
    console.warn(`[taskManager] IRCTC check failed for task ${taskId}:`, checkError.message);
    const now = Date.now();

    // Mark when the continuous outage started
    if (!task.firstErrorAt) {
      task.firstErrorAt = now;
    }

    task.errorCheckCount = (task.errorCheckCount || 0) + 1;
    task.lastError = checkError.message;
    const elapsedErrorMs = now - task.firstErrorAt;
    const elapsedMinutes = Math.floor(elapsedErrorMs / (60 * 1000));

    console.log(
      `[taskManager] IRCTC error active for ${elapsedMinutes} min(s) (1-hour max threshold before alerting).`
    );

    // Check if website has been continuously failing for >= 1 hour (60 minutes)
    if (elapsedErrorMs >= MAX_ERROR_WINDOW_MS) {
      console.error(
        `[taskManager] IRCTC website has been down/unresponsive for 1 hour. Marking task ${taskId} as failed.`
      );
      task.taskStatus = "failed";
      task.displayStatus = "Monitoring failed: IRCTC website was unavailable for 1 hour.";
      task.nextScheduledCheckTime = null;

      if (task.timerRef) {
        clearTimeout(task.timerRef);
        task.timerRef = null;
      }

      // Send error alert email now that 1 full hour has elapsed
      if (!task.errorEmailSent) {
        try {
          console.log(`[taskManager] Sending 1-hour IRCTC outage email notification to ${task.email}...`);
          await sendIRCTCServerErrorEmail({
            email: task.email,
            trainNo: task.trainNo,
            journeyDate: task.journeyDate,
            boardingStation: task.boardingStation,
            errorMessage: checkError.message,
          });
          task.errorEmailSent = true;
          task.displayStatus = "Monitoring failed: IRCTC down for 1 hour (server error email sent).";
        } catch (emailErr) {
          console.error(`[taskManager] Failed to send error email:`, emailErr.message);
        }
      }
      return;
    }

    // Within the 1-hour window: Keep task active and retry after 15 minutes!
    task.taskStatus = "active";
    task.displayStatus = `IRCTC website slow/error. Retrying in 15 minutes (${elapsedMinutes}m / 60m).`;
    console.log(
      `[taskManager] Scheduling 15-minute retry for task ${taskId} (${elapsedMinutes}m elapsed of 60m threshold).`
    );
    scheduleNextCheck(taskId, ERROR_RETRY_INTERVAL_MS);
    return;
  }

  // --- CASE 2: IRCTC website responded successfully ---
  // If IRCTC was previously down and has recovered:
  if (task.firstErrorAt) {
    console.log(
      `[taskManager] IRCTC website has recovered for task ${taskId}! Resuming normal 8-minute monitoring schedule.`
    );
    task.firstErrorAt = null;
    task.errorCheckCount = 0;
    task.lastError = null;
  }

  // If chart is prepared:
  if (result.prepared) {
    console.log(`[taskManager] Chart IS PREPARED for train ${task.trainNo}!`);
    task.chartPrepared = true;
    task.displayStatus = "Chart prepared successfully.";

    // Clear any pending timer
    if (task.timerRef) {
      clearTimeout(task.timerRef);
      task.timerRef = null;
    }

    // Send email notification immediately
    if (task.emailNotificationStatus !== "sent") {
      try {
        console.log(`[taskManager] Sending email notification to ${task.email}...`);
        const emailRes = await sendChartPreparedEmail({
          email: task.email,
          trainNo: task.trainNo,
          journeyDate: task.journeyDate,
          boardingStation: task.boardingStation,
        });

        task.emailNotificationStatus = "sent";
        task.emailResult = emailRes;
        task.taskStatus = "completed";
        task.displayStatus = "Email notification sent.";
        task.completedAt = new Date().toISOString();
        task.nextScheduledCheckTime = null;
        console.log(`[taskManager] Task ${taskId} marked as COMPLETED.`);
      } catch (emailErr) {
        console.error(`[taskManager] Failed to send email for task ${taskId}:`, emailErr.message);
        task.emailNotificationStatus = "failed";
        task.emailError = emailErr.message;
        task.taskStatus = "completed";
        task.displayStatus = "Chart prepared successfully (Email delivery issue).";
        task.completedAt = new Date().toISOString();
        task.nextScheduledCheckTime = null;
      }
    }
    return;
  }

  // Chart is not prepared yet: schedule next check at standard 8-minute interval
  task.chartPrepared = false;
  task.taskStatus = "active";
  task.displayStatus = "Chart not prepared yet.";
  scheduleNextCheck(taskId, NORMAL_CHECK_INTERVAL_MS);
}

/**
 * Schedules the next check after a delay (default 8 minutes).
 */
function scheduleNextCheck(taskId, delayMs) {
  const task = taskMap.get(taskId);
  if (!task || task.taskStatus === "stopped" || task.taskStatus === "completed") {
    return;
  }

  if (task.timerRef) {
    clearTimeout(task.timerRef);
  }

  const nextCheck = new Date(Date.now() + delayMs);
  task.nextScheduledCheckTime = nextCheck.toISOString();

  task.timerRef = setTimeout(() => {
    performCheck(taskId);
  }, delayMs);

  console.log(
    `[taskManager] Next check for task ${taskId} scheduled at ${nextCheck.toLocaleTimeString()} (in ${Math.round(
      delayMs / 1000 / 60
    )} minutes).`
  );
}

/**
 * Creates and registers a new monitoring task.
 */
function createMonitoringTask({ trainNo, stationCode, journeyDate, email, departureTime }) {
  const cleanTrain = String(trainNo).trim();
  const cleanStation = String(stationCode).trim().toUpperCase();
  const cleanDate = String(journeyDate).trim();
  const cleanEmail = String(email).trim().toLowerCase();

  // Prevent duplicates
  const existing = findDuplicateTask(cleanTrain, cleanStation, cleanDate, cleanEmail);
  if (existing) {
    console.log(`[taskManager] Duplicate task detected. Reusing existing task: ${existing.id}`);
    return { task: sanitizeTask(existing), isDuplicate: true };
  }

  const id = uuidv4();
  const now = new Date();
  const startTime = calculateMonitoringStartTime(cleanDate, departureTime || "08:00");
  const delayUntilStartMs = Math.max(0, startTime.getTime() - now.getTime());

  const task = {
    id,
    trainNo: cleanTrain,
    boardingStation: cleanStation,
    stationCode: cleanStation,
    journeyDate: cleanDate,
    email: cleanEmail,
    taskStatus: delayUntilStartMs > 0 ? "scheduled" : "active",
    displayStatus: delayUntilStartMs > 0 ? "Waiting for monitoring to start." : "Monitoring active.",
    chartPrepared: false,
    monitoringStartTime: startTime.toISOString(),
    lastCheckedTime: null,
    nextScheduledCheckTime: null,
    emailNotificationStatus: "pending",
    emailError: null,
    firstErrorAt: null,
    lastError: null,
    errorCheckCount: 0,
    errorEmailSent: false,
    checkCount: 0,
    createdAt: now.toISOString(),
    timerRef: null,
  };

  taskMap.set(id, task);
  console.log(`[taskManager] Task ${id} created for Train ${cleanTrain} on ${cleanDate} at ${cleanStation}.`);

  if (delayUntilStartMs > 0) {
    // Schedule monitoring to begin at monitoringStartTime
    console.log(
      `[taskManager] Task ${id} scheduled to start at ${startTime.toLocaleTimeString()} (in ${Math.round(
        delayUntilStartMs / 1000 / 60
      )} mins).`
    );
    task.nextScheduledCheckTime = startTime.toISOString();
    task.timerRef = setTimeout(() => {
      task.taskStatus = "active";
      task.displayStatus = "Monitoring active.";
      performCheck(id);
    }, delayUntilStartMs);
  } else {
    // Start monitoring immediately
    task.taskStatus = "active";
    task.displayStatus = "Monitoring active.";
    // Immediate first check
    performCheck(id);
  }

  return { task: sanitizeTask(task), isDuplicate: false };
}

/**
 * Gets a task by ID.
 */
function getTask(id) {
  const task = taskMap.get(id);
  return task ? sanitizeTask(task) : null;
}

/**
 * Gets all tasks in memory.
 */
function getAllTasks() {
  const tasks = [];
  for (const task of taskMap.values()) {
    tasks.push(sanitizeTask(task));
  }
  // Sort latest first
  tasks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return tasks;
}

/**
 * Stops an active monitoring task manually.
 */
function stopTask(id) {
  const task = taskMap.get(id);
  if (!task) return null;

  if (task.timerRef) {
    clearTimeout(task.timerRef);
    task.timerRef = null;
  }

  task.taskStatus = "stopped";
  task.displayStatus = "Monitoring stopped.";
  task.stoppedAt = new Date().toISOString();
  task.nextScheduledCheckTime = null;

  console.log(`[taskManager] Task ${id} has been manually stopped.`);
  return sanitizeTask(task);
}

/**
 * Clears all timers upon server shutdown to prevent memory leaks or hanging processes.
 */
function cleanupAllTimers() {
  console.log(`[taskManager] Cleaning up all in-memory timers...`);
  for (const task of taskMap.values()) {
    if (task.timerRef) {
      clearTimeout(task.timerRef);
      task.timerRef = null;
    }
  }
}

module.exports = {
  createMonitoringTask,
  getTask,
  getAllTasks,
  stopTask,
  performCheck,
  cleanupAllTimers,
  taskMap,
};
