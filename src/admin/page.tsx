"use server";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import KeyCreator from "./KeyCreator";

async function updateLimits(formData: FormData) {
  "use server";
  await requireAdmin();
  const userId = String(formData.get("userId") || "");
  const dailyRaw = String(formData.get("dailyLimit") || "").trim();
  const minuteRaw = String(formData.get("minuteLimit") || "").trim();
  const dailyLimit = dailyRaw === "" ? null : Number(dailyRaw);
  const minuteLimit = minuteRaw === "" ? null : Number(minuteRaw);

  await prisma.user.update({
    where: { id: userId },
    data: {
      dailyLimit: dailyLimit !== null && Number.isNaN(dailyLimit) ? null : dailyLimit,
      minuteLimit: minuteLimit !== null && Number.isNaN(minuteLimit) ? null : minuteLimit,
    },
  });
  revalidatePath("/admin");
}

async function toggleAdmin(formData: FormData) {
  "use server";
  await requireAdmin();
  const userId = String(formData.get("userId") || "");
  const role = String(formData.get("role") || "user");
  await prisma.user.update({
    where: { id: userId },
    data: { role },
  });
  revalidatePath("/admin");
}


export default async function AdminPage() {
  await requireAdmin();
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      role: true,
      dailyLimit: true,
      minuteLimit: true,
      createdAt: true,
      apiKeys: { select: { id: true, name: true, prefix: true, createdAt: true } },
    },
  });

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#1d1d2b,transparent_55%),linear-gradient(180deg,#0c0c10,#0a0a0d)] px-6 py-10 text-white">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <header>
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
            Admin Console
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Users & Limits</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Manage per-user limits and API keys.
          </p>
        </header>

        <div className="space-y-6">
          {users.map((user) => (
            <div
              key={user.id}
              className="rounded-3xl border border-[var(--panel-border)] bg-[var(--panel)]/85 p-6 backdrop-blur"
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-[var(--muted)]">User</p>
                  <p className="text-lg font-semibold">{user.email}</p>
                </div>
                <form action={toggleAdmin} className="flex items-center gap-3">
                  <input type="hidden" name="userId" value={user.id} />
                  <select
                    name="role"
                    defaultValue={user.role}
                    className="rounded-xl border border-[var(--panel-border)] bg-[#0d0d13] px-3 py-2 text-xs"
                  >
                    <option value="user">user</option>
                    <option value="admin">admin</option>
                  </select>
                  <button
                    className="rounded-full border border-[var(--panel-border)] px-4 py-2 text-xs text-[var(--muted)] transition hover:text-white"
                    type="submit"
                  >
                    Update role
                  </button>
                </form>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <form action={updateLimits} className="space-y-3">
                  <input type="hidden" name="userId" value={user.id} />
                  <div>
                    <label className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                      Daily limit
                    </label>
                    <input
                      name="dailyLimit"
                      defaultValue={user.dailyLimit ?? ""}
                      placeholder="Use default"
                      className="mt-2 w-full rounded-xl border border-[var(--panel-border)] bg-[#0d0d13] px-3 py-2 text-sm text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                      Minute limit
                    </label>
                    <input
                      name="minuteLimit"
                      defaultValue={user.minuteLimit ?? ""}
                      placeholder="Use default"
                      className="mt-2 w-full rounded-xl border border-[var(--panel-border)] bg-[#0d0d13] px-3 py-2 text-sm text-white outline-none"
                    />
                  </div>
                  <button
                    className="rounded-full bg-[var(--accent-strong)] px-4 py-2 text-xs font-semibold text-black transition hover:bg-[#ffe181]"
                    type="submit"
                  >
                    Save limits
                  </button>
                </form>

                <div className="space-y-3">
                  <KeyCreator userId={user.id} />
                  <div className="space-y-2 text-xs text-[var(--muted)]">
                    {user.apiKeys.map((key) => (
                      <div
                        key={key.id}
                        className="flex items-center justify-between rounded-xl border border-[var(--panel-border)] px-3 py-2"
                      >
                        <span>{key.name}</span>
                        <span className="font-mono text-white">
                          {key.prefix}••••
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
