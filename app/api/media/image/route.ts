import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { enforceImageGenerationLimit, enforceLimits } from "@/lib/usage";
import { checkMediaLimit } from "@/lib/plan-limits";
import {
  moderateMediaRequest,
  isImageModerationEnabled,
  moderationFailOpen,
  normalizeModerationMode,
  shouldBlockModeration,
} from "@/lib/media-moderation";
import { generateFromComfyUI } from "@/lib/comfyui";
import { generateImageViaZImageTurbo } from "@/lib/zimage";
import { generateImageViaHF } from "@/lib/huggingface";
import { hasHFMediaToken, hasHFMcpToken } from "@/lib/hf-media-token";

type ImageProvider = "comfy" | "zimage" | "hf";
type ImageDetailLevel = "standard" | "high" | "ultra";
type ImageModelSelection =
  | "auto"
  | "comfyui_fast"
  | "zimage_turbo"
  | "hf_flux_schnell";
type ImageModelRouting = {
  preferredProvider: ImageProvider | null;
  forcedDetail?: ImageDetailLevel;
  hfModel?: string;
};

function isComfyEnabled() {
  return Boolean(process.env.COMFYUI_IMAGE_WORKFLOW || process.env.COMFYUI_MOCK === "true");
}

function isZImageEnabled() {
  return process.env.Z_IMAGE_ENABLED !== "false" && hasHFMcpToken();
}

function isHfEnabled() {
  return hasHFMediaToken();
}

function normalizeProvider(input: string | undefined): ImageProvider | "auto" | "invalid" {
  const value = (input || "").trim().toLowerCase();
  if (!value || value === "auto") return "auto";
  if (value === "comfy" || value === "comfyui") return "comfy";
  if (value === "zimage" || value === "z-image") return "zimage";
  if (value === "hf" || value === "huggingface") return "hf";
  return "invalid";
}

function providerAvailable(provider: ImageProvider) {
  if (provider === "comfy") return isComfyEnabled();
  if (provider === "zimage") return isZImageEnabled();
  return isHfEnabled();
}

function resolveComfyImageWorkflow() {
  return process.env.COMFYUI_IMAGE_WORKFLOW || "@workflows/image_sd15_simple.json";
}

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

function normalizeImageModel(input: string | undefined): ImageModelSelection {
  const value = (input || "").trim().toLowerCase();
  if (!value || value === "auto") return "comfyui_fast";
  if (value === "comfyui_fast" || value === "comfy" || value === "comfyui") return "comfyui_fast";
  if (value === "zimage_turbo" || value === "zimage" || value === "z-image") return "zimage_turbo";
  if (value === "hf_flux_schnell" || value === "hf" || value === "huggingface") return "hf_flux_schnell";
  return "comfyui_fast";
}

const HF_MODEL_MAP: Record<string,string> = {
  hf_flux_schnell:"black-forest-labs/FLUX.1-schnell",
  hf_flux_dev:"black-forest-labs/FLUX.1-dev",
  hf_sdxl_lightning:"ByteDance/SDXL-Lightning",
  hf_sdxl_turbo:"stabilityai/sdxl-turbo",
  hf_lcm_sdxl:"latent-consistency/lcm-sdxl",
  hf_ssd1b:"segmind/SSD-1B",
  hf_zimage:"Purz/zimage",
  hf_sdxl:"stabilityai/stable-diffusion-xl-base-1.0",
  hf_sd35_turbo:"stabilityai/stable-diffusion-3.5-large-turbo",
  hf_sd35:"stabilityai/stable-diffusion-3.5-large",
  hf_playground:"playgroundai/playground-v2.5-1024px-aesthetic",
  hf_realvisxl:"SG161222/RealVisXL_V4.0",
};
function resolveImageModelRouting(selection: ImageModelSelection): ImageModelRouting {
  if (selection === "zimage_turbo") return { preferredProvider: "zimage" };
  if (selection === "comfyui_fast" || selection === "auto") return { preferredProvider: "comfy" };
  if ((HF_MODEL_MAP as Record<string,string>)[selection]) return { preferredProvider: "hf", hfModel: (HF_MODEL_MAP as Record<string,string>)[selection] };
  if (selection.includes("/")) return { preferredProvider: "hf", hfModel: selection };
  return { preferredProvider: "comfy" };
}

function providerHint(provider: ImageProvider) {
  if (provider === "comfy") {
    return "Set COMFYUI_IMAGE_WORKFLOW and COMFYUI_BASE_URL (or COMFYUI_MOCK=true).";
  }
  if (provider === "zimage") {
    return "Set HF_MCP_TOKEN and keep Z_IMAGE_ENABLED=true.";
  }
  if (provider === "hf") {
    return "Set HF_MEDIA_TOKEN (or HF_TOKEN).";
  }
  return "Set HF_MEDIA_TOKEN (or HF_TOKEN).";
}

function resolveProviderOrder({
  explicitProvider,
  strictProvider,
  modelRouting,
}: {
  explicitProvider: ImageProvider | "auto";
  strictProvider: boolean;
  modelRouting: ImageModelRouting;
}) {
  const preferred =
    explicitProvider !== "auto" ? explicitProvider : modelRouting.preferredProvider || "comfy";
  if (strictProvider) return [preferred];
  const fallback: ImageProvider[] = ["hf", "zimage", "comfy"];
  return [preferred, ...fallback.filter((provider) => provider !== preferred)];
}

export async function POST(req: Request) {
  try {
    if (!req.headers.get("content-type")?.includes("application/json")) {
      return Response.json({ error: "Content-Type must be application/json." }, { status: 400 });
    }
    const configuredApiKey = process.env.MEDIA_IMAGE_API_KEY?.trim();
    const configuredWebhookSecret = process.env.MEDIA_IMAGE_WEBHOOK_SECRET?.trim();
    const providedApiKey = req.headers.get("x-api-key")?.trim();
    const providedSignature = req.headers.get("x-webhook-signature")?.trim();
    if (configuredApiKey && providedApiKey && providedApiKey !== configuredApiKey) {
      return Response.json({ error: "Invalid image API key." }, { status: 401 });
    }
    if (configuredWebhookSecret && providedSignature && providedSignature !== configuredWebhookSecret) {
      return Response.json({ error: "Invalid image webhook signature." }, { status: 401 });
    }
    let body: {
      prompt?: string;
      detailLevel?: "standard" | "high" | "ultra";
      baseUrl?: string;
      mock?: boolean;
      provider?: string;
      strictProvider?: boolean;
      imageUrls?: string[];
      imageModel?: string;
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
    const planCheck = await checkMediaLimit(auth.userId, "image");
    if (!planCheck.allowed) {
      return Response.json({
        error: planCheck.reason || "Media generation limit reached.",
        limitHit: true,
        resetAt: planCheck.resetAt?.toISOString(),
        usedCount: planCheck.usedCount,
        maxCount: planCheck.maxCount,
      }, { status: 429 });
    }

    // Free users: force zimage (lighter model)
    const userRole2 = await prisma.user.findUnique({ where: { id: auth.userId }, select: { role: true } });
    const userTierImg = (userRole2?.role || "user").toLowerCase();
    if (userTierImg === "user" || userTierImg === "free") {
      body.imageModel = "zimage_turbo";
    }

    if (!body.prompt || !body.prompt.trim()) {
      return Response.json({ error: "Missing prompt." }, { status: 400 });
    }
    const selectedImageModel = normalizeImageModel(body.imageModel || process.env.MEDIA_IMAGE_MODEL);
    const modelRouting = resolveImageModelRouting(selectedImageModel);
    const moderationMode = normalizeModerationMode(body.moderationMode);
    await enforceImageGenerationLimit(auth.userId, 1);
    const detailLevel: ImageDetailLevel = modelRouting.forcedDetail || body.detailLevel || "high";
    const prompt = body.prompt.trim();

    if (isImageModerationEnabled()) {
      try {
        const moderation = await moderateMediaRequest({
          prompt,
          imageUrls: body.imageUrls,
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
      } catch (err: unknown) {
        if (!moderationFailOpen()) {
          throw err;
        }
      }
    }

    const bodyProvider = normalizeProvider(body.provider);
    if (bodyProvider === "invalid") {
      return Response.json(
        {
          error:
            'Unsupported provider. Allowed providers: "comfy", "zimage", "hf".',
        },
        { status: 400 },
      );
    }
    const strictProvider = body.strictProvider === true;
    const orderedProviders = resolveProviderOrder({
      explicitProvider: bodyProvider,
      strictProvider,
      modelRouting,
    });
    if (!orderedProviders.length) {
      return Response.json(
        {
          error: "No image provider selected.",
        },
        { status: 400 },
      );
    }
    const availableProviders = orderedProviders.filter(providerAvailable);
    if (strictProvider && !providerAvailable(orderedProviders[0])) {
      const selected = orderedProviders[0];
      return Response.json(
        {
          error: `Requested provider "${selected}" is not configured. ${providerHint(selected)}`,
        },
        { status: 400 },
      );
    }
    if (!availableProviders.length) {
      return Response.json(
        {
          error: "No image provider configured. Enable ComfyUI, Z Image MCP, or HF token.",
        },
        { status: 400 },
      );
    }

    const errors: string[] = [];
    for (const provider of availableProviders) {
      try {
        if (provider === "comfy") {
          const workflowEnv = resolveComfyImageWorkflow();
          const result = await generateFromComfyUI({
            prompt,
            workflowEnv,
            workflowEnvFallback: process.env.COMFYUI_IMAGE_WORKFLOW_FALLBACK,
            mediaType: "image",
            detailLevel,
            baseUrlOverride: body.baseUrl,
            mockOverride: body.mock,
          });
          const files = (result.files || []).filter(
            (file) => file.kind === "image" || file.kind === "gif",
          );
          if (!files.length) {
            throw new Error(`ComfyUI returned no image files (${detailLevel}).`);
          }
          return Response.json({
            promptId: result.promptId,
            files,
            provider: "comfy",
            model: "comfyui_fast",
            baseUrl: result.baseUrl,
          });
        }

        if (provider === "zimage") {
          const result = await generateImageViaZImageTurbo({
            prompt,
            detailLevel,
          });
          if (!Array.isArray(result.files) || !result.files.length) {
            throw new Error("Z Image returned no files.");
          }
          return Response.json({
            promptId: result.promptId,
            files: result.files,
            provider: "zimage",
            model: "zimage_turbo",
          });
        }

        if (provider === "hf") {
          const hfModel = modelRouting.hfModel || process.env.HF_IMAGE_MODEL || "black-forest-labs/FLUX.1-schnell";
          const result = await generateImageViaHF({
            prompt,
            detailLevel,
            model: hfModel,
          });
          if (!Array.isArray(result.files) || !result.files.length) {
            throw new Error("Hugging Face returned no files.");
          }
          return Response.json({
            promptId: result.promptId,
            files: result.files,
            provider: "hf",
            model: result.model || hfModel,
          });
        }
        throw new Error(`Unsupported provider branch: ${provider}`);
      } catch (err: unknown) {
        errors.push(`${provider}: ${errorMessage(err)}`);
        if (strictProvider) break;
      }
    }
    return Response.json(
      {
        error: `All image providers failed. ${errors.join(" | ")}`.trim(),
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
