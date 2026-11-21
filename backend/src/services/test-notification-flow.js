process.env.MOCK_IRCTC = "true";
process.env.MOCK_CHART_PREPARED = "true";

const {
  createMonitoringTask,
  getTask,
  cleanupAllTimers,
} = require("./taskManager");

async function testChartPreparedFlow() {
  console.log("=== TESTING CHART PREPARED & NOTIFICATION FLOW ===");

  const { task } = createMonitoringTask({
    trainNo: "12951",
    stationCode: "NDLS",
    journeyDate: new Date().toISOString().split("T")[0],
    email: "passenger@example.com",
  });

  console.log(`Created Task ${task.id}`);

  // Allow async performCheck and sendChartPreparedEmail to complete
  await new Promise((resolve) => setTimeout(resolve, 100));

  const completedTask = getTask(task.id);
  console.log(`Task Status: ${completedTask.taskStatus}`);
  console.log(`Display Status: ${completedTask.displayStatus}`);
  console.log(`Chart Prepared: ${completedTask.chartPrepared}`);
  console.log(`Email Notification Status: ${completedTask.emailNotificationStatus}`);
  console.log(`Next Scheduled Check Time: ${completedTask.nextScheduledCheckTime}`);

  if (completedTask.taskStatus !== "completed") {
    throw new Error(`Expected status 'completed', got '${completedTask.taskStatus}'`);
  }
  if (completedTask.emailNotificationStatus !== "sent") {
    throw new Error(`Expected email status 'sent', got '${completedTask.emailNotificationStatus}'`);
  }
  if (completedTask.nextScheduledCheckTime !== null) {
    throw new Error(`Expected nextScheduledCheckTime to be null, got '${completedTask.nextScheduledCheckTime}'`);
  }

  cleanupAllTimers();
  console.log("=== CHART PREPARED & NOTIFICATION FLOW VERIFIED! ===");
}

testChartPreparedFlow()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Test failed:", err);
    process.exit(1);
  });
