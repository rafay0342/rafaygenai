import { requireAuth } from "@/lib/api-auth";
import { checkMediaLimit } from "@/lib/plan-limits";
import { enforceLimits } from "@/lib/usage";
import { generateVideoViaHF } from "@/lib/huggingface";
import { generateFromComfyUI } from "@/lib/comfyui";
import { generateVideoViaImageFx } from "@/lib/video-imagefx";
import { generateVideoViaWan } from "@/lib/wan";
import { generateVideoViaWan22Gradio } from "@/lib/wan-gradio";
import { hasHFMediaToken } from "@/lib/hf-media-token";
import {
  moderateMediaRequest,
  moderationFailOpen,
  normalizeModerationMode,
  shouldBlockModeration,
} from "@/lib/media-moderation";

type VideoProvider =
  | "wan"
  | "wan22gradio"
  | "comfy"
  | "hf"
  | "imagefx";

export const runtime = "nodejs";

function isHfEnabled() {
  return hasHFMediaToken();
}

function isComfyEnabled() {
  return Boolean(
    process.env.COMFYUI_VIDEO_WORKFLOW ||
      process.env.COMFYUI_VIDEO_WORKFLOW_SD15 ||
      process.env.COMFYUI_VIDEO_WORKFLOW_SDXL ||
      process.env.COMFYUI_MOCK === "true",
  );
}

function isImageFxEnabled() {
  return process.env.VIDEO_IMAGEFX_ENABLED !== "false";
}




function normalizeProvider(input: string | undefined): VideoProvider | "auto" {
  if (input === "wan") return "wan";
  if (input === "wan22gradio") return "wan22gradio";
  if (input === "comfy") return "comfy";
  if (input === "hf") return "hf";
  if (input === "imagefx") return "imagefx";
  return "auto";
}

function providerAvailable(provider: VideoProvider) {
  if (provider === "wan") return true;
  if (provider === "wan22gradio") return true;
  if (provider === "comfy") return isComfyEnabled();
  if (provider === "imagefx") return isImageFxEnabled();
  return isHfEnabled();
}

function resolveComfyVideoWorkflow(version?: "sdxl" | "sd15") {
  if (version === "sd15") {
    return process.env.COMFYUI_VIDEO_WORKFLOW_SD15 || process.env.COMFYUI_VIDEO_WORKFLOW;
  }
  if (version === "sdxl") {
    return process.env.COMFYUI_VIDEO_WORKFLOW_SDXL || process.env.COMFYUI_VIDEO_WORKFLOW;
  }
  return process.env.COMFYUI_VIDEO_WORKFLOW;
}

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

function hasMediaFiles(result: unknown) {
  if (!result || typeof result !== "object") return false;
  const files = (result as { files?: unknown }).files;
  return Array.isArray(files) && files.length > 0;
}

export async function POST(req: Request) {
  try {
    if (!req.headers.get("content-type")?.includes("application/json")) {
      return Response.json({ error: "Content-Type must be application/json." }, { status: 400 });
    }
    let body: {
      prompt?: string;
      detailLevel?: "standard" | "high" | "ultra";
      baseUrl?: string;
      mock?: boolean;
      workflowVersion?: "sdxl" | "sd15"; // retained for compatibility, ignored now
      motionLora?: string;
      videoModel?: string;
      provider?:
        | "hf"
        | "comfy"
        | "imagefx"
        | "wan"
        | "wan22gradio"
                    ;
      seed?: number;
      size?: string;
      watermark?: boolean;
      imageUrl?: string;
      wan22Height?: number;
      wan22Width?: number;
      wan22DurationSeconds?: number;
      wan22SamplingSteps?: number;
      wan22GuideScale?: number;
      wan22Shift?: number;
      wan22Space?: string;
      resolution?: "RESOLUTION_720" | "RESOLUTION_1080";
      duration?: number;
      leonardoImageId?: string;
      leonardoImageType?: "UPLOADED" | "GENERATED";
      leonardoEndFrameId?: string;
      leonardoEndFrameType?: "UPLOADED" | "GENERATED";
      aiccModel?: string;
      aiccResolution?: string;
      aiccDuration?: number;
      aiccImageUrl?: string;
      aiccVideoUrl?: string;
      strictProvider?: boolean;
      moderationMode?: string;
    };
    try {
      body = (await req.json()) as typeof body;
    } catch (err: unknown) {
      return Response.json(
        { error: `Invalid JSON body: ${errorMessage(err) || "parse error"}` },
        { status: 400 },
      );
    }

    const auth = await requireAuth(req);
    await enforceLimits(auth.userId);

    // Plan-based media limit check
    const planCheck = await checkMediaLimit(auth.userId, "video");
    if (!planCheck.allowed) {
      return Response.json({
        error: planCheck.reason || "Video generation limit reached.",
        limitHit: true,
        resetAt: planCheck.resetAt?.toISOString(),
      }, { status: 429 });
    }
    if (!body.prompt) {
      return Response.json({ error: "Missing prompt." }, { status: 400 });
    }
    const moderationMode = normalizeModerationMode(body.moderationMode);
    try {
      const moderation = await moderateMediaRequest({
        prompt: body.prompt,
        imageUrls: body.imageUrl ? [body.imageUrl] : [],
      });
      if (shouldBlockModeration(moderation, moderationMode)) {
        return Response.json(
          {
            error: "Prompt blocked by moderation policy.",
            moderation,
          },
          { status: 400 },
        );
      }
    } catch (err) {
      if (!moderationFailOpen()) {
        throw err;
      }
    }

    const bodyProvider = normalizeProvider(body.provider);
    const envProvider = normalizeProvider(process.env.MEDIA_VIDEO_PROVIDER);
    const explicitProvider = bodyProvider !== "auto";
    const strictProvider = body.strictProvider === true;
    const fallbackOrder: VideoProvider[] = ["wan", "wan22gradio", "imagefx", "hf", "comfy"];
    const orderedProviders: VideoProvider[] = explicitProvider
      ? [bodyProvider]
      : envProvider !== "auto"
        ? [envProvider, ...fallbackOrder.filter((provider) => provider !== envProvider)]
        : fallbackOrder;
    const availableProviders = orderedProviders.filter(providerAvailable);
    const requestedDetail = body.detailLevel || "ultra";

    if (explicitProvider && !providerAvailable(bodyProvider)) {
      const missingHint =
bodyProvider === "comfy"
          ? "Set COMFYUI_VIDEO_WORKFLOW and COMFYUI_BASE_URL."
          : bodyProvider === "hf"
          ? "Set HF_MEDIA_TOKEN."
          : "Set VIDEO_IMAGEFX_ENABLED=true.";
      return Response.json(
        { error: `Requested provider "${bodyProvider}" is not configured. ${missingHint}` },
        { status: 400 },
      );
    }

    if (!availableProviders.length) {
      return Response.json(
        {
          error:
            "No video provider configured. Use ComfyUI, imagefx fallback, or set HF_MEDIA_TOKEN.",
        },
        { status: 400 },
      );
    }

    const errors: string[] = [];
    for (const provider of availableProviders) {
      try {



        if (provider === "wan") {
          const result = await generateVideoViaWan({
            prompt: body.prompt,
            seed: body.seed,
            size: body.size,
            watermark: body.watermark,
          });
          if (!hasMediaFiles(result)) {
            throw new Error("Wan returned no video files.");
          }
          return Response.json(result);
        }

        if (provider === "wan22gradio") {
          try {
            const result = await generateVideoViaWan22Gradio({
              prompt: body.prompt,
              imageUrl: body.imageUrl,
              height: body.wan22Height,
              width: body.wan22Width,
              durationSeconds: body.wan22DurationSeconds,
              samplingSteps: body.wan22SamplingSteps,
              guideScale: body.wan22GuideScale,
              shift: body.wan22Shift,
              seed: body.seed,
              space: body.wan22Space,
            });
            if (!hasMediaFiles(result)) {
              throw new Error("Wan 2.2 Gradio returned no video files.");
            }
            return Response.json(result);
          } catch (err: unknown) {
            const message = errorMessage(err);
            if (/zerogpu|quota exceeded|gpu task aborted/i.test(message)) {
              const fallback = await generateVideoViaWan({
                prompt: body.prompt,
                seed: body.seed,
                size: body.size,
                watermark: body.watermark,
              });
              if (hasMediaFiles(fallback)) {
                return Response.json({
                  ...fallback,
                  provider: "wan",
                  fallbackFrom: "wan22gradio",
                  warning:
                    "Wan 2.2 quota unavailable. Fallback provider Wan 2.1 used for this generation.",
                });
              }
            }
            throw err;
          }
        }

        if (provider === "comfy") {
          const workflowEnv = resolveComfyVideoWorkflow(body.workflowVersion);
          const detailSequence: Array<"ultra" | "high" | "standard"> =
            requestedDetail === "ultra"
              ? ["ultra", "high", "standard"]
              : requestedDetail === "high"
                ? ["high", "standard"]
                : ["standard"];
          let comfyResult: Awaited<ReturnType<typeof generateFromComfyUI>> | null = null;
          let comfyError = "ComfyUI generation failed.";
          for (const detailLevel of detailSequence) {
            try {
              comfyResult = await generateFromComfyUI({
                prompt: body.prompt,
                workflowEnv,
                workflowEnvFallback: process.env.COMFYUI_VIDEO_WORKFLOW_FALLBACK,
                mediaType: "video",
                detailLevel,
                baseUrlOverride: body.baseUrl,
                mockOverride: body.mock,
                motionLora: body.motionLora,
              });
              if (hasMediaFiles(comfyResult)) break;
              comfyError = `ComfyUI returned no video files (${detailLevel}).`;
            } catch (err: unknown) {
              comfyError = errorMessage(err);
            }
          }
          if (!comfyResult || !hasMediaFiles(comfyResult)) {
            throw new Error(comfyError);
          }
          const result = comfyResult;
          if (!hasMediaFiles(result)) {
            throw new Error("ComfyUI returned no video files.");
          }
          return Response.json(result);
        }

        if (provider === "imagefx") {
          const result = await generateVideoViaImageFx({
            prompt: body.prompt,
            detailLevel: requestedDetail,
          });
          if (!hasMediaFiles(result)) {
            throw new Error("imagefx returned no video files.");
          }
          return Response.json(result);
        }

        const result = await generateVideoViaHF({
          prompt: body.prompt,
          detailLevel: requestedDetail,
        });
        if (!hasMediaFiles(result)) {
          throw new Error("Hugging Face returned no video files.");
        }
        return Response.json(result);
      } catch (err: unknown) {
        const message = errorMessage(err);
        errors.push(`${provider}: ${message}`);
        if (explicitProvider && strictProvider) break;
      }
    }

    return Response.json(
      {
        error: `All video providers failed. ${errors.join(" | ")}`.trim(),
      },
      { status: 502 },
    );
  } catch (error) {
    const message = String(error);
    const status =
      message.includes("Unauthorized") ? 401 : message.includes("limit") ? 429 : 500;
    return Response.json({ error: message }, { status });
  }
}
