const cron = require("node-cron");
const db = require("../db");
const { isChartPrepared } = require("./irctcService");
const { sendChartPreparedEmail } = require("./emailService");

const POLL_INTERVAL_MINUTES = Number(process.env.POLL_INTERVAL_MINUTES || 5);

async function processWatch(watch) {
  const nowIso = new Date().toISOString();

  try {
    const { prepared } = await isChartPrepared(
      watch.train_no,
      watch.journey_date,
      watch.boarding_station
    );

    if (prepared) {
      await sendChartPreparedEmail({
        email: watch.email,
        trainNo: watch.train_no,
        journeyDate: watch.journey_date,
        boardingStation: watch.boarding_station,
      });

      db.prepare(
        `UPDATE chart_watchers
         SET status = 'COMPLETED', notified = 1, last_checked_at = ?
         WHERE id = ?`
      ).run(nowIso, watch.id);

      console.log(`[worker] Chart prepared + email sent for watch ${watch.id} (train ${watch.train_no})`);
    } else {
      db.prepare(
        `UPDATE chart_watchers SET last_checked_at = ? WHERE id = ?`
      ).run(nowIso, watch.id);
    }
  } catch (err) {
    console.error(`[worker] Error checking watch ${watch.id}:`, err.message);
    db.prepare(
      `UPDATE chart_watchers
       SET last_checked_at = ?, error_message = ?
       WHERE id = ?`
    ).run(nowIso, err.message, watch.id);
    // Intentionally NOT marking as FAILED on a single transient error —
    // it will simply be retried on the next tick. Only persistent issues
    // should require manual/status inspection via GET /api/status/:id.
  }
}

async function runPollCycle() {
  const pending = db
    .prepare(`SELECT * FROM chart_watchers WHERE status = 'PENDING'`)
    .all();

  if (pending.length === 0) return;

  console.log(`[worker] Polling ${pending.length} pending watch(es)...`);

  // Sequential to avoid hammering IRCTC with concurrent requests.
  for (const watch of pending) {
    await processWatch(watch);
  }
}

function startWorker() {
  console.log(
    `[worker] Chart monitoring worker started — polling every ${POLL_INTERVAL_MINUTES} minute(s).`
  );

  // Run once shortly after boot, then on the cron schedule.
  setTimeout(runPollCycle, 5000);

  cron.schedule(`*/${POLL_INTERVAL_MINUTES} * * * *`, runPollCycle);
}

module.exports = { startWorker, runPollCycle };
