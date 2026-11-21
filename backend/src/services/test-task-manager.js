process.env.MOCK_IRCTC = "true";
process.env.MOCK_CHART_PREPARED = "false";

const {
  createMonitoringTask,
  getTask,
  getAllTasks,
  stopTask,
  cleanupAllTimers,
  taskMap,
} = require("./taskManager");

async function runTests() {
  console.log("=== RUNNING IN-MEMORY TASK MANAGER TESTS ===");

  // Test 1: Task Creation
  console.log("\n[Test 1] Creating a monitoring task...");
  const createRes = createMonitoringTask({
    trainNo: "12722",
    stationCode: "BPL",
    journeyDate: new Date().toISOString().split("T")[0],
    email: "test@example.com",
  });

  const task1 = createRes.task;
  console.log(`Created Task ID: ${task1.id}`);
  if (!task1.id) throw new Error("Task ID was not generated!");

  // Wait a small moment for initial async mock check to finish
  await new Promise((resolve) => setTimeout(resolve, 50));

  const afterFirstCheck = getTask(task1.id);
  console.log(`Status after check: ${afterFirstCheck.taskStatus} (${afterFirstCheck.displayStatus})`);
  console.log(`Next check scheduled at: ${afterFirstCheck.nextScheduledCheckTime}`);

  // Test 2: Duplicate Prevention
  console.log("\n[Test 2] Attempting duplicate task creation...");
  const duplicateRes = createMonitoringTask({
    trainNo: "12722",
    stationCode: "BPL",
    journeyDate: new Date().toISOString().split("T")[0],
    email: "test@example.com",
  });
  console.log(`isDuplicate: ${duplicateRes.isDuplicate}`);
  if (!duplicateRes.isDuplicate || duplicateRes.task.id !== task1.id) {
    throw new Error("Duplicate task detection failed!");
  }
  console.log("Duplicate check passed!");

  // Test 3: Get Task and Get All Tasks
  console.log("\n[Test 3] Querying tasks...");
  const fetched = getTask(task1.id);
  if (!fetched || fetched.trainNo !== "12722") {
    throw new Error("getTask failed!");
  }
  const all = getAllTasks();
  console.log(`Total tasks count: ${all.length}`);
  if (all.length !== 1) {
    throw new Error(`Expected 1 task, found ${all.length}`);
  }

  // Test 4: Manual Stop
  console.log("\n[Test 4] Stopping task manually...");
  const stopped = stopTask(task1.id);
  console.log(`Stopped Task Status: ${stopped.taskStatus} (${stopped.displayStatus})`);
  if (stopped.taskStatus !== "stopped" || stopped.displayStatus !== "Monitoring stopped.") {
    throw new Error("stopTask failed!");
  }

  // Test 5: Cleanup
  cleanupAllTimers();
  console.log("\n=== ALL IN-MEMORY TASK MANAGER TESTS PASSED! ===");
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Test error:", err);
    process.exit(1);
  });
