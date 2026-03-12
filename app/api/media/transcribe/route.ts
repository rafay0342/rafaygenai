import { requireAuthOrGuest } from "@/lib/api-auth";
import { groqFetch } from "@/lib/key-pool";
import { enforceLimits } from "@/lib/usage";
import { transcribeAudioViaHF } from "@/lib/huggingface";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

export const runtime = "nodejs";

const DEFAULT_GROQ_STT_MODELS = ["whisper-large-v3-turbo", "whisper-large-v3"] as const;

type SttProvider = "auto" | "groq" | "hf";
type TranscriptionLanguage = "en" | "hi" | "ur";
const MAX_AUDIO_BYTES = 40 * 1024 * 1024;

function envFlag(name: string, fallback = true) {
  const raw = process.env[name];
  if (raw == null) return fallback;
  if (raw === "1") return true;
  if (raw === "0") return false;
  return raw.toLowerCase() === "true" || raw.toLowerCase() === "yes";
}

function sanitizeFilename(name: string) {
  return name.replace(/[^\w.\-]+/g, "_").slice(0, 90) || "voice-input";
}

function extFromMime(mimeType: string) {
  const lower = mimeType.toLowerCase();
  if (lower.includes("mpeg") || lower.includes("mp3")) return "mp3";
  if (lower.includes("wav")) return "wav";
  if (lower.includes("ogg")) return "ogg";
  if (lower.includes("webm")) return "webm";
  if (lower.includes("mp4") || lower.includes("m4a")) return "m4a";
  if (lower.includes("flac")) return "flac";
  return "bin";
}

function plainTextOnly(raw: string) {
  return raw
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_~#>[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toArrayBuffer(data: Buffer) {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

function runProcess(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const proc = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += String(chunk || "");
    });
    proc.on("error", (error) => reject(error));
    proc.on("close", (code) => {
      if (code === 0) return resolve();
      reject(new Error(stderr.trim() || `${command} exited with ${code}`));
    });
  });
}

async function denoiseAudioIfPossible(file: File, audio: ArrayBuffer, mimeType: string) {
  if (process.env.MEDIA_TRANSCRIBE_DENOISE_ENABLED === "false") {
    return {
      audio,
      mimeType,
      cleanedAudio: undefined as
        | {
            filename: string;
            type: string;
            url: string;
          }
        | undefined,
    };
  }
  if (!audio.byteLength || audio.byteLength > MAX_AUDIO_BYTES) {
    return {
      audio,
      mimeType,
      cleanedAudio: undefined as
        | {
            filename: string;
            type: string;
            url: string;
          }
        | undefined,
    };
  }

  const id = randomUUID();
  const inputExt = extFromMime(mimeType);
  const safeBase = sanitizeFilename(file.name || "voice-input");
  const inPath = path.join(tmpdir(), `stt-${id}.${inputExt}`);
  const outPath = path.join(tmpdir(), `stt-${id}-clean.wav`);
  const filter =
    process.env.MEDIA_TRANSCRIBE_DENOISE_FILTER ||
    "highpass=f=80,lowpass=f=7800,afftdn=nf=-22";
  try {
    await fs.writeFile(inPath, Buffer.from(audio));
    await runProcess("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      inPath,
      "-af",
      filter,
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "pcm_s16le",
      outPath,
    ]);
    const cleaned = await fs.readFile(outPath);
    const cleanedDataUrl = `data:audio/wav;base64,${cleaned.toString("base64")}`;
    return {
      audio: toArrayBuffer(cleaned),
      mimeType: "audio/wav",
      cleanedAudio: {
        filename: `${safeBase.replace(/\.[a-z0-9]+$/i, "")}-clean.wav`,
        type: "audio/wav",
        url: cleanedDataUrl,
      },
    };
  } catch {
    return {
      audio,
      mimeType,
      cleanedAudio: undefined as
        | {
            filename: string;
            type: string;
            url: string;
          }
        | undefined,
    };
  } finally {
    await Promise.allSettled([fs.unlink(inPath), fs.unlink(outPath)]);
  }
}

function normalizeAudioMimeType(raw: string | undefined) {
  if (!raw) return "audio/wav";
  // HF ASR endpoint can reject the same mime when parameter spacing differs.
  const normalized = raw
    .trim()
    .replace(/\s*;\s*/g, ";")
    .replace(/\s*=\s*/g, "=")
    .toLowerCase();
  return normalized || "audio/wav";
}

function normalizeProvider(raw: string | undefined): SttProvider {
  const value = (raw || "").trim().toLowerCase();
  if (value === "groq" || value === "hf" || value === "auto") return value;
  return "auto";
}

function normalizeLanguageHint(raw: string | undefined): TranscriptionLanguage | undefined {
  const value = (raw || "").trim().toLowerCase();
  if (!value) return undefined;
  if (value.startsWith("hi") || value === "hindi") return "hi";
  if (value.startsWith("ur") || value === "urdu") return "ur";
  if (value.startsWith("en") || value === "english") return "en";
  return undefined;
}

function normalizePromptHint(raw: string | undefined) {
  const value = (raw || "").trim().replace(/\s+/g, " ");
  if (!value) return undefined;
  return value.slice(0, 320);
}

function normalizeModel(raw: string | undefined) {
  const value = (raw || "").trim();
  return value || undefined;
}

function parseModelList(raw: string | undefined) {
  return (raw || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function resolveGroqApiKey() {
  const direct = process.env.GROQ_API_KEY?.trim();
  if (direct) return direct;
  const openai = process.env.OPENAI_API_KEY?.trim();
  if (openai?.startsWith("gsk_")) return openai;
  return "";
}

function resolveGroqModels(requestedModel: string | undefined) {
  if (requestedModel) return [requestedModel];
  const configured = parseModelList(process.env.MEDIA_TRANSCRIBE_MODELS);
  if (configured.length) return configured;
  return [...DEFAULT_GROQ_STT_MODELS];
}

function toHFModel(model: string | undefined) {
  if (!model) return process.env.HF_ASR_MODEL || "openai/whisper-large-v3";
  if (model.includes("/")) return model;
  if (model.startsWith("whisper-")) return `openai/${model}`;
  return model;
}

function pickErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function transcribeAudioViaGroq({
  audio,
  mimeType,
  model,
  language,
  promptHint,
}: {
  audio: ArrayBuffer;
  mimeType: string;
  model: string;
  language?: TranscriptionLanguage;
  promptHint?: string;
}) {
  const apiKey = resolveGroqApiKey();
  if (!apiKey) {
    throw new Error("Groq STT key missing. Set GROQ_API_KEY (or OPENAI_API_KEY with gsk_ key).");
  }

  const baseUrl = (process.env.GROQ_API_BASE_URL || "https://api.groq.com/openai/v1").replace(
    /\/+$/,
    "",
  );
  const form = new FormData();
  const extension = mimeType.includes("ogg")
    ? "ogg"
    : mimeType.includes("mp4")
      ? "m4a"
      : mimeType.includes("webm")
        ? "webm"
        : "wav";
  form.set("file", new Blob([audio], { type: mimeType }), `voice-input.${extension}`);
  form.set("model", model);
  if (language) form.set("language", language);
  if (promptHint) form.set("prompt", promptHint);

  const response = await groqFetch(`${baseUrl}/audio/transcriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  const rawText = await response.text();
  let parsed: { text?: string; error?: { message?: string }; message?: string } = {};
  if (rawText) {
    try {
      parsed = JSON.parse(rawText) as typeof parsed;
    } catch {
      parsed = {};
    }
  }

  if (!response.ok) {
    const message =
      parsed.error?.message ||
      parsed.message ||
      (rawText ? rawText.slice(0, 220) : `Groq ASR error ${response.status}`);
    throw new Error(`Groq ASR error ${response.status}: ${message}`);
  }

  const text = parsed.text?.trim();
  if (!text) {
    throw new Error("Groq ASR response missing text.");
  }
  return { text, model };
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuthOrGuest(req);
    const allowGuest = envFlag("ALLOW_GUEST_MEDIA", true);
    if (auth.isGuest && !allowGuest) {
      return Response.json({ error: "Login required." }, { status: 401 });
    }
    if (!auth.isGuest) {
      await enforceLimits(auth.userId);
    }

    const contentType = req.headers.get("content-type") || "";
    if (!contentType.startsWith("multipart/form-data")) {
      return Response.json(
        { error: "Content-Type must be multipart/form-data with field 'audio'" },
        { status: 400 },
      );
    }

    const form = await req.formData();
    const file = form.get("audio");
    if (!(file instanceof File)) {
      return Response.json({ error: "Missing audio file" }, { status: 400 });
    }

    const requestedProviderValue = form.get("provider");
    const requestedProvider =
      typeof requestedProviderValue === "string"
        ? normalizeProvider(requestedProviderValue)
        : "auto";
    const configuredProvider = normalizeProvider(process.env.MEDIA_TRANSCRIBE_PROVIDER);
    const provider = requestedProvider === "auto" ? configuredProvider : requestedProvider;

    const requestedModelValue = form.get("model");
    const requestedModel =
      typeof requestedModelValue === "string" ? normalizeModel(requestedModelValue) : undefined;
    const requestedLanguageValue = form.get("language");
    const requestedLanguage =
      typeof requestedLanguageValue === "string"
        ? normalizeLanguageHint(requestedLanguageValue)
        : undefined;
    const requestedPromptValue = form.get("prompt");
    const promptHint =
      typeof requestedPromptValue === "string"
        ? normalizePromptHint(requestedPromptValue)
        : undefined;

    const arrayBuffer = await file.arrayBuffer();
    const mimeType = normalizeAudioMimeType(file.type);
    const denoised = await denoiseAudioIfPossible(file, arrayBuffer, mimeType);
    const errors: string[] = [];
    const shouldTryGroq = provider === "groq" || provider === "auto";
    const shouldTryHF = provider === "hf" || provider === "auto";

    if (shouldTryGroq) {
      const groqModels = resolveGroqModels(requestedModel);
      for (const groqModel of groqModels) {
        try {
          const result = await transcribeAudioViaGroq({
            audio: denoised.audio,
            mimeType: denoised.mimeType,
            model: groqModel,
            language: requestedLanguage,
            promptHint,
          });
          const cleanedText = plainTextOnly(result.text || "");
          return Response.json({
            text: cleanedText,
            plainText: cleanedText,
            model: result.model,
            provider: "groq",
            language: requestedLanguage || "auto",
            cleanedAudio: denoised.cleanedAudio,
          });
        } catch (error) {
          errors.push(`groq/${groqModel}: ${pickErrorMessage(error)}`);
        }
      }
      if (provider === "groq") {
        throw new Error(`Groq STT failed. ${errors.join(" | ")}`);
      }
    }

    if (shouldTryHF) {
      try {
        const result = await transcribeAudioViaHF({
          audio: denoised.audio,
          mimeType: denoised.mimeType,
          model: toHFModel(requestedModel),
        });
        const cleanedText = plainTextOnly(result.text || "");
        return Response.json({
          text: cleanedText,
          plainText: cleanedText,
          model: result.model,
          provider: "hf",
          language: requestedLanguage || "auto",
          cleanedAudio: denoised.cleanedAudio,
        });
      } catch (error) {
        errors.push(`hf: ${pickErrorMessage(error)}`);
      }
    }

    throw new Error(
      `All STT providers failed. ${
        errors.length ? errors.join(" | ") : "No provider is configured for transcription."
      }`,
    );
  } catch (error) {
    const message = pickErrorMessage(error);
    const status =
      message.includes("Unauthorized") ? 401 : message.includes("limit") ? 429 : 500;
    return Response.json({ error: message }, { status });
  }
}
