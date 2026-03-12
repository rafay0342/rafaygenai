import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req);
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const minute = now.toISOString().slice(0, 16);
    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { dailyLimit: true, minuteLimit: true },
    });
    const dailyLimit = user?.dailyLimit ?? Number(process.env.DAILY_MESSAGE_LIMIT || "200");
    const minuteLimit = user?.minuteLimit ?? Number(process.env.MINUTE_MESSAGE_LIMIT || "30");
    const record = await prisma.usage.findUnique({
      where: { userId_date: { userId: auth.userId, date } },
    });
    const minuteRecord = await prisma.rateUsage.findUnique({
      where: { userId_minute: { userId: auth.userId, minute } },
    });
    return Response.json({
      date,
      count: record?.count ?? 0,
      limit: dailyLimit,
      minuteCount: minuteRecord?.count ?? 0,
      minuteLimit,
    });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 401 });
  }
}
