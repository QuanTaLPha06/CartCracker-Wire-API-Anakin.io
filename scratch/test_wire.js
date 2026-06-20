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
    const res = await fetch(`${BASE}/holocron/jobs/${jobId}`, { headers });
    const data = await res.json();
    if (data.status === "completed") return data;
    if (data.status === "failed") throw new Error(data.error?.message || data.error);
    await new Promise((r) => setTimeout(r, 2500));
  }
  throw new Error("timeout");
}

async function executeWireTask(actionId, params) {
  const res = await fetch(`${BASE}/holocron/task`, { method: "POST", headers, body: JSON.stringify({ action_id: actionId, params }) });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return pollJob(data.job_id || data.jobId || data.id);
}

executeWireTask("act_amzn_in_product_detail_ssr", { asin: "B0CTMFZNYB" }).then(data => console.log(JSON.stringify(data, null, 2))).catch(console.error);
