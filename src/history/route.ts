import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

async function getOrCreateConversation(userId: string) {
  const existing = await prisma.conversation.findFirst({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });
  if (existing) return existing;
  return prisma.conversation.create({ data: { userId, title: "Default" } });
}

export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req);
    const conversation = await getOrCreateConversation(auth.userId);
    const messages = await prisma.chatMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "asc" },
      take: 50,
    });
    return Response.json({
      conversationId: conversation.id,
      messages: messages.map((msg) => ({ role: msg.role, content: msg.content })),
    });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req);
    const body = (await req.json()) as {
      messages?: Array<{ role: string; content: string }>;
    };
    if (!body.messages?.length) {
      return Response.json({ error: "Missing messages." }, { status: 400 });
    }

    const conversation = await getOrCreateConversation(auth.userId);
    await prisma.chatMessage.createMany({
      data: body.messages.map((msg) => ({
        conversationId: conversation.id,
        role: msg.role,
        content: msg.content,
      })),
    });

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
