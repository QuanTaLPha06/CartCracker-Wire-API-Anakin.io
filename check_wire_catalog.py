"""
RUN THIS FIRST — before writing any other code.
Tells you whether Amazon / Myntra / Flipkart have pre-built Wire actions,
and if so, what action_ids and parameters they expose.

Usage: python check_wire_catalog.py YOUR_API_KEY
"""
import sys
import requests

API_KEY = sys.argv[1] if len(sys.argv) > 1 else "YOUR_API_KEY_HERE"
BASE = "https://api.anakin.io/v1"
HEADERS = {"X-API-Key": API_KEY}

TARGETS = ["amazon", "myntra", "flipkart"]

print("=" * 60)
print("STEP 1: List all catalogs, look for our retailers")
print("=" * 60)
resp = requests.get(f"{BASE}/holocron/catalog", headers=HEADERS)
resp.raise_for_status()
catalog = resp.json()["catalog"]

found = {}
for entry in catalog:
    slug = entry["slug"].lower()
    name = entry["name"].lower()
    for target in TARGETS:
        if target in slug or target in name:
            found[target] = entry
            print(f"\n✅ FOUND: {target} -> slug='{entry['slug']}', "
                  f"actions={entry['action_count']}, auth_required={entry['auth_required']}")

for target in TARGETS:
    if target not in found:
        print(f"\n❌ NOT in catalog list: {target} — will need URL Scraper fallback")

print("\n" + "=" * 60)
print("STEP 2: For each found retailer, list actual actions")
print("=" * 60)
for target, entry in found.items():
    slug = entry["slug"]
    r = requests.get(f"{BASE}/holocron/catalog/{slug}", headers=HEADERS)
    if r.status_code != 200:
        print(f"\n{target}: failed to fetch catalog details ({r.status_code})")
        continue
    data = r.json()
    actions = data.get("actions", [])
    print(f"\n--- {target} ({slug}) — {len(actions)} actions ---")
    for a in actions:
        print(f"  action_id={a.get('id') or a.get('action_id')}  "
              f"name={a.get('name')}  "
              f"description={a.get('description', '')[:80]}")

print("\n" + "=" * 60)
print("STEP 3: Direct search fallback (in case catalog naming differs)")
print("=" * 60)
for target in TARGETS:
    r = requests.get(f"{BASE}/holocron/search", headers=HEADERS, params={"query": target})
    if r.status_code == 200:
        results = r.json().get("results", r.json().get("actions", []))
        print(f"\nsearch '{target}': {len(results) if isinstance(results, list) else 'see raw'} results")
        print(r.json())
    else:
        print(f"\nsearch '{target}': {r.status_code} {r.text[:200]}")
