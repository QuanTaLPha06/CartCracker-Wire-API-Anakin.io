const API_KEY = process.env.ANAKIN_API_KEY;
if (!API_KEY) {
  console.error("Please set the ANAKIN_API_KEY environment variable.");
  process.exit(1);
}
const BASE = "https://api.anakin.io/v1";

const headers = {
  "X-API-Key": API_KEY,
  "Content-Type": "application/json",
};

async function pollJob(jobId) {
  const start = Date.now();
  const endpoint = `url-scraper/${jobId}`;
  while (Date.now() - start < 60000) {
    const res = await fetch(`${BASE}/${endpoint}`, { headers });
    const data = await res.json();
    if (data.status === "completed") return data;
    if (data.status === "failed") throw new Error(data.error?.message || data.error);
    await new Promise((r) => setTimeout(r, 2500));
  }
}

async function scrapeUrl(url, schema) {
  const body = { url, useBrowser: true, formats: ["markdown"], generateJson: true, jsonSchema: schema };
  const res = await fetch(`${BASE}/url-scraper`, { method: "POST", headers, body: JSON.stringify(body) });
  const data = await res.json();
  return pollJob(data.jobId || data.id);
}

const SCHEMA = {
  type: "object",
  properties: {
    product_name: { type: "string" },
    current_price: { type: "number" },
    mrp: { type: "number" },
    discount_percent: { type: "number" }
  },
  required: ["product_name", "current_price"]
};

scrapeUrl("https://www.amazon.in/Puma-Unisex-Adult-Running-Shoe-Navy/dp/B0CTMFZNYB", SCHEMA)
  .then(data => console.log(JSON.stringify(data.generatedJson||data, null, 2)))
  .catch(console.error);
