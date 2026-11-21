
const axios = require("axios");

async function testIRCTC() {
  try {
    const response = await axios.post(
      "https://www.irctc.co.in/online-charts/api/trainComposition",
      {
        trainNo: "12722",
        jDate: "2026-11-01",
        boardingStation: "BPL"
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        timeout: 15000
      }
    );

    console.log("STATUS:", response.status);
    console.log("CHART DATE:", response.data.chartOneDate);
    console.log("TRAIN:", response.data.trainName);
    console.log("FULL RESPONSE:");
    console.log(JSON.stringify(response.data, null, 2));

  } catch (error) {
    console.log("REQUEST FAILED");

    console.log("STATUS:", error.response?.status);
    console.log("ERROR:", error.message);
    console.log("RESPONSE:", error.response?.data);
  }
}

testIRCTC();
