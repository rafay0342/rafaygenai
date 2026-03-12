import { requireAuth } from "@/lib/api-auth";
import { enforceLimits } from "@/lib/usage";
import { moderateMediaRequest, moderationFailOpen } from "@/lib/media-moderation";

function pickErrorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

export async function POST(req: Request) {
  try {
    if (!req.headers.get("content-type")?.includes("application/json")) {
      return Response.json({ error: "Content-Type must be application/json." }, { status: 400 });
    }

    const auth = await requireAuth(req);
    await enforceLimits(auth.userId);

    let body: { prompt?: string; imageUrls?: string[] };
    try {
      body = (await req.json()) as typeof body;
    } catch (err: unknown) {
      return Response.json({ error: `Invalid JSON body: ${pickErrorMessage(err)}` }, { status: 400 });
    }

    const prompt = (body.prompt || "").trim();
    if (!prompt && !Array.isArray(body.imageUrls)) {
      return Response.json({ error: "Missing prompt or imageUrls." }, { status: 400 });
    }

    const moderation = await moderateMediaRequest({
      prompt: prompt || "Moderate the attached image(s).",
      imageUrls: body.imageUrls,
    });
    return Response.json(moderation);
  } catch (err: unknown) {
    const detail = pickErrorMessage(err);
    if (moderationFailOpen()) {
      return Response.json({
        allow: true,
        flagged: false,
        risk: "low",
        categories: [],
        reason: "Moderation unavailable; fail-open policy active.",
        model: "none",
        raw: detail,
      });
    }
    const status = detail.includes("Unauthorized") ? 401 : detail.includes("limit") ? 429 : 502;
    return Response.json({ error: detail }, { status });
  }
}
