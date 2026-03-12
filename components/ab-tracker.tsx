"use client";

import { useEffect } from "react";

type AbTrackerProps = {
  experiment: string;
  variant: "a" | "b" | "c";
  event?: "impression" | "click";
  queryKey?: string;
  queryValue?: string;
};

export default function AbTracker({
  experiment,
  variant,
  event = "impression",
  queryKey,
  queryValue,
}: AbTrackerProps) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (queryKey) {
      const value = new URLSearchParams(window.location.search).get(queryKey);
      if (queryValue ? value !== queryValue : !value) return;
    }

    const payload = JSON.stringify({ experiment, variant, event });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(
        "/api/ab/track",
        new Blob([payload], { type: "application/json" }),
      );
      return;
    }
    fetch("/api/ab/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  }, [event, experiment, queryKey, queryValue, variant]);

  return null;
}
