import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { fetchProviderJob } from "@/lib/video-provider";

function notFound() {
  return Response.json({ error: "Not found." }, { status: 404 });
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const { userId } = await requireAuth(req as unknown as Request);
  const job = await prisma.videoJob.findUnique({
    where: { id },
    include: { segments: true },
  });
  if (!job) return notFound();
  if (job.userId && job.userId !== userId) {
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }

  let updated = job;
  const providerJobId = job.providerJobId;
  const shouldRefreshFromProvider =
    !!providerJobId &&
    (job.status === "pending" ||
      job.status === "running" ||
      (job.status === "completed" && !job.outputUrl));

  if (shouldRefreshFromProvider) {
    try {
      const provider = await fetchProviderJob(providerJobId);
      updated = await prisma.videoJob.update({
        where: { id: job.id },
        data: {
          status: provider.status === "succeeded" ? "completed" : provider.status,
          progress: provider.status === "succeeded" ? 100 : job.progress,
          outputUrl: provider.outputUrl ?? job.outputUrl,
          previewUrl: provider.previewUrl ?? job.previewUrl,
          error: provider.error ?? job.error,
          segments: {
            update: {
              where: { jobId_idx: { jobId: job.id, idx: 0 } },
              data: {
                status: provider.status,
                url: provider.outputUrl ?? provider.previewUrl,
              },
            },
          },
        },
        include: { segments: true },
      });
    } catch (err) {
      // Leave job as-is but report the fetch error in response
      const msg = err instanceof Error ? err.message : String(err);
      return Response.json({ job, providerError: msg });
    }
  }

  return Response.json(updated);
}
