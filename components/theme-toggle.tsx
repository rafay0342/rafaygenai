"use client";
import { useEffect, useSyncExternalStore } from "react";
export type ThemeMode = "light" | "dark";
type ThemeToggleProps = { variant?: "studio" | "apple" };
const KEY = "rafaygen:theme";
export const THEME_CHANGE_EVENT = "rafaygen:theme-change";

function norm(raw: string | null): ThemeMode | null {
  if (raw === "dark" || raw === "claude") return "dark";
  if (raw === "light") return "light";
  return null;
}

function readMode(): ThemeMode {
  if (typeof window === "undefined") return "light";
  return norm(localStorage.getItem(KEY)) || norm(document.documentElement.getAttribute("data-theme")) || "light";
}

function subscribe(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => undefined;

  const onThemeChange = () => onStoreChange();
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY) onStoreChange();
  };

  window.addEventListener(THEME_CHANGE_EVENT, onThemeChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onThemeChange);
    window.removeEventListener("storage", onStorage);
  };
}

export default function ThemeToggle({ variant = "studio" }: ThemeToggleProps) {
  const mode = useSyncExternalStore(subscribe, readMode, () => "light");

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(KEY, mode);
    document.documentElement.setAttribute("data-theme", mode);
  }, [mode]);

  const applyMode = (next: ThemeMode) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(KEY, next);
      document.documentElement.setAttribute("data-theme", next);
      window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: { mode: next } }));
    }
  };

  const cycle = () => applyMode(mode === "light" ? "dark" : "light");
  const label = mode === "light" ? "Switch to dark mode" : "Switch to light mode";
  const cls = variant === "apple" ? "apple-theme-toggle" : "gem-ghost-btn gem-theme-toggle";
  return (
    <button type="button" onClick={cycle} className={cls} data-mode={mode} aria-label={label} title={label}>
      <span className="apple-theme-toggle-track" aria-hidden="true">
        <span className="apple-theme-toggle-thumb" />
      </span>
      <span className="sr-only">{label}</span>
    </button>
  );
}
