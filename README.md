# CartCracker-Wire-API-Anakin.io

An AI-powered consumer shield that exposes fake e-commerce flash sales and inflated MRPs in real-time. Built with the Anakin Wire API to bypass retail anti-bot protections.

Paste a fashion product link from Amazon, Myntra, Flipkart, Ajio, or Croma and CartCracker checks whether the discount looks real.

## Setup

```bash
npm install
cp .env.example .env.local
```

Add your Anakin API key to `.env.local`:

```bash
ANAKIN_API_KEY=your_anakin_api_key_here
```

Run the app locally:

```bash
npm run dev
```

Open `http://localhost:3000`.

## What it does

1. Detects the retailer from the URL.
2. Extracts the product name, current price, MRP, and claimed discount.
3. Searches the other retailers for the same product.
4. Computes the verdict in plain TypeScript.

## Verdicts

- `GENUINE_DEAL`
- `INFLATED_MRP`
- `FAKE_URGENCY`
- `INSUFFICIENT_DATA`
- `IMPLAUSIBLE_DATA`

## Deploying

This is a standard Next.js app and can be deployed on Vercel or any platform that supports Next.js.

Before deploying:

1. Set `ANAKIN_API_KEY` in your environment variables.
2. Run `npm run build` locally to confirm the app compiles.
3. If you want extra diagnostics while testing, set `DEBUG_ANALYZE=1`.

## Notes

- The app uses Anakin URL Scraper as the fallback path.
- Some retailer search pages are brittle, so `INSUFFICIENT_DATA` is a valid result.
- The app intentionally avoids doing percentage math in the model layer.
