import fs from "fs";

// Load env
const env = fs.readFileSync(".env.local", "utf8");
env.split("\n").forEach(line => {
  const match = line.trim().match(/^([^=]+)=(.*)$/);
  if (match) {
    process.env[match[1]] = match[2].trim();
  }
});

const API_KEY = process.env.ANAKIN_API_KEY;
const BASE = "https://api.anakin.io/v1";

async function run() {
  const headers = {
    "X-API-Key": API_KEY || "",
    "Content-Type": "application/json"
  };
  
  // Let's submit a url-scraper job with useBrowser: false to see if it's faster
  console.log("Submitting url-scraper job with useBrowser: false...");
  const submitRes = await fetch(`${BASE}/url-scraper`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      url: "https://www.amazon.in/dp/B0DJ2X2HR5",
      useBrowser: false,
      formats: ["markdown"]
    })
  });
  
  console.log("Submit status:", submitRes.status);
  const data = await submitRes.json();
  console.log("Submit response:", data);
  
  const jobId = data.jobId || data.id;
  if (!jobId) return;
  
  console.log("Polling job:", jobId);
  for (let i = 0; i < 15; i++) {
    const res = await fetch(`${BASE}/url-scraper/${jobId}`, { headers });
    const statusData = await res.json();
    console.log(`Poll ${i+1}: status = ${statusData.status}`);
    if (statusData.status === "completed" || statusData.status === "failed") {
      console.log("Finished:", JSON.stringify(statusData, null, 2).substring(0, 1000));
      break;
    }
    await new Promise(r => setTimeout(r, 2000));
  }
}

run();
