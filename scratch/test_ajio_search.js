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
  while (Date.now() - start < 60000) {
    const res = await fetch(`${BASE}/url-scraper/${jobId}`, { headers });
    const data = await res.json();
    if (data.status === "completed") return data;
    if (data.status === "failed") throw new Error(data.error?.message || data.error);
    await new Promise((r) => setTimeout(r, 2500));
  }
}

async function scrapeUrl(url) {
  const body = { url, useBrowser: true, formats: ["markdown"] };
  const res = await fetch(`${BASE}/url-scraper`, { method: "POST", headers, body: JSON.stringify(body) });
  const data = await res.json();
  return pollJob(data.jobId || data.id);
}

scrapeUrl("https://www.ajio.com/search/?text=Puma%20Fade%20Pro").then(d => console.log(d.markdown?.slice(0, 500) || d)).catch(console.error);
