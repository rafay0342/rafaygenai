import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { createProviderJob, type VideoAspect, type VideoPreset } from "@/lib/video-provider";

type CreateBody = {
  prompt?: string;
  preset?: VideoPreset;
  aspect?: VideoAspect;
  targetDurationSec?: number;
};

const DEFAULT_PRESET: VideoPreset = "1080p60";
const DEFAULT_ASPECT: VideoAspect = "16:9";

function badRequest(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireAuth(req as unknown as Request);
    let body: CreateBody;
    try {
      body = (await req.json()) as CreateBody;
    } catch {
      return badRequest("Invalid JSON body.");
    }

    const prompt = (body.prompt || "").trim();
    if (!prompt) return badRequest("prompt is required.");
    if (prompt.length > 1200) return badRequest("prompt too long.");

    const preset = (body.preset || DEFAULT_PRESET) as VideoPreset;
    const aspect = (body.aspect || DEFAULT_ASPECT) as VideoAspect;
    const targetDurationSec = Math.min(
      120,
      Math.max(20, Number(body.targetDurationSec) || 30),
    );

    let providerJob;
    try {
      providerJob = await createProviderJob({ prompt, preset, aspect, targetDurationSec });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return badRequest(`Provider error: ${msg}`, 503);
    }

    const job = await prisma.videoJob.create({
      data: {
        userId,
        prompt,
        preset,
        aspect,
        targetDurationSec,
        provider: "external",
        providerJobId: providerJob.id,
        status: providerJob.status === "succeeded" ? "completed" : providerJob.status,
        progress: providerJob.status === "succeeded" ? 100 : 5,
        outputUrl: providerJob.outputUrl,
        previewUrl: providerJob.previewUrl,
        segments: {
          create: [
            {
              idx: 0,
              providerJobId: providerJob.id,
              status: providerJob.status,
            },
          ],
        },
      },
      include: { segments: true },
    });

    return Response.json({
      id: job.id,
      status: job.status,
      progress: job.progress,
      previewUrl: job.previewUrl,
      outputUrl: job.outputUrl,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
