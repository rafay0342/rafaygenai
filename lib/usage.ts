import { prisma } from "./prisma";

type LimitConfig = {
  dailyLimit: number;
  minuteLimit: number;
};

function envBool(name: string, def = false) {
  const v = process.env[name];
  if (v == null) return def;
  return v === "1" || v.toLowerCase() === "true" || v.toLowerCase() === "yes";
}

function resolveLimits(user: { dailyLimit: number | null; minuteLimit: number | null }): LimitConfig {
  const defaultDaily = Number(process.env.DAILY_MESSAGE_LIMIT || "200");
  const defaultMinute = Number(process.env.MINUTE_MESSAGE_LIMIT || "30");

  return {
    dailyLimit: user.dailyLimit ?? defaultDaily,
    minuteLimit: user.minuteLimit ?? defaultMinute,
  };
}

export async function enforceLimits(userId: string) {
  // For dev / internal demos you may want to bypass DB writes entirely.
  // This saves latency on every chat request.
  if (envBool("UNLIMITED_MODE", false)) return;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { dailyLimit: true, minuteLimit: true },
  });

  if (!user) throw new Error("Unauthorized.");

  const { dailyLimit, minuteLimit } = resolveLimits(user);
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const minute = now.toISOString().slice(0, 16);

  const dailyRecord = await prisma.usage.upsert({
    where: { userId_date: { userId, date } },
    update: { count: { increment: 1 } },
    create: { userId, date, count: 1 },
  });

  if (dailyRecord.count > dailyLimit) {
    throw new Error("Daily limit exceeded.");
  }

  const minuteRecord = await prisma.rateUsage.upsert({
    where: { userId_minute: { userId, minute } },
    update: { count: { increment: 1 } },
    create: { userId, minute, count: 1 },
  });

  if (minuteRecord.count > minuteLimit) {
    throw new Error("Minute limit exceeded.");
  }
}

export async function enforceImageGenerationLimit(userId: string, incrementBy = 1) {
  if (envBool("UNLIMITED_MODE", false)) return;
  const limit = Number(process.env.DAILY_IMAGE_LIMIT || "100");
  if (!Number.isFinite(limit) || limit <= 0) return;

  const date = `image-${new Date().toISOString().slice(0, 10)}`;
  const record = await prisma.usage.upsert({
    where: { userId_date: { userId, date } },
    update: { count: { increment: incrementBy } },
    create: { userId, date, count: incrementBy },
  });

  if (record.count > limit) {
    throw new Error(`Daily image generation limit exceeded (${limit}).`);
  }
}
