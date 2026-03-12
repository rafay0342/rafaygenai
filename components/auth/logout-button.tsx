"use client";
import { signOut } from "next-auth/react";

export default function LogoutButton({
  className = "",
  label = "Sign out",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        void signOut({ callbackUrl: "/login" });
      }}
      className={className}
    >
      {label}
    </button>
  );
}
