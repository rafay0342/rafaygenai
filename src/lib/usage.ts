import { prisma } from "./prisma";

type LimitConfig = {
  dailyLimit: number;
  minuteLimit: number;
};

function resolveLimits(user: { dailyLimit: number | null; minuteLimit: number | null }): LimitConfig {
  const defaultDaily = Number(process.env.DAILY_MESSAGE_LIMIT || "200");
  const defaultMinute = Number(process.env.MINUTE_MESSAGE_LIMIT || "30");

  return {
    dailyLimit: user.dailyLimit ?? defaultDaily,
    minuteLimit: user.minuteLimit ?? defaultMinute,
  };
}

export async function enforceLimits(userId: string) {
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
