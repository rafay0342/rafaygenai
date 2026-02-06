import { requireAuth } from "@/lib/api-auth";
import { enforceLimits } from "@/lib/usage";

const MAX_BYTES = 100_000;

export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req);
    await enforceLimits(auth.userId);
    const body = (await req.json()) as { url?: string };
    if (!body.url) {
      return Response.json({ error: "Missing url." }, { status: 400 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(body.url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      return Response.json(
        { error: `Fetch failed with ${response.status}.` },
        { status: 400 },
      );
    }

    const text = await response.text();
    const output = text.length > MAX_BYTES ? text.slice(0, MAX_BYTES) : text;

    return Response.json({ output });
  } catch (error) {
    const message = String(error);
    const status =
      message.includes("Unauthorized") ? 401 : message.includes("limit") ? 429 : 500;
    return Response.json({ error: message }, { status });
  }
}
