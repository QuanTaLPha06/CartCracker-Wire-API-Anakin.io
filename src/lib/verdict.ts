// Verdict logic is pure arithmetic — never let an LLM compute the numbers
// that this product's entire credibility rests on.

import type { Retailer } from "./retailers";

export type RetailerPrice = {
  retailer: Retailer;
  price: number | null;
  found: boolean;
  productUrl?: string;
  matchedProductName?: string;
  matchConfidence?: number;
};

export type ProductInfo = {
  productName: string;
  sourceRetailer: Retailer;
  claimedPrice: number;
  claimedMrp: number | null;
  claimedDiscountPercent: number | null;
};

export type Verdict = "GENUINE_DEAL" | "INFLATED_MRP" | "FAKE_URGENCY" | "INSUFFICIENT_DATA" | "IMPLAUSIBLE_DATA";

export type AnalysisResult = {
  productName: string;
  sourceRetailer: string;
  claimedPrice: number;
  claimedMrp: number | null;
  claimedDiscountPercent: number | null;
  comparisons: RetailerPrice[];
  cheapestPrice: number | null;
  cheapestRetailer: string | null;
  realDiscountVsCheapest: number | null;
  verdict: Verdict;
  verdictExplanation: string;
  honestyScore: number;
};

export function computeVerdict(
  product: ProductInfo,
  comparisons: RetailerPrice[]
): AnalysisResult {
  // Sanity check FIRST, before any other logic: real retail markdowns essentially
  // never exceed ~75-80%. A claimed discount beyond that is far more likely to be
  // a scraping/normalization bug (wrong field picked up, wrong variant, stale
  // cache) than a genuine deal. Surface this honestly instead of computing a
  // verdict that LOOKS authoritative but rests on unverified inputs.
  // Confirmed by hand-testing: a real product on this pipeline produced an
  // 86% "discount" that did not match the actual page (₹25,000 MRP vs a
  // scraped ₹89,990) — this guard exists specifically because of that case.
  const MAX_PLAUSIBLE_DISCOUNT = 75;
  const MAX_PLAUSIBLE_MRP_MULTIPLE = 4; // MRP > 4x price is already extreme for most categories

  const impliedMultiple =
    product.claimedMrp && product.claimedPrice > 0
      ? product.claimedMrp / product.claimedPrice
      : null;

  const mrpImplausible =
    (product.claimedDiscountPercent !== null &&
      product.claimedDiscountPercent > MAX_PLAUSIBLE_DISCOUNT) ||
    (impliedMultiple !== null && impliedMultiple > MAX_PLAUSIBLE_MRP_MULTIPLE);

  if (mrpImplausible) {
    return {
      productName: product.productName,
      sourceRetailer: product.sourceRetailer,
      claimedPrice: product.claimedPrice,
      claimedMrp: product.claimedMrp,
      claimedDiscountPercent: product.claimedDiscountPercent,
      comparisons,
      cheapestPrice: null,
      cheapestRetailer: null,
      realDiscountVsCheapest: null,
      verdict: "IMPLAUSIBLE_DATA",
      verdictExplanation:
        "The extracted discount looks too large to trust, so we are treating this as bad input rather than a real deal.",
      honestyScore: 0,
    };
  }

  const foundPrices = comparisons.filter(
    (c) => c.found && typeof c.price === "number"
  ) as Array<RetailerPrice & { price: number }>;

  const allPrices = [
    { retailer: product.sourceRetailer, price: product.claimedPrice },
    ...foundPrices,
  ];

  const cheapest = allPrices.reduce((min, cur) =>
    cur.price < min.price ? cur : min
  );

  let verdict: Verdict = "INSUFFICIENT_DATA";
  let explanation = "";
  let honestyScore = 50;

  if (foundPrices.length === 0) {
    verdict = "INSUFFICIENT_DATA";
    explanation =
      "We couldn't confirm this product's price on other retailers right now. We can only show you what's claimed here.";
    honestyScore = 50;
  } else {
    const isSourceCheapest = cheapest.retailer === product.sourceRetailer;
    const pctVsCheapest =
      ((product.claimedPrice - cheapest.price) / cheapest.price) * 100;

    const mrpLooksInflated =
      product.claimedMrp !== null &&
      product.claimedDiscountPercent !== null &&
      product.claimedDiscountPercent > 40 &&
      // if the "discounted" price is still not meaningfully below competitors,
      // the MRP was likely inflated just to manufacture a big % off
      pctVsCheapest > -10;

    if (isSourceCheapest && !mrpLooksInflated) {
      verdict = "GENUINE_DEAL";
      explanation = `Best price found. It is ${Math.abs(Math.round(pctVsCheapest))}% cheaper than the next option.`;
      honestyScore = 90;
    } else if (mrpLooksInflated && isSourceCheapest) {
      verdict = "INFLATED_MRP";
      explanation = `The "off" claim looks inflated, but the current price is still the best one we found.`;
      honestyScore = 65;
    } else if (!isSourceCheapest) {
      verdict = "FAKE_URGENCY";
      explanation = `${cheapest.retailer} is cheaper right now, so this is not the best deal.`;
      honestyScore = 25;
    }
  }

  return {
    productName: product.productName,
    sourceRetailer: product.sourceRetailer,
    claimedPrice: product.claimedPrice,
    claimedMrp: product.claimedMrp,
    claimedDiscountPercent: product.claimedDiscountPercent,
    comparisons,
    cheapestPrice: cheapest?.price ?? null,
    cheapestRetailer: cheapest?.retailer ?? null,
    realDiscountVsCheapest:
      foundPrices.length > 0
        ? Math.round(
            ((product.claimedPrice - cheapest.price) / cheapest.price) * 100
          )
        : null,
    verdict,
    verdictExplanation: explanation,
    honestyScore,
  };
}
