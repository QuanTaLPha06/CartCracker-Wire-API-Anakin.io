

async function run() {
  const SOURCE_SCHEMA = {
    type: "object",
    properties: {
      product_name: { type: "string" },
      current_price: { type: "number" },
      mrp: { type: "number" },
      discount_percent: { type: "number" },
    },
    required: ["product_name", "current_price"],
  };

  const body = {
    url: "https://www.ajio.com/puma-fade-pro-running-shoes/p/451021246_navybluemulti?",
    useBrowser: true,
    formats: ["markdown"],
    generateJson: true,
    jsonSchema: SOURCE_SCHEMA
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
      console.log(JSON.stringify(data, null, 2));
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
