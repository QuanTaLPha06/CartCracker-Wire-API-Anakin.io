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

const SEARCH_RESULT_SCHEMA = {
  type: "object",
  properties: {
    found: {
      type: "boolean",
      description:
        "True if there is AT LEAST ONE specific product result in the main search grid. False if no products matched or if the page shows a 'no results' state.",
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
            description: "URL of the product listing, if available",
          },
        },
        required: ["product_name", "price"],
      },
    },
  },
  required: ["found"],
};

async function test() {
  const searchUrl = "https://www.ajio.com/search/?text=Puma%20Fade%20Pro%20Running%20Shoes";
  console.log("Scraping Ajio search:", searchUrl);
  try {
    const res = await scrapeUrl(searchUrl, SEARCH_RESULT_SCHEMA);
    const data = extractJsonData(res);
    console.log("Result:", JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(err);
  }
}

test();
