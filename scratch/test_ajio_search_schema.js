
async function run() {
  const SEARCH_RESULT_SCHEMA = {
    type: "object",
    properties: {
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
    required: ["products"],
  };

  const body = {
    url: "https://www.ajio.com/search/?text=Puma%20Fade%20Pro",
    useBrowser: true,
    formats: ["markdown"],
    generateJson: true,
    jsonSchema: SEARCH_RESULT_SCHEMA
  };

  const API_KEY = process.env.ANAKIN_API_KEY;
  if (!API_KEY) {
    console.error("Please set the ANAKIN_API_KEY environment variable.");
    process.exit(1);
  }
  
  const submitRes = await fetch(`https://api.anakin.io/v1/url-scraper`, {
    method: "POST",
    headers: {
      "X-API-Key": API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const submitData = await submitRes.json();
  const jobId = submitData.jobId || submitData.id;
  console.log("Job ID:", jobId);

  const start = Date.now();
  while (Date.now() - start < 45000) {
    const res = await fetch(`https://api.anakin.io/v1/url-scraper/${jobId}`, {
      headers: { "X-API-Key": API_KEY }
    });
    const data = await res.json();
    if (data.status === "completed") {
      console.log(JSON.stringify(data.generatedJson, null, 2));
      return;
    }
    if (data.status === "failed") {
      console.log("FAILED", data);
      return;
    }
    await new Promise(r => setTimeout(r, 2000));
  }
}

run().catch(console.error);
