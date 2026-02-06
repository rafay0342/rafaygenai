"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const response = await signIn("credentials", {
      redirect: false,
      email,
      password,
    });

    if (response?.error) {
      setError("Invalid credentials.");
    } else {
      window.location.href = "/";
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#1d1d2b,transparent_55%),linear-gradient(180deg,#0c0c10,#0a0a0d)] px-4 text-white">
      <div className="w-full max-w-md rounded-3xl border border-[var(--panel-border)] bg-[var(--panel)]/85 p-6 backdrop-blur">
        <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
          RafayGen The Ai LLM Studio
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Access the paid console with your credentials.
        </p>
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <input
            className="w-full rounded-xl border border-[var(--panel-border)] bg-[#0d0d13] px-3 py-2 text-sm text-white outline-none"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email"
            required
          />
          <input
            className="w-full rounded-xl border border-[var(--panel-border)] bg-[#0d0d13] px-3 py-2 text-sm text-white outline-none"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            required
          />
          <button
            className="w-full rounded-full bg-[var(--accent-strong)] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[#ffe181]"
            type="submit"
          >
            Sign in
          </button>
          {error ? (
            <p className="text-xs text-[var(--danger)]">{error}</p>
          ) : null}
        </form>
      </div>
    </div>
  );
}
