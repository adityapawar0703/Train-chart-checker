# IRCTC Seat Chart Alert Platform

Automated IRCTC train reservation chart preparation monitoring system with instant email notifications.

Get an email notification the moment your train's official IRCTC reservation chart is prepared — no need to keep refreshing the IRCTC website or keep your browser tab open.

---

## Architecture: Database-Free (In-Memory Map)

This feature operates using a **database-free architecture**:
* Active monitoring tasks and timers are stored strictly in backend memory using a JavaScript `Map`.
* No MongoDB, PostgreSQL, SQLite, MySQL, Redis, Firebase, or other database dependencies are required for task execution.
* Background scheduling is managed directly via Node.js `setTimeout` timers.
* Duplicate tasks with identical train details and email are automatically detected and reused.

> ### ⚠️ Important In-Memory Limitation
> Because tasks are stored in backend process memory (`Map`), all active monitoring tasks and scheduled timers **will be cleared if the backend server restarts or shuts down**. This is an expected trade-off of the database-free design.

---

## How It Works

1. **Submission**: Enter Train Number, Station Code, Journey Date, and Notification Email Address on the frontend.
2. **Pre-Chart Monitoring Window**: The backend calculates the expected chart preparation time (typically ~4 hours before train departure) and schedules monitoring to begin ~30 minutes before chart preparation. If the journey date is today and within or past this window, monitoring begins immediately (`active`).
3. **8-Minute Interval Checks & 2-Attempt Failure Resilience**:
   * Once monitoring is active, checks are performed every **8 minutes** (`8 * 60 * 1000` ms).
   * **Error & Empty Response Handling**: If the IRCTC website returns a server error (e.g., 500, 502, 503), times out, or returns an empty response:
     * The system automatically retries a 2nd time after a 3-second pause.
     * If it fails after 2 attempts, the task is marked as `failed` (`Monitoring failed: IRCTC server error`), timers are stopped, and an **IRCTC Server Error Alert email** is automatically sent to the user.
4. **Instant Email Notification**: As soon as the chart preparation status becomes `true` (`chartOneDate` is populated):
   * Monitoring is stopped immediately.
   * An email notification is sent via **Resend** REST API.
   * The task is marked as `completed`.
   * Only one email notification is sent per monitoring task (guaranteed deduplication).
5. **Background Execution**: You can safely close or refresh your browser tab. The backend process continues monitoring independently and dispatches the alert to your inbox.
6. **Manual Stop**: The dashboard provides a "Stop Monitoring" button to cancel any active or scheduled task at any time (`POST /api/chart-monitoring/:id/stop`).

---

## Project Structure

```text
irctc-chart-alert/
├── backend/
│   ├── src/
│   │   ├── server.js                     # Express app entry point & graceful shutdown
│   │   ├── routes/
│   │   │   ├── chartMonitoring.js        # POST, GET, and /:id/stop endpoints
│   │   │   └── watch.js                  # Legacy watch endpoint
│   │   └── services/
│   │       ├── taskManager.js            # In-memory Map store, timers, 8-min scheduler
│   │       ├── resendService.js          # Resend REST API email integration
│   │       ├── irctcService.js           # IRCTC chart status verification
│   │       ├── test-task-manager.js      # Unit tests for in-memory task manager
│   │       ├── test-notification-flow.js # Unit tests for notification & chart prepared flow
│   │       └── test-e2e-api.js           # End-to-end API integration tests
│   ├── .env.example
│   └── package.json
└── frontend/
    └── src/
        ├── App.jsx                       # Form, 9-state StatusBadge & MonitoringDashboard
        └── main.jsx
```

---

## API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/chart-monitoring` | Create an automated monitoring task (or return existing duplicate). |
| `GET` | `/api/chart-monitoring` | Get all active and recent monitoring tasks in backend memory. |
| `GET` | `/api/chart-monitoring/:id` | Get the real-time status and metrics of a specific task. |
| `POST` | `/api/chart-monitoring/:id/stop` | Manually stop an active monitoring task and cancel its timers. |
| `GET` | `/api/health` | Health check endpoint returning backend uptime and mode. |

---

## Setup & Running

### 1. Backend

```bash
cd backend
npm install

# Copy environment template
cp .env.example .env
```

Edit `backend/.env` with your configuration:
```env
PORT=4000
CHECK_INTERVAL_MS=480000

# Resend API Key (Free account from https://resend.com)
RESEND_API_KEY=re_your_api_key_here
NOTIFICATION_EMAIL=your_email@example.com
RESEND_FROM="IRCTC Alert <onboarding@resend.dev>"

# IRCTC Endpoint
IRCTC_CHART_URL=https://www.irctc.co.in/online-charts/api/trainComposition
```

Start the backend:
```bash
npm run dev
# or: node src/server.js
```
Runs at `http://localhost:4000`.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```
Runs at `http://localhost:5173`. Requests to `/api/*` are automatically proxied to port 4000.

---

## Testing & Verification

Run the test suite from the `backend` folder:

```bash
# In-memory task management & scheduling tests:
node src/services/test-task-manager.js

# Chart prepared & Resend email notification flow:
node src/services/test-notification-flow.js

# End-to-end REST API endpoint tests:
node src/services/test-e2e-api.js
```

---

## IRCTC API & Compliance Note

* This system accesses official IRCTC status endpoints in accordance with access policies.
* It enforces strict **8-minute intervals** and restricts checks to the **30-minute pre-chart preparation window**.
* Bot gates, CAPTCHAs, and access restrictions are never bypassed.
* Network timeouts and temporary failures are handled gracefully without flooding servers.
