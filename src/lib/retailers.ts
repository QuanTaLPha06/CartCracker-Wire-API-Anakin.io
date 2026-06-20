// Single source of truth for every retailer-specific quirk.
//
// Why this file exists: before this refactor, adding a retailer meant
// touching detectRetailer(), buildSearchUrl(), the Step 1 Wire/scraper
// branch, the Step 2 comparison loop, and the verdict.ts type union —
// six places, all hand-copied. That's exactly how a per-retailer quirk
// (Myntra's rawQuery requirement, Amazon's ASIN extraction) gets silently
// missed on the next retailer added under time pressure. Now each
// retailer is one object below; every consumer iterates this list.

export type Retailer = "Amazon" | "Myntra" | "Flipkart" | "Ajio" | "Croma";

export const ALL_RETAILERS: Retailer[] = ["Amazon", "Myntra", "Flipkart", "Ajio", "Croma"];

export type WireConfig = {
  /** Wire action_id for a direct product-detail fetch by URL/ASIN. */
  detailActionId?: string;
  /** Wire action_id for a search-results fetch. */
  searchActionId?: string;
  /**
   * Builds the exact params object for the search action. Kept per-retailer
   * and explicit, rather than merging field names across actions, because
   * the two confirmed actions this session used DIFFERENT field names for
   * the same concept (Amazon: `search_query` + `sort_order`; Flipkart:
   * `query`). Guessing that sending both is "harmless extra" is exactly the
   * kind of unverified assumption that caused the original MRP bug — define
   * what's actually confirmed instead.
   */
  searchParamBuilder?: (query: string) => Record<string, unknown>;
};

export type RetailerConfig = {
  name: Retailer;
  /** Hostname fragments that identify a URL as belonging to this retailer. */
  hostMatches: string[];
  /** Build a search-results URL for the URL Scraper fallback path. */
  buildSearchUrl: (query: string) => string;
  /**
   * STATUS of Wire (Holocron) pre-built actions for this retailer, set from
   * live testing in this session — not assumed. Anakin's catalog can list an
   * action_id that doesn't actually work; "configured" only means "worth
   * trying," gated the same way Amazon already was. Unverified retailers
   * (Ajio, Croma) ship with Wire disabled and URL Scraper as the only path
   * until someone actually runs them against a real product.
   */
  wire: WireConfig | null;
  /** True once a human has confirmed Wire actually returns correct data live. */
  wireVerified: boolean;
};

export const RETAILERS: Record<Retailer, RetailerConfig> = {
  Amazon: {
    name: "Amazon",
    hostMatches: ["amazon.in", "amazon.com"],
    buildSearchUrl: (q) => `https://www.amazon.in/s?k=${encodeURIComponent(q)}`,
    wire: {
      detailActionId: "act_amzn_in_product_detail_ssr",
      searchActionId: "act_amzn_in_search_results_ssr",
      searchParamBuilder: (q) => ({ search_query: q, sort_order: "apparel" }),
    },
    // Confirmed working for SEARCH in this session. Detail action confirmed
    // BROKEN (returns stale/wrong list_price — the ₹89,990 vs ₹25,000 case)
    // and is gated behind the plausibility check in route.ts, not trusted
    // outright. "wireVerified: true" here describes the search path; the
    // detail path has its own explicit plausibility gate regardless.
    wireVerified: true,
  },
  Myntra: {
    name: "Myntra",
    hostMatches: ["myntra.com"],
    // Confirmed via live testing: needs rawQuery to resolve to search
    // results rather than an unrelated product page.
    buildSearchUrl: (q) => `https://www.myntra.com/${encodeURIComponent(q)}?rawQuery=${encodeURIComponent(q)}`,
    wire: null, // No Wire action used for Myntra in this session — URL Scraper only.
    wireVerified: false,
  },
  Flipkart: {
    name: "Flipkart",
    hostMatches: ["flipkart.com"],
    buildSearchUrl: (q) => `https://www.flipkart.com/search?q=${encodeURIComponent(q)}`,
    wire: {
      detailActionId: "flipkart_get_product",
      searchActionId: "fk_search_products",
      searchParamBuilder: (q) => ({ query: q }),
    },
    wireVerified: true,
  },
  Ajio: {
    name: "Ajio",
    hostMatches: ["ajio.com"],
    buildSearchUrl: (q) => `https://www.ajio.com/search/?text=${encodeURIComponent(q)}`,
    // No Wire action_id confirmed to exist for Ajio in Anakin's catalog as of
    // this session — not tested, so not wired in. URL Scraper only until
    // someone checks the catalog and live-tests a real action_id here.
    wire: null,
    wireVerified: false,
  },
  Croma: {
    name: "Croma",
    hostMatches: ["croma.com"],
    buildSearchUrl: (q) => `https://www.croma.com/searchB?q=${encodeURIComponent(q)}%3Arelevance&text=${encodeURIComponent(q)}`,
    wire: null,
    wireVerified: false,
  },
};

export function detectRetailer(url: string): Retailer | null {
  const u = url.toLowerCase();
  for (const r of ALL_RETAILERS) {
    if (RETAILERS[r].hostMatches.some((h) => u.includes(h))) return r;
  }
  return null;
}

export function buildSearchUrl(retailer: Retailer, query: string): string {
  return RETAILERS[retailer].buildSearchUrl(query);
}

/** Human-readable list for error messages and UI copy — derived, never hand-typed. */
export const RETAILER_LIST_LABEL = ALL_RETAILERS.join(", ");
