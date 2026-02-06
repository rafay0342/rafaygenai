"use client";

import { useState } from "react";

export default function KeyCreator({ userId }: { userId: string }) {
  const [name, setName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const createKey = async () => {
    setError(null);
    try {
      const response = await fetch("/api/admin/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, name }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = (await response.json()) as { key: string };
      setNewKey(data.key);
    } catch (err) {
      setError(String(err));
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Key name"
          className="flex-1 rounded-xl border border-[var(--panel-border)] bg-[#0d0d13] px-3 py-2 text-sm text-white outline-none"
        />
        <button
          className="rounded-full border border-[var(--panel-border)] px-4 py-2 text-xs text-[var(--muted)] transition hover:text-white"
          type="button"
          onClick={createKey}
        >
          Create key
        </button>
      </div>
      {newKey ? (
        <div className="rounded-xl border border-[var(--panel-border)] bg-[#101018] p-3 text-xs">
          <p className="text-[var(--muted)]">New key (copy now):</p>
          <p className="mt-1 break-all font-mono text-white">{newKey}</p>
        </div>
      ) : null}
      {error ? <p className="text-xs text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}
