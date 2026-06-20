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

const TARGETS = ["amazon", "myntra", "flipkart", "ajio", "croma", "puma"];

async function main() {
  console.log("STEP 1: List all catalogs");
  const res = await fetch(`${BASE}/holocron/catalog`, { headers });
  if (!res.ok) throw new Error("failed to fetch catalog");
  const data = await res.json();
  const catalog = data.catalog || [];
  
  const found = {};
  for (const entry of catalog) {
    const slug = (entry.slug || "").toLowerCase();
    const name = (entry.name || "").toLowerCase();
    for (const target of TARGETS) {
      if (slug.includes(target) || name.includes(target)) {
        found[target] = entry;
        console.log(`✅ FOUND: ${target} -> slug='${entry.slug}', actions=${entry.action_count}, auth_required=${entry.auth_required}`);
      }
    }
  }

  for (const target of TARGETS) {
    if (!found[target]) console.log(`❌ NOT in catalog list: ${target}`);
  }

  console.log("\nSTEP 2: List actual actions");
  for (const [target, entry] of Object.entries(found)) {
    const res = await fetch(`${BASE}/holocron/catalog/${entry.slug}`, { headers });
    if (!res.ok) continue;
    const data = await res.json();
    const actions = data.actions || [];
    console.log(`\n--- ${target} (${entry.slug}) — ${actions.length} actions ---`);
    for (const a of actions) {
      console.log(`  action_id=${a.id || a.action_id}  name=${a.name}  desc=${(a.description || "").slice(0, 80)}`);
    }
  }

  console.log("\nSTEP 3: Direct search fallback");
  for (const target of TARGETS) {
    const res = await fetch(`${BASE}/holocron/search?query=${target}`, { headers });
    if (res.ok) {
      const data = await res.json();
      const results = data.results || data.actions || [];
      console.log(`\nsearch '${target}': ${Array.isArray(results) ? results.length : 'see raw'} results`);
      console.log(JSON.stringify(data).slice(0, 300));
    }
  }
}

main().catch(console.error);
