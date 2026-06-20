import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PriceGhost - Is that discount real?",
  description:
    "Paste a fashion product link and check whether the discount is genuine across Amazon, Myntra, Flipkart, Ajio, and Croma.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full flex flex-col selection:bg-white/20 selection:text-white">{children}</body>
    </html>
  );
}
