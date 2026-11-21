process.env.PORT = "4005";
process.env.MOCK_IRCTC = "true";
process.env.MOCK_CHART_PREPARED = "false";
process.env.CHECK_INTERVAL_MS = "60000";

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const chartMonitoringRoutes = require("../routes/chartMonitoring");
const { cleanupAllTimers } = require("../services/taskManager");

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api", chartMonitoringRoutes);

let server;

async function runE2ETests() {
  await new Promise((resolve) => {
    server = app.listen(4005, resolve);
  });
  console.log("Test server listening on port 4005");

  const BASE = "http://localhost:4005/api";

  try {
    // 1. Validation test
    console.log("\n[Test 1] Testing validation failure...");
    try {
      await axios.post(`${BASE}/chart-monitoring`, {
        trainNo: "invalid",
        stationCode: "123",
        journeyDate: "bad-date",
        email: "not-an-email",
      });
      throw new Error("Validation should have failed!");
    } catch (err) {
      if (err.response?.status === 400) {
        console.log("Validation correctly rejected invalid inputs:", err.response.data.errors);
      } else {
        throw err;
      }
    }

    // 2. Successful task creation
    console.log("\n[Test 2] Testing successful task creation...");
    const createRes = await axios.post(`${BASE}/chart-monitoring`, {
      trainNo: "12951",
      stationCode: "NDLS",
      journeyDate: "2026-11-25",
      email: "traveler@example.com",
    });
    console.log("Create Response Status:", createRes.status);
    console.log("Created Task ID:", createRes.data.task.id);
    console.log("Task Status:", createRes.data.task.taskStatus);
    const taskId = createRes.data.task.id;

    if (!taskId || createRes.data.task.trainNo !== "12951") {
      throw new Error("Task creation data mismatch!");
    }

    // 3. Duplicate task test
    console.log("\n[Test 3] Testing duplicate task creation...");
    const dupRes = await axios.post(`${BASE}/chart-monitoring`, {
      trainNo: "12951",
      stationCode: "NDLS",
      journeyDate: "2026-11-25",
      email: "traveler@example.com",
    });
    console.log("Duplicate flag:", dupRes.data.isDuplicate);
    if (!dupRes.data.isDuplicate || dupRes.data.task.id !== taskId) {
      throw new Error("Duplicate detection failed!");
    }

    // 4. Get all tasks
    console.log("\n[Test 4] Testing GET /api/chart-monitoring...");
    const listRes = await axios.get(`${BASE}/chart-monitoring`);
    console.log("Found tasks:", listRes.data.count);
    if (listRes.data.count !== 1) {
      throw new Error(`Expected 1 task, found ${listRes.data.count}`);
    }

    // 5. Get single task
    console.log("\n[Test 5] Testing GET /api/chart-monitoring/:id...");
    const singleRes = await axios.get(`${BASE}/chart-monitoring/${taskId}`);
    console.log("Task fetched successfully:", singleRes.data.task.id);

    // 6. Stop task
    console.log("\n[Test 6] Testing POST /api/chart-monitoring/:id/stop...");
    const stopRes = await axios.post(`${BASE}/chart-monitoring/${taskId}/stop`);
    console.log("Stop response status:", stopRes.data.task.taskStatus);
    console.log("Stop display status:", stopRes.data.task.displayStatus);
    if (stopRes.data.task.taskStatus !== "stopped") {
      throw new Error("Task was not stopped!");
    }

    console.log("\n=== ALL E2E API TESTS PASSED! ===");
  } finally {
    cleanupAllTimers();
    server.close();
  }
}

runE2ETests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("E2E Test Failed:", err);
    if (server) server.close();
    process.exit(1);
  });
