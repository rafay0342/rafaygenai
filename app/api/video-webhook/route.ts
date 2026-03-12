import { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";
import { verifyWebhookSignature } from "@/lib/video-provider";

export async function POST(req: NextRequest) {
  const secret = process.env.VIDEO_API_WEBHOOK_SECRET || "";
  if (secret) {
    const provided = req.headers.get("x-webhook-signature");
    if (!verifyWebhookSignature(secret, provided)) {
      return Response.json({ error: "Invalid signature." }, { status: 401 });
    }
  }

  let payload: {
    id?: string;
    status?: string;
    output?: unknown;
    error?: string;
  };
  try {
    payload = (await req.json()) as typeof payload;
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (!payload.id) {
    return Response.json({ error: "Missing id." }, { status: 400 });
  }

  const job = await prisma.videoJob.findFirst({
    where: { providerJobId: payload.id },
  });
  if (!job) {
    return Response.json({ ok: true, note: "Job not found, ignoring." });
  }

  const outputUrls = Array.isArray(payload.output) ? payload.output : [];
  const status = (payload.status || "").toLowerCase();
  const completed = status === "succeeded" || status === "completed";
  const failed = status === "failed" || status === "error";

  await prisma.videoJob.update({
    where: { id: job.id },
    data: {
      status: completed ? "completed" : failed ? "failed" : status || job.status,
      progress: completed ? 100 : job.progress,
      outputUrl: outputUrls[outputUrls.length - 1] ?? job.outputUrl,
      previewUrl: outputUrls[0] ?? job.previewUrl,
      error: payload.error ?? job.error,
      segments: {
        updateMany: {
          where: { jobId: job.id },
          data: {
            status: status || job.status,
            url: outputUrls[outputUrls.length - 1] ?? job.outputUrl,
          },
        },
      },
    },
  });

  return Response.json({ ok: true });
}
