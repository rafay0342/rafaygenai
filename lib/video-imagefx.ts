import { randomUUID } from "crypto";
import { writeFile, readFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { execFile } from "child_process";
import { promisify } from "util";

import { generateImageViaZImageTurbo } from "@/lib/zimage";
import { generateImageViaGoogle } from "@/lib/googleai";
import { generateImageViaHF } from "@/lib/huggingface";
import { generateFromComfyUI } from "@/lib/comfyui";
import { hasHFMediaToken, hasHFMcpToken } from "@/lib/hf-media-token";

type ImageDetailLevel = "standard" | "high" | "ultra";
type ImageProvider = "comfy" | "zimage" | "google" | "hf";
type Layout = "square" | "landscape" | "portrait";

const execFileAsync = promisify(execFile);

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

function isZImageEnabled() {
  return process.env.Z_IMAGE_ENABLED !== "false" && hasHFMcpToken();
}

function isComfyEnabled() {
  return Boolean(process.env.COMFYUI_IMAGE_WORKFLOW || process.env.COMFYUI_MOCK === "true");
}

function isGoogleEnabled() {
  return Boolean(process.env.GOOGLE_API_KEY || process.env.GOOGLE_ACCESS_TOKEN);
}

function isHfEnabled() {
  return hasHFMediaToken();
}

function isProviderEnabled(provider: ImageProvider) {
  if (provider === "comfy") return isComfyEnabled();
  if (provider === "zimage") return isZImageEnabled();
  if (provider === "google") return isGoogleEnabled();
  return isHfEnabled();
}

function resolveComfyImageWorkflow() {
  return process.env.COMFYUI_IMAGE_WORKFLOW || "@workflows/image_sd15_simple.json";
}

function normalizePrompt(prompt: string) {
  return prompt.trim().replace(/\s+/g, " ");
}

function detectLayout(prompt: string): Layout {
  const lower = prompt.toLowerCase();
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

function videoSizeForLayout(layout: Layout, detailLevel: ImageDetailLevel) {
  if (layout === "landscape") {
    return detailLevel === "ultra" ? { w: 1280, h: 720 } : { w: 960, h: 540 };
  }
  if (layout === "portrait") {
    return detailLevel === "ultra" ? { w: 720, h: 1280 } : { w: 540, h: 960 };
  }
  return detailLevel === "ultra" ? { w: 1024, h: 1024 } : { w: 768, h: 768 };
}

function dataUrlToBuffer(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Invalid data URL.");
  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], "base64"),
  };
}

async function fetchImageAsBuffer(url: string) {
  if (url.startsWith("data:")) {
    return dataUrlToBuffer(url);
  }

  const response = await fetch(url, { method: "GET" });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Image fetch failed ${response.status}: ${text}`);
  }
  const mimeType = response.headers.get("content-type") || "image/png";
  const arrayBuffer = await response.arrayBuffer();
  return {
    mimeType,
    buffer: Buffer.from(arrayBuffer),
  };
}

async function createVideoFromImage({
  imageBuffer,
  mimeType,
  width,
  height,
  seconds = 4,
  fps = 24,
}: {
  imageBuffer: Buffer;
  mimeType: string;
  width: number;
  height: number;
  seconds?: number;
  fps?: number;
}) {
  const uid = randomUUID();
  const inputExt = mimeType.includes("jpeg") ? "jpg" : mimeType.includes("webp") ? "webp" : "png";
  const inputPath = join(tmpdir(), `imagefx-${uid}.${inputExt}`);
  const outputPath = join(tmpdir(), `imagefx-${uid}.mp4`);
  const frameCount = Math.max(24, Math.round(seconds * fps));

  // Lightweight Ken Burns style motion from one generated image.
  const filter =
    `scale=${width}:${height}:force_original_aspect_ratio=cover,` +
    `crop=${width}:${height},` +
    `zoompan=z='min(zoom+0.0012,1.12)':d=${frameCount}:` +
    `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}:fps=${fps},` +
    `format=yuv420p`;

  try {
    await writeFile(inputPath, imageBuffer);
    await execFileAsync(
      "ffmpeg",
      [
        "-y",
        "-loop",
        "1",
        "-i",
        inputPath,
        "-vf",
        filter,
        "-t",
        String(seconds),
        "-r",
        String(fps),
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        outputPath,
      ],
      { maxBuffer: 10 * 1024 * 1024 },
    );
    const video = await readFile(outputPath);
    const dataUrl = `data:video/mp4;base64,${video.toString("base64")}`;
    return {
      filename: `imagefx-${Date.now()}.mp4`,
      type: "video/mp4",
      url: dataUrl,
      kind: "video" as const,
    };
  } catch (err: unknown) {
    const message = errorMessage(err);
    if (message.includes("ENOENT") && message.toLowerCase().includes("ffmpeg")) {
      throw new Error("ffmpeg is required for imagefx video fallback but is not installed.");
    }
    throw new Error(`imagefx render failed: ${message}`);
  } finally {
    await unlink(inputPath).catch(() => undefined);
    await unlink(outputPath).catch(() => undefined);
  }
}

async function generateBestImage({
  prompt,
  detailLevel,
}: {
  prompt: string;
  detailLevel: ImageDetailLevel;
}) {
  const providers: ImageProvider[] = ["comfy", "zimage", "google", "hf"];
  const errors: string[] = [];
  for (const provider of providers) {
    if (!isProviderEnabled(provider)) continue;
    try {
      if (provider === "comfy") {
        const comfyResult = await generateFromComfyUI({
          prompt,
          workflowEnv: resolveComfyImageWorkflow(),
          mediaType: "image",
          detailLevel,
        });
        const first = comfyResult.files?.find((file) => file.kind === "image" || file.kind === "gif");
        if (first?.filename) {
          const params = new URLSearchParams();
          params.set("filename", first.filename);
          if (first.subfolder) params.set("subfolder", first.subfolder);
          if (first.type) params.set("type", first.type);
          const comfyBaseUrl =
            (comfyResult as { baseUrl?: string }).baseUrl ||
            (first as { baseUrl?: string }).baseUrl;
          if (comfyBaseUrl) params.set("baseUrl", comfyBaseUrl);
          return `/api/media/file?${params.toString()}`;
        }
      } else if (provider === "zimage") {
        const result = await generateImageViaZImageTurbo({ prompt, detailLevel });
        const first = result.files?.[0];
        if (first?.url) return first.url;
      } else if (provider === "google") {
        const result = await generateImageViaGoogle({ prompt });
        const first = result.files?.[0];
        if (first?.url) return first.url;
      } else {
        const result = await generateImageViaHF({ prompt });
        const first = result.files?.[0];
        if (first?.url) return first.url;
      }
    } catch (err: unknown) {
      errors.push(`${provider}: ${errorMessage(err)}`);
    }
  }
  throw new Error(`imagefx could not generate base image. ${errors.join(" | ")}`.trim());
}

export async function generateVideoViaImageFx({
  prompt,
  detailLevel = "standard",
}: {
  prompt: string;
  detailLevel?: ImageDetailLevel;
}) {
  const cleanPrompt = normalizePrompt(prompt);
  const layout = detectLayout(cleanPrompt);
  const size = videoSizeForLayout(layout, detailLevel);
  const imageUrl = await generateBestImage({
    prompt: cleanPrompt,
    detailLevel,
  });
  const image = await fetchImageAsBuffer(imageUrl);
  const file = await createVideoFromImage({
    imageBuffer: image.buffer,
    mimeType: image.mimeType,
    width: size.w,
    height: size.h,
  });
  return {
    promptId: `imgfx-${Date.now()}`,
    files: [file],
  };
}
