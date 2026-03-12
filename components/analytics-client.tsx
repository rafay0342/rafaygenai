"use client";

import { useEffect, useMemo, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

type AnalyticsEvent = {
  event: "session_start" | "page_view" | "page_exit" | "click";
  path?: string;
  label?: string;
  href?: string;
  variant?: "a" | "b" | "c" | "unknown";
  utmSource?: string;
  utmCampaign?: string;
  utmMedium?: string;
  utmContent?: string;
  referrer?: string;
  device?: "mobile" | "tablet" | "desktop" | "unknown";
  platform?: string;
  durationMs?: number;
  sessionId?: string;
};

const SESSION_ID_KEY = "rg_session_id";
const SESSION_STARTED_KEY = "rg_session_started";

function getSessionId() {
  if (typeof window === "undefined") return "";
  let sessionId = localStorage.getItem(SESSION_ID_KEY);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem(SESSION_ID_KEY, sessionId);
  }
  return sessionId;
}

function getVariant(pathname: string, searchParams: URLSearchParams | null) {
  if (pathname === "/start") return "a";
  if (pathname === "/start-b") return "b";
  if (searchParams?.get("ab") === "start_c") return "c";
  return "unknown";
}

function getDeviceType() {
  if (typeof window === "undefined") return "unknown" as const;
  const uaData = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData;
  if (uaData?.mobile) return "mobile";
  const width = window.innerWidth || 0;
  if (width > 0 && width <= 900) return "tablet";
  if (width > 900) return "desktop";
  return /mobi|iphone|android/i.test(navigator.userAgent) ? "mobile" : "desktop";
}

function getPlatform() {
  if (typeof window === "undefined") return "unknown";
  const uaData = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  return uaData?.platform || navigator.platform || "unknown";
}

function sendEvent(event: AnalyticsEvent) {
  const payload = JSON.stringify(event);
  if (navigator.sendBeacon) {
    navigator.sendBeacon(
      "/api/analytics/track",
      new Blob([payload], { type: "application/json" }),
    );
    return;
  }
  fetch("/api/analytics/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true,
  }).catch(() => {});
}

export default function AnalyticsClient() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const startTimeRef = useRef<number | null>(null);
  const lastPathRef = useRef<string | null>(null);

  const utm = useMemo(() => {
    return {
      utmSource: searchParams?.get("utm_source") || undefined,
      utmCampaign: searchParams?.get("utm_campaign") || undefined,
      utmMedium: searchParams?.get("utm_medium") || undefined,
      utmContent: searchParams?.get("utm_content") || undefined,
    };
  }, [searchParams]);

  useEffect(() => {
    if (!pathname) return;
    const sessionId = getSessionId();
    const variant = getVariant(pathname, searchParams);
    const referrer = document.referrer || "";
    const device = getDeviceType();
    const platform = getPlatform();

    if (!sessionStorage.getItem(SESSION_STARTED_KEY)) {
      sessionStorage.setItem(SESSION_STARTED_KEY, "1");
      sendEvent({
        event: "session_start",
        path: pathname,
        variant,
        referrer,
        device,
        platform,
        sessionId,
        ...utm,
      });
    }

    const now = Date.now();
    if (lastPathRef.current && startTimeRef.current) {
      const durationMs = Math.max(0, now - startTimeRef.current);
      sendEvent({
        event: "page_exit",
        path: lastPathRef.current,
        variant,
        durationMs,
        sessionId,
      });
    }

    lastPathRef.current = pathname;
    startTimeRef.current = now;
    sendEvent({
      event: "page_view",
      path: pathname,
      variant,
      referrer,
      device,
      platform,
      sessionId,
      ...utm,
    });
  }, [pathname, searchParams, utm]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== "hidden") return;
      if (!lastPathRef.current || !startTimeRef.current) return;
      const durationMs = Math.max(0, Date.now() - startTimeRef.current);
      sendEvent({
        event: "page_exit",
        path: lastPathRef.current,
        variant: getVariant(lastPathRef.current, searchParams),
        durationMs,
        sessionId: getSessionId(),
      });
    };

    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const element = target.closest("[data-analytics-label]") as HTMLElement | null;
      if (!element) return;
      const label = element.dataset.analyticsLabel || "unknown";
      const href = (element as HTMLAnchorElement).href || "";
      sendEvent({
        event: "click",
        path: pathname || undefined,
        variant: getVariant(pathname || "", searchParams),
        label,
        href,
        sessionId: getSessionId(),
      });
    };

    window.addEventListener("visibilitychange", handleVisibility);
    document.addEventListener("click", handleClick);
    return () => {
      window.removeEventListener("visibilitychange", handleVisibility);
      document.removeEventListener("click", handleClick);
    };
  }, [pathname, searchParams]);

  return null;
}
