"use client";

import { useState } from "react";

type RetailerPrice = {
  retailer: string;
  price: number | null;
  found: boolean;
  productUrl?: string;
  matchedProductName?: string;
  matchConfidence?: number;
};

type AnalysisResult = {
  productName: string;
  sourceRetailer: string;
  claimedPrice: number;
  claimedMrp: number | null;
  claimedDiscountPercent: number | null;
  comparisons: RetailerPrice[];
  cheapestPrice: number | null;
  cheapestRetailer: string | null;
  realDiscountVsCheapest: number | null;
  verdict: "GENUINE_DEAL" | "INFLATED_MRP" | "FAKE_URGENCY" | "INSUFFICIENT_DATA" | "IMPLAUSIBLE_DATA";
  verdictExplanation: string;
  honestyScore: number;
  cacheHit?: boolean;
  analysisTimeMs?: number;
};

const VERDICT_CONFIG: Record<
  AnalysisResult["verdict"],
  { label: string; color: string; bg: string; icon: React.ReactNode }
> = {
  GENUINE_DEAL: { 
    label: "GENUINE DEAL", 
    color: "var(--verified)", 
    bg: "var(--verified-bg)",
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  },
  INFLATED_MRP: { 
    label: "INFLATED MRP", 
    color: "var(--caution)", 
    bg: "var(--caution-bg)",
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  },
  FAKE_URGENCY: { 
    label: "FAKE URGENCY", 
    color: "var(--alarm)", 
    bg: "var(--alarm-bg)",
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  },
  INSUFFICIENT_DATA: { 
    label: "COULDN'T VERIFY", 
    color: "var(--ink-soft)", 
    bg: "var(--neutral-bg)",
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
  },
  IMPLAUSIBLE_DATA: { 
    label: "DATA LOOKS OFF", 
    color: "var(--caution)", 
    bg: "var(--caution-bg)",
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  },
};

const LOADING_STEPS = [
  "Summoning the ghost\u2026",
  "Reading the product listing\u2026",
  "Haunting other retailers for real prices\u2026",
  "Running the honesty check\u2026",
];


export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  function validateUrl(input: string) {
    try {
      const parsed = new URL(input.trim());
      return ["amazon.in", "amazon.com", "myntra.com", "flipkart.com", "ajio.com", "croma.com"].some((host) =>
        parsed.hostname.includes(host)
      );
    } catch {
      return false;
    }
  }

  async function handleAnalyze(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    if (!validateUrl(url)) {
      setUrlError("Please paste a valid product link from Amazon, Myntra, Flipkart, Ajio, or Croma.");
      return;
    }
    setLoading(true);
    setError(null);
    setUrlError(null);
    setResult(null);
    setLoadingStep(0);

    const stepTimer = setInterval(() => {
      setLoadingStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1));
    }, 2800);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      clearInterval(stepTimer);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-16 sm:py-24 relative overflow-hidden">
      {/* Decorative Ghostly Orbs */}
      <div className="absolute top-20 -left-32 w-96 h-96 bg-emerald-500/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-20 -right-32 w-96 h-96 bg-rose-500/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Hero */}
      <div className="max-w-2xl w-full text-center mb-16 fade-in-up relative z-10">
        <div
          className="inline-flex items-center gap-2 font-mono text-[10px] sm:text-xs tracking-[0.2em] uppercase px-4 py-2 mb-8 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm text-slate-300 shadow-xl"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          Powered by Anakin Wire
        </div>
        <h1
          className="text-5xl sm:text-7xl font-extrabold tracking-tight leading-[1.05] mb-6 text-transparent bg-clip-text bg-gradient-to-br from-white to-slate-500"
          style={{ fontFamily: "var(--font-display)" }}
        >
          PriceGhost
        </h1>
        <p className="text-xl sm:text-2xl font-medium mb-4 text-slate-300">
          Is that &ldquo;70% OFF&rdquo; actually true?
        </p>
        <p className="text-base sm:text-lg text-slate-500 max-w-xl mx-auto font-light leading-relaxed">
          Paste a product link from Amazon, Myntra, Flipkart, Ajio, or Croma.
          We haunt the web to check the real price across all five before you buy.
        </p>
      </div>

      {/* Input */}
      <form onSubmit={handleAnalyze} className="w-full max-w-2xl mb-12 fade-in-up relative z-10" style={{ animationDelay: "0.1s" }}>
        <div
          className="flex flex-col sm:flex-row gap-2 p-2 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl pulse-glow transition-all duration-300 focus-within:border-white/30 focus-within:bg-white/10"
        >
          <div className="relative flex-1 flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 absolute left-4 text-slate-400">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
            </svg>
            <input
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.myntra.com/..."
              className="w-full pl-12 pr-4 py-4 font-mono text-sm outline-none bg-transparent text-white placeholder-slate-500 rounded-xl"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-8 py-4 font-bold uppercase tracking-widest text-sm text-black rounded-xl disabled:opacity-50 transition-all hover:scale-[1.02] active:scale-[0.98] glimmer"
            style={{ backgroundColor: "var(--ink)" }}
          >
            {loading ? "Checking" : "Reveal"}
          </button>
        </div>
        {urlError && <p className="mt-3 text-sm text-amber-300">{urlError}</p>}
      </form>


      {/* Loading state */}
      {loading && (
        <div className="max-w-xl w-full text-center fade-in-up">
          <div className="inline-flex flex-col items-center gap-4">
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 border-4 border-white/10 rounded-full" />
              <div className="absolute inset-0 border-4 border-emerald-500 rounded-full border-t-transparent animate-spin" />
            </div>
            <p className="font-mono text-sm tracking-wide text-slate-400 animate-pulse">
              {LOADING_STEPS[loadingStep]}
            </p>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div
          className="max-w-xl w-full p-6 rounded-2xl border bg-rose-500/10 backdrop-blur-md fade-in-up flex items-start gap-4"
          style={{ borderColor: "var(--alarm)" }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 shrink-0" style={{ color: "var(--alarm)" }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className="text-sm font-medium leading-relaxed" style={{ color: "var(--alarm)" }}>
            {error}
          </div>
        </div>
      )}

      {/* Result */}
      {result && <ResultTicket result={result} />}
    </div>
  );
}

function ResultTicket({ result }: { result: AnalysisResult }) {
  const cfg = VERDICT_CONFIG[result.verdict];

  return (
    <div className="max-w-3xl w-full fade-in-up" style={{ animationDelay: "0.2s" }}>
      <div className="ticket-edge p-8 sm:p-10 relative">
        {/* Glow effect based on verdict */}
        <div 
          className="absolute inset-0 opacity-20 blur-2xl pointer-events-none rounded-2xl" 
          style={{ background: `radial-gradient(circle at center, ${cfg.color}, transparent 70%)` }} 
        />

        <div className="relative z-10">
          {/* Verdict stamp */}
          <div className="flex justify-center mb-10">
            <div
              className="stamp inline-flex items-center gap-2 px-6 py-3 border-2 rounded-lg font-mono font-bold text-sm sm:text-base tracking-[0.15em]"
              style={{ borderColor: cfg.color, color: cfg.color, backgroundColor: cfg.bg }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                {cfg.icon}
              </svg>
              {cfg.label}
            </div>
          </div>

          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-2 font-display text-white">{result.productName}</h2>
          <p className="text-center text-sm mb-10 text-slate-400 font-mono tracking-wide uppercase">
            Listed on {result.sourceRetailer}
          </p>
          <div className="flex flex-wrap justify-center gap-3 mb-8">
            <MetaPill label="Cache" value={result.cacheHit ? "HIT" : "MISS"} tone={result.cacheHit ? "emerald" : "slate"} />
            <MetaPill label="Time" value={result.analysisTimeMs ? `${Math.round(result.analysisTimeMs / 100) / 10}s` : "n/a"} tone="slate" />
            <MetaPill label="Honesty" value={`${result.honestyScore}/100`} tone={result.honestyScore >= 80 ? "emerald" : result.honestyScore >= 50 ? "amber" : "rose"} />
          </div>

          {/* Price strip */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4 mb-10">
            <PriceCard
              label={result.sourceRetailer}
              price={result.claimedPrice}
              highlight={result.cheapestRetailer === result.sourceRetailer}
              isSource
            />
            {result.comparisons.map((c) => (
              <PriceCard
                key={c.retailer}
                label={c.retailer}
                price={c.price}
                found={c.found}
                highlight={result.cheapestRetailer === c.retailer}
                matchedProductName={c.matchedProductName}
                matchConfidence={c.matchConfidence}
              />
            ))}
          </div>

          {result.claimedMrp && (
            <div className="flex flex-col items-center justify-center mb-8 p-4 rounded-xl bg-white/5 border border-white/5">
              <p className="text-xs text-slate-400 font-mono uppercase tracking-widest mb-2">Claimed Deal</p>
              <p className="text-lg font-mono">
                <span className="text-slate-500 mr-3 line-through decoration-slate-500/50">₹{result.claimedMrp.toLocaleString("en-IN")}</span>
                <span className="font-bold" style={{ color: cfg.color }}>{result.claimedDiscountPercent}% OFF</span>
              </p>
            </div>
          )}

          <div
            className="border-t border-white/10 pt-6 mt-4 text-base sm:text-lg font-medium leading-relaxed text-center"
          >
            {result.verdictExplanation}
          </div>
        </div>
      </div>
    </div>
  );
}

function PriceCard({
  label,
  price,
  found = true,
  highlight = false,
  isSource = false,
  matchedProductName,
  matchConfidence,
}: {
  label: string;
  price: number | null;
  found?: boolean;
  highlight?: boolean;
  isSource?: boolean;
  matchedProductName?: string;
  matchConfidence?: number;
}) {
  return (
    <div
      className={`px-3 py-4 text-center rounded-xl transition-all duration-300 ${
        highlight 
          ? "border-emerald-500/50 bg-emerald-500/10 shadow-[0_0_15px_rgba(16,185,129,0.15)] scale-105 z-10 relative" 
          : "border-white/10 bg-white/5 hover:bg-white/10"
      } border`}
    >
      <div className={`text-[10px] sm:text-xs font-mono uppercase tracking-widest mb-2 ${highlight ? 'text-emerald-400' : 'text-slate-400'}`}>
        {label}{isSource ? "*" : ""}
      </div>
      {found && price !== null ? (
        <>
          <div className={`font-mono font-bold text-sm sm:text-base whitespace-nowrap ${highlight ? 'text-emerald-300' : 'text-white'}`}>
            ₹{price.toLocaleString("en-IN")}
          </div>
          {(matchedProductName || matchConfidence !== undefined) && (
            <div className="mt-2 text-[10px] leading-snug text-slate-500">
              {matchedProductName && <div className="line-clamp-2">{matchedProductName}</div>}
              {matchConfidence !== undefined && <div>Match {matchConfidence}%</div>}
            </div>
          )}
        </>
      ) : (
        <div className="font-mono text-xs text-slate-600 mt-1">
          N/A
        </div>
      )}
    </div>
  );
}

function MetaPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "emerald" | "amber" | "rose" | "slate";
}) {
  const toneClasses = {
    emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    rose: "border-rose-500/30 bg-rose-500/10 text-rose-300",
    slate: "border-white/10 bg-white/5 text-slate-300",
  }[tone];

  return (
    <div className={`rounded-full border px-3 py-1 text-xs font-mono ${toneClasses}`}>
      {label}: {value}
    </div>
  );
}
