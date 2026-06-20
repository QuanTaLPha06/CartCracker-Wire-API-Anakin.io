// Anakin API client — URL Scraper and Wire Tasks.
//
// CORRECTED: Wire's product slug in the actual API is `holocron`, confirmed
// against https://anakin.io/docs/api-reference/holocron — NOT `wire`. The
// previous version of this file called /v1/wire/task and /v1/wire/jobs/{id},
// which don't match the documented routes (/v1/holocron/task,
// /v1/holocron/jobs/{id}). That mismatch is the most likely reason Wire
// attempts were slow/silently failing and falling through to URL Scraper —
// worst case, paying both latency costs on every request.
//
// Field name for Wire task parameters: confirmed via live testing to be
// `params`, not `parameters` (contradicts the doc example body shown
// earlier in this session — trust the live-tested field name here).

const BASE = "https://api.anakin.io/v1";

function headers() {
  const API_KEY = process.env.ANAKIN_API_KEY;
  if (!API_KEY) throw new Error("ANAKIN_API_KEY is not set");
  return {
    "X-API-Key": API_KEY,
    "Content-Type": "application/json",
  };
}

async function pollJob(
  jobId: string,
  type: "scraper" | "wire",
  { interval = 2500, timeoutMs = 45000 }: { interval?: number; timeoutMs?: number } = {}
) {
  const start = Date.now();
  const endpoint = type === "scraper" ? `url-scraper/${jobId}` : `holocron/jobs/${jobId}`;

  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`${BASE}/${endpoint}`, { headers: headers() });
    if (!res.ok) throw new Error(`Poll failed: ${res.status} on ${endpoint}`);
    const data = await res.json();

    if (data.status === "completed") return data;
    if (data.status === "failed") {
      throw new Error(data.error?.message || data.error || "Job failed");
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(`Job timed out after ${timeoutMs}ms on ${endpoint}`);
}

/**
 * URL Scraper — generic fallback. Works on any URL.
 */
export async function scrapeUrl(
  url: string,
  schema?: Record<string, unknown>,
  {
    timeoutMs = 45000,
    interval = 2500,
    useBrowser = true,
  }: { timeoutMs?: number; interval?: number; useBrowser?: boolean } = {}
): Promise<Record<string, unknown>> {
  const body: Record<string, unknown> = {
    url,
    useBrowser,
    formats: ["markdown"],
  };
  if (schema) {
    body.generateJson = true;
    body.jsonSchema = schema;
  }

  const submitRes = await fetch(`${BASE}/url-scraper`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });

  if (!submitRes.ok) {
    const errText = await submitRes.text();
    if (submitRes.status === 402 && errText.includes("insufficient_credits")) {
      throw new Error("ANAKIN_INSUFFICIENT_CREDITS");
    }
    throw new Error(`url-scraper submit failed (${submitRes.status}): ${errText}`);
  }

  const submitData = await submitRes.json();
  const jobId: string = submitData.jobId || submitData.id;
  if (!jobId) throw new Error("No jobId returned from url-scraper");

  return pollJob(jobId, "scraper", { interval, timeoutMs });
}

/**
 * Wire Tasks — pre-built actions via the `holocron` product.
 * Submit: POST /v1/holocron/task   { action_id, params }
 * Poll:   GET  /v1/holocron/jobs/{id}
 *
 * STATUS (as of last live test): Amazon India + Flipkart action_ids exist in
 * the catalog but were returning scraper_error server-side. Re-verify with
 * check_wire_catalog.py before relying on this path for a live demo —
 * don't assume the endpoint fix alone makes these reliable.
 */
export async function executeWireTask(
  actionId: string,
  params: Record<string, unknown>,
  { timeoutMs = 20000, interval = 2000 }: { timeoutMs?: number; interval?: number } = {}
): Promise<Record<string, unknown>> {
  const submitRes = await fetch(`${BASE}/holocron/task`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      action_id: actionId,
      params,
    }),
  });

  if (!submitRes.ok) {
    const errText = await submitRes.text();
    if (submitRes.status === 402 && errText.includes("insufficient_credits")) {
      throw new Error("ANAKIN_INSUFFICIENT_CREDITS");
    }
    throw new Error(`Wire task submit failed (${submitRes.status}): ${errText}`);
  }

  const submitData = await submitRes.json();
  const jobId: string = submitData.job_id || submitData.jobId || submitData.id;
  if (!jobId) throw new Error("No job_id returned from wire task submission");

  // Shorter timeout than URL Scraper's fallback path on purpose: if Wire is
  // going to fail, fail fast so the URL Scraper fallback still has time to
  // run within the route's overall budget. Tune this against real latency.
  return pollJob(jobId, "wire", { interval, timeoutMs });
}

/**
 * Extract structured product fields from a scrape result.
 * Confirmed field path: generatedJson.data (URL Scraper responses).
 */
export function extractJsonData(
  scrapeResult: Record<string, unknown>
): Record<string, unknown> | null {
  const gj = scrapeResult.generatedJson as Record<string, unknown> | undefined;
  if (gj?.data && typeof gj.data === "object") return gj.data as Record<string, unknown>;
  if (gj && typeof gj === "object" && !("data" in gj)) return gj;

  const json = scrapeResult.json as Record<string, unknown> | undefined;
  if (json && typeof json === "object") return json;

  const ext = scrapeResult.extractedJson as Record<string, unknown> | undefined;
  if (ext && typeof ext === "object") return ext;

  return null;
}
