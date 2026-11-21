const express = require("express");
const {
  createMonitoringTask,
  getTask,
  getAllTasks,
  stopTask,
} = require("../services/taskManager");

const router = express.Router();

const TRAIN_NO_RE = /^\d{3,6}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STATION_RE = /^[A-Za-z]{2,10}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/chart-monitoring
 * Creates or retrieves an active monitoring task for a train.
 */
router.post("/chart-monitoring", (req, res) => {
  const {
    trainNo,
    trainNumber,
    stationCode,
    boardingStation,
    journeyDate,
    email,
    departureTime,
  } = req.body || {};

  const effectiveTrainNo = String(trainNo || trainNumber || "").trim();
  const effectiveStation = String(stationCode || boardingStation || "").trim().toUpperCase();
  const effectiveDate = String(journeyDate || "").trim();
  const effectiveEmail = String(email || "").trim().toLowerCase();

  const errors = [];

  if (!effectiveTrainNo || !TRAIN_NO_RE.test(effectiveTrainNo)) {
    errors.push("Train number is required and must be 3 to 6 digits.");
  }
  if (!effectiveStation || !STATION_RE.test(effectiveStation)) {
    errors.push("Station code is required and must be valid (e.g. NDLS, BPL).");
  }
  if (!effectiveDate || !DATE_RE.test(effectiveDate)) {
    errors.push("Journey date is required in YYYY-MM-DD format.");
  }
  if (!effectiveEmail || !EMAIL_RE.test(effectiveEmail)) {
    errors.push("A valid email address is required for notifications.");
  }

  if (errors.length > 0) {
    return res.status(400).json({ success: false, errors });
  }

  const { task, isDuplicate } = createMonitoringTask({
    trainNo: effectiveTrainNo,
    stationCode: effectiveStation,
    journeyDate: effectiveDate,
    email: effectiveEmail,
    departureTime,
  });

  return res.status(isDuplicate ? 200 : 201).json({
    success: true,
    isDuplicate,
    task,
  });
});

/**
 * GET /api/chart-monitoring
 * Returns all monitoring tasks in memory.
 */
router.get("/chart-monitoring", (req, res) => {
  const tasks = getAllTasks();
  res.json({
    success: true,
    count: tasks.length,
    tasks,
  });
});

/**
 * GET /api/chart-monitoring/:id
 * Retrieves the status of a specific monitoring task.
 */
router.get("/chart-monitoring/:id", (req, res) => {
  const task = getTask(req.params.id);
  if (!task) {
    return res.status(404).json({
      success: false,
      error: `Monitoring task '${req.params.id}' not found. Note: tasks are held in-memory and are cleared if the server restarts.`,
    });
  }

  res.json({
    success: true,
    task,
  });
});

/**
 * POST /api/chart-monitoring/:id/stop
 * Manually stops an active monitoring task and cancels all scheduled checks.
 */
router.post("/chart-monitoring/:id/stop", (req, res) => {
  const task = stopTask(req.params.id);
  if (!task) {
    return res.status(404).json({
      success: false,
      error: `Monitoring task '${req.params.id}' not found.`,
    });
  }

  res.json({
    success: true,
    message: "Monitoring task successfully stopped.",
    task,
  });
});

module.exports = router;
