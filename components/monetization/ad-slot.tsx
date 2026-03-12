"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

type AdSlotProps = {
  client?: string;
  slot?: string;
  className?: string;
  label?: string;
  enabled?: boolean;
};

function isLikelyAdsenseClient(value: string) {
  return /^ca-pub-\d{10,20}$/.test(value);
}

function isLikelyAdsenseSlot(value: string) {
  return /^\d{6,20}$/.test(value);
}

export default function AdSlot({
  client = "",
  slot = "",
  className = "",
  label = "Sponsored",
  enabled = true,
}: AdSlotProps) {
  const pathname = usePathname();
  const allowByRoute = pathname ? !pathname.startsWith("/api") : true;
  const canShowAdsense =
    enabled && allowByRoute && isLikelyAdsenseClient(client) && isLikelyAdsenseSlot(slot);

  useEffect(() => {
    if (!canShowAdsense) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // Ignore ad-block/script timing issues and keep layout stable.
    }
  }, [canShowAdsense, slot]);

  if (!canShowAdsense) return null;

  return (
    <aside
      className={`neon-panel rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)]/84 p-4 ${className}`}
      aria-label={label}
    >
      <p className="mb-2 text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">
        {label}
      </p>
      <ins
        className="adsbygoogle block min-h-[120px] w-full"
        style={{ display: "block" }}
        data-ad-client={client}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </aside>
  );
}
