const express = require("express");
const { v4: uuidv4 } = require("uuid");
const db = require("../db");

const router = express.Router();

const TRAIN_NO_RE = /^\d{3,6}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STATION_RE = /^[A-Za-z]{2,10}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/watch — create a new monitoring request
router.post("/watch", (req, res) => {
  const { trainNo, journeyDate, boardingStation, email } = req.body || {};

  const errors = [];
  if (!trainNo || !TRAIN_NO_RE.test(String(trainNo).trim())) {
    errors.push("trainNo is required and must be a valid train number.");
  }
  if (!journeyDate || !DATE_RE.test(journeyDate)) {
    errors.push("journeyDate is required in YYYY-MM-DD format.");
  }
  if (!boardingStation || !STATION_RE.test(String(boardingStation).trim())) {
    errors.push("boardingStation is required and must be a valid station code.");
  }
  if (!email || !EMAIL_RE.test(String(email).trim())) {
    errors.push("A valid email address is required.");
  }

  if (errors.length > 0) {
    return res.status(400).json({ success: false, errors });
  }

  const id = uuidv4();

  db.prepare(
    `INSERT INTO chart_watchers (id, train_no, journey_date, boarding_station, email, status)
     VALUES (?, ?, ?, ?, ?, 'PENDING')`
  ).run(
    id,
    String(trainNo).trim(),
    journeyDate,
    String(boardingStation).trim().toUpperCase(),
    String(email).trim().toLowerCase()
  );

  res.json({ success: true, id });
});

// GET /api/status/:id — check status of a watch request
router.get("/status/:id", (req, res) => {
  const watch = db
    .prepare(`SELECT * FROM chart_watchers WHERE id = ?`)
    .get(req.params.id);

  if (!watch) {
    return res.status(404).json({ success: false, error: "Watch request not found. line 57" });
  }

  res.json({
    success: true,
    status: watch.status,
    trainNo: watch.train_no,
    journeyDate: watch.journey_date,
    boardingStation: watch.boarding_station,
    notified: !!watch.notified,
    lastCheckedAt: watch.last_checked_at,
    createdAt: watch.created_at,
  });
});

module.exports = router;
