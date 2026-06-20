import fs from "fs";
import path from "path";

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

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function run() {
  const headers = {
    "X-API-Key": API_KEY || "",
    "Content-Type": "application/json"
  };
  
  console.log("Fetching /holocron/catalog...");
  const res = await fetch(`${BASE}/holocron/catalog`, { headers });
  if (!res.ok) {
    console.error("Failed to fetch catalog:", res.status, await res.text());
    return;
  }
  const data = await res.json();
  const catalog = data.catalog || [];
  
  const targets = ["amzn-in", "flipkart", "croma"];
  let logContent = "";
  
  for (const slug of targets) {
    const entry = catalog.find((e: any) => e.slug === slug);
    if (entry) {
      logContent += `\n======================================\n`;
      logContent += `✅ MATCH: Slug: ${entry.slug}, Name: ${entry.name}, Action Count: ${entry.action_count}\n`;
      logContent += `======================================\n`;
      
      const detailRes = await fetch(`${BASE}/holocron/catalog/${entry.slug}`, { headers });
      if (detailRes.ok) {
        const detailData = await detailRes.json();
        logContent += `Actions:\n`;
        for (const action of detailData.actions || []) {
          logContent += `  * ID: ${action.id || action.action_id}\n`;
          logContent += `    Name: ${action.name}\n`;
          logContent += `    Desc: ${action.description}\n`;
          logContent += `    Params: ${JSON.stringify(action.parameters || action.params, null, 2)}\n\n`;
        }
      } else {
        logContent += `  Failed to fetch details for ${entry.slug}: status = ${detailRes.status}\n`;
      }
      
      // Delay to avoid hitting rate limit
      await sleep(2000);
    }
  }
  
  fs.writeFileSync(path.join("scratch", "wire-actions.txt"), logContent, "utf8");
  console.log("Finished writing to scratch/wire-actions.txt");
}

run();
