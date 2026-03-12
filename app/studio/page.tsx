"use client";
import ThemeToggle from "@/components/theme-toggle";
import { RafaygenLogo } from "@/components/ui/rafaygen-logo";
import { pickBestModelForPreset } from "@/lib/model-routing";
/* eslint-disable @next/next/no-img-element */

import Image from "next/image";
import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type ChangeEvent,
} from "react";
import { createPortal } from "react-dom";
import { signOut, useSession as useSessionBase } from "next-auth/react";

type Role = "user" | "assistant" | "system";

type PromptAttachmentKind = "image" | "video" | "audio" | "document" | "file";

type PromptAttachment = {
  id: string;
  name: string;
  type: string;
  size: number;
  kind: PromptAttachmentKind;
  textSnippet?: string;
  dataUrl?: string;
  previewUrl?: string;
};

type Message = {
  role: Role;
  content: string;
  media?: MediaResult[];
  attachments?: PromptAttachment[];
};

type ChatSession = {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
};

// Minimal SpeechRecognition typings so server build passes without DOM globals
type SpeechRecognitionEvent = {
  resultIndex?: number;
  results: Array<{ 0?: { transcript?: string }; isFinal?: boolean }>;
};
type SpeechRecognitionErrorEvent = { error: string };
type SpeechRecognition = {
  start: () => void;
  stop: () => void;
  abort: () => void;
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onaudiostart?: () => void;
  onend?: () => void;
  onresult?: (event: SpeechRecognitionEvent) => void;
  onerror?: (event: SpeechRecognitionErrorEvent) => void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognition;

type MediaResult = {
  filename: string;
  subfolder?: string;
  type?: string;
  kind: "image" | "video" | "gif" | "audio" | "unknown";
  url?: string; // direct URL or data URL for non-Comfy providers
  baseUrl?: string;
};

type MediaPreview = {
  file: MediaResult;
  url: string;
};

type MediaMode = "image" | "video" | "audio";
type RealtimeSetting = "auto" | "off" | "search" | "deep";
type SafetySetting = "standard" | "strict";
type StudioExperienceProps = {
  initialMediaMode?: MediaMode;
  initialMediaModalOpen?: boolean;
  initialVoicePopupOpen?: boolean;
  initialVoiceMode?: boolean;
  initialPresetId?: string;
  embedded?: boolean;
};
type ImageModelChoice =
  | "comfyui_fast"
  | "zimage_turbo"
  | "hf_flux_schnell";
type HiddenImageProvider = "comfy" | "zimage" | "hf";

const getSpeechRecognitionConstructor = (): SpeechRecognitionConstructor | null => {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
};

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
    webkitAudioContext?: typeof AudioContext;
  }
}


function attachmentKindFromFile(file: File): PromptAttachmentKind {
  const type = file.type.toLowerCase();
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  if (
    type.startsWith("text/") ||
    type.includes("json") ||
    type.includes("xml") ||
    type.includes("pdf") ||
    /\.(txt|md|csv|json|xml|pdf|doc|docx|rtf|log|yml|yaml)$/i.test(file.name)
  ) {
    return "document";
  }
  return "file";
}

function isTextLikeFile(file: File) {
  const type = file.type.toLowerCase();
  return (
    type.startsWith("text/") ||
    type.includes("json") ||
    type.includes("xml") ||
    /\.(txt|md|csv|json|xml|yml|yaml|log|ini|toml|js|ts|py|java|go|rs|c|cpp|sql)$/i.test(
      file.name,
    )
  );
}

export default function StudioPage() {
  return <StudioExperience />;
}

function formatFileSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

function stripAttachmentBinaryForHistory(file: PromptAttachment): PromptAttachment {
  return {
    id: file.id,
    name: file.name,
    type: file.type,
    size: file.size,
    kind: file.kind,
    textSnippet: file.textSnippet,
  };
}

async function dataUrlToFile(dataUrl: string, name: string, fallbackType: string) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const type = blob.type || fallbackType || "application/octet-stream";
  return new File([blob], name || `audio-${Date.now()}`, { type });
}

function describeVoiceStartError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  const normalized = message.toLowerCase();
  if (normalized.includes("not-allowed")) {
    return "Microphone permission denied. Allow mic access in browser settings.";
  }
  if (normalized.includes("service-not-allowed")) {
    return "Microphone capture blocked by browser/device policy.";
  }
  if (normalized.includes("network")) {
    return "Network issue. Check connection and retry.";
  }
  return `Voice start failed: ${message}`;
}

function pickRecordingMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/mp4",
  ];
  for (const value of candidates) {
    if (MediaRecorder.isTypeSupported(value)) return value;
  }
  return "";
}

// ─── Gemini-style WAV Visualizer — Organic Blob/Orb ────────────────────────
const WavVisualizer = memo(function WavVisualizer({
  isListening,
  isSpeaking,
  isReady,
  analyserNode,
}: {
  isListening: boolean;
  isSpeaking: boolean;
  isReady: boolean;
  analyserNode: AnalyserNode | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const timeRef = useRef(0);
  const ampRef = useRef(0);
  const active = isListening || isSpeaking || isReady;
  const size = 268;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = typeof window === "undefined" ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;

    const W = size;
    const H = size;
    const cx = W / 2;
    const cy = H / 2;
    const BASE_R = Math.min(W, H) * 0.22;

    const bufLen = analyserNode ? analyserNode.frequencyBinCount : 0;
    const fftData = analyserNode ? new Uint8Array(bufLen) : null;

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      timeRef.current += active ? 0.04 : 0.012;
      const t = timeRef.current;

      // Get real audio amplitude
      let realAmp = 0;
      if (analyserNode && fftData) {
        analyserNode.getByteFrequencyData(fftData);
        let sum = 0;
        const slice = Math.floor(bufLen * 0.5);
        for (let i = 0; i < slice; i++) sum += fftData[i];
        realAmp = sum / (slice * 255);
      }

      // Smooth amplitude
      const targetAmp = active
        ? realAmp > 0.01
          ? realAmp
          : isReady
            ? 0.22 + Math.sin(t * 1.5) * 0.08
            : 0.35 + Math.sin(t * 1.8) * 0.15
        : 0.08;
      ampRef.current += (targetAmp - ampRef.current) * 0.12;
      const amp = ampRef.current;

      ctx.clearRect(0, 0, W, H);

      // ── Outer glow rings ────────────────────────────────────
      if (active) {
        const ringCount = isSpeaking ? 4 : 3;
        for (let r = 0; r < ringCount; r++) {
          const phase = t * (0.6 + r * 0.3) + r * 1.1;
          const ringR = BASE_R * (1.4 + r * 0.55 + amp * (0.6 + r * 0.25)) * (0.88 + Math.sin(phase) * 0.07);
          const alpha = (0.18 - r * 0.045) * (0.5 + amp * 0.5);
          const grad = ctx.createRadialGradient(cx, cy, ringR * 0.6, cx, cy, ringR);
          if (isSpeaking) {
            grad.addColorStop(0, `rgba(139,92,246,${alpha * 1.4})`);
            grad.addColorStop(0.5, `rgba(167,139,250,${alpha * 0.7})`);
            grad.addColorStop(1, "rgba(139,92,246,0)");
          } else if (isListening) {
            grad.addColorStop(0, `rgba(59,130,246,${alpha * 1.4})`);
            grad.addColorStop(0.5, `rgba(96,165,250,${alpha * 0.7})`);
            grad.addColorStop(1, "rgba(59,130,246,0)");
          } else {
            grad.addColorStop(0, `rgba(56,189,248,${alpha * 1.2})`);
            grad.addColorStop(0.5, `rgba(125,211,252,${alpha * 0.6})`);
            grad.addColorStop(1, "rgba(56,189,248,0)");
          }
          ctx.beginPath();
          ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
          ctx.fillStyle = grad;
          ctx.fill();
        }
      }

      // ── Organic blob shape ───────────────────────────────────
      const POINTS = 120;
      ctx.beginPath();
      for (let i = 0; i <= POINTS; i++) {
        const angle = (i / POINTS) * Math.PI * 2;
        // Multi-frequency noise for organic feel
        const n1 = Math.sin(angle * 2 + t * 1.4) * 0.18;
        const n2 = Math.sin(angle * 3 - t * 0.9) * 0.12;
        const n3 = Math.sin(angle * 5 + t * 2.1) * 0.07;
        const n4 = Math.sin(angle * 7 - t * 1.6) * 0.04;
        const noise = (n1 + n2 + n3 + n4) * amp * (active ? 1.0 : 0.3);
        const r = BASE_R * (1 + noise + amp * 0.18 * (active ? 1 : 0.2));
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();

      // Blob gradient fill
      const blobGrad = ctx.createRadialGradient(cx - BASE_R * 0.2, cy - BASE_R * 0.2, 0, cx, cy, BASE_R * 1.3);
      if (!active) {
        blobGrad.addColorStop(0, "rgba(148,163,184,0.22)");
        blobGrad.addColorStop(1, "rgba(100,116,139,0.10)");
      } else if (isSpeaking) {
        blobGrad.addColorStop(0, `rgba(196,181,253,${0.7 + amp * 0.3})`);
        blobGrad.addColorStop(0.4, `rgba(139,92,246,${0.65 + amp * 0.3})`);
        blobGrad.addColorStop(1, `rgba(109,40,217,${0.5 + amp * 0.3})`);
      } else if (isListening) {
        blobGrad.addColorStop(0, `rgba(147,197,253,${0.7 + amp * 0.3})`);
        blobGrad.addColorStop(0.4, `rgba(59,130,246,${0.65 + amp * 0.3})`);
        blobGrad.addColorStop(1, `rgba(29,78,216,${0.5 + amp * 0.3})`);
      } else {
        blobGrad.addColorStop(0, `rgba(186,230,253,${0.72 + amp * 0.2})`);
        blobGrad.addColorStop(0.42, `rgba(14,165,233,${0.5 + amp * 0.18})`);
        blobGrad.addColorStop(1, `rgba(59,130,246,${0.36 + amp * 0.12})`);
      }
      ctx.fillStyle = blobGrad;
      ctx.fill();

      // Inner highlight
      const hlGrad = ctx.createRadialGradient(cx - BASE_R * 0.28, cy - BASE_R * 0.32, 0, cx, cy, BASE_R * 0.85);
      hlGrad.addColorStop(0, `rgba(255,255,255,${0.28 + amp * 0.12})`);
      hlGrad.addColorStop(0.5, "rgba(255,255,255,0.04)");
      hlGrad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = hlGrad;
      ctx.fill();

      // ── Inner frequency bars (subtle) ────────────────────────
      if ((isListening || isSpeaking) && analyserNode && fftData) {
        const BAR_COUNT = 32;
        const innerR = BASE_R * 0.72;
        const outerR = BASE_R * (1.02 + amp * 0.22);
        for (let i = 0; i < BAR_COUNT; i++) {
          const angle = (i / BAR_COUNT) * Math.PI * 2 - Math.PI / 2;
          const bin = Math.floor((i / BAR_COUNT) * bufLen * 0.55);
          const barAmp = (fftData[bin] / 255) * 0.85 + 0.15;
          const r0 = innerR;
          const r1 = innerR + (outerR - innerR) * barAmp;
          ctx.beginPath();
          ctx.moveTo(cx + r0 * Math.cos(angle), cy + r0 * Math.sin(angle));
          ctx.lineTo(cx + r1 * Math.cos(angle), cy + r1 * Math.sin(angle));
          ctx.strokeStyle = isSpeaking
            ? `rgba(221,214,254,${0.35 + barAmp * 0.45})`
            : `rgba(186,230,253,${0.35 + barAmp * 0.45})`;
          ctx.lineWidth = 1.5;
          ctx.lineCap = "round";
          ctx.stroke();
        }
      }
    };

    draw();
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [isListening, isSpeaking, isReady, analyserNode, active, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ width: `${size}px`, height: `${size}px`, display: "block", margin: "0 auto" }}
      aria-hidden="true"
    />
  );
});
// ─────────────────────────────────────────────────────────────────────────────

const MessageBubble = memo(function MessageBubble({
  message,
  plainTextEnabled,
  buildMediaUrl,
  buildMediaDownloadUrl,
  openMediaPreview,
  messageIndex,
  onCopyMessage,
  onShareMessage,
  onEditUserMessage,
  onRegenerateAssistantMessage,
  onReplyToAssistant,
}: {
  message: Message;
  plainTextEnabled: boolean;
  buildMediaUrl: (file: MediaResult) => string;
  buildMediaDownloadUrl: (file: MediaResult) => string;
  openMediaPreview: (file: MediaResult) => void;
  messageIndex: number;
  onCopyMessage: (content: string) => void;
  onShareMessage: (messageIndex: number) => void;
  onEditUserMessage: (index: number) => void;
  onRegenerateAssistantMessage: (index: number) => void;
  onReplyToAssistant: (content: string) => void;
}) {
  const isUser = message.role === "user";
  const normalized =
    message.role === "assistant" ? sanitizeStreamChunk(message.content) : message.content;
  const content =
    message.role === "assistant" && plainTextEnabled
      ? formatAssistantText(normalized)
      : normalized;

  const isEmpty = !isUser && !message.content;
  return (
    <div className={`gem-msg-row ${isUser ? "justify-end" : "justify-start"} gem-msg-row-outer`}>
      <div className={`gem-msg ${isUser ? "gem-msg-user" : "gem-msg-assistant"}`}>
        {!isUser ? (
          <div className="rg-assistant-header">
            <div className={`rg-logo-avatar ${isEmpty ? "rg-logo-streaming" : ""}`}>
              <RafaygenLogo size="md" />
            </div>
            <span className="rg-assistant-name">RafayGen</span>
          </div>
        ) : null}
        {isEmpty ? (
          <div className="rg-typing-dots"><span /><span /><span /></div>
        ) : content ? (
          <p className="whitespace-pre-wrap break-words">{content}</p>
        ) : null}
        {message.attachments?.length ? (
          <section className="gem-attachment-list" aria-label="Attached files">
            {message.attachments.map((file) => (
              <article key={file.id} className="gem-attachment-item">
                {file.previewUrl ? (
                  <Image
                    src={file.previewUrl}
                    alt={file.name}
                    className="gem-attachment-thumb"
                    width={64}
                    height={64}
                    unoptimized
                  />
                ) : (
                  <span className="gem-attachment-icon" aria-hidden="true">
                    {file.kind === "image"
                      ? "IMG"
                      : file.kind === "video"
                        ? "VID"
                        : file.kind === "audio"
                          ? "AUD"
                          : file.kind === "document"
                            ? "DOC"
                            : "FILE"}
                  </span>
                )}
                <div className="min-w-0">
                  <p>{file.name}</p>
                  <small>
                    {file.kind} • {formatFileSize(file.size)}
                  </small>
                </div>
              </article>
            ))}
          </section>
        ) : null}
        {!isUser && message.media?.length ? (
          <section className="gem-media-grid" aria-label="Generated media results">
            {message.media.map((file, index) => {
              const mediaUrl = buildMediaUrl(file);
              const downloadUrl = buildMediaDownloadUrl(file);
              return (
                <article key={`${file.filename}-${index}`} className="gem-media-card">
                  <div className="gem-media-card-head">
                    <p>{file.filename}</p>
                    <a href={downloadUrl} download>
                      Download
                    </a>
                  </div>
                  {file.kind === "image" || file.kind === "gif" ? (
                    <button
                      type="button"
                      className="gem-media-preview-btn"
                      onClick={() => openMediaPreview(file)}
                    >
                      <Image
                        src={mediaUrl}
                        alt={file.filename}
                        className="gem-media-thumb"
                        width={200}
                        height={200}
                        unoptimized
                      />
                    </button>
                  ) : file.kind === "video" ? (
                    <video src={mediaUrl} controls className="gem-media-video" />
                  ) : file.kind === "audio" ? (
                    <audio src={mediaUrl} controls className="gem-media-audio" />
                  ) : (
                    <a href={mediaUrl} target="_blank" rel="noreferrer" className="gem-media-open-link">
                      Open file
                    </a>
                  )}
                </article>
              );
            })}
          </section>
        ) : null}
        <div className={`gem-msg-actions ${isUser ? "gem-msg-actions-user" : ""}`}>
          <button type="button" onClick={() => onCopyMessage(message.content)}>
            Copy
          </button>
          <button type="button" onClick={() => onShareMessage(messageIndex)}>
            Share chat
          </button>
          {isUser ? (
            <button type="button" onClick={() => onEditUserMessage(messageIndex)}>
              Edit
            </button>
          ) : (
            <>
              <button type="button" onClick={() => onReplyToAssistant(message.content)}>
                Reply
              </button>
              <button type="button" onClick={() => onRegenerateAssistantMessage(messageIndex)}>
                Regenerate
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
});

const PLAIN_TEXT_STORAGE_KEY = "rafaygen:plainText";
const THEME_STORAGE_KEY = "rafaygen:theme";
const CHAT_SESSIONS_STORAGE_KEY = "rafaygen:chatSessions";
const ACTIVE_CHAT_SESSION_STORAGE_KEY = "rafaygen:activeChatSession";
const SPEECH_TO_SPEECH_STORAGE_KEY = "rafaygen:speechToSpeech";
const MODEL_PRESET_STORAGE_KEY = "rafaygen:modelPreset";
const MAX_CHAT_SESSIONS = 40;
const SESSION_SYNC_DELAY_IDLE_MS = 90;
const SESSION_SYNC_DELAY_STREAMING_MS = 260;
const SESSION_STORAGE_WRITE_DELAY_MS = 260;
const MAX_ATTACHMENTS_PER_MESSAGE = 8;
const MAX_TEXT_ATTACHMENT_BYTES = 1_500_000;
const MAX_AUDIO_ATTACHMENT_BYTES = 28_000_000;
const VOICE_RECORDING_WINDOW_MS = 1900;
const DEFAULT_SPEECH_LOCALE =
  process.env.NEXT_PUBLIC_DEFAULT_SPEECH_LOCALE || "en-IN";

type ThemeMode = "light" | "dark";

function normalizeThemeMode(raw: string | null): ThemeMode | null {
  if (raw === "claude") return "dark";
  if (raw === "light" || raw === "dark") return raw;
  return null;
}

const PROMPT_BOOST =
  process.env.NEXT_PUBLIC_PROMPT_BOOST ||
  "Maximize solution quality and completeness. Provide full working code by default, not just outlines. For complex math/science, give pro-level depth with clear steps and final answers. Ask clarifying questions only if a key detail is missing and guessing would likely be wrong. Avoid unnecessary disclaimers or warnings. Keep the response direct and user-focused.";

const SAME_LANGUAGE_INSTRUCTION =
  "Reply in the same language and script as the user's latest message. Keep code and technical terms unchanged unless the user asks for translation.";

const SAME_LANGUAGE_INSTRUCTION_VOICE =
  "If user speaks in Roman Urdu or Hinglish, strictly reply in the same Roman style and language mix. Do not switch to pure English unless user asks.";

const SAME_LANGUAGE_INSTRUCTION_STRICT =
  "If user writes in Roman Urdu/Hinglish, never switch to Devanagari/Urdu script. Mirror user language style exactly and stay consistent through the full reply.";

// tier: "free" = free+login, "pro" = pro plan, "premium" = premium plan, "any" = all
const MODEL_PRESETS = [
  { id: "rafaygenai-2.5-flash",    label: "RafayGen Flash",    note: "Free · Fast",        description: "Quick responses. Free plan.", tier: "free" },
  { id: "rafaygenai-3.0-thinking", label: "RafayGen Thinking", note: "Free · Reasoning",   description: "Balanced reasoning. Free plan.", tier: "free" },
  { id: "rafaygenai-3.1-pro",      label: "RafayGen Pro",      note: "Pro",                description: "Best quality. Pro plan.", tier: "pro" },
  { id: "hf-qwen3-thinking",       label: "Qwen3 Thinking",    note: "Pro · HF",           description: "Qwen3-4B Thinking distill.", tier: "pro" },
  { id: "hf-gpt5-reasoning",       label: "GPT-5.2 HF",        note: "Pro · HF·Reasoning", description: "GPT-5.2 high reasoning via HF.", tier: "pro" },
  { id: "hf-glm47-flash",          label: "GLM-4.7 Flash",     note: "Pro · HF·Fast",      description: "GLM-4.7 Flash distill via HF.", tier: "pro" },
  { id: "hf-gemini3-pro",          label: "Gemini 3 Pro",      note: "Premium · HF",       description: "High reasoning Gemini 3 Pro.", tier: "premium" },
  { id: "hf-ming-omni",            label: "Ming Omni",         note: "Premium · Any-to-Any", description: "Any-to-any: image,text,video,audio.", tier: "premium" },
  { id: "hf-qwen-img-edit",        label: "Qwen Image Edit",   note: "Premium · Img-to-Img", description: "Image editing via Qwen Sora.", tier: "premium" },
] as const;

type ModelPresetId = (typeof MODEL_PRESETS)[number]["id"];
type ModelProfileMeta = {
  id: ModelPresetId;
  label: string;
  note: string;
  description: string;
  provider?: string;
  model: string;
};

const CONTROL_SYMBOL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const IMAGE_FORCE_CMD_RE = /^\/(?:image|img)\s+/i;
const VIDEO_FORCE_CMD_RE = /^\/(?:video|vid)\s+/i;
const AUDIO_FORCE_CMD_RE = /^\/(?:audio|voice|tts)\s+/i;
const QUESTION_PREFIX_RE = /^(how|what|why|can|could|should|is|are|do|does|did|which|when|where)\b/i;
const MEDIA_ACTION_RE = /\b(generate|create|make|design|draw|render|animate|produce|build|craft)\b/i;
const IMAGE_INTENT_RE =
  /\b(image|photo|picture|pic|illustration|artwork|poster|logo|wallpaper|thumbnail|portrait|avatar)\b/i;
const VIDEO_INTENT_RE = /\b(video|clip|reel|animation|animated|cinematic|movie|trailer|short)\b/i;
const AUDIO_INTENT_RE =
  /\b(audio|voiceover|narration|narrate|read aloud|text to speech|speech|tts)\b/i;

function sanitizeStreamChunk(input: string) {
  return input.replace(/\uFFFD/g, "").replace(CONTROL_SYMBOL_RE, "");
}

function detectMediaIntent(input: string): { mode: MediaMode; prompt: string } | null {
  const source = input.trim();
  if (!source) return null;

  if (IMAGE_FORCE_CMD_RE.test(source)) {
    return { mode: "image", prompt: source.replace(IMAGE_FORCE_CMD_RE, "").trim() || source };
  }
  if (VIDEO_FORCE_CMD_RE.test(source)) {
    return { mode: "video", prompt: source.replace(VIDEO_FORCE_CMD_RE, "").trim() || source };
  }
  if (AUDIO_FORCE_CMD_RE.test(source)) {
    return { mode: "audio", prompt: source.replace(AUDIO_FORCE_CMD_RE, "").trim() || source };
  }

  const lowered = source.toLowerCase();
  if (QUESTION_PREFIX_RE.test(lowered) && (IMAGE_INTENT_RE.test(lowered) || VIDEO_INTENT_RE.test(lowered))) {
    return null;
  }

  if (/^(imagine|visualize)\b/i.test(source)) {
    return { mode: "image", prompt: source };
  }

  const hasAction = MEDIA_ACTION_RE.test(source);
  if (!hasAction) return null;

  if (VIDEO_INTENT_RE.test(source)) return { mode: "video", prompt: source };
  if (AUDIO_INTENT_RE.test(source)) return { mode: "audio", prompt: source };
  if (IMAGE_INTENT_RE.test(source)) return { mode: "image", prompt: source };

  return null;
}

function buildMediaContextPrompt(currentPrompt: string, history: Message[]) {
  const prompt = currentPrompt.trim();
  if (!prompt) return currentPrompt;
  const recent = history
    .filter((entry) => entry.content.trim() || entry.media?.length)
    .slice(-8)
    .map((entry) => {
      const role = entry.role === "assistant" ? "Assistant" : entry.role === "user" ? "User" : "System";
      const text = entry.content.replace(/\s+/g, " ").trim().slice(0, 260);
      const mediaNote =
        entry.media?.length
          ? ` [media: ${entry.media
              .slice(0, 2)
              .map((item) => item.filename)
              .join(", ")}]`
          : "";
      if (!text && !mediaNote) return "";
      return `${role}: ${text}${mediaNote}`.trim();
    })
    .filter(Boolean);

  if (!recent.length) return prompt;
  const context = recent.join("\n").slice(0, 1800);
  return `${prompt}\n\nConversation context for consistency:\n${context}`;
}

function resolvePresetImageRouting(presetId: string | null): {
  provider: HiddenImageProvider;
  imageModel: ImageModelChoice;
} {
  if (presetId === "rafaygenai-2.5-flash") {
    return { provider: "hf", imageModel: "hf_flux_schnell" };
  }
  if (presetId === "rafaygenai-3.0-thinking") {
    return { provider: "zimage", imageModel: "zimage_turbo" };
  }
  return { provider: "comfy", imageModel: "comfyui_fast" };
}

function mapPresetToModel(
  presetId: ModelPresetId,
  availableModels: string[],
  fallback: string,
) {
  return pickBestModelForPreset(availableModels, presetId, fallback);
}

function formatAssistantText(content: string) {
  let text = content.replace(/\r\n/g, "\n");
  text = text.replace(/```([\s\S]*?)```/g, (_match, inner) => inner.trim());
  text = text.replace(/`([^`]+)`/g, "$1");
  text = text.replace(/\*\*(.*?)\*\*/g, "$1");
  text = text.replace(/\*(.*?)\*/g, "$1");
  text = text.replace(/__(.*?)__/g, "$1");
  text = text.replace(/_(.*?)_/g, "$1");
  text = text.replace(/~~(.*?)~~/g, "$1");
  text = text.replace(/^#{1,6}\s+/gm, "");
  text = text.replace(/^\s*[-*+]\s+/gm, "- ");
  text = text.replace(/^\s*>\s?/gm, "");
  return text;
}

function makeSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function makeSessionTitle(messages: Message[]) {
  const firstUser = messages.find((entry) => entry.role === "user" && entry.content.trim());
  if (!firstUser) return "New chat";
  const compact = firstUser.content.replace(/\s+/g, " ").trim();
  if (!compact) return "New chat";
  return compact.length > 54 ? `${compact.slice(0, 54)}...` : compact;
}

function makeFreshSession(): ChatSession {
  return {
    id: makeSessionId(),
    title: "New chat",
    messages: [],
    updatedAt: Date.now(),
  };
}

function normalizeSpeechLocale(value: string | undefined) {
  const raw = (value || "").trim().toLowerCase();
  if (!raw) return DEFAULT_SPEECH_LOCALE;
  if (raw.startsWith("hi")) return "hi-IN";
  if (raw.startsWith("ur")) return "ur-PK";
  if (raw === "hindi") return "hi-IN";
  if (raw === "urdu") return "ur-PK";
  if (raw.startsWith("en")) return "en-IN";
  return DEFAULT_SPEECH_LOCALE;
}

function toTranscriptionLanguageHint(locale: string) {
  const normalized = normalizeSpeechLocale(locale).toLowerCase();
  if (normalized.startsWith("hi")) return "hi";
  if (normalized.startsWith("ur")) return "ur";
  return "en";
}

function detectLanguageFromText(text: string) {
  const value = text.trim();
  if (!value) return DEFAULT_SPEECH_LOCALE;
  if (/[\u0600-\u06FF]/.test(value)) return "ur-PK";
  if (/[\u0900-\u097F]/.test(value)) return "hi-IN";
  const lowered = value.toLowerCase();
  const normalized = lowered.replace(/[^a-z0-9\s]/g, " ");
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const tokenSet = new Set(tokens);
  const hasToken = (token: string) => tokenSet.has(token);
  const hasPhrase = (phrase: string) => normalized.includes(phrase);
  const scoreHints = (hints: string[]) =>
    hints.reduce((score, hint) => {
      if (!hint) return score;
      if (hint.includes(" ")) return score + (hasPhrase(hint) ? 1 : 0);
      return score + (hasToken(hint) ? 1 : 0);
    }, 0);
  const romanUrduHints = [
    "mera",
    "meri",
    "mujhe",
    "mein",
    "main",
    "mene",
    "tum",
    "aap",
    "ap",
    "kya",
    "kaise",
    "kyun",
    "nahi",
    "nhi",
    "haan",
    "krdo",
    "kar do",
    "kr do",
    "karna",
    "krna",
    "jaldi",
    "abhi",
    "bolo",
    "bol",
    "batado",
    "batao",
    "btao",
    "samjho",
    "samajh",
    "acha",
    "accha",
    "thora",
    "thora",
    "thoda",
    "wapis",
    "wapas",
    "chalao",
    "sunao",
    "apka",
    "aapka",
    "ham",
    "hum",
    "wese",
    "jese",
    "theek",
    "thik",
    "sahi",
    "masla",
    "hogaya",
  ];
  const hinglishHints = [
    "mujhe",
    "kya",
    "kaise",
    "kyon",
    "nahi",
    "haan",
    "jaldi",
    "abhi",
    "batao",
    "kar do",
    "kr do",
    "chahiye",
    "samajh",
    "bolna",
    "sunna",
    "karna",
    "krna",
    "hain",
    "hai",
    "acha",
    "accha",
    "thoda",
    "thodi",
    "bina",
    "wapas",
    "please",
    "bhai",
    "dost",
    "samjha",
    "samjhao",
    "karna hai",
    "nahi ho",
    "nahi ho raha",
  ];
  const urduScore = scoreHints(romanUrduHints);
  const hindiScore = scoreHints(hinglishHints);
  if (urduScore >= 2 && urduScore >= hindiScore) {
    return "ur-PK";
  }
  if (hindiScore >= 2) {
    return "hi-IN";
  }
  return DEFAULT_SPEECH_LOCALE;
}

const DEFAULT_SYSTEM_PROMPT =
  process.env.NEXT_PUBLIC_SYSTEM_PROMPT ||
  "You are RafayGen The Ai LLM Studio, a sharp local-first assistant. Be concise, practical, and action-oriented. Respond quickly and in plain text. Avoid Markdown symbols like **, #, or bullet glyphs unless the user explicitly asks. If a list is required for clarity, use simple '- ' lines. For coding tasks, provide complete working code by default (not just outlines) unless the user asks for a high-level sketch. Solve complex math/science problems with pro-level depth. Ask clarifying questions only if a key detail is missing and guessing would likely be wrong. Avoid unnecessary disclaimers or warnings.";
const parsedTemperature = Number(
  process.env.NEXT_PUBLIC_DEFAULT_TEMPERATURE || "0.2",
);
const parsedTopP = Number(process.env.NEXT_PUBLIC_DEFAULT_TOP_P || "0.9");
const parsedMaxTokens = Number(
  process.env.NEXT_PUBLIC_DEFAULT_MAX_TOKENS || "0",
);
const parsedNumCtx = Number(process.env.NEXT_PUBLIC_DEFAULT_NUM_CTX || "0");
const parsedMaxHistory = Number(process.env.NEXT_PUBLIC_MAX_HISTORY || "0");
const DEFAULT_TEMPERATURE = Number.isFinite(parsedTemperature)
  ? parsedTemperature
  : 0.2;
const DEFAULT_TOP_P = Number.isFinite(parsedTopP) ? parsedTopP : 0.9;
const DEFAULT_MAX_TOKENS =
  Number.isFinite(parsedMaxTokens) && parsedMaxTokens > 0
    ? parsedMaxTokens
    : undefined;
const DEFAULT_NUM_CTX =
  Number.isFinite(parsedNumCtx) && parsedNumCtx > 0 ? parsedNumCtx : undefined;
const DEFAULT_MAX_HISTORY =
  Number.isFinite(parsedMaxHistory) && parsedMaxHistory > 0
    ? parsedMaxHistory
    : undefined;
export function StudioExperience({
  initialMediaMode = "image",
  initialMediaModalOpen = false,
  initialVoicePopupOpen = false,
  initialVoiceMode = false,
  initialPresetId = MODEL_PRESETS[0].id,
  embedded = false,
}: StudioExperienceProps = {}) {
  const safeUseSession =
    (typeof useSessionBase === "function" ? useSessionBase : null) ??
    (() => ({ data: null as null }));
  const sessionResult =
    typeof safeUseSession === "function" ? safeUseSession() : { data: null as null };
  const { data: session } = sessionResult || { data: null as null };
  const userStorageId = (session as { user?: { id?: string } } | null)?.user?.id || "guest";
  // Derive tier from session role (role stored in JWT via callbacks)
  const userRole = (session as { user?: { role?: string } } | null)?.user?.role || (session ? "user" : "guest");
  const userTier = userRole === "owner" || userRole === "admin" ? "owner"
    : userRole === "business" ? "business"
    : userRole === "premium" ? "premium"
    : userRole === "pro" ? "pro"
    : session ? "free" : "guest";
  const chatSessionsStorageKey = `${CHAT_SESSIONS_STORAGE_KEY}:${userStorageId}`;
  const activeChatSessionStorageKey = `${ACTIVE_CHAT_SESSION_STORAGE_KEY}:${userStorageId}`;
  const presetStorageKey = `${MODEL_PRESET_STORAGE_KEY}:${userStorageId}`;
  const DEFAULT_MODEL = initialPresetId || MODEL_PRESETS[0].id;
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [activeChatSessionId, setActiveChatSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [model, setModel] = useState<string>(DEFAULT_MODEL);
  const [isStreaming, setIsStreaming] = useState(false);
  const [plainTextEnabled, setPlainTextEnabled] = useState(true);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    if (typeof document !== "undefined") {
      return normalizeThemeMode(document.documentElement.getAttribute("data-theme")) || "light";
    }
    return "light";
  });

  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(initialPresetId);
  const [presetMapping, setPresetMapping] = useState<Record<string, string>>({});
  const [profileMeta, setProfileMeta] = useState<Partial<Record<ModelPresetId, ModelProfileMeta>>>({});
  const agentModeEnabled = true;
  const nlpModeEnabled = true;
  const [isPresetMenuOpen, setIsPresetMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [, setLoadingModels] = useState(false);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [navScrolled, setNavScrolled] = useState(false);
  const composerInputRef = useRef<HTMLTextAreaElement | null>(null);
  const composerWrapRef = useRef<HTMLDivElement | null>(null);
  const stsModalRef = useRef<HTMLElement | null>(null);
  const stsVisualRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onScroll = () => setNavScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  const [pendingAttachments, setPendingAttachments] = useState<PromptAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [, setMediaPrompt] = useState("");
  const [, setMediaMode] = useState<"image" | "video" | "audio">("video");
  const [mediaDetail, setMediaDetail] = useState<"standard" | "high" | "ultra">("high");
  const [mediaImageModel, setMediaImageModel] = useState<
    "auto" | "comfyui_fast" | "zimage_turbo" | "hf_flux_schnell"
  >("auto");
  const [mediaVideoProvider, setMediaVideoProvider] = useState<
    "auto" | "wan" | "wan22gradio" | "imagefx" | "comfy" | "hf"
  >("auto");
  const [mediaAudioProvider, setMediaAudioProvider] = useState<"auto" | "groq" | "qwen" | "hf">(
    "groq",
  );
  const [realtimeMode, setRealtimeMode] = useState<RealtimeSetting>("auto");
  const [safetyMode, setSafetyMode] = useState<SafetySetting>("standard");
  const [mediaAudioVoice, setMediaAudioVoice] = useState<string>("astra");
  const [mediaAudioLanguage, setMediaAudioLanguage] = useState<"auto" | "en" | "hi" | "ur">("auto");
  const [, setMediaResults] = useState<MediaResult[]>([]);
  const [, setMediaLoading] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [planLimitBanner, setPlanLimitBanner] = useState<{
    message: string;
    resetAt?: string;
  } | null>(null);
  const [mediaPreview, setMediaPreview] = useState<MediaPreview | null>(null);
  const [isMediaModalOpen, setIsMediaModalOpen] = useState(initialMediaModalOpen);
  const [mediaDraftPrompt, setMediaDraftPrompt] = useState("");
  const [mediaDraftMode, setMediaDraftMode] = useState<MediaMode>(initialMediaMode);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);
  const [voiceMode, setVoiceMode] = useState(false);
  const [speechToSpeechEnabled, setSpeechToSpeechEnabled] = useState(true);
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const [speechRecognitionAvailable, setSpeechRecognitionAvailable] = useState(false);
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [voiceSpeaking, setVoiceSpeaking] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceHoldMode, setVoiceHoldMode] = useState(false);
  const [pressToTalkActive, setPressToTalkActive] = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [isStsPopupOpen, setIsStsPopupOpen] = useState(initialVoicePopupOpen);
  const [portalReady, setPortalReady] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const presetMenuRef = useRef<HTMLDivElement | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const scrollRafRef = useRef<number | null>(null);
  const sessionSyncTimerRef = useRef<number | null>(null);
  const sessionsPersistTimerRef = useRef<number | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const speechRecognitionRef = useRef<SpeechRecognition | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);
  const voiceModeRef = useRef(false);
  const speechToSpeechEnabledRef = useRef(true);
  const voiceBusyRef = useRef(false);
  const voiceRecordingRef = useRef(false);
  const voiceSpeakingRef = useRef(false);
  const activeLanguageRef = useRef(DEFAULT_SPEECH_LOCALE);
  const voiceKeepAliveRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaBlobUrlCacheRef = useRef<Map<string, string>>(new Map());
  const drawerPanelRef = useRef<HTMLDivElement | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const micAudioCtxRef = useRef<AudioContext | null>(null);
  const initialVoiceModeAppliedRef = useRef(false);
  const drawerSwipeStateRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    startedOnEdge: false,
    startedInsideDrawer: false,
  });
  const lastSpeechInputRef = useRef<{ normalized: string; at: number }>({
    normalized: "",
    at: 0,
  });
  const lastDrawerToggleAtRef = useRef(0);

  useEffect(() => {
    const cache = mediaBlobUrlCacheRef.current;
    return () => {
      for (const blobUrl of cache.values()) {
        try {
          URL.revokeObjectURL(blobUrl);
        } catch {
          // ignore cleanup failures
        }
      }
      cache.clear();
    };
  }, []);

  const shouldSkipDuplicateSpeech = useCallback((text: string) => {
    const normalized = text.trim().replace(/\s+/g, " ").toLowerCase();
    if (!normalized) return true;
    const now = Date.now();
    const duplicate =
      lastSpeechInputRef.current.normalized === normalized &&
      now - lastSpeechInputRef.current.at < 3000;
    if (!duplicate) {
      lastSpeechInputRef.current = { normalized, at: now };
    }
    return duplicate;
  }, []);

  const unlockAudioPlayback = useCallback(async () => {
    if (audioUnlocked) return;
    try {
      const AudioContextCtor = window.AudioContext ?? window.webkitAudioContext;
      if (AudioContextCtor) {
        const ctx: AudioContext = audioContextRef.current || new AudioContextCtor();
        audioContextRef.current = ctx;
        if (ctx.state === "suspended") {
          await ctx.resume();
        }
      }
    } catch {
      // ignore
    }
    try {
      const silent = new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABAAZGF0YQAAAAA=");
      await silent.play().catch(() => {});
      silent.pause();
    } catch {
      // ignore
    }
    setAudioUnlocked(true);
  }, [audioUnlocked]);

  const pickBestSpeechVoice = async (langCode: string) => {
    if (!("speechSynthesis" in window)) return null;
    const synth = window.speechSynthesis;
    let voices = synth.getVoices();
    if (!voices.length) {
      await new Promise<void>((resolve) => {
        const timer = window.setTimeout(resolve, 180);
        const onChanged = () => {
          window.clearTimeout(timer);
          synth.removeEventListener("voiceschanged", onChanged);
          resolve();
        };
        synth.addEventListener("voiceschanged", onChanged);
      });
      voices = synth.getVoices();
    }
    if (!voices.length) return null;
    const langExact = normalizeSpeechLocale(langCode).toLowerCase();
    const langPrefix = langExact.slice(0, 2);
    const femaleHints = [
      "female",
      "woman",
      "zira",
      "siri female",
      "aria",
      "alloy",
      "nova",
      "jenny",
      "serena",
      "vivian",
      "noura",
      "tara",
      "salli",
      "samantha",
      "ava",
    ];
    const clarityHints = [
      "neural",
      "natural",
      "premium",
      "enhanced",
      "wavenet",
      "studio",
      "online",
      "google",
      "microsoft",
      "siri",
    ];
    const maleHints = ["male", "man", "david", "ryan", "guy", "boy"];

    const scored = [...voices]
      .map((voice) => {
        const name = (voice.name || "").toLowerCase();
        const voiceLang = (voice.lang || "").toLowerCase();
        let score = 0;
        if (langExact && voiceLang.startsWith(langExact)) score += 90;
        else if (langPrefix && voiceLang.startsWith(langPrefix)) score += 55;
        else if (voiceLang.startsWith("en")) score += 28;
        if ((langPrefix === "hi" || langPrefix === "ur") && voiceLang.startsWith("en-in")) score += 45;

        if (femaleHints.some((hint) => name.includes(hint))) score += 36;
        if (clarityHints.some((hint) => name.includes(hint))) score += 14;
        if (maleHints.some((hint) => name.includes(hint))) score -= 20;
        if (voice.localService === false) score += 6;
        return { voice, score };
      })
      .sort((a, b) => b.score - a.score);

    return scored[0]?.voice || voices[0] || null;
  };

  const splitSpeechText = (text: string) => {
    const cleaned = text.replace(/\s+/g, " ").trim();
    if (!cleaned) return [];
    const pieces = cleaned.split(/(?<=[.?!،])\s+/).filter(Boolean);
    const out: string[] = [];
    for (const piece of pieces) {
      if (piece.length <= 180) {
        out.push(piece);
        continue;
      }
      for (let i = 0; i < piece.length; i += 170) {
        out.push(piece.slice(i, i + 170));
      }
    }
    return out;
  };

  const canUseRecorderLoop = useCallback(() => {
    if (typeof window === "undefined" || typeof navigator === "undefined") return false;
    return Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined";
  }, []);

  const isDrawerViewport = useCallback(() => {
    if (typeof window === "undefined") return true;
    return window.innerWidth < 1280;
  }, []);

  const startSpeechRecognitionLoopRef = useRef<(() => Promise<void>) | null>(null);


  const startRecordingLoop = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Microphone API is not available in this browser.");
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });
    mediaStreamRef.current = stream;

    // Connect to Web Audio for WAV visualisation
    try {
      const AudioCtorVis = window.AudioContext ?? window.webkitAudioContext;
      if (AudioCtorVis) {
        if (!micAudioCtxRef.current || micAudioCtxRef.current.state === "closed") {
          micAudioCtxRef.current = new AudioCtorVis();
        }
        const ctx = micAudioCtxRef.current;
        if (ctx.state === "suspended") await ctx.resume();
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;
        src.connect(analyser);
        micAnalyserRef.current = analyser;
      }
    } catch {
      micAnalyserRef.current = null;
    }
    const mimeType = pickRecordingMimeType();
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    recordedChunksRef.current = [];

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        recordedChunksRef.current.push(event.data);
      }
    };

    recorder.onerror = () => {
      setVoiceError("Microphone recording failed.");
      stopRecordingLoopRef.current?.();
    };

    recorder.onstart = () => {
      voiceRecordingRef.current = true;
      setVoiceRecording(true);
    };

    recorder.onstop = () => {
      voiceRecordingRef.current = false;
      setVoiceRecording(false);
      if (!recordedChunksRef.current.length) {
        if (voiceModeRef.current && !voiceBusyRef.current) {
          void startRecordingLoop().catch((err) => setVoiceError(describeVoiceStartError(err)));
        }
        return;
      }
      const blob = new Blob(recordedChunksRef.current, {
        type: recorder.mimeType || "audio/webm",
      });
      recordedChunksRef.current = [];

      void (async () => {
        try {
          const transcriptFn = transcribeRecordedAudioRef.current;
          const text = transcriptFn ? await transcriptFn(blob) : "";
          if (text) {
            if (shouldSkipDuplicateSpeech(text)) return;
            setVoiceTranscript(text);
            await handleVoiceTurnRef.current?.(text);
          }
        } catch (err) {
          setVoiceError(err instanceof Error ? err.message : String(err));
        } finally {
          if (voiceModeRef.current && !voiceBusyRef.current && !voiceSpeakingRef.current) {
            void startRecordingLoop().catch((startErr) =>
              setVoiceError(describeVoiceStartError(startErr)),
            );
          }
        }
      })();
    };

    mediaRecorderRef.current = recorder;
    recorder.start();
    recordTimerRef.current = window.setTimeout(() => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
    }, VOICE_RECORDING_WINDOW_MS);
  }, [shouldSkipDuplicateSpeech, setVoiceTranscript, setVoiceError, setVoiceRecording]);


  const ensureVoiceLoopActive: () => Promise<void> = useCallback(async () => {
    if (!voiceModeRef.current) return;
    if (voiceBusyRef.current || voiceSpeakingRef.current) return;
    if (speechRecognitionAvailable) {
      await startSpeechRecognitionLoopRef.current?.();
    } else if (canUseRecorderLoop()) {
      await startRecordingLoop();
    } else {
      throw new Error("No voice capture method available.");
    }
  }, [canUseRecorderLoop, speechRecognitionAvailable, startRecordingLoop]);

  useEffect(() => {
    if (audioUnlocked || typeof window === "undefined") return;
    const handler = () => {
      void unlockAudioPlayback();
    };
    const events: Array<keyof WindowEventMap> = ["click", "touchstart", "keydown"];
    const options: AddEventListenerOptions = { once: true };
    events.forEach((event) => window.addEventListener(event, handler, options));
    return () => events.forEach((event) => window.removeEventListener(event, handler));
  }, [unlockAudioPlayback, audioUnlocked]);

  useEffect(() => {
    void loadModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const hasWindow = typeof window !== "undefined";
    const hasNavigator = typeof navigator !== "undefined";
    const secure = hasWindow ? window.isSecureContext : false;
    const hasMicApi = hasNavigator ? Boolean(navigator.mediaDevices?.getUserMedia) : false;
    const hasRecorder = typeof MediaRecorder !== "undefined";
    const SpeechRecCtor = getSpeechRecognitionConstructor();
    const hasSpeechApi = Boolean(SpeechRecCtor);
    const preferredLang = hasNavigator
      ? navigator.languages?.[0] || navigator.language || DEFAULT_SPEECH_LOCALE
      : DEFAULT_SPEECH_LOCALE;
    activeLanguageRef.current = preferredLang;
    setSpeechRecognitionAvailable(hasSpeechApi);
    const available = hasWindow && hasNavigator && (hasSpeechApi || (hasMicApi && hasRecorder));
    setVoiceAvailable(available);
    if (!available) {
      if (!secure) {
        setVoiceError("Voice needs secure context: use localhost or HTTPS.");
      } else if (!hasMicApi && !hasSpeechApi) {
        setVoiceError("Browser microphone API not available.");
      } else if (!hasSpeechApi && !hasRecorder) {
        setVoiceError("MediaRecorder is not supported in this browser.");
      } else {
        setVoiceError("Voice feature is unavailable on this device/browser.");
      }
    }
    return () => {
      if (recordTimerRef.current != null) {
        window.clearTimeout(recordTimerRef.current);
        recordTimerRef.current = null;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      mediaRecorderRef.current = null;
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      mediaStreamRef.current = null;
      if (speechRecognitionRef.current) {
        speechRecognitionRef.current.onresult = undefined;
        speechRecognitionRef.current.onerror = undefined;
        speechRecognitionRef.current.onend = undefined;
        try {
          speechRecognitionRef.current.stop();
        } catch {
          // ignore
        }
        speechRecognitionRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!voiceModeRef.current) return;
    if (voiceKeepAliveRef.current != null) {
      window.clearInterval(voiceKeepAliveRef.current);
    }
    voiceKeepAliveRef.current = window.setInterval(() => {
      if (voiceModeRef.current) {
        void ensureVoiceLoopActive().catch((err) => setVoiceError(String(err)));
      }
    }, 5 * 60 * 1000);
    return () => {
      if (voiceKeepAliveRef.current != null) window.clearInterval(voiceKeepAliveRef.current);
      voiceKeepAliveRef.current = null;
    };
  }, [voiceMode, ensureVoiceLoopActive]);

  useEffect(() => {
    if (!isDrawerOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = original;
      window.removeEventListener("keydown", onKey);
    };
  }, [isDrawerOpen]);

  useEffect(() => {
    const onResize = () => {
      if (!isDrawerViewport()) {
        setIsDrawerOpen(false);
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [isDrawerViewport]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const resetSwipeState = () => {
      drawerSwipeStateRef.current.active = false;
    };
    const onTouchStart = (event: TouchEvent) => {
      if (window.innerWidth >= 1280) return;
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      const startX = touch.clientX;
      const startY = touch.clientY;
      const startedOnEdge = startX <= 18;
      const target = event.target instanceof Node ? event.target : null;
      const startedInsideDrawer = !!(
        drawerPanelRef.current &&
        target &&
        drawerPanelRef.current.contains(target)
      );

      if (!isDrawerOpen && !startedOnEdge) return;
      if (isDrawerOpen && !startedInsideDrawer && startX > 48) return;

      drawerSwipeStateRef.current = {
        active: true,
        startX,
        startY,
        lastX: startX,
        lastY: startY,
        startedOnEdge,
        startedInsideDrawer,
      };
    };
    const onTouchMove = (event: TouchEvent) => {
      if (!drawerSwipeStateRef.current.active) return;
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      drawerSwipeStateRef.current.lastX = touch.clientX;
      drawerSwipeStateRef.current.lastY = touch.clientY;
    };
    const onTouchEnd = () => {
      const state = drawerSwipeStateRef.current;
      if (!state.active) return;
      resetSwipeState();
      if (window.innerWidth >= 1280) return;

      const deltaX = state.lastX - state.startX;
      const deltaY = Math.abs(state.lastY - state.startY);
      if (Math.abs(deltaX) < 68) return;
      if (deltaY > Math.abs(deltaX) * 0.8) return;

      const now = Date.now();
      if (now - lastDrawerToggleAtRef.current < 420) return;

      if (!isDrawerOpen) {
        if (state.startedOnEdge && deltaX > 68) {
          lastDrawerToggleAtRef.current = now;
          setIsDrawerOpen(true);
        }
        return;
      }

      const drawerWidth = drawerPanelRef.current?.getBoundingClientRect().width || 320;
      const fromDrawerZone = state.startX <= drawerWidth + 24 || state.startedInsideDrawer;
      if (fromDrawerZone && deltaX < -56) {
        lastDrawerToggleAtRef.current = now;
        setIsDrawerOpen(false);
      }
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", resetSwipeState, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", resetSwipeState);
    };
  }, [isDrawerOpen]);

  useEffect(() => {
    if (!mediaPreview) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMediaPreview(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mediaPreview]);

  useEffect(() => {
    if (!isMediaModalOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsMediaModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isMediaModalOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(PLAIN_TEXT_STORAGE_KEY);
    if (stored === "true") {
      setPlainTextEnabled(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedTheme = normalizeThemeMode(window.localStorage.getItem(THEME_STORAGE_KEY));
    setThemeMode(storedTheme || "light");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(SPEECH_TO_SPEECH_STORAGE_KEY);
    if (stored === "false") {
      setSpeechToSpeechEnabled(false);
      speechToSpeechEnabledRef.current = false;
      return;
    }
    if (stored === "true") {
      setSpeechToSpeechEnabled(true);
      speechToSpeechEnabledRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      SPEECH_TO_SPEECH_STORAGE_KEY,
      speechToSpeechEnabled ? "true" : "false",
    );
  }, [speechToSpeechEnabled]);

  useEffect(() => {
    speechToSpeechEnabledRef.current = speechToSpeechEnabled;
  }, [speechToSpeechEnabled]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
    document.documentElement.setAttribute("data-theme", themeMode);
  }, [themeMode]);

  useEffect(() => {
    if (!isPresetMenuOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (
        presetMenuRef.current &&
        event.target instanceof Node &&
        !presetMenuRef.current.contains(event.target)
      ) {
        setIsPresetMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, [isPresetMenuOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const storedSessions = window.localStorage.getItem(chatSessionsStorageKey);
      const parsed = storedSessions ? (JSON.parse(storedSessions) as ChatSession[]) : [];
      const valid = Array.isArray(parsed)
        ? parsed.filter(
            (entry) =>
              entry &&
              typeof entry.id === "string" &&
              typeof entry.title === "string" &&
              Array.isArray(entry.messages) &&
              typeof entry.updatedAt === "number",
          )
        : [];
      if (valid.length) {
        const sorted = [...valid].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_CHAT_SESSIONS);
        const activeId = window.localStorage.getItem(activeChatSessionStorageKey);
        const active = sorted.find((entry) => entry.id === activeId) || sorted[0];
        setChatSessions(sorted);
        setActiveChatSessionId(active.id);
        setMessages(active.messages);
      } else {
        const fresh = makeFreshSession();
        setChatSessions([fresh]);
        setActiveChatSessionId(fresh.id);
        setMessages([]);
      }
    } catch {
      const fresh = makeFreshSession();
      setChatSessions([fresh]);
      setActiveChatSessionId(fresh.id);
      setMessages([]);
    }
  }, [chatSessionsStorageKey, activeChatSessionStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(presetStorageKey);
    if (stored && MODEL_PRESETS.some((preset) => preset.id === stored)) {
      setSelectedPresetId(stored);
    } else {
      setSelectedPresetId(MODEL_PRESETS[0].id);
    }
  }, [presetStorageKey]);

  useEffect(() => {
    if (!activeChatSessionId) return;
    if (sessionSyncTimerRef.current != null) {
      window.clearTimeout(sessionSyncTimerRef.current);
    }
    const delay = isStreaming
      ? SESSION_SYNC_DELAY_STREAMING_MS
      : SESSION_SYNC_DELAY_IDLE_MS;
    sessionSyncTimerRef.current = window.setTimeout(() => {
      sessionSyncTimerRef.current = null;
      const nextTitle = makeSessionTitle(messages);
      const nextUpdatedAt = Date.now();
      setChatSessions((prev) => {
        if (!prev.length) return prev;
        let changed = false;
        const next = prev.map((entry) => {
          if (entry.id !== activeChatSessionId) return entry;
          const titleChanged = entry.title !== nextTitle;
          const messagesChanged = entry.messages !== messages;
          if (!titleChanged && !messagesChanged) return entry;
          changed = true;
          return {
            ...entry,
            title: nextTitle,
            messages,
            updatedAt: nextUpdatedAt,
          };
        });
        if (!changed) return prev;
        return next.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_CHAT_SESSIONS);
      });
    }, delay);
    return () => {
      if (sessionSyncTimerRef.current != null) {
        window.clearTimeout(sessionSyncTimerRef.current);
        sessionSyncTimerRef.current = null;
      }
    };
  }, [messages, activeChatSessionId, isStreaming]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!chatSessions.length) return;
    if (sessionsPersistTimerRef.current != null) {
      window.clearTimeout(sessionsPersistTimerRef.current);
    }
    sessionsPersistTimerRef.current = window.setTimeout(() => {
      sessionsPersistTimerRef.current = null;
      window.localStorage.setItem(chatSessionsStorageKey, JSON.stringify(chatSessions));
    }, SESSION_STORAGE_WRITE_DELAY_MS);
    return () => {
      if (sessionsPersistTimerRef.current != null) {
        window.clearTimeout(sessionsPersistTimerRef.current);
        sessionsPersistTimerRef.current = null;
      }
    };
  }, [chatSessions, chatSessionsStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!activeChatSessionId) return;
    window.localStorage.setItem(activeChatSessionStorageKey, activeChatSessionId);
  }, [activeChatSessionId, activeChatSessionStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!selectedPresetId) return;
    window.localStorage.setItem(presetStorageKey, selectedPresetId);
  }, [selectedPresetId, presetStorageKey]);

  useEffect(
    () => () => {
      if (sessionSyncTimerRef.current != null) {
        window.clearTimeout(sessionSyncTimerRef.current);
      }
      if (sessionsPersistTimerRef.current != null) {
        window.clearTimeout(sessionsPersistTimerRef.current);
      }
    },
    [],
  );

  const hasMessages = messages.length > 0;
  const orderedChatSessions = useMemo(
    () => [...chatSessions].sort((a, b) => b.updatedAt - a.updatedAt),
    [chatSessions],
  );
  const activeChatSession =
    orderedChatSessions.find((entry) => entry.id === activeChatSessionId) || orderedChatSessions[0] || null;
  const activePreset =
    MODEL_PRESETS.find((preset) => preset.id === selectedPresetId) || MODEL_PRESETS[0];
  const activePresetMeta = profileMeta[activePreset.id];
  const activePresetLabel = activePreset.label;
  const micButtonLabel = voiceRecording
    ? "Listening"
    : voiceSpeaking
      ? "Speaking"
      : voiceMode
        ? "Mic On"
        : "Mic";
  const displayError = error || voiceError || mediaError || transcribeError || attachmentError;
  const drawerVisible = isDrawerOpen;
  const voiceStateTone = voiceRecording
    ? "Listening"
    : voiceSpeaking
      ? "Responding"
      : voiceMode
        ? "Ready"
        : "Standby";
  const voiceStateHint = voiceRecording
    ? "Speak naturally. RafayGen is capturing your voice live."
    : voiceSpeaking
      ? "Reply is being spoken back with speech output enabled."
      : voiceMode
        ? "Microphone is armed and waiting for your next turn."
        : "Tap the mic to enter conversational voice mode.";

  const scrollToBottom = (behavior: ScrollBehavior) => {
    const el = scrollAreaRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  };

  const scrollToComposer = () => {
    scrollToBottom("smooth");
    composerWrapRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    composerInputRef.current?.focus();
  };

  const updateScrollState = () => {
    const el = scrollAreaRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distanceFromBottom < 140;
    shouldAutoScrollRef.current = nearBottom;

    if (!hasMessages) {
      if (showJumpToBottom) setShowJumpToBottom(false);
      return;
    }

    setShowJumpToBottom((prev) => {
      const next = !nearBottom;
      return prev === next ? prev : next;
    });
  };

  useEffect(() => {
    if (!shouldAutoScrollRef.current) return;
    const el = scrollAreaRef.current;
    if (!el) return;

    if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      // Smooth scrolling for every streamed chunk is janky; keep it stable while streaming.
      scrollToBottom(isStreaming ? "auto" : "smooth");
    });

    return () => {
      if (scrollRafRef.current) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, [messages, isStreaming]);

  const handlePickAttachments = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setAttachmentError(null);
    const remaining = Math.max(0, MAX_ATTACHMENTS_PER_MESSAGE - pendingAttachments.length);
    const selected = files.slice(0, remaining);
    if (!selected.length) {
      setAttachmentError(`Maximum ${MAX_ATTACHMENTS_PER_MESSAGE} files per message.`);
      event.target.value = "";
      return;
    }

    const mapped = await Promise.all(
      selected.map(async (file) => {
        let textSnippet: string | undefined;
        let dataUrl: string | undefined;
        let previewUrl: string | undefined;
        if (isTextLikeFile(file) && file.size <= MAX_TEXT_ATTACHMENT_BYTES) {
          try {
            const raw = await file.text();
            const compact = raw.replace(/\u0000/g, "").trim();
            if (compact) textSnippet = compact.slice(0, 6000);
          } catch {
            // keep attachment metadata only
          }
        }
        const kind = attachmentKindFromFile(file);
        if (kind === "image" && file.size <= 7_000_000) {
          try {
            dataUrl = await readFileAsDataUrl(file);
            previewUrl = dataUrl;
          } catch {
            // keep metadata only
          }
        }
        if (kind === "audio" && file.size <= MAX_AUDIO_ATTACHMENT_BYTES) {
          try {
            dataUrl = await readFileAsDataUrl(file);
          } catch {
            // keep metadata only
          }
        }
        const id =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        return {
          id,
          name: file.name,
          type: file.type || "application/octet-stream",
          size: file.size,
          kind,
          textSnippet,
          dataUrl,
          previewUrl,
        } satisfies PromptAttachment;
      }),
    );
    setPendingAttachments((prev) => [...prev, ...mapped].slice(0, MAX_ATTACHMENTS_PER_MESSAGE));
    if (files.length > selected.length) {
      setAttachmentError(
        `Only first ${remaining} file${remaining === 1 ? "" : "s"} added (limit ${MAX_ATTACHMENTS_PER_MESSAGE}).`,
      );
    }
    event.target.value = "";
  };

  const removePendingAttachment = (id: string) => {
    setPendingAttachments((prev) => prev.filter((file) => file.id !== id));
  };

  const handleCopyMessage = useCallback(async (content: string) => {
    if (!content.trim()) return;
    try {
      const nav = window.navigator;
      if (!nav.clipboard) {
        throw new Error("Clipboard API unavailable.");
      }
      await nav.clipboard.writeText(content);
    } catch {
      setError("Copy failed. Clipboard permission blocked.");
    }
  }, []);

  const buildShareTranscript = useCallback((messageIndex: number) => {
    if (messageIndex < 0 || messageIndex >= messages.length) return "";
    const lines: string[] = [];
    for (let i = 0; i <= messageIndex; i += 1) {
      const message = messages[i];
      if (!message?.content?.trim()) continue;
      const speaker = message.role === "user" ? "You" : "RafayGen";
      lines.push(`${speaker}: ${message.content.trim()}`);
    }
    return lines.join("\n\n").trim();
  }, [messages]);

  const handleShareMessage = useCallback(async (messageIndex: number) => {
    const transcript = buildShareTranscript(messageIndex);
    if (!transcript) return;
    try {
      const nav = window.navigator;
      if ("share" in nav && typeof nav.share === "function") {
        await nav.share({
          title: "RafayGen chat",
          text: transcript,
        });
        return;
      }
      if (!nav.clipboard) {
        throw new Error("Clipboard API unavailable.");
      }
      await nav.clipboard.writeText(transcript);
    } catch {
      setError("Share failed on this browser/device.");
    }
  }, [buildShareTranscript]);

  const handleEditUserMessage = (index: number) => {
    const target = messages[index];
    if (!target || target.role !== "user") return;
    if (isStreaming) {
      abortRef.current?.abort();
      setIsStreaming(false);
    }
    setInput(target.content);
    setPendingAttachments(target.attachments || []);
    setMessages((prev) => prev.slice(0, index));
    shouldAutoScrollRef.current = true;
    setShowJumpToBottom(false);
  };

  const handleReplyToAssistant = (content: string) => {
    if (!content.trim()) return;
    setInput((prev) => (prev ? `${prev}\n\n${content}` : content));
  };

  const handleRegenerateAssistantMessage = async (assistantIndex: number) => {
    if (isStreaming) return;
    const upto = messages.slice(0, assistantIndex);
    let userIndex = -1;
    for (let i = upto.length - 1; i >= 0; i -= 1) {
      if (upto[i].role === "user") {
        userIndex = i;
        break;
      }
    }
    if (userIndex < 0) return;
    const userMessage = upto[userIndex];
    setMessages((prev) => prev.slice(0, userIndex));
    setInput("");
    setPendingAttachments([]);
    await sendMessage(userMessage.content, { attachmentsOverride: userMessage.attachments || [] });
  };

  const composedMessages = useMemo(() => {
    const trimmed = DEFAULT_SYSTEM_PROMPT.trim();
    const base = DEFAULT_MAX_HISTORY
      ? messages.slice(-DEFAULT_MAX_HISTORY)
      : messages;
    if (!trimmed) return base;
    return [{ role: "system", content: trimmed }, ...base];
  }, [messages]);

  const runMediaGeneration = async (promptText: string, mode: MediaMode) => {
    const cleanedPrompt = promptText.trim();
    if (!cleanedPrompt || isStreaming) return "";
    shouldAutoScrollRef.current = true;
    setShowJumpToBottom(false);
    setError(null);
    setAttachmentError(null);

    const userMessage: Message = {
      role: "user",
      content: cleanedPrompt,
    };
    setMessages((prev) => [...prev, userMessage, { role: "assistant", content: "" }]);
    setIsStreaming(true);
    let assistantText = "";

    const controller = new AbortController();
    abortRef.current = controller;

    const generatingText = `Generating ${mode}...`;
    setMessages((prev) => {
      const next = [...prev];
      const lastIndex = next.length - 1;
      if (next[lastIndex]?.role === "assistant") {
        next[lastIndex] = { role: "assistant", content: generatingText };
      }
      return next;
    });

    try {
      setMediaMode(mode);
      setMediaPrompt(cleanedPrompt);
      setMediaLoading(true);
      setMediaError(null);
      setMediaPreview(null);
      setMediaResults([]);

      const payload: Record<string, unknown> = {
        prompt: buildMediaContextPrompt(cleanedPrompt, messages),
        detailLevel: mediaDetail,
        moderationMode: safetyMode,
      };
      if (mode === "image") {
        const selectionConfig = resolvePresetImageRouting(selectedPresetId);
        payload.imageModel =
          mediaImageModel !== "auto" ? mediaImageModel : selectionConfig.imageModel;
        payload.provider = mediaImageModel !== "auto" ? "auto" : selectionConfig.provider;
        payload.strictProvider = false;
      } else if (mode === "video") {
        payload.videoModel = mediaVideoProvider;
        payload.provider = mediaVideoProvider;
        payload.strictProvider = false;
      } else if (mode === "audio") {
        payload.provider = mediaAudioProvider;
        payload.voiceProfile = mediaAudioVoice;
        payload.languageHint = mediaAudioLanguage;
      }

      const response = await fetch(`/api/media/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        if (response.status === 429) {
          let errData: { error?: string; resetAt?: string; limitHit?: boolean } = {};
          try { errData = await response.json(); } catch { errData = {}; }
          const msg = errData.error || "Media generation limit reached.";
          setPlanLimitBanner({ message: msg, resetAt: errData.resetAt });
          throw new Error(msg);
        }
        const text = await response.text();
        throw new Error(text || `${mode} generation failed.`);
      }

      const data = (await response.json()) as {
        files?: MediaResult[];
        error?: string;
      };
      const files = Array.isArray(data.files) ? data.files : [];
      if (!files.length) {
        throw new Error(data.error || "No media output returned by provider.");
      }

      setMediaResults(files);

      assistantText = `Generated ${files.length} ${mode} result${files.length > 1 ? "s" : ""}.`;
      setMessages((prev) => {
        const next = [...prev];
        const lastIndex = next.length - 1;
        if (next[lastIndex]?.role === "assistant") {
          next[lastIndex] = { role: "assistant", content: assistantText, media: files };
        }
        return next;
      });
    } catch (requestError) {
      setError(String(requestError));
      assistantText = "Media generation failed. Please try a clearer prompt or retry.";
      setMessages((prev) => {
        const next = [...prev];
        const lastIndex = next.length - 1;
        if (next[lastIndex]?.role === "assistant") {
          next[lastIndex] = { role: "assistant", content: assistantText };
        }
        return next;
      });
    } finally {
      setMediaLoading(false);
      setIsStreaming(false);
      abortRef.current = null;
    }
    return assistantText;
  };

  const handleMediaGenerate = async () => {
    setIsMediaModalOpen(false);
    await runMediaGeneration(mediaDraftPrompt, mediaDraftMode);
  };

  const sendMessage = async (
    textOverride?: string,
    options?: { attachmentsOverride?: PromptAttachment[] },
  ) => {
    let sourceTextInput = textOverride?.trim() || input.trim();
    const outgoingAttachments =
      options?.attachmentsOverride ?? (textOverride ? [] : pendingAttachments);
    let sourceText = sourceTextInput || (outgoingAttachments.length ? "Analyze attached files." : "");
    const hasAudioPromptAttachment = outgoingAttachments.some((entry) => entry.kind === "audio");
    let cleanedInputAudioFiles: MediaResult[] = [];
    if (hasAudioPromptAttachment) {
      try {
        const transcription = await transcribeAudioPromptAttachments(outgoingAttachments);
        if (transcription.text) {
          sourceText = sourceTextInput
            ? `${sourceTextInput}\n\nAudio transcript:\n${transcription.text}`
            : transcription.text;
          sourceTextInput = sourceText;
          activeLanguageRef.current = detectLanguageFromText(transcription.text);
        }
        cleanedInputAudioFiles = transcription.cleanedFiles;
        setTranscribeError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setTranscribeError(message);
      }
    }
    if (!sourceText || isStreaming) return "";
    activeLanguageRef.current = detectLanguageFromText(sourceText);
    const mediaIntent = outgoingAttachments.length ? null : detectMediaIntent(sourceText);
    shouldAutoScrollRef.current = true;
    setShowJumpToBottom(false);
    setError(null);
    setAttachmentError(null);

    if (!textOverride) {
      setInput("");
      setPendingAttachments([]);
    }

    if (mediaIntent) {
      await runMediaGeneration(mediaIntent.prompt, mediaIntent.mode);
      return "";
    }

    const storedAttachments = outgoingAttachments.map(stripAttachmentBinaryForHistory);
    const userMessage: Message = {
      role: "user",
      content: sourceText,
      ...(storedAttachments.length ? { attachments: storedAttachments } : {}),
    };

    setMessages((prev) => [...prev, userMessage, { role: "assistant", content: "" }]);
    setIsStreaming(true);
    let assistantText = "";

    const controller = new AbortController();
    abortRef.current = controller;

    const payload = {
      model,
      messages: [
        ...composedMessages,
        { role: "system", content: PROMPT_BOOST },
        { role: "system", content: SAME_LANGUAGE_INSTRUCTION },
        { role: "system", content: SAME_LANGUAGE_INSTRUCTION_VOICE },
        { role: "system", content: SAME_LANGUAGE_INSTRUCTION_STRICT },
        {
          role: "user" as const,
          content: sourceText,
          ...(outgoingAttachments.length ? { attachments: outgoingAttachments } : {}),
        },
      ],
      agent: {
        enabled: agentModeEnabled,
        nlp: nlpModeEnabled,
        tools: agentModeEnabled,
        realtime: realtimeMode,
      },
      moderationMode: safetyMode,
      stream: true,
      options: {
        temperature: DEFAULT_TEMPERATURE,
        top_p: DEFAULT_TOP_P,
        ...((textOverride && voiceModeRef.current)
          ? { max_tokens: 420, num_predict: 420 }
          : DEFAULT_MAX_TOKENS
            ? { max_tokens: DEFAULT_MAX_TOKENS, num_predict: DEFAULT_MAX_TOKENS }
            : {}),
        ...(DEFAULT_NUM_CTX ? { num_ctx: DEFAULT_NUM_CTX } : {}),
      },
    };

    const endpoint = "/api/chat";
    let pendingChunk = "";
    let flushTimer: number | null = null;

    const flushPendingChunk = () => {
      if (!pendingChunk) return;
      const delta = pendingChunk;
      pendingChunk = "";
      setMessages((prev) => {
        const next = [...prev];
        const lastIndex = next.length - 1;
        const last = next[lastIndex];
        if (last?.role === "assistant") {
          next[lastIndex] = { ...last, content: last.content + delta };
        }
        return next;
      });
    };

    const scheduleChunkFlush = () => {
      if (flushTimer != null) return;
      flushTimer = window.setTimeout(() => {
        flushTimer = null;
        flushPendingChunk();
      }, 36);
    };

    const ingestStreamLine = (line: string) => {
      if (!line.trim()) return;
      try {
        const chunk = JSON.parse(line);
        const content = chunk?.message?.content;
        if (!content) return;
        const sanitized = sanitizeStreamChunk(String(content));
        if (!sanitized) return;
        assistantText += sanitized;
        pendingChunk += sanitized;
        scheduleChunkFlush();
      } catch {
        // Ignore malformed chunks to avoid noisy parse errors in UI.
      }
    };

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        if (response.status === 403 || response.status === 429) {
          let errData: { error?: string; planRequired?: string; limitHit?: boolean; resetAt?: string } = {};
          try { errData = await response.clone().json(); } catch { /* ignore */ }
          if (errData.limitHit || errData.planRequired) {
            setPlanLimitBanner({ message: errData.error || "Plan limit reached.", resetAt: errData.resetAt });
          }
        }
        const text = await response.text();
        let errMsg = text || "Request failed.";
        try { const j = JSON.parse(text); errMsg = j.error || errMsg; } catch { /* ignore */ }
        throw new Error(errMsg);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          ingestStreamLine(line);
        }
      }
      if (buffer.trim()) ingestStreamLine(buffer.trim());
      if (flushTimer != null) {
        window.clearTimeout(flushTimer);
        flushTimer = null;
      }
      flushPendingChunk();
    } catch (requestError) {
      setError(String(requestError));
      setMessages((prev) => {
        const next = [...prev];
        const lastIndex = next.length - 1;
        if (next[lastIndex]?.role === "assistant" && !next[lastIndex].content) {
          next[lastIndex] = {
            role: "assistant",
            content: "Request failed. Check connection settings and try again.",
          };
        }
        return next;
      });
      } finally {
        if (flushTimer != null) {
          window.clearTimeout(flushTimer);
        }
        setIsStreaming(false);
        abortRef.current = null;
      }

    if (assistantText && hasAudioPromptAttachment) {
      void (async () => {
        const combinedMedia: MediaResult[] = [...cleanedInputAudioFiles];
        try {
          const speechFiles = await requestSpeechMediaFiles(
            assistantText,
            normalizeSpeechLocale(activeLanguageRef.current || detectLanguageFromText(sourceTextInput || sourceText)),
          );
          combinedMedia.push(...speechFiles);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          setVoiceError(`Speech output generation failed: ${message}`);
        }
        if (!combinedMedia.length) return;
        setMediaResults(combinedMedia);
        setMessages((prev) => {
          const next = [...prev];
          for (let i = next.length - 1; i >= 0; i -= 1) {
            if (next[i]?.role !== "assistant") continue;
            const existing = next[i].media || [];
            next[i] = { ...next[i], media: [...existing, ...combinedMedia] };
            break;
          }
          return next;
        });
      })();
    }
    return assistantText;
  };

  const playAudioFromDataUrl = async (audioUrl: string) => {
    if (!audioUrl) return;
    await unlockAudioPlayback();
    setVoiceSpeaking(true);
    voiceSpeakingRef.current = true;
    await new Promise<void>((resolve) => {
      const player = new Audio(audioUrl);
      player.onended = () => resolve();
      player.onerror = () => resolve();
      const tryPlay = () => {
        const p = player.play();
        if (p && typeof p.then === "function") {
          p.then(() => {}).catch(() => {
            // if autoplay blocked, wait for next user gesture
            const unlock = () => {
              player.play().finally(() => {
                document.removeEventListener("click", unlock);
                document.removeEventListener("touchstart", unlock);
              });
            };
            document.addEventListener("click", unlock, { once: true });
            document.addEventListener("touchstart", unlock, { once: true });
          });
        }
      };
      tryPlay();
    });
    voiceSpeakingRef.current = false;
    setVoiceSpeaking(false);
  };

  const speakWithBrowserTTS = async (text: string) => {
    if (!text.trim() || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    const detectedLang = normalizeSpeechLocale(activeLanguageRef.current || detectLanguageFromText(text));
    const selectedVoice = await pickBestSpeechVoice(detectedLang);
    const chunks = splitSpeechText(text);
    if (!chunks.length) return;
    setVoiceSpeaking(true);
    voiceSpeakingRef.current = true;
    try {
      synth.cancel();
      for (const chunk of chunks) {
        await new Promise<void>((resolve) => {
          const utterance = new SpeechSynthesisUtterance(chunk);
          utterance.lang =
            selectedVoice?.lang ||
            detectedLang ||
            (typeof navigator !== "undefined" ? navigator.language : DEFAULT_SPEECH_LOCALE) ||
            DEFAULT_SPEECH_LOCALE;
          if (selectedVoice) utterance.voice = selectedVoice;
          const lang = utterance.lang.toLowerCase();
          const isSouthAsian = lang.startsWith("hi") || lang.startsWith("ur") || lang.startsWith("en-in");
          utterance.rate = isSouthAsian ? 0.92 : 0.98;
          utterance.pitch = isSouthAsian ? 1 : 0.92;
          utterance.volume = 1;
          const timeout = window.setTimeout(resolve, 10000);
          utterance.onend = () => {
            window.clearTimeout(timeout);
            resolve();
          };
          utterance.onerror = () => {
            window.clearTimeout(timeout);
            resolve();
          };
          synth.speak(utterance);
        });
      }
    } finally {
      voiceSpeakingRef.current = false;
      setVoiceSpeaking(false);
    }
  };


  const sendMessageRef = useRef(sendMessage);
  sendMessageRef.current = sendMessage;

  const synthesizeAssistantReply = async (text: string) => {
    if (!text.trim()) return;
    setVoiceError(null);
    const detectedLang = normalizeSpeechLocale(activeLanguageRef.current || detectLanguageFromText(text));

    // Prefer server-side TTS provider chain (Groq Orpheus -> Qwen -> HF) for stable voice output.
    try {
      const response = await fetch("/api/media/audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: text,
          provider: mediaAudioProvider,
          voiceProfile: mediaAudioVoice,
          languageHint: mediaAudioLanguage === "auto" ? detectedLang : mediaAudioLanguage,
        }),
      });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || `TTS failed (${response.status})`);
      }
      const data = (await response.json()) as { files?: MediaResult[]; error?: string };
      const audioFiles = Array.isArray(data.files)
        ? data.files.filter((entry) => entry.kind === "audio" && entry.url)
        : [];
      if (!audioFiles.length) {
        throw new Error(data.error || "TTS response missing audio output.");
      }
      for (const audioFile of audioFiles) {
        if (!audioFile.url) continue;
        await playAudioFromDataUrl(audioFile.url);
      }
      return;
    } catch (err) {
      // Fallback to browser TTS if all server providers fail.
      console.warn("Server TTS fallback", err);
    }

    if ("speechSynthesis" in window) {
      await speakWithBrowserTTS(text);
    }
  };

  const synthesizeAssistantReplyRef = useRef(synthesizeAssistantReply);
  synthesizeAssistantReplyRef.current = synthesizeAssistantReply;

  const requestSpeechMediaFiles = async (text: string, languageHint?: string) => {
    const response = await fetch("/api/media/audio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: text,
        provider: mediaAudioProvider,
        voiceProfile: mediaAudioVoice,
        languageHint:
          mediaAudioLanguage === "auto"
            ? languageHint ||
              normalizeSpeechLocale(activeLanguageRef.current || DEFAULT_SPEECH_LOCALE)
            : mediaAudioLanguage,
      }),
    });
    const data = (await response.json()) as { files?: MediaResult[]; error?: string };
    if (!response.ok || data.error) {
      throw new Error(data.error || `TTS failed (${response.status})`);
    }
    const audioFiles = Array.isArray(data.files)
      ? data.files.filter((entry) => entry.kind === "audio" && entry.url)
      : [];
    if (!audioFiles.length) throw new Error("No speech output generated.");
    return audioFiles;
  };

  const transcribeAudioPromptAttachments = async (attachments: PromptAttachment[]) => {
    const audioAttachments = attachments.filter(
      (entry) => entry.kind === "audio" && entry.dataUrl,
    );
    if (!audioAttachments.length) {
      return { text: "", cleanedFiles: [] as MediaResult[] };
    }

    const transcriptParts: string[] = [];
    const cleanedFiles: MediaResult[] = [];
    for (const entry of audioAttachments) {
      if (!entry.dataUrl) continue;
      const file = await dataUrlToFile(
        entry.dataUrl,
        entry.name || `audio-${Date.now()}.wav`,
        entry.type || "audio/wav",
      );
      const formData = new FormData();
      formData.append("audio", file);
      formData.append("provider", "auto");
      formData.append(
        "language",
        toTranscriptionLanguageHint(
          activeLanguageRef.current || detectLanguageFromText(input || "") || DEFAULT_SPEECH_LOCALE,
        ),
      );
      formData.append(
        "prompt",
        "Transcribe exactly as spoken in plain text. Keep Roman Urdu/Hinglish in Latin script.",
      );
      const response = await fetch("/api/media/transcribe", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as {
        text?: string;
        plainText?: string;
        error?: string;
        cleanedAudio?: { filename?: string; type?: string; url?: string };
      };
      if (!response.ok || data.error) {
        throw new Error(data.error || `Transcription failed (${response.status})`);
      }
      const plain = (data.plainText || data.text || "").trim();
      if (plain) transcriptParts.push(plain);
      if (data.cleanedAudio?.url) {
        cleanedFiles.push({
          filename: data.cleanedAudio.filename || "cleaned-input.wav",
          kind: "audio",
          type: data.cleanedAudio.type || "audio/wav",
          url: data.cleanedAudio.url,
        });
      }
    }
    return {
      text: transcriptParts.join("\n\n").trim(),
      cleanedFiles,
    };
  };

  const transcribeRecordedAudio = async (blob: Blob) => {
    const formData = new FormData();
    const ext = blob.type.includes("ogg") ? "ogg" : blob.type.includes("mp4") ? "m4a" : "webm";
    formData.append("audio", new File([blob], `voice-input.${ext}`, { type: blob.type }));
    formData.append(
      "language",
      toTranscriptionLanguageHint(activeLanguageRef.current || DEFAULT_SPEECH_LOCALE),
    );
    formData.append(
      "prompt",
      "Transcribe exactly as spoken. Preserve Roman Urdu and Hinglish words in Latin script.",
    );
    const response = await fetch("/api/media/transcribe", {
      method: "POST",
      body: formData,
    });
    const data = (await response.json()) as { text?: string; plainText?: string; error?: string };
    if (!response.ok || data.error) {
      throw new Error(data.error || `Transcription failed (${response.status})`);
    }
    return (data.plainText || data.text || "").trim();
  };

  const transcribeRecordedAudioRef = useRef(transcribeRecordedAudio);
  transcribeRecordedAudioRef.current = transcribeRecordedAudio;

  const stopRecordingLoop = () => {
    if (recordTimerRef.current != null) {
      window.clearTimeout(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    mediaRecorderRef.current = null;
    micAnalyserRef.current = null;
    voiceRecordingRef.current = false;
    setVoiceRecording(false);
    stopSpeechRecognitionLoop();
  };

  const stopRecordingLoopRef = useRef(stopRecordingLoop);
  stopRecordingLoopRef.current = stopRecordingLoop;

  const handleVoiceTurn = useCallback(
    async (spokenText: string) => {
      if (!spokenText.trim()) return;
      voiceBusyRef.current = true;
      setVoiceError(null);
      try {
        stopSpeechRecognitionLoopRef.current?.();
        activeLanguageRef.current = detectLanguageFromText(spokenText);
        const assistantReply = await sendMessageRef.current?.(spokenText);
        if (assistantReply && voiceModeRef.current && speechToSpeechEnabledRef.current) {
          const synthesize = synthesizeAssistantReplyRef.current;
          if (synthesize) {
            await synthesize(assistantReply);
          }
        }
        setVoiceTranscript("");
      } finally {
        voiceBusyRef.current = false;
        if (voiceModeRef.current) {
          void ensureVoiceLoopActive().catch((err) => setVoiceError(String(err)));
        }
      }
    },
    [setVoiceTranscript, setVoiceError, ensureVoiceLoopActive],
  );

  const stopSpeechRecognitionLoop = () => {
    if (speechRecognitionRef.current) {
    speechRecognitionRef.current.onresult = undefined;
    speechRecognitionRef.current.onerror = undefined;
    speechRecognitionRef.current.onend = undefined;
      try {
        speechRecognitionRef.current.stop();
      } catch {
        // ignore
      }
      speechRecognitionRef.current = null;
    }
  };

  const stopSpeechRecognitionLoopRef = useRef(stopSpeechRecognitionLoop);
  stopSpeechRecognitionLoopRef.current = stopSpeechRecognitionLoop;

  const handleVoiceTurnRef = useRef(handleVoiceTurn);
  handleVoiceTurnRef.current = handleVoiceTurn;

  const startSpeechRecognitionLoop = useCallback(async () => {
    const SpeechRecCtor = getSpeechRecognitionConstructor();
    if (!SpeechRecCtor) throw new Error("SpeechRecognition API not available.");
    const rec: SpeechRecognition = new SpeechRecCtor();
    const browserLang =
      typeof navigator !== "undefined"
        ? navigator.languages?.[0] || navigator.language || DEFAULT_SPEECH_LOCALE
        : DEFAULT_SPEECH_LOCALE;
    const latestUserMessage = [...messages]
      .reverse()
      .find((entry) => entry.role === "user" && entry.content.trim())?.content;
    const historyLang = latestUserMessage ? detectLanguageFromText(latestUserMessage) : "";
    rec.lang = normalizeSpeechLocale(
      activeLanguageRef.current || historyLang || browserLang || DEFAULT_SPEECH_LOCALE,
    );
    rec.continuous = true;
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onresult = async (event: SpeechRecognitionEvent) => {
      try {
        const chunks: string[] = [];
        const from = Number.isFinite(event?.resultIndex) ? Number(event.resultIndex) : 0;
        for (let i = from; i < event.results.length; i += 1) {
          const result = event.results[i];
          if (!result?.isFinal) continue;
          const piece = ((result?.[0]?.transcript as string) || "").trim();
          if (piece) chunks.push(piece);
        }
        const transcript = chunks.join(" ").replace(/\s+/g, " ").trim();
        if (transcript) {
          if (shouldSkipDuplicateSpeech(transcript)) return;
          setVoiceTranscript(transcript);
          await handleVoiceTurnRef.current?.(transcript);
        }
      } catch (err) {
        setVoiceError(err instanceof Error ? err.message : String(err));
      }
    };

    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      const msg = event?.error ? `Voice recognition error: ${event.error}` : "Voice recognition error";
      setVoiceError(msg);
      if (voiceModeRef.current && !voiceBusyRef.current && !voiceSpeakingRef.current) {
        setTimeout(() => {
          void ensureVoiceLoopActive().catch((err) => setVoiceError(String(err)));
        }, 150);
      }
    };

    rec.onend = () => {
      if (voiceModeRef.current && !voiceBusyRef.current && !voiceSpeakingRef.current) {
        setTimeout(() => {
          void ensureVoiceLoopActive().catch((err) => setVoiceError(String(err)));
        }, 120);
      }
    };

    speechRecognitionRef.current = rec;
    rec.start();
  }, [
    messages,
    shouldSkipDuplicateSpeech,
    setVoiceTranscript,
    setVoiceError,
    ensureVoiceLoopActive,
  ]);

  startSpeechRecognitionLoopRef.current = startSpeechRecognitionLoop;

  const toggleVoiceMode = async () => {
    if (!voiceAvailable) {
      setVoiceError("Voice mode not supported in this browser.");
      return;
    }
    const next = !voiceModeRef.current;
    voiceModeRef.current = next;
    setVoiceMode(next);
    setVoiceError(null);
    setVoiceTranscript("");
    if (!next) {
      stopRecordingLoop();
      stopSpeechRecognitionLoop();
      setVoiceSpeaking(false);
      voiceSpeakingRef.current = false;
      return;
    }
    try {
      if (speechRecognitionAvailable) {
        await startSpeechRecognitionLoop();
      } else if (canUseRecorderLoop()) {
        await startRecordingLoop();
      } else {
        throw new Error("No voice capture method available.");
      }
    } catch (err) {
      setVoiceError(describeVoiceStartError(err));
      stopRecordingLoop();
      stopSpeechRecognitionLoop();
      setVoiceMode(false);
      voiceModeRef.current = false;
    }
  };

  const toggleSpeechToSpeech = (nextValue?: boolean) => {
    setSpeechToSpeechEnabled((prev) => {
      const next = typeof nextValue === "boolean" ? nextValue : !prev;
      speechToSpeechEnabledRef.current = next;
      if (!next && typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        setVoiceSpeaking(false);
        voiceSpeakingRef.current = false;
      }
      return next;
    });
  };

  const closeStsPopup = () => {
    setIsStsPopupOpen(false);
    if (recordTimerRef.current != null) {
      window.clearTimeout(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    stopRecordingLoop();
    stopSpeechRecognitionLoop();
    setPressToTalkActive(false);
    setVoiceMode(false);
    voiceModeRef.current = false;
    setVoiceRecording(false);
    voiceRecordingRef.current = false;
    setVoiceSpeaking(false);
    voiceSpeakingRef.current = false;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  };

  const openStsPopup = () => {
    setIsStsPopupOpen(true);
    if (!speechToSpeechEnabledRef.current) {
      toggleSpeechToSpeech(true);
    }
    if (!voiceModeRef.current) {
      window.setTimeout(() => {
        void toggleVoiceMode();
      }, 120);
    }
  };

  const startPressToTalk = useCallback(async () => {
    if (pressToTalkActive) return;
    if (!canUseRecorderLoop()) {
      setVoiceError("Press-and-hold needs microphone recording support in this browser.");
      return;
    }
    setVoiceError(null);
    setVoiceTranscript("");
    stopSpeechRecognitionLoopRef.current?.();
    if (voiceSpeakingRef.current && typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      setVoiceSpeaking(false);
      voiceSpeakingRef.current = false;
    }
    setPressToTalkActive(true);
    await startRecordingLoop();
  }, [canUseRecorderLoop, pressToTalkActive, startRecordingLoop]);

  const stopPressToTalk = useCallback(() => {
    if (!pressToTalkActive) return;
    setPressToTalkActive(false);
    if (recordTimerRef.current != null) {
      window.clearTimeout(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, [pressToTalkActive]);

  useEffect(() => {
    if (!voiceHoldMode) return;
    if (!voiceModeRef.current) return;
    stopRecordingLoop();
    stopSpeechRecognitionLoop();
    setVoiceMode(false);
    voiceModeRef.current = false;
    setVoiceSpeaking(false);
    voiceSpeakingRef.current = false;
  }, [voiceHoldMode]);

  useEffect(() => {
    if (!initialVoiceMode || initialVoiceModeAppliedRef.current) return;
    if (!voiceAvailable) return;
    initialVoiceModeAppliedRef.current = true;
    setIsStsPopupOpen(true);
    window.setTimeout(() => {
      void toggleVoiceMode();
    }, 180);
  }, [initialVoiceMode, toggleVoiceMode, voiceAvailable]);

  useEffect(() => {
    if (!isStsPopupOpen) return;
    stsModalRef.current?.scrollTo({ top: 0 });
    stsVisualRef.current?.scrollTo({ top: 0 });
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeStsPopup();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isStsPopupOpen]);

  const loadModels = async () => {
    setLoadingModels(true);
    setError(null);
    try {
      const response = await fetch("/api/models");
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = (await response.json()) as {
        models: string[];
        profiles?: Partial<Record<ModelPresetId, string>>;
        profileMeta?: Partial<Record<ModelPresetId, ModelProfileMeta>>;
      };
      setModels(data.models);
      setProfileMeta(data.profileMeta || {});
      const nextMapping: Record<string, string> = {};
      for (const preset of MODEL_PRESETS) {
        const profileModel = data.profiles?.[preset.id];
        nextMapping[preset.id] =
          profileModel && data.models.includes(profileModel)
            ? profileModel
            : mapPresetToModel(
                preset.id,
                data.models,
                DEFAULT_MODEL,
              );
      }
      setPresetMapping(nextMapping);
      const activePresetId = (selectedPresetId || MODEL_PRESETS[0].id) as ModelPresetId;
      const mapped = nextMapping[activePresetId];
      if (mapped && mapped !== model) {
        setModel(mapped);
      } else if (!mapped && data.models.length) {
        setModel(data.models.includes(DEFAULT_MODEL) ? DEFAULT_MODEL : data.models[0]);
      }
    } catch (err) {
      const raw = String(err || "");
      const lower = raw.toLowerCase();
      let message = "Model list unavailable. Using default profiles.";
      if (lower.includes("unauthorized") || lower.includes("invalid api key")) {
        message = "Sign in to load models.";
      } else if (lower.includes("fetch") || lower.includes("network")) {
        message = "Model service unreachable. Using defaults.";
      }
      setError(message);
      if (!models.length) {
        const fallbackModels = MODEL_PRESETS.map((preset) => preset.id);
        setModels(fallbackModels);
        const nextMapping: Record<string, string> = {};
        for (const preset of MODEL_PRESETS) {
          nextMapping[preset.id] = preset.id;
        }
        setPresetMapping(nextMapping);
        const activePresetId = (selectedPresetId || MODEL_PRESETS[0].id) as ModelPresetId;
        const mapped = nextMapping[activePresetId] || MODEL_PRESETS[0].id;
        setModel(mapped);
      }
    } finally {
      setLoadingModels(false);
    }
  };

  const stopStreaming = () => {
    abortRef.current?.abort();
    setIsStreaming(false);
  };

  const buildMediaUrl = (file: MediaResult) => {
    if (file.url) {
      if (/^https?:\/\//i.test(file.url)) {
        const params = new URLSearchParams();
        params.set("url", file.url);
        return `/api/media/file?${params.toString()}`;
      }
      if (file.url.startsWith("data:")) {
        // Keep data URLs as-is to avoid blob:// links and extra quality loss.
        return file.url;
      }
      return file.url;
    }
    const params = new URLSearchParams();
    params.set("filename", file.filename);
    if (file.subfolder) params.set("subfolder", file.subfolder);
    if (file.type) params.set("type", file.type);
    if (file.baseUrl) params.set("baseUrl", file.baseUrl);
    return `/api/media/file?${params.toString()}`;
  };

  const buildMediaDownloadUrl = (file: MediaResult) => {
    if (file.url && file.url.startsWith("data:")) {
      return file.url;
    }
    const params = new URLSearchParams();
    if (file.url && /^https?:\/\//i.test(file.url)) {
      params.set("url", file.url);
      params.set("downloadName", file.filename);
      params.set("download", "true");
      return `/api/media/file?${params.toString()}`;
    }
    params.set("filename", file.filename);
    if (file.subfolder) params.set("subfolder", file.subfolder);
    if (file.type) params.set("type", file.type);
    if (file.baseUrl) params.set("baseUrl", file.baseUrl);
    params.set("downloadName", file.filename);
    params.set("download", "true");
    return `/api/media/file?${params.toString()}`;
  };

  const buildImageDownloadUrl = (file: MediaResult, format: "jpg" | "svg") => {
    const params = new URLSearchParams();
    if (file.url && /^https?:\/\//i.test(file.url)) {
      params.set("url", file.url);
    } else {
      params.set("filename", file.filename);
      if (file.subfolder) params.set("subfolder", file.subfolder);
      if (file.type) params.set("type", file.type);
      if (file.baseUrl) params.set("baseUrl", file.baseUrl);
    }
    params.set("download", "true");
    params.set("format", format);
    params.set("downloadName", file.filename);
    return `/api/media/file?${params.toString()}`;
  };

  const openMediaPreview = (file: MediaResult) => {
    if (file.kind !== "image" && file.kind !== "gif") return;
    setMediaPreview({ file, url: buildMediaUrl(file) });
  };

  const selectChatSession = (sessionId: string) => {
    const target = orderedChatSessions.find((entry) => entry.id === sessionId);
    if (!target) return;
    if (isStreaming) {
      abortRef.current?.abort();
      setIsStreaming(false);
    }
    setActiveChatSessionId(target.id);
    setMessages(target.messages);
    setInput("");
    setPendingAttachments([]);
    setAttachmentError(null);
    setError(null);
    shouldAutoScrollRef.current = true;
    setShowJumpToBottom(false);
    setIsDrawerOpen(false);
  };

  const deleteChatSession = (sessionId: string) => {
    if (!sessionId) return;
    if (isStreaming) {
      abortRef.current?.abort();
      setIsStreaming(false);
    }
    setChatSessions((prev) => {
      const remaining = prev.filter((entry) => entry.id !== sessionId);
      if (!remaining.length) {
        const fresh = makeFreshSession();
        setActiveChatSessionId(fresh.id);
        setMessages([]);
        setInput("");
        setPendingAttachments([]);
        setAttachmentError(null);
        setError(null);
        setIsDrawerOpen(false);
        shouldAutoScrollRef.current = true;
        setShowJumpToBottom(false);
        return [fresh];
      }

      const sorted = [...remaining].sort((a, b) => b.updatedAt - a.updatedAt);
      const nextActiveId =
        activeChatSessionId === sessionId
          ? sorted[0].id
          : (sorted.find((entry) => entry.id === activeChatSessionId)?.id || sorted[0].id);
      const nextActive = sorted.find((entry) => entry.id === nextActiveId) || sorted[0];

      setActiveChatSessionId(nextActiveId);
      setMessages(nextActive.messages);
      setInput("");
      setPendingAttachments([]);
      setAttachmentError(null);
      setError(null);
      setIsDrawerOpen(false);
      shouldAutoScrollRef.current = true;
      setShowJumpToBottom(false);
      return sorted;
    });
  };

  const startNewChat = () => {
    if (isStreaming) {
      abortRef.current?.abort();
      setIsStreaming(false);
    }
    const fresh = makeFreshSession();
    setChatSessions((prev) => [fresh, ...prev].slice(0, MAX_CHAT_SESSIONS));
    setActiveChatSessionId(fresh.id);
    setMessages([]);
    setInput("");
    setPendingAttachments([]);
    setAttachmentError(null);
    setError(null);
    shouldAutoScrollRef.current = true;
    setShowJumpToBottom(false);
    setIsDrawerOpen(false);
  };

  const toggleDrawerFromUser = useCallback(() => {
    const now = Date.now();
    if (now - lastDrawerToggleAtRef.current < 900) return;
    lastDrawerToggleAtRef.current = now;
    setIsDrawerOpen((open) => !open);
  }, []);

  const rootClassName = embedded ? "studio-rafaygen studio-embedded" : "studio-rafaygen";
  const rootStyle = embedded ? undefined : { paddingTop: "56px" };
  const layoutClassName = embedded
    ? "flex h-full min-h-0 w-full items-start gap-3 xl:gap-5"
    : "mx-auto flex h-full min-h-0 w-full max-w-[1540px] items-start gap-3 xl:gap-5";

  return (
    <div className={rootClassName} style={rootStyle}>
      <div className={layoutClassName}>
        <main className="gem-shell flex h-full min-h-0 flex-1 flex-col">
          {!embedded ? (
            <header className={`gem-topbar${navScrolled ? " gem-topbar--scrolled" : ""}`} data-theme={themeMode}>
              <div className="gem-topbar-brand flex items-center gap-2">
                  <RafaygenLogo variant="lockup" size="lg" href="/" className="gem-site-logo" />
                <button
                  type="button"
                  className="gem-menu-cta xl:hidden"
                  onClick={toggleDrawerFromUser}
                  aria-label="Open chats panel"
                >
                  <span className="flex items-center gap-1.5">
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[14px] w-[14px] fill-current">
                      <path d="M4 6.5A1.5 1.5 0 0 1 5.5 5h13a1.5 1.5 0 0 1 0 3h-13A1.5 1.5 0 0 1 4 6.5zm0 5.5A1.5 1.5 0 0 1 5.5 10h13a1.5 1.5 0 0 1 0 3h-13A1.5 1.5 0 0 1 4 12zm0 5.5A1.5 1.5 0 0 1 5.5 15h13a1.5 1.5 0 0 1 0 3h-13A1.5 1.5 0 0 1 4 17.5z" />
                    </svg>
                    <span className="hidden sm:inline">Chats</span>
                  </span>
                </button>
                <div ref={presetMenuRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setIsPresetMenuOpen((prev) => !prev)}
                    className="gem-pill gem-pill-btn gem-mode-pill"
                    title={activePresetLabel}
                    aria-label="Select model mode"
                  >
                    <span className="hidden sm:inline">{activePresetLabel}</span>
                    <span className="sm:hidden">Mode</span>
                  </button>
                  {isPresetMenuOpen ? (
                    <div className="gem-dropdown-menu gem-dropdown-topbar">
                      {MODEL_PRESETS.map((preset) => {
                        const isActive = selectedPresetId === preset.id;
                        const meta = profileMeta[preset.id];
                        const pTier = (preset as { tier?: string }).tier || "free";
                        const isLocked = (pTier === "pro" && (userTier === "free" || userTier === "guest"))
                          || (pTier === "premium" && (userTier === "free" || userTier === "guest" || userTier === "pro"));
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => {
                              if (isLocked) {
                                setPlanLimitBanner({ message: `${preset.label} requires ${pTier === "premium" ? "Premium ($25)" : "Pro ($15)"} plan. Upgrade at /pricing.` });
                                setIsPresetMenuOpen(false);
                                return;
                              }
                              const mapped =
                                meta?.model ||
                                presetMapping[preset.id] ||
                                mapPresetToModel(preset.id, models, DEFAULT_MODEL);
                              setSelectedPresetId(preset.id);
                              setModel(mapped);
                              setIsPresetMenuOpen(false);
                            }}
                            className={`gem-dropdown-item ${isActive ? "gem-dropdown-item-active" : ""} ${isLocked ? "gem-dropdown-item-locked" : ""}`}
                          >
                            <span>{preset.label} {isLocked ? "🔒" : ""}</span>
                            <small>
                              {preset.note}
                              {meta?.provider ? ` · ${meta.provider}` : ""}
                            </small>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="gem-topbar-actions flex items-center gap-2">
                <div className="gem-active-model">
                  <span>{activePresetLabel}</span>
                  <small>{activePresetMeta?.provider || "Auto"} · {model}</small>
                </div>
                <ThemeToggle variant="apple" />
              </div>
            </header>
          ) : null}

          <div className="flex min-h-0 flex-1 flex-col px-2 pb-2 sm:px-4">
            {/* Plan Limit Banner — pinned at top of chat when limit hit */}
            {planLimitBanner && (
              <div className="gem-limit-banner">
                <div className="gem-limit-banner-inner">
                  <span className="gem-limit-banner-icon">⚡</span>
                  <div className="gem-limit-banner-text">
                    <span>{planLimitBanner.message}</span>
                    {planLimitBanner.resetAt && (
                      <span className="gem-limit-banner-reset">
                        {" · Resets: "}
                        {new Date(planLimitBanner.resetAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                  </div>
                  <div className="gem-limit-banner-actions">
                    <a href="/pricing" className="gem-limit-upgrade-btn">Upgrade</a>
                    <button type="button" className="gem-limit-dismiss-btn" onClick={() => setPlanLimitBanner(null)}>✕</button>
                  </div>
                </div>
              </div>
            )}
            <div ref={scrollAreaRef} onScroll={updateScrollState} className="gem-chat-scroll min-h-0 flex-1 space-y-4">
              {!hasMessages ? (
                <div className="gem-empty-block gem-reveal">
                  <h2 className="gem-empty-title">How can RafayGen help today?</h2>
                  <p className="gem-empty-subtitle">Ask anything, plan work, debug code, or draft content.</p>
                  <div className="gem-suggestion-grid">
                    {[
                      "Build a complete launch plan for my app",
                      "Summarize this long text in simple points",
                      "Refactor my API route for performance",
                      "Create a polished marketing copy draft",
                    ].map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => setInput(prompt)}
                        className="gem-suggestion-chip"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {messages.map((message, index) => (
                <MessageBubble
                  key={`${message.role}-${index}`}
                  message={message}
                  plainTextEnabled={plainTextEnabled}
                  buildMediaUrl={buildMediaUrl}
                  buildMediaDownloadUrl={buildMediaDownloadUrl}
                  openMediaPreview={openMediaPreview}
                  messageIndex={index}
                  onCopyMessage={(content) => {
                    void handleCopyMessage(content);
                  }}
                  onShareMessage={() => {
                    void handleShareMessage(index);
                  }}
                  onEditUserMessage={handleEditUserMessage}
                  onRegenerateAssistantMessage={(msgIndex) => {
                    void handleRegenerateAssistantMessage(msgIndex);
                  }}
                  onReplyToAssistant={handleReplyToAssistant}
                />
              ))}
            </div>

            <div ref={composerWrapRef} className="gem-composer-wrap">
              <input
                ref={attachmentInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handlePickAttachments}
                accept="image/*,video/*,audio/*,.txt,.md,.csv,.json,.xml,.pdf,.doc,.docx"
              />
              <div className="mb-3 flex flex-wrap items-end gap-2 rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)]/92 px-3 py-3">
                <label className="min-w-[220px] flex-1 text-[11px] font-medium text-[var(--muted)]">
                  Model
                  <select
                    value={model}
                    onChange={(event) => setModel(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-[var(--panel-border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--foreground)] outline-none"
                  >
                    {models.length ? (
                      models.map((entry) => (
                        <option key={entry} value={entry}>
                          {entry}
                        </option>
                      ))
                    ) : (
                      <option value={model}>{model}</option>
                    )}
                  </select>
                </label>
                <label className="min-w-[150px] flex-1 text-[11px] font-medium text-[var(--muted)] sm:max-w-[190px]">
                  Realtime
                  <select
                    value={realtimeMode}
                    onChange={(event) => setRealtimeMode(event.target.value as RealtimeSetting)}
                    className="mt-1 w-full rounded-xl border border-[var(--panel-border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--foreground)] outline-none"
                  >
                    <option value="auto">Auto detect</option>
                    <option value="search">Always search</option>
                    <option value="deep">Search + page extracts</option>
                    <option value="off">Off</option>
                  </select>
                </label>
                <label className="min-w-[150px] flex-1 text-[11px] font-medium text-[var(--muted)] sm:max-w-[190px]">
                  Safety
                  <select
                    value={safetyMode}
                    onChange={(event) => setSafetyMode(event.target.value as SafetySetting)}
                    className="mt-1 w-full rounded-xl border border-[var(--panel-border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--foreground)] outline-none"
                  >
                    <option value="standard">Standard</option>
                    <option value="strict">Strict</option>
                  </select>
                </label>
                <p className="text-[11px] text-[var(--muted)]">
                  Media prompts sent in chat now generate inline previews with downloads.
                </p>
              </div>
              {pendingAttachments.length ? (
                <div className="gem-pending-attachments" aria-label="Pending attachments">
                  {pendingAttachments.map((file) => (
                    <div key={file.id} className="gem-pending-attachment-item">
                      {file.previewUrl ? (
                        <Image
                          src={file.previewUrl}
                          alt={file.name}
                          className="gem-pending-attachment-thumb"
                          width={56}
                          height={56}
                          unoptimized
                        />
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <p>{file.name}</p>
                        <small>
                          {file.kind} • {formatFileSize(file.size)}
                        </small>
                      </div>
                      <button
                        type="button"
                        onClick={() => removePendingAttachment(file.id)}
                        aria-label={`Remove ${file.name}`}
                      >
                        x
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              <textarea
                ref={composerInputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
                placeholder="Message RafayGen..."
                className="gem-composer-input"
              />
              <div className="gem-composer-actions">
                <div className="gem-composer-primary-actions">
                  {embedded ? (
                    <button
                      type="button"
                      onClick={toggleDrawerFromUser}
                      className="gem-ghost-btn gem-icon-btn xl:hidden"
                      aria-label="Open chats panel"
                      title="Chats"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M4 6.5A1.5 1.5 0 0 1 5.5 5h13a1.5 1.5 0 0 1 0 3h-13A1.5 1.5 0 0 1 4 6.5zm0 5.5A1.5 1.5 0 0 1 5.5 10h13a1.5 1.5 0 0 1 0 3h-13A1.5 1.5 0 0 1 4 12zm0 5.5A1.5 1.5 0 0 1 5.5 15h13a1.5 1.5 0 0 1 0 3h-13A1.5 1.5 0 0 1 4 17.5z" />
                      </svg>
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => attachmentInputRef.current?.click()}
                    className="gem-ghost-btn gem-icon-btn gem-attach-icon-btn"
                    title="Attach files"
                    aria-label="Attach files"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M16.5 6.5a4 4 0 0 0-5.66 0l-5.2 5.2a5.5 5.5 0 1 0 7.78 7.78l6.62-6.62a3.5 3.5 0 0 0-4.95-4.95l-6.63 6.62a1.5 1.5 0 0 0 2.12 2.12l6.01-6.01a1 1 0 0 1 1.42 1.41l-6.01 6.02a3.5 3.5 0 0 1-4.95-4.95l6.63-6.62a5 5 0 1 1 7.07 7.07l-6.62 6.62a7.5 7.5 0 1 1-10.61-10.6l5.2-5.2a6 6 0 0 1 8.49 8.48l-6.01 6.01a2.5 2.5 0 0 1-3.54-3.54l6.62-6.62a1 1 0 1 1 1.42 1.41l-6.62 6.63a.5.5 0 1 0 .7.7l6-6a4 4 0 0 0 0-5.67z" />
                    </svg>
                  </button>
                </div>
                <div className="gem-send-actions ml-auto flex items-center gap-2">
                  {isStreaming ? (
                    <button type="button" onClick={stopStreaming} className="gem-ghost-btn">
                      Stop
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      void sendMessage();
                    }}
                    disabled={isStreaming}
                    className="gem-send-btn gem-icon-btn gem-send-icon-btn"
                    aria-label="Send message"
                    title="Send message"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M3.4 20.6a1 1 0 0 1-.12-1.73L19.5 12 3.28 5.13a1 1 0 0 1 .33-1.9 1 1 0 0 1 .34.06l17.5 7a1.9 1.9 0 0 1 0 3.42l-17.5 7a1 1 0 0 1-.55.09z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void toggleVoiceMode();
                    }}
                    className={`gem-mic-btn gem-icon-btn ${voiceMode ? "gem-mic-btn-active" : ""}`}
                    aria-pressed={voiceMode}
                    disabled={!voiceAvailable}
                    title={voiceAvailable ? micButtonLabel : "Mic not available on this device/browser"}
                    aria-label="Speech to text microphone"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 15a4 4 0 0 0 4-4V7a4 4 0 1 0-8 0v4a4 4 0 0 0 4 4zm7-4a1 1 0 1 0-2 0 5 5 0 1 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.93V21H9a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-3.07A7 7 0 0 0 19 11z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={openStsPopup}
                    className={`gem-mic-btn gem-icon-btn gem-wav-btn ${
                      speechToSpeechEnabled ? "gem-mic-btn-active" : ""
                    }`}
                    aria-pressed={speechToSpeechEnabled}
                    title="Speech to speech"
                    aria-label="Open speech to speech"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M4 10.5a1 1 0 1 1 2 0v3a1 1 0 1 1-2 0v-3zm4-3a1 1 0 1 1 2 0v9a1 1 0 1 1-2 0v-9zm4-2a1 1 0 1 1 2 0v13a1 1 0 1 1-2 0v-13zm4 3a1 1 0 1 1 2 0v7a1 1 0 1 1-2 0v-7z" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {showJumpToBottom ? (
              <button
                type="button"
                onClick={scrollToComposer}
                className="rg-jump-fab"
                aria-label="Scroll to chat prompt"
                title="Jump to prompt"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" className="rg-jump-fab__icon">
                  <path d="M12 4a1 1 0 0 1 1 1v12.17l4.24-4.25a1 1 0 1 1 1.42 1.42l-5.95 5.95a1 1 0 0 1-1.42 0l-5.95-5.95a1 1 0 1 1 1.42-1.42L11 17.17V5a1 1 0 0 1 1-1z" />
                </svg>
              </button>
            ) : null}
          </div>

          {displayError ? (
            <div className="mx-3 mb-3 rounded-xl border border-[rgba(255,107,107,0.5)] bg-[rgba(255,107,107,0.12)] p-3 text-xs text-[var(--danger)] sm:mx-4">
              {displayError}
            </div>
          ) : null}
        </main>

        <aside className="gem-right-panel hidden xl:order-first xl:flex">
          <div className="gem-panel-block">
            <button type="button" onClick={startNewChat} className="gem-primary-btn w-full">
              + New chat
            </button>
            <div className="gem-panel-section">
              <p className="gem-panel-label">Model profiles</p>
              <div className="gem-model-list">
                {MODEL_PRESETS.map((preset) => {
                  const meta = profileMeta[preset.id];
                  const mapped =
                    meta?.model || presetMapping[preset.id] || mapPresetToModel(preset.id, models, DEFAULT_MODEL);
                  const isActive = selectedPresetId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      className={`gem-model-item ${isActive ? "gem-model-item-active" : ""}`}
                      onClick={() => {
                        setSelectedPresetId(preset.id);
                        setModel(mapped);
                      }}
                    >
                      <span>
                        <p>{preset.label}</p>
                        <small>{preset.description}</small>
                      </span>
                      <span className="gem-model-meta">
                        <small>{meta?.provider || "Auto"}</small>
                        <p>{mapped}</p>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="gem-panel-section">
              <p className="gem-panel-label">Chats</p>
              <div className="gem-chat-list">
                {orderedChatSessions.length ? (
                  orderedChatSessions.map((entry) => {
                    const isActive = activeChatSession?.id === entry.id;
                    const preview = entry.messages.find((item) => item.role === "user")?.content || "";
                    const compactPreview = preview.replace(/\s+/g, " ").trim();
                    return (
                      <div key={entry.id} className="gem-chat-item-row">
                        <button
                          type="button"
                          onClick={() => selectChatSession(entry.id)}
                          className={`gem-chat-item ${isActive ? "gem-chat-item-active" : ""}`}
                        >
                          <span className="gem-panel-item-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24">
                              <path d="M20 4H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3v3.2a.8.8 0 0 0 1.35.58L12.13 17H20a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 11h-8.17a1 1 0 0 0-.65.24L9 17.16V16a1 1 0 0 0-1-1H4V6h16v9z" />
                            </svg>
                          </span>
                          <span className="gem-panel-item-copy">
                            <p>{entry.title || "New chat"}</p>
                            <small>{compactPreview || "No messages yet"}</small>
                          </span>
                        </button>
                        <button
                          type="button"
                          className="gem-chat-delete-btn"
                          aria-label={`Delete chat ${entry.title || "New chat"}`}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            deleteChatSession(entry.id);
                          }}
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M9 3a1 1 0 0 0-.9.55L7.38 5H5a1 1 0 1 0 0 2h.28l.83 11.12A3 3 0 0 0 9.1 21h5.8a3 3 0 0 0 2.99-2.88L18.72 7H19a1 1 0 1 0 0-2h-2.38l-.72-1.45A1 1 0 0 0 15 3H9zm1.62 2 .2-.4h2.36l.2.4h-2.76zM8.29 7h7.42l-.82 11a1 1 0 0 1-1 .94H10.1a1 1 0 0 1-1-.94L8.29 7z" />
                          </svg>
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <p className="gem-muted-box">No chats yet.</p>
                )}
              </div>
            </div>
          </div>
        </aside>
      </div>

      {portalReady && isStsPopupOpen
        ? createPortal(
        <div className="gem-sts-overlay" onClick={closeStsPopup}>
          <section
            ref={stsModalRef}
            className="gem-sts-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="gem-sts-head">
              <div>
                <p className="gem-sts-kicker">Speech Studio</p>
                <h3>Realtime voice conversation</h3>
              </div>
              <button
                type="button"
                className="gem-drawer-close-btn"
                onClick={closeStsPopup}
                aria-label="Close speech popup"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.12L10.58 12 5.7 16.88a1 1 0 1 0 1.41 1.41L12 13.41l4.89 4.88a1 1 0 0 0 1.41-1.41L13.42 12l4.88-4.88a1 1 0 0 0 0-1.41z" />
                </svg>
              </button>
            </header>

            <div ref={stsVisualRef} className="gem-sts-visual">
              <div className="gem-sts-stage">
                <div
                  className={`gem-sts-stage-shell gem-sts-stage-shell-${voiceStateTone.toLowerCase()}`}
                  data-state={voiceStateTone.toLowerCase()}
                >
                  <div className="gem-sts-mode-row">
                    <span className={`gem-sts-mode-pill gem-sts-mode-pill-${voiceStateTone.toLowerCase()}`}>
                      {voiceStateTone}
                    </span>
                    <span className="gem-sts-mode-pill">Model {activePresetLabel}</span>
                    <span className="gem-sts-mode-pill">
                      {speechToSpeechEnabled ? "Voice reply on" : "Voice reply off"}
                    </span>
                  </div>
                  <WavVisualizer
                    isListening={voiceRecording}
                    isSpeaking={voiceSpeaking}
                    isReady={voiceMode}
                    analyserNode={micAnalyserRef.current}
                  />
                  <p className="gem-sts-status">{voiceStateHint}</p>
                  <p className="gem-sts-transcript">
                    {voiceTranscript || "Speak in English, Urdu, or Hindi. RafayGen will keep the flow fast and reply in the same conversational style."}
                  </p>
                </div>
              </div>
            </div>

            <div className="gem-sts-controls">
              <div className="gem-sts-setting-grid">
                <label className="gem-sts-setting gem-sts-setting-card">
                  <span>Conversation model</span>
                  <select
                    value={selectedPresetId || MODEL_PRESETS[0].id}
                    onChange={(event) => {
                      const nextPresetId = event.target.value as ModelPresetId;
                      const mapped =
                        profileMeta[nextPresetId]?.model ||
                        presetMapping[nextPresetId] ||
                        mapPresetToModel(nextPresetId, models, DEFAULT_MODEL);
                      setSelectedPresetId(nextPresetId);
                      setModel(mapped);
                    }}
                    className="gem-media-select"
                  >
                    {MODEL_PRESETS.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="gem-sts-setting gem-sts-setting-card">
                  <span>Voice provider</span>
                  <select
                    value={mediaAudioProvider}
                    onChange={(event) =>
                      setMediaAudioProvider(event.target.value as "auto" | "groq" | "qwen" | "hf")
                    }
                    className="gem-media-select"
                  >
                    <option value="auto">Auto</option>
                    <option value="groq">Groq TTS</option>
                    <option value="qwen">Qwen TTS</option>
                    <option value="hf">Hugging Face</option>
                  </select>
                </label>
                <label className="gem-sts-setting gem-sts-setting-card">
                  <span>Voice profile</span>
                  <select
                    value={mediaAudioVoice}
                    onChange={(event) => setMediaAudioVoice(event.target.value)}
                    className="gem-media-select"
                  >
                    <option value="astra">Astra</option>
                    <option value="vanguard">Vanguard</option>
                    <option value="lumina">Lumina</option>
                    <option value="aegis">Aegis</option>
                    <option value="helix">Helix</option>
                    <option value="serena">Serena</option>
                    <option value="titan">Titan</option>
                    <option value="navigator">Navigator</option>
                    <option value="pulse">Pulse</option>
                    <option value="regal">Regal</option>
                    <option value="female_clear">Female Clear</option>
                    <option value="default">Default</option>
                  </select>
                </label>
                <label className="gem-sts-setting gem-sts-setting-card">
                  <span>Language hint</span>
                  <select
                    value={mediaAudioLanguage}
                    onChange={(event) =>
                      setMediaAudioLanguage(event.target.value as "auto" | "en" | "hi" | "ur")
                    }
                    className="gem-media-select"
                  >
                    <option value="auto">Auto detect</option>
                    <option value="en">English</option>
                    <option value="hi">Hindi</option>
                    <option value="ur">Urdu</option>
                  </select>
                </label>
              </div>
              <div className="gem-sts-quickbar">
                <div className="gem-sts-quickcard">
                  <span className="gem-sts-quicklabel">Speech loop</span>
                  <strong>{speechToSpeechEnabled ? "Enabled" : "Muted"}</strong>
                </div>
                <div className="gem-sts-quickcard">
                  <span className="gem-sts-quicklabel">Capture mode</span>
                  <strong>{voiceHoldMode ? "Hold to talk" : "Continuous"}</strong>
                </div>
                <div className="gem-sts-quickcard">
                  <span className="gem-sts-quicklabel">Language</span>
                  <strong>{mediaAudioLanguage === "auto" ? "Auto detect" : mediaAudioLanguage.toUpperCase()}</strong>
                </div>
              </div>
              <div className="gem-sts-inline-actions">
                <button
                  type="button"
                  className={`gem-press-talk-btn ${voiceHoldMode ? "gem-press-talk-btn-active" : ""}`}
                  onClick={() => setVoiceHoldMode((prev) => !prev)}
                >
                  {voiceHoldMode ? "Hold mode enabled" : "Enable hold-to-talk"}
                </button>
                <button
                  type="button"
                  className={`gem-press-talk-btn ${pressToTalkActive ? "gem-press-talk-btn-active" : ""}`}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    if (!voiceHoldMode) return;
                    void startPressToTalk();
                  }}
                  onPointerUp={(event) => {
                    event.preventDefault();
                    stopPressToTalk();
                  }}
                  onPointerLeave={() => {
                    stopPressToTalk();
                  }}
                  onPointerCancel={() => {
                    stopPressToTalk();
                  }}
                  disabled={!voiceHoldMode}
                >
                  {pressToTalkActive ? "Release to send" : "Press and hold to talk"}
                </button>
              </div>
              <p className="gem-sts-helper">
                Continuous mode listens between turns. Hold mode records only while pressed for cleaner short replies and less overlap.
              </p>
            </div>

            <div className="gem-sts-strip">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
                placeholder="Message RafayGen..."
                className="gem-composer-input gem-sts-input"
              />
              <div className="gem-composer-actions gem-sts-actions">
                <div className="gem-composer-primary-actions">
                  <button
                    type="button"
                    onClick={() => attachmentInputRef.current?.click()}
                    className="gem-ghost-btn gem-icon-btn gem-attach-icon-btn"
                    title="Attach files"
                    aria-label="Attach files"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M16.5 6.5a4 4 0 0 0-5.66 0l-5.2 5.2a5.5 5.5 0 1 0 7.78 7.78l6.62-6.62a3.5 3.5 0 0 0-4.95-4.95l-6.63 6.62a1.5 1.5 0 0 0 2.12 2.12l6.01-6.01a1 1 0 0 1 1.42 1.41l-6.01 6.02a3.5 3.5 0 0 1-4.95-4.95l6.63-6.62a5 5 0 1 1 7.07 7.07l-6.62 6.62a7.5 7.5 0 1 1-10.61-10.6l5.2-5.2a6 6 0 0 1 8.49 8.48l-6.01 6.01a2.5 2.5 0 0 1-3.54-3.54l6.62-6.62a1 1 0 1 1 1.42 1.41l-6.62 6.63a.5.5 0 1 0 .7.7l6-6a4 4 0 0 0 0-5.67z" />
                    </svg>
                  </button>
                </div>
                <div className="gem-send-actions ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void sendMessage();
                    }}
                    disabled={isStreaming}
                    className="gem-send-btn gem-icon-btn gem-send-icon-btn"
                    aria-label="Send message"
                    title="Send message"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M3.4 20.6a1 1 0 0 1-.12-1.73L19.5 12 3.28 5.13a1 1 0 0 1 .33-1.9 1 1 0 0 1 .34.06l17.5 7a1.9 1.9 0 0 1 0 3.42l-17.5 7a1 1 0 0 1-.55.09z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void toggleVoiceMode();
                    }}
                    className={`gem-mic-btn gem-icon-btn ${voiceMode ? "gem-mic-btn-active" : ""}`}
                    aria-pressed={voiceMode}
                    disabled={!voiceAvailable}
                    title={voiceAvailable ? micButtonLabel : "Mic not available on this device/browser"}
                    aria-label="Speech to text microphone"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 15a4 4 0 0 0 4-4V7a4 4 0 1 0-8 0v4a4 4 0 0 0 4 4zm7-4a1 1 0 1 0-2 0 5 5 0 1 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.93V21H9a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-3.07A7 7 0 0 0 19 11z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleSpeechToSpeech()}
                    className={`gem-mic-btn gem-icon-btn gem-wav-btn ${
                      speechToSpeechEnabled ? "gem-mic-btn-active" : ""
                    }`}
                    aria-pressed={speechToSpeechEnabled}
                    title="Toggle speech to speech"
                    aria-label="Toggle speech to speech"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M4 10.5a1 1 0 1 1 2 0v3a1 1 0 1 1-2 0v-3zm4-3a1 1 0 1 1 2 0v9a1 1 0 1 1-2 0v-9zm4-2a1 1 0 1 1 2 0v13a1 1 0 1 1-2 0v-13zm4 3a1 1 0 1 1 2 0v7a1 1 0 1 1-2 0v-7z" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>,
        document.body,
      ) : null}

      {isMediaModalOpen ? (
        <div className="gem-media-overlay" onClick={() => setIsMediaModalOpen(false)}>
          <section className="gem-media-modal" onClick={(event) => event.stopPropagation()}>
            <header className="gem-media-modal-head">
              <div>
                <p className="gem-media-kicker">Media Studio</p>
                <h3>Generate image, video, or audio</h3>
              </div>
              <button
                type="button"
                className="gem-media-close-btn"
                onClick={() => setIsMediaModalOpen(false)}
                aria-label="Close media generator"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.12L10.58 12 5.7 16.88a1 1 0 1 0 1.41 1.41L12 13.41l4.89 4.88a1 1 0 0 0 1.41-1.41L13.42 12l4.88-4.88a1 1 0 0 0 0-1.41z" />
                </svg>
              </button>
            </header>

            <div className="gem-media-modal-body">
              <div className="gem-media-mode-tabs">
                {(["image", "video", "audio"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={`gem-media-tab ${mediaDraftMode === mode ? "active" : ""}`}
                    onClick={() => setMediaDraftMode(mode)}
                  >
                    {mode.toUpperCase()}
                  </button>
                ))}
              </div>

              <label className="gem-media-label" htmlFor="mediaPrompt">
                Prompt
              </label>
              <textarea
                id="mediaPrompt"
                value={mediaDraftPrompt}
                onChange={(event) => setMediaDraftPrompt(event.target.value)}
                placeholder="Describe in a few words. We’ll auto-enhance the details."
                className="gem-media-textarea"
              />

              {mediaDraftMode !== "audio" ? (
                <div className="gem-media-controls">
                  <label className="gem-media-label" htmlFor="mediaDetail">
                    Detail
                  </label>
                  <select
                    id="mediaDetail"
                    className="gem-media-select"
                    value={mediaDetail}
                    onChange={(event) =>
                      setMediaDetail(event.target.value as "standard" | "high" | "ultra")
                    }
                  >
                    <option value="standard">Standard</option>
                    <option value="high">High</option>
                    <option value="ultra">Ultra</option>
                  </select>
                </div>
              ) : null}

              <div className="gem-media-controls">
                <label className="gem-media-label" htmlFor="mediaModel">
                  Model
                </label>
                {mediaDraftMode === "image" ? (
                  <select
                    id="mediaModel"
                    className="gem-media-select"
                    value={mediaImageModel}
                    onChange={(event) =>
                      setMediaImageModel(
                        event.target.value as
                          | "auto"
                          | "comfyui_fast"
                          | "zimage_turbo"
                          | "hf_flux_schnell",
                      )
                    }
                  >
                    <option value="auto">Auto (Preset optimized)</option>
                    <option value="hf_flux_schnell">HF FLUX.1 Schnell</option>
                    <option value="zimage_turbo">Z-Image Turbo</option>
                    <option value="comfyui_fast">ComfyUI Fast</option>
                  </select>
                ) : mediaDraftMode === "video" ? (
                  <select
                    id="mediaModel"
                    className="gem-media-select"
                    value={mediaVideoProvider}
                    onChange={(event) =>
                      setMediaVideoProvider(
                        event.target.value as
                          | "auto"
                          | "wan"
                          | "wan22gradio"
                          | "imagefx"
                          | "comfy"
                          | "hf",
                      )
                    }
                  >
                    <option value="auto">Auto</option>
                    <option value="wan">WAN 2.1</option>
                    <option value="wan22gradio">WAN 2.2 Gradio</option>
                    <option value="imagefx">ImageFX fallback</option>
                    <option value="hf">Hugging Face</option>
                    <option value="comfy">ComfyUI</option>
                  </select>
                ) : (
                  <select
                    id="mediaModel"
                    className="gem-media-select"
                    value={mediaAudioProvider}
                    onChange={(event) =>
                      setMediaAudioProvider(event.target.value as "auto" | "groq" | "qwen" | "hf")
                    }
                  >
                    <option value="auto">Auto (Groq → Qwen → HF)</option>
                    <option value="groq">Groq TTS</option>
                    <option value="qwen">Qwen TTS</option>
                    <option value="hf">Hugging Face</option>
                  </select>
                )}
              </div>

              {mediaDraftMode === "audio" ? (
                <div className="gem-media-controls">
                  <label className="gem-media-label" htmlFor="mediaVoice">
                    Voice profile
                  </label>
                  <select
                    id="mediaVoice"
                    className="gem-media-select"
                    value={mediaAudioVoice}
                    onChange={(event) =>
                      setMediaAudioVoice(event.target.value)
                    }
                  >
                    <option value="astra">Astra — Calm, Mid-range</option>
                    <option value="vanguard">Vanguard — Engaged, Mid-range</option>
                    <option value="lumina">Lumina — Bright, Higher-pitched</option>
                    <option value="aegis">Aegis — Engaged, Deeper</option>
                    <option value="helix">Helix — Energetic, Deeper</option>
                    <option value="serena">Serena — Bright, Higher-pitched</option>
                    <option value="titan">Titan — Bright, Deeper</option>
                    <option value="navigator">Navigator — Engaged, Deeper</option>
                    <option value="pulse">Pulse — Energetic, Mid-range</option>
                    <option value="regal">Regal — British, Higher-pitched</option>
                  </select>
                </div>
              ) : null}

              {mediaDraftMode === "audio" ? (
                <div className="gem-media-controls">
                  <label className="gem-media-label" htmlFor="mediaLanguage">
                    Language hint
                  </label>
                  <select
                    id="mediaLanguage"
                    className="gem-media-select"
                    value={mediaAudioLanguage}
                    onChange={(event) =>
                      setMediaAudioLanguage(event.target.value as "auto" | "en" | "hi" | "ur")
                    }
                  >
                    <option value="auto">Auto detect</option>
                    <option value="en">English</option>
                    <option value="hi">Hindi</option>
                    <option value="ur">Urdu</option>
                  </select>
                </div>
              ) : null}

              <p className="gem-media-hint">
                Short prompt bhi chalega — AI details fill kar dega.
              </p>
              {mediaError ? <p className="gem-media-error">{mediaError}</p> : null}
            </div>

            <footer className="gem-media-modal-actions">
              <button
                type="button"
                className="gem-media-btn ghost"
                onClick={() => setIsMediaModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="gem-media-btn"
                onClick={() => {
                  void handleMediaGenerate();
                }}
                disabled={!mediaDraftPrompt.trim()}
              >
                Generate
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {mediaPreview ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-6"
          onClick={() => setMediaPreview(null)}
        >
          <div
            className="w-full max-w-5xl rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] p-3 sm:p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
              <p className="truncate text-xs text-[var(--muted)]">{mediaPreview.file.filename}</p>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={buildImageDownloadUrl(mediaPreview.file, "jpg")}
                  download
                  className="rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-black"
                >
                  Download JPG
                </a>
                <a
                  href={buildImageDownloadUrl(mediaPreview.file, "svg")}
                  download
                  className="rounded-full border border-[var(--panel-border)] px-4 py-2 text-xs font-semibold text-[var(--foreground)]"
                >
                  Download SVG
                </a>
                <button
                  type="button"
                  onClick={() => setMediaPreview(null)}
                  className="rounded-full border border-[var(--panel-border)] px-3 py-2 text-xs text-[var(--foreground)]"
                >
                  Close
                </button>
              </div>
            </div>
            <img
              src={mediaPreview.url}
              alt={mediaPreview.file.filename}
              className="max-h-[78vh] w-full rounded-xl object-contain bg-black/30"
            />
          </div>
        </div>
      ) : null}

      <div>
          {/* Drawer for mobile and tablet chats */}
          <div
            className={`fixed inset-0 z-30 bg-[var(--backdrop)] backdrop-blur-sm transition-opacity duration-200 xl:hidden ${drawerVisible ? "pointer-events-auto" : "pointer-events-none"}`}
            style={{ opacity: drawerVisible ? 0.3 : 0 }}
            onClick={() => setIsDrawerOpen(false)}
          />
          <div
            ref={drawerPanelRef}
            className={`gem-mobile-drawer fixed inset-y-0 left-0 z-40 xl:hidden ${
              isDrawerOpen ? "pointer-events-auto" : "pointer-events-none"
            }`}
            style={{
              transform: drawerVisible
                ? "translate3d(0, 0, 0)"
                : "translate3d(calc(-100% - 14px), 0, 0)",
            }}
          >
            <div className="gem-mobile-drawer-panel h-full border-r border-[var(--gem-border)] bg-[var(--gem-surface)] p-5 shadow-[0_12px_28px_rgba(15,23,42,0.16)]">
              <div className="mb-3 flex items-center justify-between border-b border-[var(--gem-border)] pb-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--muted)]">RafayGen</p>
                  <p className="text-sm text-[var(--gem-muted)]">Chats</p>
                </div>
                <button
                  type="button"
                  className="gem-drawer-close-btn"
                  onClick={() => setIsDrawerOpen(false)}
                  aria-label="Close drawer"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.12L10.58 12 5.7 16.88a1 1 0 1 0 1.41 1.41L12 13.41l4.89 4.88a1 1 0 0 0 1.41-1.41L13.42 12l4.88-4.88a1 1 0 0 0 0-1.41z" />
                  </svg>
                </button>
              </div>

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={startNewChat}
                  className="gem-drawer-new-chat"
                >
                  <span className="gem-drawer-item-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="M11 5a1 1 0 1 1 2 0v6h6a1 1 0 1 1 0 2h-6v6a1 1 0 1 1-2 0v-6H5a1 1 0 1 1 0-2h6V5z" />
                    </svg>
                  </span>
                  <span className="gem-drawer-item-copy">
                    <span>New chat</span>
                  </span>
                </button>

                {/* Media mode selection */}
                <div>
                  <p className="gem-drawer-section-title">Generate</p>
                  <div className="gem-drawer-media-modes">
                    {(["image", "video", "audio"] as const).map((mode) => {
                      const icons = {
                        image: <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: "currentColor" }}><path d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2zM8.5 13.5l2.5 3 3.5-4.5 4.5 6H5l3.5-4.5z" /></svg>,
                        video: <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: "currentColor" }}><path d="M15 8v8H5V8h10m1-2H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4V6.5l-4 4V7a1 1 0 0 0-1-1z" /></svg>,
                        audio: <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: "currentColor" }}><path d="M4 10.5a1 1 0 1 1 2 0v3a1 1 0 1 1-2 0v-3zm4-3a1 1 0 1 1 2 0v9a1 1 0 1 1-2 0v-9zm4-2a1 1 0 1 1 2 0v13a1 1 0 1 1-2 0v-13zm4 3a1 1 0 1 1 2 0v7a1 1 0 1 1-2 0v-7z" /></svg>,
                      };
                      return (
                        <button
                          key={mode}
                          type="button"
                          className={`gem-drawer-media-btn ${mediaDraftMode === mode ? "gem-drawer-media-btn-active" : ""}`}
                          onClick={() => {
                            setMediaDraftMode(mode);
                            setMediaDraftPrompt("");
                            setIsMediaModalOpen(true);
                            setIsDrawerOpen(false);
                          }}
                        >
                          {icons[mode]}
                          <span>{mode.charAt(0).toUpperCase() + mode.slice(1)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Pricing link */}
                <a
                  href="/pricing"
                  className="gem-drawer-pricing-link"
                  onClick={() => setIsDrawerOpen(false)}
                >
                  <span>⭐ Upgrade Plan</span>
                  <small>View pricing →</small>
                </a>

                {/* Chat list */}
                <p className="gem-drawer-section-title">Recent</p>
                <div className="gem-drawer-list">
                  {orderedChatSessions.length ? (
                    orderedChatSessions.map((entry) => {
                      const isActive = activeChatSession?.id === entry.id;
                      const preview = entry.messages.find((item) => item.role === "user")?.content || "";
                      const compactPreview = preview.replace(/\s+/g, " ").trim();
                      return (
                        <div key={entry.id} className="gem-drawer-list-row">
                          <button
                            type="button"
                            onClick={() => selectChatSession(entry.id)}
                            className={`gem-drawer-list-item ${
                              isActive
                                ? "gem-drawer-list-item-active"
                                : ""
                            }`}
                          >
                            <span className="gem-drawer-item-icon" aria-hidden="true">
                              <svg viewBox="0 0 24 24">
                                <path d="M20 4H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3v3.2a.8.8 0 0 0 1.35.58L12.13 17H20a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 11h-8.17a1 1 0 0 0-.65.24L9 17.16V16a1 1 0 0 0-1-1H4V6h16v9z" />
                              </svg>
                            </span>
                            <span className="gem-drawer-item-copy">
                              <span>{entry.title || "New chat"}</span>
                              <small>{compactPreview || "No messages yet"}</small>
                            </span>
                          </button>
                          <button
                            type="button"
                            className="gem-drawer-delete-btn"
                            aria-label={`Delete chat ${entry.title || "New chat"}`}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              deleteChatSession(entry.id);
                            }}
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M9 3a1 1 0 0 0-.9.55L7.38 5H5a1 1 0 1 0 0 2h.28l.83 11.12A3 3 0 0 0 9.1 21h5.8a3 3 0 0 0 2.99-2.88L18.72 7H19a1 1 0 1 0 0-2h-2.38l-.72-1.45A1 1 0 0 0 15 3H9zm1.62 2 .2-.4h2.36l.2.4h-2.76zM8.29 7h7.42l-.82 11a1 1 0 0 1-1 .94H10.1a1 1 0 0 1-1-.94L8.29 7z" />
                            </svg>
                          </button>
                      </div>
                    );
                  })
                ) : (
                  <p className="rounded-xl border border-dashed border-[var(--panel-border)] p-3 text-xs text-[var(--muted)]">
                    No chats yet.
                  </p>
                )}
                </div>

                {/* Profile section at bottom — click to sign out */}
                {session?.user ? (
                  <button
                    type="button"
                    className="gem-drawer-profile"
                    onClick={() => {
                      setIsDrawerOpen(false);
                      void signOut({ callbackUrl: "/login" });
                    }}
                    title="Sign out"
                  >
                    <span className="gem-drawer-profile-avatar" aria-hidden="true">
                      {(session.user.name || session.user.email || "U").charAt(0).toUpperCase()}
                    </span>
                    <span className="gem-drawer-profile-info">
                      <span className="gem-drawer-profile-name">{session.user.name || session.user.email}</span>
                      <small className="gem-drawer-profile-hint">Tap to sign out</small>
                    </span>
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="gem-drawer-profile-icon">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                    </svg>
                  </button>
                ) : null}

              </div>
            </div>
          </div>
        </div>
    </div>
  );
}
