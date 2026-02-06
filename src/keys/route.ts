import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { generateApiKey } from "@/lib/security";

export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req);
    if (auth.via === "api-key") {
      return Response.json({ error: "Session required." }, { status: 403 });
    }
    const keys = await prisma.apiKey.findMany({
      where: { userId: auth.userId },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, prefix: true, createdAt: true },
    });
    return Response.json({ keys });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req);
    if (auth.via === "api-key") {
      return Response.json({ error: "Session required." }, { status: 403 });
    }
    const body = (await req.json()) as { name?: string };
    const name = body.name?.trim() || "Default";

    const key = generateApiKey();
    const saved = await prisma.apiKey.create({
      data: {
        name,
        prefix: key.prefix,
        keyHash: key.hash,
        userId: auth.userId,
      },
      select: { id: true, name: true, prefix: true, createdAt: true },
    });

    return Response.json({ key: key.plain, saved });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 401 });
  }
}
