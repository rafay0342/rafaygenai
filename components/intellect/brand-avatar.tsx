"use client";

import { RafaygenLogo } from "@/components/ui/rafaygen-logo";

type BrandAvatarKind = "assistant" | "brand" | "user";
type BrandAvatarSize = "sm" | "md" | "lg";

function getInitials(label?: string | null) {
  const value = (label || "").trim();
  if (!value) return "RG";
  const parts = value.split(/\s+/).filter(Boolean).slice(0, 2);
  const initials = parts.map((part) => part.charAt(0)).join("").toUpperCase();
  return initials || value.slice(0, 2).toUpperCase();
}

export function BrandAvatar({
  kind = "brand",
  label,
  size = "md",
  compact = false,
  className = "",
}: {
  kind?: BrandAvatarKind;
  label?: string | null;
  size?: BrandAvatarSize;
  compact?: boolean;
  className?: string;
}) {
  const classes = [
    "intellect-brand-avatar",
    `intellect-brand-avatar--${size}`,
    `intellect-brand-avatar--${kind}`,
    compact && "intellect-brand-avatar--compact",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes} aria-hidden="true">
      <span className="intellect-brand-avatar__face">
        {kind === "user" ? (
          <span className="intellect-brand-avatar__initials">{getInitials(label)}</span>
        ) : (
          <RafaygenLogo size={size === "lg" ? "md" : "sm"} href="" />
        )}
      </span>
      {!compact && label ? <span className="intellect-brand-avatar__label">{label}</span> : null}
    </span>
  );
}
