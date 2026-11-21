const nodemailer = require("nodemailer");
require("dotenv").config();

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return transporter;
}

async function sendChartPreparedEmail({ email, trainNo, journeyDate, boardingStation }) {
  const mailer = getTransporter();

  const text = `Hello,

The reservation chart for your train has been prepared.

Train Number: ${trainNo}
Journey Date: ${journeyDate}
Boarding Station: ${boardingStation}

You may now view coach allocations and berth details on IRCTC.

Thank you.`;

  const html = `
    <p>Hello,</p>
    <p>The reservation chart for your train has been prepared.</p>
    <table style="border-collapse:collapse;margin:16px 0;">
      <tr><td style="padding:4px 12px 4px 0;color:#555;">Train Number</td><td style="padding:4px 0;font-weight:600;">${trainNo}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#555;">Journey Date</td><td style="padding:4px 0;font-weight:600;">${journeyDate}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#555;">Boarding Station</td><td style="padding:4px 0;font-weight:600;">${boardingStation}</td></tr>
    </table>
    <p>You may now view coach allocations and berth details on IRCTC.</p>
    <p>Thank you.</p>
  `;

  await mailer.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: email,
    subject: "Train Chart Prepared",
    text,
    html,
  });
}

module.exports = { sendChartPreparedEmail };
