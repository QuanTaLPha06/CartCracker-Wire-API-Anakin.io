import { scrapeUrl, extractJsonData } from "./src/lib/anakin";
import fs from "fs";

// Load env
const env = fs.readFileSync(".env.local", "utf8");
env.split("\n").forEach(line => {
  const match = line.trim().match(/^([^=]+)=(.*)$/);
  if (match) {
    process.env[match[1]] = match[2].trim();
  }
});

const SOURCE_SCHEMA = {
  type: "object",
  properties: {
    product_name: {
      type: "string",
      description: "Clean product title of the MAIN product on the page including brand and model. Ignore 'customers also viewed' or related items.",
    },
    current_price: {
      type: "number",
      description: "Current selling price of the MAIN product in INR, numeric only, no currency symbols. DO NOT extract prices of related products or ads.",
    },
    mrp: {
      type: "number",
      description: "Listed MRP / strikethrough / 'was' price of the MAIN product in INR. Return 0 if not shown.",
    },
    discount_percent: {
      type: "number",
      description: "Discount percentage shown on the page for the MAIN product (e.g. 67 for '67% OFF'). Return 0 if not shown.",
    },
  },
  required: ["product_name", "current_price"],
};

async function test() {
  const url = "https://www.amazon.in/dp/B0DJ2X2HR5"; // Puma Fade Pro Running Shoes
  console.log("Scraping Amazon:", url);
  try {
    const res = await scrapeUrl(url, SOURCE_SCHEMA);
    const data = extractJsonData(res);
    console.log("Result:", JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(err);
  }
}

test();
