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
  const timeoutMs = 60000;

  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`${BASE}/${endpoint}`, { headers });
    if (!res.ok) throw new Error(`Poll failed: ${res.status} on ${endpoint}`);
    const data = await res.json();
    console.log("Poll status:", data.status);

    if (data.status === "completed") return data;
    if (data.status === "failed") {
      throw new Error(data.error?.message || data.error || "Job failed");
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  throw new Error(`Job timed out after ${timeoutMs}ms on ${endpoint}`);
}

async function scrapeUrl(url, schema) {
  const body = {
    url,
    useBrowser: true,
    formats: ["markdown"],
  };
  if (schema) {
    body.generateJson = true;
    body.jsonSchema = schema;
  }

  console.log("Submitting to url-scraper...");
  const submitRes = await fetch(`${BASE}/url-scraper`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!submitRes.ok) {
    const errText = await submitRes.text();
    throw new Error(`url-scraper submit failed (${submitRes.status}): ${errText}`);
  }

  const submitData = await submitRes.json();
  const jobId = submitData.jobId || submitData.id;
  if (!jobId) throw new Error("No jobId returned from url-scraper");
  
  console.log("Job ID:", jobId);

  return pollJob(jobId);
}

const SEARCH_SCHEMA = {
  type: "object",
  properties: {
    found: {
      type: "boolean",
    },
    products: {
      type: "array",
      items: {
        type: "object",
        properties: {
          product_name: { type: "string" },
          price: { type: "number" },
          product_url: { type: "string" },
        },
        required: ["product_name", "price"],
      },
    },
  },
  required: ["found"],
};

const SOURCE_SCHEMA = {
  type: "object",
  properties: {
    product_name: { type: "string" },
    current_price: { type: "number" },
  },
  required: ["product_name", "current_price"]
};

async function main() {
  try {
    const data = await scrapeUrl("https://www.ajio.com/puma-fade-pro-running-shoes/p/451021246_navybluemulti?", SOURCE_SCHEMA);
    console.log("Scrape Result:", JSON.stringify(data.generatedJson || data, null, 2));
  } catch (err) {
    console.error("Error:", err.message);
  }
}

main();
