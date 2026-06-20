import type { AnalysisResult, ProductInfo, RetailerPrice } from "./verdict";

export function getDemoAnalysis(url: string): AnalysisResult | null {
  const normalized = url.toLowerCase();

  if (normalized.includes("ajio.com/puma-fade-pro-running-shoes")) {
    const source: ProductInfo = {
      productName: "Puma Fade Pro Running Shoes",
      sourceRetailer: "Ajio",
      claimedPrice: 4399,
      claimedMrp: null,
      claimedDiscountPercent: null,
    };

    const comparisons: RetailerPrice[] = [
      {
        retailer: "Amazon",
        found: true,
        price: 3599,
        productUrl: "https://www.amazon.in/Puma-Unisex-Adult-Darter-Fade-Running/dp/B0FNJRJB27",
        matchedProductName: "Puma | Fade Pro Running Shoes for Unisex-Adult",
        matchConfidence: 100,
      },
      { retailer: "Myntra", found: false, price: null },
      {
        retailer: "Flipkart",
        found: true,
        price: 4399,
        productUrl: "https://www.flipkart.com/puma-pro-fade-running-shoes-men/p/itmd70b5def55eaa?pid=SHOH43HGAGMFJWNY&lid=LSTSHOH43HGAGMFJWNYQWIDPR&marketplace=FLIPKART&q=Puma+Fade+Pro+Running+Shoes&store=osp%2Fcil%2F1cu",
        matchedProductName: "PUMA Pro Fade Running Shoes For Men",
        matchConfidence: 100,
      },
      { retailer: "Croma", found: false, price: null },
    ];

    return {
      productName: source.productName,
      sourceRetailer: source.sourceRetailer,
      claimedPrice: source.claimedPrice,
      claimedMrp: source.claimedMrp,
      claimedDiscountPercent: source.claimedDiscountPercent,
      comparisons,
      cheapestPrice: 3599,
      cheapestRetailer: "Amazon",
      realDiscountVsCheapest: 22,
      verdict: "FAKE_URGENCY",
      verdictExplanation: "Amazon is cheaper right now, so this is not the best deal.",
      honestyScore: 90,
    };
  }

  if (normalized.includes("myntra.com") && normalized.includes("fade pro running shoes")) {
    const source: ProductInfo = {
      productName: "Puma Fade Pro Running Shoes",
      sourceRetailer: "Myntra",
      claimedPrice: 4399,
      claimedMrp: 7999,
      claimedDiscountPercent: 45,
    };

    const comparisons: RetailerPrice[] = [
      {
        retailer: "Amazon",
        found: true,
        price: 3599,
        productUrl: "https://www.amazon.in/Puma-Unisex-Adult-Darter-Fade-Running/dp/B0FNJRJB27",
        matchedProductName: "Puma | Fade Pro Running Shoes for Unisex-Adult",
        matchConfidence: 100,
      },
      {
        retailer: "Ajio",
        found: true,
        price: 4399,
        productUrl: "https://www.ajio.com/puma-fade-pro-running-shoes/p/451021246_navybluemulti",
        matchedProductName: "Puma Fade Pro Running Shoes",
        matchConfidence: 100,
      },
      { retailer: "Flipkart", found: true, price: 4399, matchedProductName: "PUMA Pro Fade Running Shoes For Men", matchConfidence: 100 },
      { retailer: "Croma", found: false, price: null },
    ];

    return {
      productName: source.productName,
      sourceRetailer: source.sourceRetailer,
      claimedPrice: source.claimedPrice,
      claimedMrp: source.claimedMrp,
      claimedDiscountPercent: source.claimedDiscountPercent,
      comparisons,
      cheapestPrice: 3599,
      cheapestRetailer: "Amazon",
      realDiscountVsCheapest: 22,
      verdict: "FAKE_URGENCY",
      verdictExplanation: "Amazon is cheaper right now, so this is not the best deal.",
      honestyScore: 90,
    };
  }

  if (normalized.includes("amazon.in/dp/b0dj2x2hr5")) {
    return {
      productName: "Puma Fade Pro Running Shoes",
      sourceRetailer: "Amazon",
      claimedPrice: 3599,
      claimedMrp: 7999,
      claimedDiscountPercent: 55,
      comparisons: [],
      cheapestPrice: 3599,
      cheapestRetailer: "Amazon",
      realDiscountVsCheapest: 0,
      verdict: "INSUFFICIENT_DATA",
      verdictExplanation: "Demo fallback: Amazon live scraping is currently unavailable.",
      honestyScore: 50,
    };
  }

  return null;
}
