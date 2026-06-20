import { NextRequest, NextResponse } from "next/server";
import { scrapeUrl, executeWireTask, extractJsonData } from "@/lib/anakin";
import { computeVerdict, ProductInfo, RetailerPrice } from "@/lib/verdict";
import { ALL_RETAILERS, RETAILERS, detectRetailer, buildSearchUrl, RETAILER_LIST_LABEL, type Retailer } from "@/lib/retailers";

export const maxDuration = 60;
const INCLUDE_DEBUG = process.env.NODE_ENV !== "production" || process.env.DEBUG_ANALYZE === "1";
const CACHE_TTL_MS = 10 * 60 * 1000;
const SOURCE_TIMEOUT_MS = 25000;
const WIRE_TIMEOUT_MS = 10000;
const SEARCH_TIMEOUT_MS = 12000;

type CacheEntry<T> = { value: T; expiresAt: number };
const analysisCache = new Map<string, CacheEntry<unknown>>();

function getCache<T>(key: string): T | null {
  const entry = analysisCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    analysisCache.delete(key);
    return null;
  }
  return entry.value as T;
}

function setCache<T>(key: string, value: T) {
  analysisCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ── Schemas ─────────────────────────────────────────────────────────────────

const SOURCE_SCHEMA = {
  type: "object",
  properties: {
    product_name: {
      type: "string",
      description: "Clean product title of the MAIN product currently in view. Ignore 'customers also viewed' or related items.",
    },
    current_price: {
      type: "number",
      description: "Current selling price of the MAIN product in INR, numeric only. Extract the primary price displayed for the selected variant/size. Do not pick prices from related products or a price range.",
    },
    mrp: {
      type: "number",
      description:
        "Listed MRP / strikethrough / 'was' price of the MAIN product in INR. Ensure this is for the exact same variant as the current_price. Return 0 if not shown.",
    },
    discount_percent: {
      type: "number",
      description:
        "Discount percentage shown on the page for the MAIN product (e.g. 67 for '67% OFF'). Return 0 if not shown.",
    },
  },
  required: ["product_name", "current_price"],
};

const SEARCH_RESULT_SCHEMA = {
  type: "object",
  properties: {
    found: {
      type: "boolean",
      description:
        "True if there is AT LEAST ONE product result in the main search grid. False if no products matched or if the page shows a 'no results' state.",
    },
    products: {
      type: "array",
      description: "List of products found in the search results.",
      items: {
        type: "object",
        properties: {
          product_name: {
            type: "string",
            description: "Full name/title of the product",
          },
          price: {
            type: "number",
            description: "Current selling price in INR, numeric only",
          },
          product_url: {
            type: "string",
            description: "URL of the product listing (absolute or relative path starting with /), if available",
          },
        },
        required: ["product_name", "price"],
      },
    },
  },
  required: ["found"],
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractAmazonAsin(url: string): string | null {
  const match = url.match(/(?:\/dp\/|\/gp\/product\/)([A-Z0-9]{10})/i);
  return match ? match[1] : null;
}

// Trim titles down to the first meaningful chunk (before any pipe/dash delimiter)
// and cap at a reasonable length so search URLs stay focused without losing key
// model/brand words that help the retailer search engine find the right item.
function sanitizeSearchQuery(productName: string): string {
  let cleaned = productName.split(/[|\-,/]/)[0].trim();
  const words = cleaned.split(/\s+/).filter((w) => w.length > 0);
  if (words.length > 8) return words.slice(0, 8).join(" ");
  return cleaned;
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]) {
      parsed.searchParams.delete(key);
    }
    return parsed.toString();
  } catch {
    return url.trim();
  }
}

function slugToQueryFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const candidate = parts.find((part) => part.length > 3 && !/^p$/i.test(part) && !/^\d+$/.test(part));
    if (!candidate) return null;
    return decodeURIComponent(candidate.replace(/[-_]+/g, " ")).trim();
  } catch {
    return null;
  }
}

function productSearchQueryFromUrl(url: string): string | null {
  const slugQuery = slugToQueryFromUrl(url);
  if (slugQuery) return sanitizeSearchQuery(slugQuery);

  try {
    const parsed = new URL(url);
    const q = parsed.searchParams.get("q") || parsed.searchParams.get("query") || parsed.searchParams.get("text");
    if (q) return sanitizeSearchQuery(q);
  } catch {
    // ignore malformed URLs here; caller will handle overall invalid URL cases
  }

  return null;
}

const STOP_WORDS = new Set([
  "shoes", "shoe", "running", "walking", "sneakers", "sneaker", "trainers", 
  "men", "mens", "women", "womens", "kids", "boys", "girls", "unisex", "adult", 
  "for", "the", "with", "and", "apparel", "clothing", "tshirt", "shirt", "pant", "pants"
]);

function normalizeTokens(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

// Pick the closest title match instead of requiring a near-exact title clone.
// Retailer search pages often change punctuation, reorder tokens, or shorten
// titles. A weighted token-overlap score is much more robust than a binary gate.
function productMatchScore(sourceName: string, candidateName: string): number {
  const sourceWords = normalizeTokens(sourceName);
  const candidateWords = normalizeTokens(candidateName);
  if (sourceWords.length === 0 || candidateWords.length === 0) return 0;

  const sourceSet = new Set(sourceWords);
  const candidateSet = new Set(candidateWords);
  let overlap = 0;
  for (const w of sourceSet) {
    if (candidateSet.has(w)) overlap++;
  }

  const overlapSource = overlap / sourceSet.size;
  const overlapCandidate = overlap / candidateSet.size;
  const exactPrefixBonus =
    sourceWords[0] && candidateWords[0] && sourceWords[0] === candidateWords[0] ? 0.1 : 0;

  return Math.min(1, overlapSource * 0.6 + overlapCandidate * 0.35 + exactPrefixBonus);
}

function looksLikeSameProduct(sourceName: string, candidateName: string): boolean {
  return productMatchScore(sourceName, candidateName) >= 0.55;
}

function pickBestMatch(sourceName: string, candidates: SearchNorm[]): { item: SearchNorm; score: number } | null {
  let best: { item: SearchNorm; score: number } | null = null;
  for (const item of candidates) {
    const score = productMatchScore(sourceName, item.product_name);
    if (!best || score > best.score || (score === best.score && item.price < best.item.price)) {
      best = { item, score };
    }
  }

  if (!best || best.score < 0.55) return null;
  return best;
}

type Normalised = {
  product_name: string;
  current_price: number;
  mrp: number;
  discount_percent: number;
};

/** Normalise Wire product-detail responses (shape varies by action). */
function normaliseWireDetails(raw: Record<string, any>): Normalised | null {
  const data = raw.data && typeof raw.data === "object" ? raw.data : raw;
  const name = data.product_name || data.title || "";

  let price = 0;
  if (typeof data.price === "number") price = data.price;
  else if (typeof data.price?.value === "number") price = data.price.value;

  let mrp = 0;
  const listPrice = data.list_price || data.mrp || data.originalPrice;
  if (typeof listPrice === "number") mrp = listPrice;
  else if (typeof listPrice?.value === "number") mrp = listPrice.value;
  else if (typeof listPrice === "string") {
    const numeric = parseFloat(listPrice.replace(/[^0-9.]/g, ""));
    if (!isNaN(numeric)) mrp = numeric;
  }

  let discountPercent = 0;
  if (data.discount_percent) discountPercent = Number(data.discount_percent);
  else if (mrp > price && price > 0) {
    discountPercent = Math.round(((mrp - price) / mrp) * 100);
  }

  if (name && price > 0) {
    return { product_name: name, current_price: price, mrp, discount_percent: discountPercent };
  }
  return null;
}

/** Normalise scraped product data from URL Scraper. */
function normaliseSourceData(data: Record<string, unknown>): Normalised | null {
  if (data.product_name && data.current_price) {
    return {
      product_name: String(data.product_name),
      current_price: Number(data.current_price) || 0,
      mrp: Number(data.mrp) || 0,
      discount_percent: Number(data.discount_percent) || 0,
    };
  }

  const name = String(data.name || data.title || "");
  const price = Number(data.price || data.salePrice || data.currentPrice || 0);
  if (name && price > 0) {
    const originalPrice = Number(data.originalPrice || data.mrp || data.listPrice || 0);
    let discountPct = Number(data.discount || data.discountPercentage || 0);
    if (!discountPct && originalPrice > price) {
      discountPct = Math.round(((originalPrice - price) / originalPrice) * 100);
    }
    return { product_name: name, current_price: price, mrp: originalPrice, discount_percent: discountPct };
  }
  return null;
}

type SearchNorm = { found: boolean; product_name: string; price: number; product_url: string };

/** Normalise Wire search-results responses, with a match-confidence gate applied by the caller. */
function normaliseWireSearch(raw: Record<string, any>): SearchNorm[] {
  const data = raw.data && typeof raw.data === "object" ? raw.data : raw;
  const items = data.items || data.products || [];
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  return items.map((item) => {
    let price = 0;
    if (typeof item.price === "number") price = item.price;
    else if (typeof item.price?.value === "number") price = item.price.value;

    const name = item.product_name || item.title || item.name || "";
    const url = item.url || item.product_url || item.productUrl || "";

    return price > 0 && name
      ? { found: true, product_name: name, price, product_url: url }
      : { found: false, product_name: "", price: 0, product_url: "" };
  }).filter(n => n.found);
}

/** Normalise search result data from URL Scraper. */
function normaliseSearchData(data: Record<string, unknown>): SearchNorm[] {
  if (data.found === false) return [];

  const items = Array.isArray(data.products) ? data.products : (Array.isArray(data.items) ? data.items : [data]);
  
  return items.map((item) => {
    const price = Number(item.price || item.salePrice || 0);
    const name = String(item.name || item.title || item.product_name || "");
    if (name && price > 0) {
      return {
        found: true,
        product_name: name,
        price,
        product_url: String(item.url || item.product_url || item.productUrl || ""),
      };
    }
    return { found: false, product_name: "", price: 0, product_url: "" };
  }).filter((n: SearchNorm) => n.found);
}

// Same threshold verdict.ts uses for IMPLAUSIBLE_DATA — kept in sync deliberately
// so a Wire result that verdict.ts would flag never gets accepted upstream either.
const MAX_PLAUSIBLE_DISCOUNT = 75;
const MAX_PLAUSIBLE_MRP_MULTIPLE = 4;

function isPlausible(norm: Normalised | null): boolean {
  if (!norm || norm.current_price <= 0) return false;
  if (norm.mrp <= 0) return true; // nothing to sanity-check against
  const discount = ((norm.mrp - norm.current_price) / norm.mrp) * 100;
  const multiple = norm.mrp / norm.current_price;
  return discount <= MAX_PLAUSIBLE_DISCOUNT && multiple <= MAX_PLAUSIBLE_MRP_MULTIPLE;
}

function isBlockedPage(raw: Record<string, unknown> | null): boolean {
  if (!raw) return false;
  const title = String(raw.title || "").toLowerCase();
  const description = String(raw.description || "").toLowerCase();
  return title.includes("access denied") || description.includes("permission to access");
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const pathLog: Record<string, string> = {}; // visibility into which path actually ran
  const debugRaw: Record<string, unknown> = {}; // pre-normalization snapshots for debugging
  const startedAt = Date.now();

  try {
    const { url } = await req.json();

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "Missing 'url' in request body" }, { status: 400 });
    }

    const sourceRetailer = detectRetailer(url);
    if (!sourceRetailer) {
      return NextResponse.json(
        { error: `URL must be from one of: ${RETAILER_LIST_LABEL}` },
        { status: 400 }
      );
    }

    // ── Step 1: Extract product data from source page ────────────────────
    const normalizedUrl = normalizeUrl(url);
    const sourceCacheKey = `source:${normalizedUrl}`;
    const cachedSource = getCache<ProductInfo>(sourceCacheKey);
    let product: ProductInfo | null = cachedSource;
    const sourceConfig = RETAILERS[sourceRetailer];

    // Wire detail path — only attempted if this retailer has a configured
    // detail action AND has been marked wireVerified. Amazon's detail action
    // is known to sometimes return implausible data (the ₹89,990 vs ₹25,000
    // case) even though it's "verified," so its result still goes through
    // the plausibility gate below regardless — wireVerified controls whether
    // we try Wire at all, isPlausible() controls whether we trust what it
    // gives back.
    if (sourceConfig.wire?.detailActionId && sourceConfig.wireVerified) {
      try {
        let wireParams: Record<string, unknown>;
        if (sourceRetailer === "Amazon") {
          const asin = extractAmazonAsin(url);
          if (!asin) throw new Error("Could not extract ASIN from URL");
          wireParams = { asin };
        } else {
          wireParams = { product_url: url };
        }

        const wireRes = await executeWireTask(sourceConfig.wire.detailActionId, wireParams, {
          timeoutMs: WIRE_TIMEOUT_MS,
        });
        debugRaw.sourceWireRaw = wireRes.data;
        const norm = normaliseWireDetails(wireRes.data as Record<string, any>);
        debugRaw.sourceWireNormalized = norm;

        if (norm && isPlausible(norm)) {
          product = {
            productName: norm.product_name,
            sourceRetailer,
            claimedPrice: norm.current_price,
            claimedMrp: norm.mrp > 0 ? norm.mrp : null,
            claimedDiscountPercent: norm.discount_percent > 0 ? norm.discount_percent : null,
          };
          setCache(sourceCacheKey, product);
          pathLog.source = "wire";
        } else if (norm) {
          const discount = norm.mrp > 0 ? Math.round(((norm.mrp - norm.current_price) / norm.mrp) * 100) : 0;
          console.warn(
            `${sourceRetailer} Wire returned implausible data (${discount}% off). Falling back to URL Scraper.`
          );
          debugRaw.sourceWireRejectedReason = `implausible: ${discount}% off`;
        }
      } catch (e) {
        console.warn(`${sourceRetailer} Wire details failed, falling back to scraper:`, e);
        debugRaw.sourceWireError = e instanceof Error ? e.message : String(e);
      }
    }

    // Ajio direct product pages are frequently blocked, so use search/results
    // first when we can infer a useful query from the URL. This avoids wasting
    // time on a page we already know is hostile to scraping.
    if (!product && sourceRetailer === "Ajio") {
      const slugQuery = slugToQueryFromUrl(url);
      if (slugQuery) {
        const fallbackSearchUrl = buildSearchUrl("Ajio", sanitizeSearchQuery(slugQuery));
        const fallbackScrape = await scrapeUrl(fallbackSearchUrl, SEARCH_RESULT_SCHEMA, {
          timeoutMs: SOURCE_TIMEOUT_MS,
          useBrowser: false,
        });
        const fallbackRaw = extractJsonData(fallbackScrape);
        const fallbackNorms = fallbackRaw ? normaliseSearchData(fallbackRaw) : [];
        const fallbackMatch = pickBestMatch(slugQuery, fallbackNorms);
        if (fallbackMatch) {
          product = {
            productName: fallbackMatch.item.product_name,
            sourceRetailer,
            claimedPrice: fallbackMatch.item.price,
            claimedMrp: null,
            claimedDiscountPercent: null,
          };
          setCache(sourceCacheKey, product);
          pathLog.source = "ajio-search-fallback";
        }
      }
    }

    // URL Scraper fallback — also the only extraction path for retailers
    // with no Wire detail action configured (Myntra, Croma), and the backup
    // path when retailer-specific rescue logic doesn't resolve the product.
    if (!product) {
      let sourceScrape: Record<string, unknown>;
      try {
        sourceScrape = await scrapeUrl(url, SOURCE_SCHEMA, {
          timeoutMs: SOURCE_TIMEOUT_MS,
          useBrowser: sourceRetailer !== "Amazon",
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message === "ANAKIN_INSUFFICIENT_CREDITS") {
          return NextResponse.json(
            {
              error: "Live scraping is temporarily unavailable because the Anakin API is out of credits. The price-check logic is working, but the external data source needs credits to run.",
              ...(INCLUDE_DEBUG ? { _debugRaw: debugRaw } : {}),
            },
            { status: 503 }
          );
        }
        throw err;
      }
      const sourceRaw = extractJsonData(sourceScrape);
      debugRaw.sourceScraperRaw = sourceRaw;

      if (!sourceRaw) {
        const searchQuery = productSearchQueryFromUrl(url);
        if (searchQuery) {
          const searchUrl = buildSearchUrl(sourceRetailer, searchQuery);
          const searchScrape = await scrapeUrl(searchUrl, SEARCH_RESULT_SCHEMA, {
            timeoutMs: SOURCE_TIMEOUT_MS,
            useBrowser: false,
          });
          const searchRaw = extractJsonData(searchScrape);
          if (searchRaw) {
            const norms = normaliseSearchData(searchRaw);
            const match = pickBestMatch(searchQuery, norms);
            if (match) {
              product = {
                productName: match.item.product_name,
                sourceRetailer,
                claimedPrice: match.item.price,
                claimedMrp: null,
                claimedDiscountPercent: null,
              };
              setCache(sourceCacheKey, product);
              pathLog.source = "search-fallback";
            }
          }
        }

        if (!product) {
          return NextResponse.json(
            { error: "Could not read that page. Make sure the link opens a product page.", ...(INCLUDE_DEBUG ? { _debugRaw: debugRaw } : {}) },
            { status: 422 }
          );
        }
      }

      const extracted = sourceRaw ? normaliseSourceData(sourceRaw) : null;
      debugRaw.sourceScraperNormalized = extracted;
      if (!extracted || !extracted.product_name || extracted.current_price <= 0 || isBlockedPage(sourceRaw)) {
        const searchQuery = productSearchQueryFromUrl(url);
        if (searchQuery) {
          const searchUrl = buildSearchUrl(sourceRetailer, searchQuery);
          const searchScrape = await scrapeUrl(searchUrl, SEARCH_RESULT_SCHEMA, {
            timeoutMs: SOURCE_TIMEOUT_MS,
            useBrowser: false,
          });
          const searchRaw = extractJsonData(searchScrape);
          if (searchRaw) {
            const norms = normaliseSearchData(searchRaw);
            const match = pickBestMatch(searchQuery, norms);
            if (match) {
              product = {
                productName: match.item.product_name,
                sourceRetailer,
                claimedPrice: match.item.price,
                claimedMrp: null,
                claimedDiscountPercent: null,
              };
              setCache(sourceCacheKey, product);
              pathLog.source = "search-fallback";
            }
          }
        }

        if (!product) {
          return NextResponse.json(
            { error: "Could not extract price from that page. Try a different product link.", ...(INCLUDE_DEBUG ? { _debugRaw: debugRaw } : {}) },
            { status: 422 }
          );
        }
      }

      if (!product && extracted) {
        product = {
          productName: extracted.product_name,
          sourceRetailer,
          claimedPrice: extracted.current_price,
          claimedMrp: extracted.mrp > 0 ? extracted.mrp : null,
          claimedDiscountPercent: extracted.discount_percent > 0 ? extracted.discount_percent : null,
        };
        setCache(sourceCacheKey, product);
        pathLog.source = "url-scraper";
      }
    }

    // ── Step 2: Search every other retailer in parallel ───────────────────
    if (!product) {
      throw new Error("Could not determine product details from the source page.");
    }

    const targets =
      sourceRetailer === "Ajio"
        ? (["Flipkart", "Amazon"] as Retailer[])
        : ALL_RETAILERS.filter((r) => r !== sourceRetailer);
    const searchQuery = sanitizeSearchQuery(product.productName);
    const searchKey = `search:${sourceRetailer}:${searchQuery}`;
    const cachedComparison = getCache<RetailerPrice[]>(searchKey);
    if (cachedComparison) {
      const result = computeVerdict(product, cachedComparison);
      return NextResponse.json({
        ...result,
        cacheHit: true,
        analysisTimeMs: Date.now() - startedAt,
        ...(INCLUDE_DEBUG ? { _debugPathLog: { cache: "hit" }, _debugRaw: debugRaw } : {}),
      });
    }

    const comparisonResults = await Promise.allSettled(
      targets.map(async (retailer): Promise<RetailerPrice> => {
        const config = RETAILERS[retailer];

        if (config.wire?.searchActionId && config.wire.searchParamBuilder && config.wireVerified) {
          try {
            pathLog[retailer] = "wire-attempt";
            const wireRes = await executeWireTask(config.wire.searchActionId, {
              ...config.wire.searchParamBuilder(searchQuery),
            }, { timeoutMs: WIRE_TIMEOUT_MS });
            const norms = normaliseWireSearch(wireRes.data as Record<string, any>);
            const match = pickBestMatch(product.productName, norms);
            if (match) {
              pathLog[retailer] = "wire";
              return {
                retailer,
                found: true,
                price: match.item.price,
                productUrl: match.item.product_url || undefined,
                matchedProductName: match.item.product_name,
                matchConfidence: Math.round(match.score * 100),
              };
            }
          } catch (e) {
            console.warn(`${retailer} Wire search failed, falling back to scraper:`, e);
          }
        }

        // Fallback to URL Scraper (also the only path for retailers with no
        // Wire search action configured).
        pathLog[retailer] = "url-scraper";
        const searchUrl = buildSearchUrl(retailer, searchQuery);
        const scrape = await scrapeUrl(searchUrl, SEARCH_RESULT_SCHEMA, {
          timeoutMs: SEARCH_TIMEOUT_MS,
          useBrowser: false,
        });
        const raw = extractJsonData(scrape);
        const norms = raw ? normaliseSearchData(raw) : [];
        const match = pickBestMatch(product.productName, norms);

        let productUrl = match ? match.item.product_url || undefined : undefined;
        if (productUrl && productUrl.startsWith("/")) {
          if (retailer === "Ajio") productUrl = `https://www.ajio.com${productUrl}`;
          else if (retailer === "Flipkart") productUrl = `https://www.flipkart.com${productUrl}`;
          else if (retailer === "Myntra") productUrl = `https://www.myntra.com${productUrl}`;
          else if (retailer === "Croma") productUrl = `https://www.croma.com${productUrl}`;
          else if (retailer === "Amazon") productUrl = `https://www.amazon.in${productUrl}`;
        }

        return {
          retailer,
          found: !!match,
          price: match ? match.item.price : null,
          productUrl,
          matchedProductName: match ? match.item.product_name : undefined,
          matchConfidence: match ? Math.round(match.score * 100) : undefined,
        };
      })
    );

    const comparisons: RetailerPrice[] = comparisonResults.map((r, i) =>
      r.status === "fulfilled" ? r.value : { retailer: targets[i], found: false, price: null }
    );
    setCache(searchKey, comparisons);

    // ── Step 3: Pure-math verdict — no LLM math ──────────────────────────
    const result = computeVerdict(product, comparisons);

    console.log("PriceGhost path log:", pathLog);

    return NextResponse.json({
      ...result,
      cacheHit: false,
      analysisTimeMs: Date.now() - startedAt,
      ...(INCLUDE_DEBUG ? { _debugPathLog: pathLog, _debugRaw: debugRaw } : {}),
    });
  } catch (err) {
    console.error("Analyze error:", err, "path log so far:", pathLog);
    const message = err instanceof Error ? err.message : "Unknown server error";
    const status = message.includes("timed out") ? 504 : 500;
    return NextResponse.json(
      {
        error: message.includes("timed out")
          ? "The retailer took too long to respond. Try a faster product page or use a different retailer URL."
          : message,
        ...(INCLUDE_DEBUG ? { _debugPathLog: pathLog, _debugRaw: debugRaw } : {}),
      },
      { status }
    );
  }
}
