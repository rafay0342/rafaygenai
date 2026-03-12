import { Client } from "@gradio/client";
import { getHFMediaToken } from "@/lib/hf-media-token";

const DEFAULT_WAN22_SPACE = process.env.WAN22_GRADIO_SPACE || "Wan-AI/Wan-2.2-5B";
const DEFAULT_WAN22_ENDPOINT = process.env.WAN22_GRADIO_ENDPOINT || "/generate_video";
const DEFAULT_IMAGE_URL =
  process.env.WAN22_IMAGE_FALLBACK_URL ||
  "https://raw.githubusercontent.com/gradio-app/gradio/main/test/test_files/bus.png";

export type Wan22GradioPayload = {
  prompt: string;
  imageUrl?: string | null;
  height?: number;
  width?: number;
  durationSeconds?: number;
  samplingSteps?: number;
  guideScale?: number;
  shift?: number;
  seed?: number;
  endpoint?: string;
  space?: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function describeGradioError(err: unknown) {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const payload = err as Record<string, unknown>;
    const title = typeof payload.title === "string" ? payload.title : "";
    const message = typeof payload.message === "string" ? payload.message : "";
    if (title || message) return `${title}${title && message ? ": " : ""}${message}`.trim();
    try {
      return JSON.stringify(payload);
    } catch {
      return String(err);
    }
  }
  return String(err);
}

function pickVideoUrl(value: unknown, baseUrl?: string): string | null {
  if (typeof value === "string") {
    if (isHttpUrl(value) && /\.(mp4|mov|webm)(\?|$)/i.test(value)) return value;
    return null;
  }
  if (!value || typeof value !== "object") return null;

  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = pickVideoUrl(entry, baseUrl);
      if (found) return found;
    }
    return null;
  }

  const record = value as Record<string, unknown>;
  const directUrl = typeof record.url === "string" ? record.url : null;
  if (directUrl && isHttpUrl(directUrl)) return directUrl;

  const directPath = typeof record.path === "string" ? record.path : null;
  if (directPath && baseUrl) {
    return `${baseUrl.replace(/\/+$/, "")}/gradio_api/file=${directPath.replace(/^\/+/, "")}`;
  }

  const nestedCandidates = ["video", "value", "data", "output", "files"];
  for (const key of nestedCandidates) {
    const found = pickVideoUrl(record[key], baseUrl);
    if (found) return found;
  }

  for (const nested of Object.values(record)) {
    const found = pickVideoUrl(nested, baseUrl);
    if (found) return found;
  }
  return null;
}

async function fetchImageBlob(imageUrl?: string | null) {
  const source = imageUrl?.trim() || DEFAULT_IMAGE_URL;
  const response = await fetch(source);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Wan 2.2 fallback image fetch failed ${response.status}: ${text}`);
  }
  return response.blob();
}

export async function generateVideoViaWan22Gradio({
  prompt,
  imageUrl,
  height = 576,
  width = 1024,
  durationSeconds = 4,
  samplingSteps = 30,
  guideScale = 5,
  shift = 5,
  seed = -1,
  endpoint = DEFAULT_WAN22_ENDPOINT,
  space = DEFAULT_WAN22_SPACE,
}: Wan22GradioPayload) {
  const token = getHFMediaToken();
  const imageBlob = await fetchImageBlob(imageUrl);
  const clientOptions =
    token && token.startsWith("hf_")
      ? { token: token as `hf_${string}` }
      : undefined;
  const client = await Client.connect(space, clientOptions);
  try {
    let result: Awaited<ReturnType<typeof client.predict>>;
    try {
      result = await client.predict(endpoint, {
        image: imageBlob,
        prompt,
        height: clamp(Math.round(height), 128, 1536),
        width: clamp(Math.round(width), 128, 1536),
        duration_seconds: clamp(Number(durationSeconds), 0.3, 12),
        sampling_steps: clamp(Math.round(samplingSteps), 1, 60),
        guide_scale: clamp(Number(guideScale), 0, 20),
        shift: clamp(Number(shift), 0, 20),
        seed: Math.round(seed),
      });
    } catch (err) {
      throw new Error(`Wan 2.2 Gradio failed: ${describeGradioError(err)}`);
    }

    const baseUrl =
      (client.config?.root_url || client.config?.root || "").replace(/\/+$/, "") || undefined;
    const url = pickVideoUrl((result as { data?: unknown }).data, baseUrl);
    if (!url) {
      throw new Error("Wan 2.2 Gradio response missing video url.");
    }

    return {
      promptId: `wan22-${Date.now()}`,
      files: [
        {
          filename: `wan22-${Date.now()}.mp4`,
          kind: "video" as const,
          type: "video/mp4",
          url,
        },
      ],
    };
  } finally {
    client.close();
  }
}
