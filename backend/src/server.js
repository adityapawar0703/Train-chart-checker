const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const watchRoutes = require("./routes/watch");
const chartMonitoringRoutes = require("./routes/chartMonitoring");
const { cleanupAllTimers } = require("./services/taskManager");

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    mode: "in-memory-map",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Primary In-Memory Chart Monitoring Routes
app.use("/api", chartMonitoringRoutes);

// Legacy routes kept for backward compatibility
app.use("/api", watchRoutes);

const server = app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(` IRCTC Chart Alert Backend running on port ${PORT}`);
  console.log(` Mode: Database-Free (In-Memory Map)`);
  console.log(` Check Interval: ${process.env.CHECK_INTERVAL_MS ? (Number(process.env.CHECK_INTERVAL_MS)/1000) + 's' : '8 minutes'}`);
  console.log(` API Endpoints:`);
  console.log(`   POST /api/chart-monitoring`);
  console.log(`   GET  /api/chart-monitoring`);
  console.log(`   GET  /api/chart-monitoring/:id`);
  console.log(`   POST /api/chart-monitoring/:id/stop`);
  console.log(`====================================================`);
});

// Graceful shutdown handling
function gracefulShutdown(signal) {
  console.log(`\n[server] Received ${signal}. Shutting down gracefully...`);
  cleanupAllTimers();
  server.close(() => {
    console.log("[server] HTTP server closed. Exiting process.");
    process.exit(0);
  });
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
