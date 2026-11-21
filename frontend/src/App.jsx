import React, { useState, useEffect, useRef } from "react";

// const API_BASE = "/api";
const API_BASE = "https://backend-eight-ivory-84.vercel.app/";

/**
 * StatusBadge displays a styled indicator for the current monitoring lifecycle state.
 */
function StatusBadge({ taskStatus, displayStatus }) {
  const configs = {
    scheduled: {
      bg: "bg-indigo-50 text-indigo-700 border-indigo-200",
      dot: "bg-indigo-500",
      icon: "⏱️",
    },
    active: {
      bg: "bg-blue-50 text-blue-700 border-blue-200",
      dot: "bg-blue-500 animate-pulse",
      icon: "📡",
    },
    checking: {
      bg: "bg-amber-50 text-amber-700 border-amber-200",
      dot: "bg-amber-500 animate-ping",
      icon: "🔍",
    },
    completed: {
      bg: "bg-emerald-50 text-emerald-700 border-emerald-200",
      dot: "bg-emerald-500",
      icon: "✅",
    },
    stopped: {
      bg: "bg-gray-100 text-gray-700 border-gray-300",
      dot: "bg-gray-400",
      icon: "⏹️",
    },
    failed: {
      bg: "bg-rose-50 text-rose-700 border-rose-200",
      dot: "bg-rose-500",
      icon: "⚠️",
    },
  };

  const current = configs[taskStatus] || configs.active;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${current.bg}`}
    >
      <span className={`w-2 h-2 rounded-full ${current.dot}`} />
      <span>{displayStatus || taskStatus?.toUpperCase()}</span>
    </span>
  );
}

/**
 * MonitoringDashboard displays real-time status of a train monitoring task.
 */
function MonitoringDashboard({ taskId, onReset, onSwitchTask }) {
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stopping, setStopping] = useState(false);
  const [stopMessage, setStopMessage] = useState(null);
  const pollIntervalRef = useRef(null);

  async function fetchTaskStatus() {
    try {
      const res = await fetch(`${API_BASE}/chart-monitoring/${taskId}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to load monitoring task.");
      }
      setTask(data.task);
      setError(null);

      // Stop periodic polling if task has terminated
      if (
        (data.task.taskStatus === "completed" ||
          data.task.taskStatus === "stopped" ||
          data.task.taskStatus === "failed") &&
        pollIntervalRef.current
      ) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTaskStatus();
    // Poll status every 8 seconds while active
    pollIntervalRef.current = setInterval(fetchTaskStatus, 8000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [taskId]);

  async function handleStopMonitoring() {
    if (!window.confirm("Are you sure you want to stop monitoring this train?")) {
      return;
    }
    setStopping(true);
    setStopMessage(null);
    try {
      const res = await fetch(`${API_BASE}/chart-monitoring/${taskId}/stop`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Could not stop monitoring.");
      }
      setTask(data.task);
      setStopMessage("Monitoring task stopped successfully.");
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      setStopping(false);
    }
  }

  if (loading && !task) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center space-y-3">
        <div className="w-8 h-8 border-3 border-rail-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-gray-500 text-sm">Connecting to monitoring service...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-rose-100 p-6 space-y-4">
        <div className="flex items-center gap-2 text-rose-600 font-medium">
          <span>⚠️</span> Error Loading Monitoring Task
        </div>
        <p className="text-sm text-gray-600">{error}</p>
        <div className="flex gap-3 pt-2">
          <button
            onClick={fetchTaskStatus}
            className="text-xs bg-rail-50 text-rail-700 px-3 py-1.5 rounded-lg font-medium hover:bg-rail-100"
          >
            Retry Connection
          </button>
          <button
            onClick={onReset}
            className="text-xs text-gray-500 hover:text-gray-700 py-1.5"
          >
            ← Back to Form
          </button>
        </div>
      </div>
    );
  }

  if (!task) return null;

  const isTerminal =
    task.taskStatus === "completed" ||
    task.taskStatus === "stopped" ||
    task.taskStatus === "failed";

  return (
    <div className="space-y-4">
      {/* Main Monitoring Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Card Header & Primary Status */}
        <div className="p-6 border-b border-gray-50 bg-gradient-to-r from-gray-50/50 to-white">
          <div className="flex items-center justify-between gap-3 mb-2">
            <h2 className="font-bold text-gray-900 text-base">Train Monitoring Status</h2>
            <StatusBadge taskStatus={task.taskStatus} displayStatus={task.displayStatus} />
          </div>
          <p className="text-xs text-gray-500 font-mono">ID: {task.id}</p>
        </div>

        {/* Live Status Callout Banner */}
        <div className="px-6 py-4 bg-rail-50/50 border-b border-gray-100">
          <div className="flex items-start gap-3">
            <div className="text-xl mt-0.5">
              {task.taskStatus === "completed"
                ? "🎉"
                : task.taskStatus === "checking"
                ? "🔍"
                : task.taskStatus === "stopped"
                ? "🛑"
                : task.taskStatus === "failed"
                ? "⚠️"
                : "📡"}
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-800">
                {task.displayStatus || "Monitoring in progress"}
              </div>
              <div className="text-xs text-gray-600 mt-0.5">
                {task.taskStatus === "completed" &&
                  "The official IRCTC reservation chart has been prepared and an email alert has been sent."}
                {task.taskStatus === "active" &&
                  (task.firstErrorAt
                    ? "IRCTC website is slow or returning errors. Retrying every 15 minutes (monitoring will continue for up to 1 hour before alerting)."
                    : "Monitoring is active. Checks are performed automatically every 8 minutes.")}
                {task.taskStatus === "checking" &&
                  "Contacting IRCTC servers to verify chart preparation status..."}
                {task.taskStatus === "scheduled" &&
                  "Monitoring will automatically begin approximately 30 minutes before expected chart preparation."}
                {task.taskStatus === "stopped" &&
                  "Monitoring has been stopped. No further IRCTC checks will be executed."}
                {task.taskStatus === "failed" &&
                  "IRCTC website was unavailable for over 1 hour. An alert email was sent to your inbox."}
              </div>
            </div>
          </div>
        </div>

        {/* Train & Monitoring Details Grid */}
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-gray-50 rounded-xl p-3">
              <span className="text-xs text-gray-400 block mb-0.5">Train Number</span>
              <span className="font-semibold text-gray-900 text-base">{task.trainNo}</span>
            </div>

            <div className="bg-gray-50 rounded-xl p-3">
              <span className="text-xs text-gray-400 block mb-0.5">Station Code</span>
              <span className="font-semibold text-gray-900 text-base">{task.boardingStation}</span>
            </div>

            <div className="bg-gray-50 rounded-xl p-3">
              <span className="text-xs text-gray-400 block mb-0.5">Journey Date</span>
              <span className="font-medium text-gray-800">{task.journeyDate}</span>
            </div>

            <div className="bg-gray-50 rounded-xl p-3">
              <span className="text-xs text-gray-400 block mb-0.5">Notification Email</span>
              <span className="font-medium text-gray-800 truncate block" title={task.email}>
                {task.email}
              </span>
            </div>
          </div>

          {/* Time Tracking Row */}
          <div className="border-t border-gray-100 pt-3 grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-gray-400 block">Last Checked</span>
              <span className="font-medium text-gray-700">
                {task.lastCheckedTime
                  ? new Date(task.lastCheckedTime).toLocaleTimeString()
                  : "Waiting for first check"}
              </span>
            </div>
            <div>
              <span className="text-gray-400 block">Next Scheduled Check</span>
              <span className="font-medium text-gray-700">
                {task.nextScheduledCheckTime
                  ? new Date(task.nextScheduledCheckTime).toLocaleTimeString()
                  : isTerminal
                  ? "None (Monitoring ended)"
                  : "Scheduling..."}
              </span>
            </div>
          </div>

          {/* Email Notification Status */}
          <div className="bg-blue-50/60 rounded-xl p-3 flex items-center justify-between text-xs">
            <span className="text-gray-600">Email Notification Status</span>
            <span
              className={`font-semibold px-2 py-0.5 rounded ${
                task.emailNotificationStatus === "sent"
                  ? "bg-emerald-100 text-emerald-800"
                  : task.emailNotificationStatus === "failed"
                  ? "bg-rose-100 text-rose-800"
                  : "bg-blue-100 text-blue-800"
              }`}
            >
              {task.emailNotificationStatus === "sent"
                ? "Notification Sent"
                : task.emailNotificationStatus === "failed"
                ? "Delivery Failed"
                : "Pending Preparation"}
            </span>
          </div>

          {task.firstErrorAt && task.taskStatus === "active" && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-amber-800 text-xs">
                <span>⏱️</span> IRCTC Outage: Retrying Every 15 Minutes
              </div>
              <p className="text-xs text-amber-700">
                {task.lastError || "IRCTC website is returning an error or taking too long."}
              </p>
              <p className="text-[11px] text-amber-600">
                Checking automatically every 15 minutes. Monitoring will continue for up to 1 hour before reporting a failure.
              </p>
            </div>
          )}

          {task.taskStatus === "failed" && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-rose-800 text-xs">
                <span>⚠️</span> IRCTC Outage Alert (1 Hour Exceeded)
              </div>
              <p className="text-xs text-rose-700">
                {task.lastError || "IRCTC website remained down or unresponsive for over 1 hour."}
              </p>
              {task.errorEmailSent && (
                <p className="text-[11px] text-rose-600 font-medium">
                  ✓ An outage alert email has been sent to your inbox.
                </p>
              )}
            </div>
          )}

          {stopMessage && (
            <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-800">
              {stopMessage}
            </div>
          )}

          {/* Actions */}
          <div className="pt-2 flex flex-col gap-2">
            {!isTerminal && (
              <button
                onClick={handleStopMonitoring}
                disabled={stopping}
                className="w-full bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-medium py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
              >
                {stopping ? "Stopping..." : "Stop Monitoring"}
              </button>
            )}

            <button
              onClick={onReset}
              className="w-full text-center text-xs text-rail-600 hover:text-rail-700 font-medium py-2"
            >
              ← Monitor another train
            </button>
          </div>
        </div>
      </div>

      {/* Background Reliability Note */}
      <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-xs text-xs text-gray-500 space-y-1">
        <div className="flex items-center gap-1.5 font-semibold text-gray-700">
          <span>💡</span> Independent Background Monitoring
        </div>
        <p>
          You can safely close this browser tab or navigate away. The backend server maintains
          your monitoring schedule independently in memory and will email you as soon as the
          official chart is prepared.
        </p>
        <p className="text-[11px] text-gray-400 pt-1">
          <em>Note: Monitoring tasks are kept in backend memory and will clear if the server restarts.</em>
        </p>
      </div>
    </div>
  );
}

/**
 * MonitoringForm collects train and notification details to initiate an automated monitoring task.
 */
function MonitoringForm({ onCreated }) {
  const [form, setForm] = useState({
    trainNo: "",
    stationCode: "",
    journeyDate: new Date().toISOString().split("T")[0],
    email: "",
  });
  const [errors, setErrors] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErrors([]);
    setSubmitting(true);

    try {
      const res = await fetch(`${API_BASE}/chart-monitoring`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrors(data.errors || [data.error || "Could not schedule monitoring."]);
        return;
      }

      onCreated(data.task.id);
    } catch (err) {
      setErrors(["Could not reach the server. Please check your backend connection."]);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4"
    >
      <div>
        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1.5">
          Train Number
        </label>
        <input
          type="text"
          placeholder="e.g. 12951 or 12722"
          value={form.trainNo}
          onChange={(e) => update("trainNo", e.target.value)}
          required
          className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rail-500 focus:border-rail-500 transition-all placeholder:text-gray-300"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1.5">
          Station Code
        </label>
        <input
          type="text"
          placeholder="e.g. NDLS, BPL, CSMT"
          value={form.stationCode}
          onChange={(e) => update("stationCode", e.target.value.toUpperCase())}
          required
          className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rail-500 focus:border-rail-500 transition-all uppercase placeholder:text-gray-300"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1.5">
          Journey Date
        </label>
        <input
          type="date"
          value={form.journeyDate}
          onChange={(e) => update("journeyDate", e.target.value)}
          required
          className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rail-500 focus:border-rail-500 transition-all"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1.5">
          Notification Email Address
        </label>
        <input
          type="email"
          placeholder="your.email@example.com"
          value={form.email}
          onChange={(e) => update("email", e.target.value)}
          required
          className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rail-500 focus:border-rail-500 transition-all placeholder:text-gray-300"
        />
      </div>

      {errors.length > 0 && (
        <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl">
          <ul className="text-xs text-rose-700 space-y-1">
            {errors.map((err, i) => (
              <li key={i}>• {err}</li>
            ))}
          </ul>
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-rail-500 hover:bg-rail-600 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-all shadow-sm shadow-rail-500/20 active:scale-[0.99] text-sm mt-2"
      >
        {submitting ? "Scheduling Monitoring..." : "Start Automated Monitoring"}
      </button>

      <p className="text-[11px] text-gray-400 text-center pt-1">
        Backend will automatically monitor the official chart status at 8-minute intervals.
      </p>
    </form>
  );
}

/**
 * TasksListModal allows viewing other active tasks running in backend memory.
 */
function TasksListModal({ currentTaskId, onSelectTask, onClose }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadTasks() {
      try {
        const res = await fetch(`${API_BASE}/chart-monitoring`);
        const data = await res.json();
        if (data.success) {
          setTasks(data.tasks);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadTasks();
  }, []);

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <h3 className="font-bold text-gray-900 text-base">All In-Memory Tasks</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">
            ✕
          </button>
        </div>

        <div className="overflow-y-auto space-y-2.5 flex-1 pr-1">
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-6">Loading tasks...</p>
          ) : tasks.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No tasks currently in memory.</p>
          ) : (
            tasks.map((t) => (
              <div
                key={t.id}
                onClick={() => {
                  onSelectTask(t.id);
                  onClose();
                }}
                className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                  t.id === currentTaskId
                    ? "border-rail-500 bg-rail-50/50"
                    : "border-gray-100 hover:border-gray-200 bg-gray-50/50"
                }`}
              >
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-bold text-gray-900">
                    Train {t.trainNo} ({t.boardingStation})
                  </span>
                  <StatusBadge taskStatus={t.taskStatus} displayStatus={t.displayStatus} />
                </div>
                <div className="text-[11px] text-gray-500 flex justify-between">
                  <span>{t.journeyDate}</span>
                  <span>{t.email}</span>
                </div>
              </div>
            ))
          )}
        </div>

        <button
          onClick={onClose}
          className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold py-2.5 rounded-xl transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}

/**
 * Main App Component
 */
export default function App() {
  const [activeTaskId, setActiveTaskId] = useState(() => {
    return localStorage.getItem("irctc_active_task_id") || null;
  });
  const [showTasksModal, setShowTasksModal] = useState(false);

  function handleTaskCreated(id) {
    setActiveTaskId(id);
    localStorage.setItem("irctc_active_task_id", id);
  }

  function handleReset() {
    setActiveTaskId(null);
    localStorage.removeItem("irctc_active_task_id");
  }

  function handleSelectTask(id) {
    setActiveTaskId(id);
    localStorage.setItem("irctc_active_task_id", id);
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-rail-50 to-white text-gray-900">
      <div className="max-w-md mx-auto px-4 py-10">
        {/* Navigation & Header */}
        <header className="text-center mb-6 relative">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-rail-500 text-white text-xl shadow-md shadow-rail-500/20 mb-3">
            🚆
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            IRCTC Chart Alert
          </h1>
          <p className="text-gray-500 text-xs mt-1 max-w-xs mx-auto">
            Automated reservation chart monitoring with instant email alerts.
          </p>

          {/* Quick Active Tasks Drawer Trigger */}
          <button
            onClick={() => setShowTasksModal(true)}
            className="mt-3 inline-flex items-center gap-1.5 text-xs text-rail-600 hover:text-rail-700 bg-white border border-gray-200 rounded-full px-3 py-1 shadow-2xs hover:border-rail-300 transition-colors"
          >
            <span>📋</span> View In-Memory Tasks
          </button>
        </header>

        {/* Dynamic Content: Form vs Dashboard */}
        {activeTaskId ? (
          <MonitoringDashboard
            taskId={activeTaskId}
            onReset={handleReset}
            onSwitchTask={() => setShowTasksModal(true)}
          />
        ) : (
          <MonitoringForm onCreated={handleTaskCreated} />
        )}

        {/* Active Tasks Modal */}
        {showTasksModal && (
          <TasksListModal
            currentTaskId={activeTaskId}
            onSelectTask={handleSelectTask}
            onClose={() => setShowTasksModal(false)}
          />
        )}

        {/* Footer */}
        <footer className="text-center text-[11px] text-gray-400 mt-8 space-y-1">
          <p>Operates using an 8-minute checking interval within the permitted window.</p>
          <p>Database-free architecture • Tasks managed in backend memory.</p>
        </footer>
      </div>
    </div>
  );
}
