import { requireAuth } from "@/lib/api-auth";
import { enforceLimits } from "@/lib/usage";
import { generateFromComfyUI } from "@/lib/comfyui";

export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req);
    await enforceLimits(auth.userId);
    const body = (await req.json()) as { prompt?: string };
    if (!body.prompt) {
      return Response.json({ error: "Missing prompt." }, { status: 400 });
    }
    const result = await generateFromComfyUI({
      prompt: body.prompt,
      workflowEnv: process.env.COMFYUI_VIDEO_WORKFLOW,
      mediaType: "video",
    });
    return Response.json(result);
  } catch (error) {
    const message = String(error);
    const status =
      message.includes("Unauthorized") ? 401 : message.includes("limit") ? 429 : 500;
    return Response.json({ error: message }, { status });
  }
}
