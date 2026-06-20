import { POST } from "./src/app/api/analyze/route";
import { NextRequest } from "next/server";
import fs from "fs";

// Load env
const env = fs.readFileSync(".env.local", "utf8");
env.split("\n").forEach(line => {
  const match = line.trim().match(/^([^=]+)=(.*)$/);
  if (match) {
    process.env[match[1]] = match[2].trim();
  }
});

async function run() {
  const req = new NextRequest("http://localhost:3000/api/analyze", {
    method: "POST",
    body: JSON.stringify({ url: "https://www.ajio.com/puma-fade-pro-running-shoes/p/451021246_navybluemulti" })
  });
  
  const res = await POST(req);
  console.log(await res.json());
}
run();
