import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { prisma } from "./prisma";
import { hashSecret } from "./security";

export type RequestContext = {
  userId: string;
  via: "session" | "api-key";
};

export async function requireAuth(req: Request): Promise<RequestContext> {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.toLowerCase().startsWith("grok ")) {
    const token = authHeader.slice(5).trim();
    if (!token) {
      throw new Error("Invalid API key.");
    }
    const hash = hashSecret(token);
    const record = await prisma.apiKey.findUnique({
      where: { keyHash: hash },
    });
    if (!record) {
      throw new Error("Invalid API key.");
    }
    await prisma.apiKey.update({
      where: { id: record.id },
      data: { lastUsedAt: new Date() },
    });
    return { userId: record.userId, via: "api-key" };
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    throw new Error("Unauthorized.");
  }

  return { userId: session.user.id, via: "session" };
}
