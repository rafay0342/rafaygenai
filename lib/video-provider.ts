import { randomUUID } from "crypto";

type ProviderStatus = "pending" | "running" | "succeeded" | "failed" | "canceled";

export type VideoPreset = "720p60" | "1080p60" | "4k30" | "2k30";
export type VideoAspect = "16:9" | "1:1";

export type CreateJobInput = {
  prompt: string;
  preset: VideoPreset;
  aspect: VideoAspect;
  targetDurationSec: number;
};

export type ProviderJob = {
  id: string;
  status: ProviderStatus;
  outputUrl?: string;
  previewUrl?: string;
  progress?: number;
  error?: string;
};

function env(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}.`);
  }
  return value;
}

function presetDimensions(preset: VideoPreset, aspect: VideoAspect) {
  const landscape =
    aspect === "16:9"
      ? {
          "720p60": { width: 1280, height: 720, fps: 60 },
          "1080p60": { width: 1920, height: 1080, fps: 60 },
          "2k30": { width: 2560, height: 1440, fps: 30 },
          "4k30": { width: 3840, height: 2160, fps: 30 },
        }
      : {
          "720p60": { width: 720, height: 720, fps: 60 },
          "1080p60": { width: 1080, height: 1080, fps: 60 },
          "2k30": { width: 1440, height: 1440, fps: 30 },
          "4k30": { width: 2160, height: 2160, fps: 30 },
        };
  return landscape[preset];
}

function normalizeStatus(status: string): ProviderStatus {
  const lower = status.toLowerCase();
  if (lower === "succeeded" || lower === "completed") return "succeeded";
  if (lower === "failed" || lower === "error") return "failed";
  if (lower === "canceled" || lower === "cancelled") return "canceled";
  if (lower === "processing" || lower === "running") return "running";
  return "pending";
}

function isLikelyReplicateVersionId(value: string) {
  return /^[a-f0-9]{32,}$/i.test(value.trim());
}

type ProviderCreateResponse = {
  id?: string;
  status?: string;
  output?: string[] | string | null;
};

export async function createProviderJob(input: CreateJobInput): Promise<ProviderJob> {
  const base = env("VIDEO_API_BASE").replace(/\/+$/, "");
  const token = env("VIDEO_API_TOKEN");
  const configuredVersion = process.env.VIDEO_API_VERSION?.trim();
  const configuredModel = process.env.VIDEO_API_MODEL?.trim();
  const webhook = process.env.VIDEO_API_WEBHOOK_URL;
  const dims = presetDimensions(input.preset, input.aspect);
  let createUrl = `${base}/predictions`;
  const body: Record<string, unknown> = {
    input: {
      prompt: input.prompt,
      duration: Math.min(Math.max(input.targetDurationSec, 8), 120),
      fps: dims.fps,
      width: dims.width,
      height: dims.height,
    },
  };
  if (configuredVersion && isLikelyReplicateVersionId(configuredVersion)) {
    body.version = configuredVersion;
  } else if (configuredModel) {
    const encodedModelPath = configuredModel
      .split("/")
      .map((part) => encodeURIComponent(part))
      .join("/");
    createUrl = `${base}/models/${encodedModelPath}/predictions`;
  } else if (configuredVersion) {
    throw new Error(
      "VIDEO_API_VERSION is not a valid Replicate version ID. Use a full version hash or set VIDEO_API_MODEL.",
    );
  } else {
    throw new Error("Missing VIDEO_API_MODEL or VIDEO_API_VERSION.");
  }
  if (webhook) {
    body.webhook = webhook;
    // Replicate currently accepts: start, output, logs, completed.
    // Keep this narrow to avoid validation failures on provider-side enums.
    body.webhook_events_filter = ["completed"];
  }

  const resp = await fetch(createUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Video provider create failed ${resp.status}: ${text}`);
  }
  const data = (await resp.json()) as ProviderCreateResponse;
  const outputArray = Array.isArray(data.output)
    ? data.output
    : typeof data.output === "string"
      ? [data.output]
      : [];
  return {
    id: data.id || randomUUID(),
    status: normalizeStatus(data.status || "pending"),
    previewUrl: outputArray[0],
    outputUrl: outputArray[outputArray.length - 1],
  };
}

type ProviderStatusResponse = {
  status?: string;
  output?: string[] | string | null;
  logs?: string;
  error?: string;
};

export async function fetchProviderJob(providerJobId: string): Promise<ProviderJob> {
  const base = env("VIDEO_API_BASE").replace(/\/+$/, "");
  const token = env("VIDEO_API_TOKEN");
  const resp = await fetch(`${base}/predictions/${providerJobId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Video provider status failed ${resp.status}: ${text}`);
  }
  const data = (await resp.json()) as ProviderStatusResponse;
  const outputUrls = Array.isArray(data.output)
    ? data.output
    : typeof data.output === "string"
      ? [data.output]
      : [];
  return {
    id: providerJobId,
    status: normalizeStatus(data.status || "pending"),
    previewUrl: outputUrls[0],
    outputUrl: outputUrls[outputUrls.length - 1],
    error: data.error,
  };
}

export function verifyWebhookSignature(secret: string, provided?: string | null) {
  if (!secret) return true;
  if (!provided) return false;
  return secret === provided;
}
