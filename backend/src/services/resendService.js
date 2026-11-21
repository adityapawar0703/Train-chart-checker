const axios = require("axios");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });
require("dotenv").config();

/**
 * Internal helper to send emails via Resend REST API with fallback to NOTIFICATION_EMAIL
 */
async function sendEmailViaResend({ email, subject, text, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM || "IRCTC Alert <onboarding@resend.dev>";
  const fallbackEmail = process.env.NOTIFICATION_EMAIL;

  // If no RESEND_API_KEY is configured, log simulated email to console
  if (!apiKey || apiKey === "your_api_key_here") {
    console.log(`[resendService] RESEND_API_KEY not configured. Simulated email logged below:`);
    console.log(`--------------------------------------------------`);
    console.log(`TO: ${email}`);
    console.log(`SUBJECT: ${subject}`);
    console.log(text);
    console.log(`--------------------------------------------------`);
    return {
      success: true,
      simulated: true,
      message: "RESEND_API_KEY not set. Email notification simulated in console logs.",
    };
  }

  async function callResend(recipient) {
    return await axios.post(
      "https://api.resend.com/emails",
      {
        from: fromEmail,
        to: [recipient],
        subject,
        text,
        html,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );
  }

  try {
    const res = await callResend(email);
    console.log(`[resendService] Email successfully sent to ${email} (ID: ${res.data?.id})`);
    return { success: true, id: res.data?.id, recipient: email };
  } catch (err) {
    const resendMsg = err.response?.data?.message || err.message;
    console.error(`[resendService] Failed to send email to ${email}:`, resendMsg);

    if (
      fallbackEmail &&
      fallbackEmail.toLowerCase() !== email.toLowerCase()
    ) {
      console.log(`[resendService] Retrying send to verified account owner email: ${fallbackEmail}`);
      try {
        const fallbackRes = await callResend(fallbackEmail);
        console.log(`[resendService] Email sent to verified fallback ${fallbackEmail} (ID: ${fallbackRes.data?.id})`);
        return {
          success: true,
          id: fallbackRes.data?.id,
          recipient: fallbackEmail,
          note: `Delivered to verified Resend owner (${fallbackEmail}) due to free-tier restrictions.`,
        };
      } catch (fallbackErr) {
        console.error(`[resendService] Fallback send failed:`, fallbackErr.response?.data || fallbackErr.message);
        throw new Error(fallbackErr.response?.data?.message || fallbackErr.message);
      }
    }

    throw new Error(resendMsg);
  }
}

/**
 * Sends a notification email when the reservation chart is prepared.
 */
async function sendChartPreparedEmail({ email, trainNo, journeyDate, boardingStation }) {
  const subject = "IRCTC Train Chart Prepared - Notification";
  const text = `Hello,

The official reservation chart has been prepared for your selected train.

Train Number: ${trainNo}

Station Code: ${boardingStation}

Journey Date: ${journeyDate}

You no longer need to check the chart status manually.

Thank you.`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
      <div style="display: flex; align-items: center; margin-bottom: 16px;">
        <span style="font-size: 24px; margin-right: 8px;">🚆</span>
        <h2 style="color: #1d6fdb; margin: 0; font-size: 20px;">IRCTC Train Chart Prepared</h2>
      </div>
      <p style="color: #2d3748; font-size: 15px; line-height: 1.5;">Hello,</p>
      <p style="color: #2d3748; font-size: 15px; line-height: 1.5;">The official reservation chart has been prepared for your selected train.</p>
      
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background: #f8fafc; border-radius: 8px; overflow: hidden;">
        <tbody>
          <tr>
            <td style="padding: 10px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 14px; width: 40%;">Train Number</td>
            <td style="padding: 10px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-weight: 600; font-size: 14px;">${trainNo}</td>
          </tr>
          <tr>
            <td style="padding: 10px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 14px;">Station Code</td>
            <td style="padding: 10px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-weight: 600; font-size: 14px;">${boardingStation}</td>
          </tr>
          <tr>
            <td style="padding: 10px 16px; color: #64748b; font-size: 14px;">Journey Date</td>
            <td style="padding: 10px 16px; color: #0f172a; font-weight: 600; font-size: 14px;">${journeyDate}</td>
          </tr>
        </tbody>
      </table>

      <p style="color: #2d3748; font-size: 15px; line-height: 1.5;">You no longer need to check the chart status manually.</p>
      <p style="color: #64748b; font-size: 14px; margin-top: 24px; border-top: 1px solid #edf2f7; padding-top: 16px;">Thank you.<br><em>Automated IRCTC Chart Alert System</em></p>
    </div>
  `;

  return await sendEmailViaResend({ email, subject, text, html });
}

/**
 * Sends a notification email when IRCTC website returns a persistent server error or fails to respond for over 1 hour.
 */
async function sendIRCTCServerErrorEmail({ email, trainNo, journeyDate, boardingStation, errorMessage }) {
  const subject = `IRCTC Server Error - Monitoring Alert (Train ${trainNo})`;
  const text = `Hello,

We encountered persistent server errors while checking the official IRCTC reservation chart for your train.

Train Number: ${trainNo}

Station Code: ${boardingStation}

Journey Date: ${journeyDate}

Issue:
The official IRCTC chart website was unreachable, timed out, or returned server errors for over 1 hour (retried automatically at 15-minute intervals).
Last Reported Error: ${errorMessage || "Connection timed out / Server Error / Empty Response from IRCTC"}

Because IRCTC's website has remained unavailable for over 1 hour, automated monitoring for this task has been stopped.

Please check the official IRCTC website (https://www.irctc.co.in/online-charts/) directly or schedule a new check once IRCTC servers recover.

Thank you.`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #fed7aa; border-radius: 12px; background: #ffffff;">
      <div style="display: flex; align-items: center; margin-bottom: 16px;">
        <span style="font-size: 24px; margin-right: 8px;">⚠️</span>
        <h2 style="color: #c2410c; margin: 0; font-size: 20px;">IRCTC Server Outage Alert (1 Hour)</h2>
      </div>
      <p style="color: #2d3748; font-size: 15px; line-height: 1.5;">Hello,</p>
      <p style="color: #2d3748; font-size: 15px; line-height: 1.5;">
        Automated monitoring was unable to check the official IRCTC reservation chart because the IRCTC website has been down or timing out continuously for over 1 hour.
      </p>
      
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background: #fff7ed; border-radius: 8px; overflow: hidden; border: 1px solid #ffedd5;">
        <tbody>
          <tr>
            <td style="padding: 10px 16px; border-bottom: 1px solid #fed7aa; color: #9a3412; font-size: 14px; width: 40%;">Train Number</td>
            <td style="padding: 10px 16px; border-bottom: 1px solid #fed7aa; color: #0f172a; font-weight: 600; font-size: 14px;">${trainNo}</td>
          </tr>
          <tr>
            <td style="padding: 10px 16px; border-bottom: 1px solid #fed7aa; color: #9a3412; font-size: 14px;">Station Code</td>
            <td style="padding: 10px 16px; border-bottom: 1px solid #fed7aa; color: #0f172a; font-weight: 600; font-size: 14px;">${boardingStation}</td>
          </tr>
          <tr>
            <td style="padding: 10px 16px; border-bottom: 1px solid #fed7aa; color: #9a3412; font-size: 14px;">Journey Date</td>
            <td style="padding: 10px 16px; color: #0f172a; font-weight: 600; font-size: 14px;">${journeyDate}</td>
          </tr>
          <tr>
            <td style="padding: 10px 16px; color: #9a3412; font-size: 14px;">Status</td>
            <td style="padding: 10px 16px; color: #c2410c; font-size: 13px;">IRCTC website unavailable for 1 hour (retried at 15-minute intervals).</td>
          </tr>
        </tbody>
      </table>

      <p style="color: #475569; font-size: 14px; line-height: 1.5;">
        Because IRCTC's servers remained unresponsive for over 1 hour, monitoring for this task has been ended.
      </p>
      <p style="color: #475569; font-size: 14px; line-height: 1.5;">
        You can check the <a href="https://www.irctc.co.in/online-charts/" style="color: #1d6fdb; text-decoration: underline;">IRCTC website directly</a> or re-schedule a watch once the IRCTC website is operational.
      </p>
      <p style="color: #64748b; font-size: 13px; margin-top: 24px; border-top: 1px solid #edf2f7; padding-top: 16px;">
        Thank you.<br><em>Automated IRCTC Chart Alert System</em>
      </p>
    </div>
  `;

  return await sendEmailViaResend({ email, subject, text, html });
}

module.exports = {
  sendChartPreparedEmail,
  sendIRCTCServerErrorEmail,
};
