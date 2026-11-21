const axios = require("axios");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });
require("dotenv").config();

const IRCTC_CHART_URL =
  process.env.IRCTC_CHART_URL ||
  "https://www.irctc.co.in/online-charts/api/trainComposition";

/**
 * Calls the official IRCTC trainComposition endpoint.
 * Respects IRCTC headers and handles timeouts and errors gracefully.
 */
async function checkChart(trainNo, jDate, boardingStation) {
  // If simulation is enabled in .env for testing/verification
  if (process.env.MOCK_IRCTC === "true") {
    console.log(`[irctcService] (MOCK_IRCTC=true) Simulating chart check for train ${trainNo}`);
    
    // Support simulating IRCTC server failure
    if (process.env.MOCK_IRCTC_ERROR === "true") {
      throw new Error("Simulated IRCTC website 503 Server Error");
    }
    if (process.env.MOCK_IRCTC_EMPTY === "true") {
      throw new Error("IRCTC chart website returned an empty response");
    }

    const isMockPrepared = process.env.MOCK_CHART_PREPARED === "true";
    return {
      trainNo,
      boardingStation,
      jDate,
      chartOneDate: isMockPrepared ? new Date().toISOString() : null,
      trainName: `TRAIN-${trainNo}`,
      mock: true,
    };
  }

  const response = await axios.post(
    IRCTC_CHART_URL,
    {
      trainNo: String(trainNo).trim(),
      jDate: String(jDate).trim(),
      boardingStation: String(boardingStation).trim().toUpperCase(),
    },
    {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/plain, */*",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Origin: "https://www.irctc.co.in",
        Referer: "https://www.irctc.co.in/online-charts/",
      },
      timeout: 12000,
    }
  );

  // Validate that IRCTC returned actual data
  if (!response.data || (typeof response.data === "object" && Object.keys(response.data).length === 0)) {
    throw new Error("IRCTC chart website returned an empty response.");
  }

  // If IRCTC returns an internal application error payload
  if (response.data.error || response.data.errorMessage) {
    throw new Error(response.data.errorMessage || response.data.error);
  }

  return response.data;
}

/**
 * Checks whether the reservation chart is prepared.
 * Returns { prepared: boolean, raw: any, chartDate: string | null }
 */
async function isChartPrepared(trainNo, jDate, boardingStation) {
  const data = await checkChart(trainNo, jDate, boardingStation);
  const chartDate = data?.chartOneDate || data?.chartTwoDate || null;
  return {
    prepared: Boolean(chartDate),
    chartDate,
    raw: data,
  };
}

module.exports = { checkChart, isChartPrepared };
