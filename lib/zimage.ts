import { getHFMcpToken } from "@/lib/hf-media-token";

type ZImageFile = {
  path?: string | null;
  url?: string | null;
  orig_name?: string | null;
  mime_type?: string | null;
};

type ImageDetailLevel = "standard" | "high" | "ultra";
type PromptLayout = "square" | "landscape" | "portrait";
type ZImageAttempt = {
  label: string;
  resolution: string;
  steps: number;
  shift: number;
};

const DEFAULT_Z_IMAGE_API_BASE = "https://mcp-tools-z-image-turbo.hf.space";
const DEFAULT_Z_IMAGE_RESOLUTION = "1280x1280 ( 1:1 )";
const DEFAULT_Z_IMAGE_STEPS = 8;
const DEFAULT_Z_IMAGE_SHIFT = 3;
const DEFAULT_Z_IMAGE_TIMEOUT_MS = 120000;

const Z_IMAGE_DETAIL_PROFILES: Record<ImageDetailLevel, { steps: number; shift: number }> = {
  standard: {
    steps: 8,
    shift: 2.6,
  },
  high: {
    steps: 10,
    shift: 2.8,
  },
  ultra: {
    steps: 12,
    shift: 3,
  },
};

function toInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toFloat(value: string | undefined, fallback: number) {
  const parsed = Number.parseFloat(value || "");
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function dedupe(values: string[]) {
  const out: string[] = [];
  for (const value of values) {
    const clean = value.trim();
    if (!clean) continue;
    if (!out.includes(clean)) out.push(clean);
  }
  return out;
}

function parseApiBaseList(raw: string | undefined) {
  return dedupe(
    (raw || "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
}

function buildZImageHeaders() {
  const token = getHFMcpToken();
  if (!token) {
    throw new Error("HF MCP token is missing. Set HF_MCP_TOKEN for Z Image.");
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
  return headers;
}

function normalizePrompt(prompt: string) {
  return prompt.trim().replace(/\s+/g, " ");
}

function detectPromptLayout(prompt: string): PromptLayout {
  const lower = prompt.toLowerCase();
  const ratioMatch = lower.match(/(\d+)\s*[:x]\s*(\d+)/);
  if (ratioMatch) {
    const a = Number(ratioMatch[1]);
    const b = Number(ratioMatch[2]);
    if (a > 0 && b > 0) {
      const ratio = a / b;
      if (ratio > 1.1) return "landscape";
      if (ratio < 0.9) return "portrait";
      return "square";
    }
  }

  if (
    /\b(portrait|vertical|phone wallpaper|mobile wallpaper|instagram story|9:16|2:3|3:4)\b/i.test(
      lower,
    )
  ) {
    return "portrait";
  }
  if (
    /\b(landscape|wide|cinematic|panorama|16:9|21:9|banner|youtube thumbnail)\b/i.test(lower)
  ) {
    return "landscape";
  }
  return "square";
}

function pickResolution(detailLevel: ImageDetailLevel, layout: PromptLayout) {
  const detailKey = detailLevel.toUpperCase();
  const envLayoutKey = layout.toUpperCase();
  const byEnv = process.env[`Z_IMAGE_${detailKey}_${envLayoutKey}_RESOLUTION`];
  if (byEnv) return byEnv;

  if (layout === "landscape") {
    if (detailLevel === "ultra") return "2048x1152 ( 16:9 )";
    if (detailLevel === "high") return "1536x864 ( 16:9 )";
    return "1280x720 ( 16:9 )";
  }
  if (layout === "portrait") {
    if (detailLevel === "ultra") return "1152x2048 ( 9:16 )";
    if (detailLevel === "high") return "864x1536 ( 9:16 )";
    return "720x1280 ( 9:16 )";
  }
  if (detailLevel === "ultra") return "1536x1536 ( 1:1 )";
  if (detailLevel === "high") return "1536x1536 ( 1:1 )";
  return "1280x1280 ( 1:1 )";
}

function looksPhotorealPrompt(prompt: string) {
  return /\b(realistic|photoreal|photo|photograph|cinematic|dslr|raw photo|portrait|selfie|human|person|face|product shot)\b/i.test(
    prompt,
  );
}

function looksStylizedPrompt(prompt: string) {
  return /\b(anime|cartoon|illustration|vector|logo|icon|pixel art|watercolor|oil painting|sketch|line art|3d render|low poly)\b/i.test(
    prompt,
  );
}

function buildFidelityPrompt(prompt: string, detailLevel: ImageDetailLevel) {
  const base = normalizePrompt(prompt);
  const qualityLine =
    detailLevel === "ultra"
      ? "maximum fidelity, deep refined details, precise geometry, artifact-free clarity"
      : detailLevel === "high"
        ? "high fidelity, crisp details, accurate anatomy and perspective, clean edges"
        : "balanced fidelity, clear details, coherent lighting and textures";

  const stylized = looksStylizedPrompt(base);
  const photoreal = looksPhotorealPrompt(base) && !stylized;
  const styleGuard = stylized
    ? "preserve the requested art style exactly, do not force photorealism"
    : photoreal
      ? "photorealistic materials, realistic lighting, natural textures"
      : "preserve the requested style and mood exactly";

  return `${base}, strict prompt adherence, keep subject count composition colors and text exactly as requested, ${qualityLine}, ${styleGuard}, no extra objects, no distortions, no watermark`;
}

function getResolutionCandidates(layout: PromptLayout) {
  if (layout === "landscape") {
    return [
      "1280x720 ( 16:9 )",
      "1152x864 ( 4:3 )",
      "1024x576 ( 16:9 )",
      "896x512 ( 16:9 )",
    ];
  }
  if (layout === "portrait") {
    return [
      "720x1280 ( 9:16 )",
      "864x1152 ( 3:4 )",
      "576x1024 ( 9:16 )",
      "512x896 ( 9:16 )",
    ];
  }
  return [
    "1024x1024 ( 1:1 )",
    "896x896 ( 1:1 )",
    "768x768 ( 1:1 )",
  ];
}

function buildAttempts(
  layout: PromptLayout,
  base: { resolution: string; steps: number; shift: number },
): ZImageAttempt[] {
  const ladder = getResolutionCandidates(layout);
  const currentIndex = ladder.indexOf(base.resolution);
  const secondaryResolution = currentIndex >= 0 ? ladder[Math.min(currentIndex + 1, ladder.length - 1)] : ladder[1] || ladder[0];
  const safeResolution =
    layout === "landscape"
      ? "1024x576 ( 16:9 )"
      : layout === "portrait"
        ? "576x1024 ( 9:16 )"
        : "1024x1024 ( 1:1 )";

  const attempts: ZImageAttempt[] = [
    {
      label: "primary",
      resolution: base.resolution,
      steps: base.steps,
      shift: base.shift,
    },
    {
      label: "retry-balanced",
      resolution: base.resolution,
      steps: Math.max(6, base.steps - 2),
      shift: Math.max(2.4, Number((base.shift - 0.2).toFixed(2))),
    },
    {
      label: "retry-lower-res",
      resolution: secondaryResolution,
      steps: Math.max(6, base.steps - 3),
      shift: Math.max(2.3, Number((base.shift - 0.3).toFixed(2))),
    },
    {
      label: "retry-safe",
      resolution: safeResolution,
      steps: 8,
      shift: 2.6,
    },
  ];

  const seen = new Set<string>();
  return attempts.filter((attempt) => {
    const key = `${attempt.resolution}|${attempt.steps}|${attempt.shift}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isRetryableZImageError(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes("generation error: null") ||
    lower.includes("timed out") ||
    lower.includes("no complete event") ||
    lower.includes("queue result failed 5") ||
    lower.includes("queue start failed 5")
  );
}

async function runZImageAttempt({
  apiBase,
  prompt,
  resolution,
  seed,
  steps,
  shift,
  randomSeed,
  timeoutMs,
}: {
  apiBase: string;
  prompt: string;
  resolution: string;
  seed: number;
  steps: number;
  shift: number;
  randomSeed: boolean;
  timeoutMs: number;
}) {
  const callUrl = `${apiBase}/gradio_api/call/generate`;
  const jsonHeaders = buildZImageHeaders();
  const pollHeaders = { ...jsonHeaders };
  delete pollHeaders["Content-Type"];
  const createResponse = await fetch(callUrl, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      data: [prompt, resolution, seed, steps, shift, randomSeed],
    }),
  });
  if (!createResponse.ok) {
    const text = await createResponse.text();
    throw new Error(`Z-Image queue start failed ${createResponse.status}: ${text}`);
  }

  const queued = (await createResponse.json()) as { event_id?: string };
  if (!queued.event_id) {
    throw new Error("Z-Image queue start did not return event_id.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let sseRaw = "";
  try {
    const resultResponse = await fetch(
      `${apiBase}/gradio_api/call/generate/${queued.event_id}`,
      {
        headers: pollHeaders,
        signal: controller.signal,
      },
    );
    if (!resultResponse.ok) {
      const text = await resultResponse.text();
      throw new Error(`Z-Image queue result failed ${resultResponse.status}: ${text}`);
    }
    sseRaw = await resultResponse.text();
  } finally {
    clearTimeout(timeout);
  }

  const parsedSse = parseSsePayload(sseRaw);
  if (!parsedSse.ok) {
    throw new Error(`Z-Image generation error: ${parsedSse.data}`);
  }

  let parsedData: unknown;
  try {
    parsedData = JSON.parse(parsedSse.data);
  } catch (err: unknown) {
    throw new Error(
      `Z-Image returned invalid JSON payload: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!Array.isArray(parsedData) || !parsedData.length) {
    throw new Error("Z-Image response is empty.");
  }

  const first = parsedData[0] as ZImageFile | undefined;
  if (!first || typeof first !== "object") {
    throw new Error("Z-Image response missing image file payload.");
  }
  const imageUrl = resolveFileUrl(first, apiBase);
  const filename =
    first.orig_name ||
    (first.path ? first.path.split("/").pop() : null) ||
    `z-image-${Date.now()}.webp`;
  const mime = first.mime_type || "image/webp";

  return {
    promptId: `zimg-${Date.now()}`,
    files: [
      {
        filename,
        kind: "image" as const,
        type: mime,
        url: imageUrl,
      },
    ],
  };
}

function parseSsePayload(raw: string) {
  const blocks = raw
    .split(/\n\n+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  let completeData: string | null = null;
  let errorData: string | null = null;

  for (const block of blocks) {
    const lines = block.split("\n");
    const eventLine = lines.find((line) => line.startsWith("event:"));
    const event = eventLine ? eventLine.slice(6).trim() : "";
    const data = lines
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n");

    if (!data) continue;
    if (event === "complete") completeData = data;
    if (event === "error") errorData = data;
  }

  if (completeData) return { ok: true as const, data: completeData };
  if (errorData) return { ok: false as const, data: errorData };
  return { ok: false as const, data: "No complete event found from Z-Image SSE response." };
}

function isHfMcpZImageBase(base: string) {
  try {
    const url = new URL(base);
    const hostname = url.hostname.toLowerCase();
    return hostname.endsWith(".hf.space") && hostname.includes("mcp-tools-z-image");
  } catch {
    return false;
  }
}

function resolveFileUrl(file: ZImageFile, apiBase: string) {
  if (file.url && /^https?:\/\//i.test(file.url)) return file.url;
  if (file.url) return `${apiBase}${file.url.startsWith("/") ? "" : "/"}${file.url}`;
  if (file.path) return `${apiBase}/gradio_api/file=${file.path}`;
  throw new Error("Z-Image response did not include file url/path.");
}

export async function generateImageViaZImageTurbo({
  prompt,
  detailLevel = "standard",
  apiBase = process.env.Z_IMAGE_API_BASE || DEFAULT_Z_IMAGE_API_BASE,
  resolution,
  randomSeed = process.env.Z_IMAGE_RANDOM_SEED !== "false",
  seed = toInt(process.env.Z_IMAGE_SEED, 42),
  steps,
  shift,
  timeoutMs = toInt(process.env.Z_IMAGE_TIMEOUT_MS, DEFAULT_Z_IMAGE_TIMEOUT_MS),
}: {
  prompt: string;
  detailLevel?: ImageDetailLevel;
  apiBase?: string;
  resolution?: string;
  randomSeed?: boolean;
  seed?: number;
  steps?: number;
  shift?: number;
  timeoutMs?: number;
}) {
  if (!isHfMcpZImageBase(apiBase)) {
    throw new Error(
      `Z Image is locked to HF MCP server only. Invalid apiBase: ${apiBase}`,
    );
  }
  const profile = Z_IMAGE_DETAIL_PROFILES[detailLevel];
  const profileKey = detailLevel.toUpperCase();
  const layout = detectPromptLayout(prompt);
  const effectiveResolution =
    resolution ||
    process.env[`Z_IMAGE_${profileKey}_RESOLUTION`] ||
    pickResolution(detailLevel, layout) ||
    process.env.Z_IMAGE_RESOLUTION ||
    DEFAULT_Z_IMAGE_RESOLUTION;
  const effectiveSteps = clamp(
    steps ??
      toInt(
        process.env[`Z_IMAGE_${profileKey}_STEPS`] || process.env.Z_IMAGE_STEPS,
        profile.steps || DEFAULT_Z_IMAGE_STEPS,
      ),
    1,
    100,
  );
  const effectiveShift = clamp(
    shift ??
      toFloat(
        process.env[`Z_IMAGE_${profileKey}_SHIFT`] || process.env.Z_IMAGE_SHIFT,
        profile.shift || DEFAULT_Z_IMAGE_SHIFT,
      ),
    1,
    10,
  );
  const effectivePrompt = buildFidelityPrompt(prompt, detailLevel);
  const promptCandidates = dedupe([effectivePrompt, normalizePrompt(prompt)]);
  const apiBaseCandidates = dedupe([
    apiBase,
    ...parseApiBaseList(process.env.Z_IMAGE_API_BASES),
  ]).filter(isHfMcpZImageBase);
  if (!apiBaseCandidates.length) {
    throw new Error(
      "Z Image requires HF MCP api base (example: https://mcp-tools-z-image-turbo.hf.space).",
    );
  }
  const attempts = buildAttempts(layout, {
    resolution: effectiveResolution,
    steps: effectiveSteps,
    shift: effectiveShift,
  });
  const baseErrors: string[] = [];
  for (const candidateBase of apiBaseCandidates) {
    for (const promptCandidate of promptCandidates) {
      const errors: string[] = [];
      for (let i = 0; i < attempts.length; i += 1) {
        const attempt = attempts[i];
        try {
          return await runZImageAttempt({
            apiBase: candidateBase,
            prompt: promptCandidate,
            resolution: attempt.resolution,
            seed,
            steps: attempt.steps,
            shift: attempt.shift,
            randomSeed,
            timeoutMs,
          });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          errors.push(`${attempt.label}: ${message}`);
          const isLastAttempt = i === attempts.length - 1;
          const retryable = isRetryableZImageError(message);
          if (retryable && !isLastAttempt) continue;
          break;
        }
      }
      if (errors.length) {
        baseErrors.push(`${candidateBase} [${promptCandidate === effectivePrompt ? "enhanced" : "raw"}]: ${errors.join(" | ")}`);
      }
    }
  }
  throw new Error(baseErrors.join(" || ") || "Z-Image generation failed.");
}
