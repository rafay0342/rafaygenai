"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { getMonetizationConfig } from "@/lib/monetization";

function normalizePath(pathname: string) {
  if (!pathname) return "/";
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function allowAdsenseOnRoute(pathname: string) {
  // User requested: load ads on every page. Keep only API paths excluded.
  const path = normalizePath(pathname);
  return !path.startsWith("/api");
}

export default function AdsenseScript() {
  const monetization = getMonetizationConfig();
  const pathname = usePathname();
  const allowByRoute = allowAdsenseOnRoute(pathname || "/");
  if (!monetization.adsenseReady || !allowByRoute) return null;

  return (
    <Script
      id="adsense-loader"
      async
      strategy="afterInteractive"
      crossOrigin="anonymous"
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${monetization.adsenseClient}`}
    />
  );
}
