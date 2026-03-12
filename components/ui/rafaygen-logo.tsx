"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { THEME_CHANGE_EVENT } from "@/components/theme-toggle";

interface Props {
  size?: "sm" | "md" | "lg";
  href?: string;
  className?: string;
  onClick?: () => void;
  variant?: "mark" | "lockup";
}

const H: Record<string, number> = { sm: 22, md: 30, lg: 38 };

export function RafaygenLogo({
  size = "md",
  href = "/",
  className = "",
  onClick,
  variant = "mark",
}: Props) {
  const h = H[size] ?? 30;
  const [shuffleCount, setShuffleCount] = useState(0);

  useEffect(() => {
    const onThemeChange = () => setShuffleCount((count) => count + 1);
    window.addEventListener(THEME_CHANGE_EVENT, onThemeChange);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, onThemeChange);
  }, []);

  const img =
    variant === "lockup" ? (
      <span className={`rafaygen-lockup rafaygen-lockup--${size} ${className}`.trim()}>
        <span
          key={shuffleCount}
          className={`rafaygen-lockup-mark${shuffleCount ? " rafaygen-lockup-mark--shuffle" : ""}`}
          aria-hidden="true"
        >
          <span className="rafaygen-lockup-stack">
            <Image
              src="/branding/logo-light.png"
              alt=""
              fill
              priority
              className="rafaygen-lockup-logo rafaygen-lockup-logo--light"
              sizes="(max-width: 480px) 40px, (max-width: 860px) 48px, 56px"
            />
            <Image
              src="/branding/dark-logo.png"
              alt=""
              fill
              priority
              className="rafaygen-lockup-logo rafaygen-lockup-logo--dark"
              sizes="(max-width: 480px) 40px, (max-width: 860px) 48px, 56px"
            />
          </span>
        </span>
        <span className="rafaygen-lockup-copy">
          <span className="rafaygen-lockup-title">RafayGen AI</span>
          <span className="rafaygen-lockup-subtitle">WaveTech Limited</span>
        </span>
      </span>
    ) : (
      <Image
        src="/branding/rafaygen-mark-transparent.png"
        alt="Rafaygen"
        width={h}
        height={h}
        className={"rafaygen-logo-img " + className}
        style={{ height: h, width: h, display: "block", objectFit: "contain" }}
        priority
        draggable={false}
        unoptimized
      />
    );

  if (!href) return img;
  return (
    <Link
      href={href}
      aria-label="Rafaygen Home"
      className={variant === "lockup" ? "rafaygen-lockup-link" : "rafaygen-mark-link"}
      style={{ display: "inline-flex", alignItems: "center", textDecoration: "none", flexShrink: 0 }}
      onClick={onClick}
    >
      {img}
    </Link>
  );
}
