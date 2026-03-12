"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import { useVoice } from "@/components/studio/providers";

// ── Types ──────────────────────────────────────────────────────────────
type SpeechRecognitionEvent = {
  resultIndex?: number;
  results: Array<{ 0?: { transcript?: string }; isFinal?: boolean }>;
};
type SpeechRecognitionErrorEvent = { error?: string };
type SpeechRecognitionInstance = {
  start: () => void;
  stop: () => void;
  abort: () => void;
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult?: (event: SpeechRecognitionEvent) => void;
  onerror?: (event: SpeechRecognitionErrorEvent) => void;
  onend?: () => void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

function getSpeechRecognitionCtor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/mp4",
  ];
  for (const v of candidates) {
    if (MediaRecorder.isTypeSupported(v)) return v;
  }
  return "";
}

// ── Language presets ───────────────────────────────────────────────────
const LANGUAGES = [
  { label: "Auto detect", value: "auto" },
  { label: "English (US)", value: "en-US" },
  { label: "Urdu (PK)", value: "ur-PK" },
  { label: "Hindi (IN)", value: "hi-IN" },
  { label: "Arabic (SA)", value: "ar-SA" },
  { label: "Spanish (ES)", value: "es-ES" },
  { label: "French (FR)", value: "fr-FR" },
  { label: "German (DE)", value: "de-DE" },
  { label: "Chinese (CN)", value: "zh-CN" },
  { label: "Japanese (JP)", value: "ja-JP" },
  { label: "Korean (KR)", value: "ko-KR" },
  { label: "Russian (RU)", value: "ru-RU" },
  { label: "Turkish (TR)", value: "tr-TR" },
  { label: "Portuguese (BR)", value: "pt-BR" },
];

// ── Audio model options ────────────────────────────────────────────────
const AUDIO_MODELS = [
  { label: "Google TTS (Neural)", value: "google-tts", provider: "Google" },
  { label: "ElevenLabs Turbo v2.5", value: "elevenlabs-turbo", provider: "ElevenLabs" },
  { label: "ElevenLabs Multilingual v2", value: "elevenlabs-multilingual", provider: "ElevenLabs" },
  { label: "OpenAI TTS-1 HD", value: "openai-tts-1-hd", provider: "OpenAI" },
  { label: "OpenAI TTS-1", value: "openai-tts-1", provider: "OpenAI" },
  { label: "Browser Native TTS", value: "browser-tts", provider: "Browser" },
];

// ── Video model options ────────────────────────────────────────────────
const VIDEO_MODELS = [
  { label: "Replicate Wan 2.1 (Text→Video)", value: "wan-2.1", provider: "Replicate" },
  { label: "Replicate Mochi-1", value: "mochi-1", provider: "Replicate" },
  { label: "Replicate Luma Dream Machine", value: "luma-dream", provider: "Replicate" },
  { label: "Replicate Stable Video", value: "stable-video", provider: "Replicate" },
  { label: "Replicate AnimateDiff", value: "animatediff", provider: "Replicate" },
];

// ── Image model options ────────────────────────────────────────────────
// ── HF Chatbot models ─────────────────────────────────────────────────
type HFChatModel = { label: string; value: string; desc: string; tags: string[] };

const HF_CHAT_MODELS: HFChatModel[] = [
  // Google
  { label: "Gemma 3 27B IT", value: "google/gemma-3-27b-it", desc: "Google's best open model, instruction-tuned", tags: ["Google", "Free"] },
  { label: "Gemma 3 12B IT", value: "google/gemma-3-12b-it", desc: "Balanced quality/speed, Google", tags: ["Google", "Free"] },
  { label: "Gemma 3 4B IT", value: "google/gemma-3-4b-it", desc: "Fastest Gemma 3, low credit use", tags: ["Google", "Fast"] },
  { label: "Gemma 2 27B IT", value: "google/gemma-2-27b-it", desc: "Previous gen, highly capable", tags: ["Google"] },
  { label: "Gemma 2 9B IT", value: "google/gemma-2-9b-it", desc: "Small & efficient Gemma 2", tags: ["Google", "Fast"] },
  // Meta Llama
  { label: "Llama 3.3 70B Instruct", value: "meta-llama/Llama-3.3-70B-Instruct", desc: "Meta's flagship open model", tags: ["Meta", "Free"] },
  { label: "Llama 3.1 8B Instruct", value: "meta-llama/Llama-3.1-8B-Instruct", desc: "Very fast & cheap", tags: ["Meta", "Fast"] },
  // Mistral
  { label: "Mistral 7B Instruct v0.3", value: "mistralai/Mistral-7B-Instruct-v0.3", desc: "Fast & free tier friendly", tags: ["Mistral", "Free"] },
  { label: "Mixtral 8x7B Instruct", value: "mistralai/Mixtral-8x7B-Instruct-v0.1", desc: "MoE model, strong reasoning", tags: ["Mistral"] },
  // Microsoft
  { label: "Phi-4 (14B)", value: "microsoft/phi-4", desc: "Microsoft's compact powerhouse", tags: ["Microsoft", "Free"] },
  { label: "Phi-3.5 Mini Instruct", value: "microsoft/Phi-3.5-mini-instruct", desc: "Tiny but mighty, 3.8B", tags: ["Microsoft", "Fast"] },
  // Qwen
  { label: "Qwen2.5 72B Instruct", value: "Qwen/Qwen2.5-72B-Instruct", desc: "Alibaba flagship, multilingual", tags: ["Qwen"] },
  { label: "Qwen2.5 7B Instruct", value: "Qwen/Qwen2.5-7B-Instruct", desc: "Cheap & fast Qwen", tags: ["Qwen", "Fast"] },
  // Community
  { label: "Zephyr 7B Beta", value: "HuggingFaceH4/zephyr-7b-beta", desc: "HF fine-tuned Mistral", tags: ["HF", "Free"] },
  { label: "DeepSeek R1 Distill Qwen 7B", value: "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B", desc: "Reasoning model, cheap tier", tags: ["DeepSeek", "Fast"] },
];

// ── Image models (expanded — cheap HF tier first) ──────────────────────
type ImageBackend = "comfyui" | "hf";

type ImageModelOption = {
  label: string;
  value: string;        // model id / workflow key
  backend: ImageBackend;
  description: string;
};

const IMAGE_MODELS: ImageModelOption[] = [
  // ── ComfyUI workflows ──
  { label: "FLUX.1 Dev (ComfyUI)", value: "flux1-dev", backend: "comfyui", description: "High quality, 20-step FLUX dev workflow" },
  { label: "FLUX.1 Schnell (ComfyUI)", value: "flux1-schnell", backend: "comfyui", description: "Fast 4-step, fastest ComfyUI option" },
  { label: "SDXL Base (ComfyUI)", value: "sdxl-base", backend: "comfyui", description: "Stable Diffusion XL base workflow" },
  { label: "SDXL + Refiner (ComfyUI)", value: "sdxl-refiner", backend: "comfyui", description: "SDXL with refiner pass" },
  { label: "SD 1.5 (ComfyUI)", value: "sd15", backend: "comfyui", description: "Classic SD 1.5 — fast & lightweight" },
  { label: "DreamShaper 8 (ComfyUI)", value: "dreamshaper8", backend: "comfyui", description: "Popular SD finetune, great for art" },
  // ── HuggingFace — CHEAPEST / FREE TIER ──
  { label: "⚡ SD v1.4 (HF) — Cheapest", value: "CompVis/stable-diffusion-v1-4", backend: "hf", description: "Original SD — minimal credit usage, nearly free" },
  { label: "⚡ SD 1.5 (HF) — Cheap", value: "runwayml/stable-diffusion-v1-5", backend: "hf", description: "Classic SD1.5 — very cheap & fast" },
  { label: "⚡ SD 2.1 (HF) — Cheap", value: "stabilityai/stable-diffusion-2-1", backend: "hf", description: "Better than 1.5, still very cheap" },
  { label: "⚡ DreamShaper 8 (HF)", value: "Lykon/dreamshaper-8", backend: "hf", description: "SD1.5 finetune — cheap & beautiful results" },
  { label: "⚡ Realistic Vision v6 (HF)", value: "SG161222/Realistic_Vision_V6.0_B1_noVAE", backend: "hf", description: "Photorealistic SD1.5 finetune — cheap" },
  { label: "⚡ AbsoluteReality v1.8 (HF)", value: "digiplay/AbsoluteReality_v1.8.1", backend: "hf", description: "Ultra realistic SD1.5 based — cheap" },
  { label: "⚡ Waifu Diffusion v1.4 (HF)", value: "hakurei/waifu-diffusion", backend: "hf", description: "Anime style — very cheap SD1.4 based" },
  { label: "⚡ Pixel Art XL (HF)", value: "nerijs/pixel-art-xl", backend: "hf", description: "Pixel art style SDXL finetune" },
  { label: "⚡ OpenJourney v4 (HF)", value: "prompthero/openjourney-v4", backend: "hf", description: "Midjourney-style SD1.5 — cheap" },
  { label: "⚡ Kandinsky 2.1 (HF)", value: "kandinsky-community/kandinsky-2-1", backend: "hf", description: "Unique artistic style, low cost" },
  // ── HuggingFace — MID TIER ──
  { label: "SDXL Base (HF)", value: "stabilityai/stable-diffusion-xl-base-1.0", backend: "hf", description: "SDXL Base via HF Inference API" },
  { label: "Playground v2.5 (HF)", value: "playgroundai/playground-v2.5-1024px-aesthetic", backend: "hf", description: "Aesthetic quality, 1024px output" },
  { label: "RealVisXL v4 (HF)", value: "SG161222/RealVisXL_V4.0", backend: "hf", description: "Photorealistic SDXL finetune" },
  { label: "Kandinsky 2.2 (HF)", value: "kandinsky-community/kandinsky-2-2-decoder", backend: "hf", description: "DALL-E style unique outputs" },
  // ── HuggingFace — PREMIUM / FLUX ──
  { label: "⚡ SDXL-Lightning 4-step (HF)", value: "ByteDance/SDXL-Lightning", backend: "hf", description: "4-step SDXL — ultra fast, minimal credits" },
  { label: "⚡ SDXL Turbo (HF)", value: "stabilityai/sdxl-turbo", backend: "hf", description: "4 steps — near zero credit, HD output" },
  { label: "⚡ LCM-SDXL (HF)", value: "latent-consistency/lcm-sdxl", backend: "hf", description: "6-step LCM — SDXL quality, fraction of cost" },
  { label: "⚡ SSD-1B Distilled (HF)", value: "segmind/SSD-1B", backend: "hf", description: "SDXL distilled — 60% faster, HD, very cheap" },
  { label: "⚡ ZImage LoRA (HF)", value: "Purz/zimage", backend: "hf", description: "ZImage LoRA — sharp HD, low steps, cheap" },
  { label: "🔥 FLUX.1 Schnell (HF)", value: "black-forest-labs/FLUX.1-schnell", backend: "hf", description: "Fastest FLUX, 4 steps — best value" },
  { label: "🔥 FLUX.1 Dev (HF)", value: "black-forest-labs/FLUX.1-dev", backend: "hf", description: "High quality FLUX — needs HF Pro" },
  { label: "🔥 SD 3.5 Large Turbo (HF)", value: "stabilityai/stable-diffusion-3.5-large-turbo", backend: "hf", description: "SD 3.5 Turbo — fewer steps, faster" },
  { label: "🔥 SD 3.5 Large (HF)", value: "stabilityai/stable-diffusion-3.5-large", backend: "hf", description: "Best SD quality, higher credit use" },
];

// ── ComfyUI workflow builder ───────────────────────────────────────────
function buildComfyWorkflow(workflowKey: string, prompt: string): Record<string, unknown> {
  const ckptMap: Record<string, string> = {
    "flux1-dev": "flux1-dev.safetensors",
    "flux1-schnell": "flux1-schnell.safetensors",
    "sdxl-base": "sd_xl_base_1.0.safetensors",
    "sdxl-refiner": "sd_xl_base_1.0.safetensors",
    "sd15": "v1-5-pruned-emaonly.safetensors",
  };
  const ckpt = ckptMap[workflowKey] || "flux1-schnell.safetensors";
  const isFlux = workflowKey.startsWith("flux");
  const steps = workflowKey === "flux1-schnell" ? 4 : workflowKey === "sd15" ? 20 : 25;
  const cfg = isFlux ? 1 : 7;
  const sampler = isFlux ? "euler" : "dpmpp_2m";
  const scheduler = isFlux ? "simple" : "karras";

  return {
    "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: ckpt } },
    "2": {
      class_type: "CLIPTextEncode",
      inputs: { text: prompt, clip: ["1", 1] },
    },
    "3": {
      class_type: "CLIPTextEncode",
      inputs: { text: "blurry, distorted, ugly, watermark, low quality", clip: ["1", 1] },
    },
    "4": {
      class_type: "EmptyLatentImage",
      inputs: { width: 1024, height: 1024, batch_size: 1 },
    },
    "5": {
      class_type: "KSampler",
      inputs: {
        model: ["1", 0],
        positive: ["2", 0],
        negative: ["3", 0],
        latent_image: ["4", 0],
        seed: Math.floor(Math.random() * 999999999),
        steps,
        cfg,
        sampler_name: sampler,
        scheduler,
        denoise: 1,
      },
    },
    "6": { class_type: "VAEDecode", inputs: { samples: ["5", 0], vae: ["1", 2] } },
    "7": {
      class_type: "SaveImage",
      inputs: { images: ["6", 0], filename_prefix: "rafaygen_" },
    },
  };
}

async function pollComfyHistory(base: string, promptId: string, maxWait = 120_000): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await new Promise((r) => setTimeout(r, 2000));
    const res = await fetch(`${base}/history/${promptId}`);
    if (!res.ok) continue;
    const data = (await res.json()) as Record<string, {
      outputs?: Record<string, { images?: Array<{ filename: string; subfolder: string; type: string }> }>;
      status?: { completed?: boolean };
    }>;
    const entry = data[promptId];
    if (!entry?.status?.completed) continue;
    // Find first image output
    for (const nodeOut of Object.values(entry.outputs ?? {})) {
      const imgs = nodeOut.images;
      if (imgs && imgs.length > 0) {
        const img = imgs[0];
        return `${base}/view?filename=${img.filename}&subfolder=${img.subfolder}&type=${img.type}`;
      }
    }
    break;
  }
  throw new Error("ComfyUI timed out or no image output found.");
}

// ── Component ──────────────────────────────────────────────────────────
type VoicePanelProps = {
  onSubmitTranscript: (text: string, lang: string) => Promise<string>;
};

type ActiveTab = "voice" | "hf-chat" | "audio-gen" | "video-gen" | "image-gen";

// ── Browser TTS fallback ───────────────────────────────────────────────
function speakWithBrowser(text: string, lang: string): Promise<void> {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) { resolve(); return; }
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = lang === "auto" ? navigator.language || "en-US" : lang;
    utt.rate = 1.1;
    utt.onend = () => resolve();
    utt.onerror = () => resolve();
    window.speechSynthesis.speak(utt);
  });
}

export function VoicePanel({ onSubmitTranscript }: VoicePanelProps) {
  const {
    isPanelOpen, voiceState, transcript, language,
    closePanel, setVoiceState, setTranscript, setLanguage, clearTranscript,
  } = useVoice();

  const [activeTab, setActiveTab] = useState<ActiveTab>("voice");
  const [panelError, setPanelError] = useState<string | null>(null);
  const [aiResponse, setAiResponse] = useState("");
  const [ttsModel, setTtsModel] = useState("browser-tts");
  const [videoModel, setVideoModel] = useState("wan-2.1");
  const [imageModel, setImageModel] = useState("black-forest-labs/FLUX.1-schnell");
  const [imageBackend, setImageBackend] = useState<ImageBackend>("hf");
  const [hfToken, setHfToken] = useState("");
  // ── HF Chatbot state ──
  const [chatModel, setChatModel] = useState("google/gemma-3-4b-it");
  const [chatMessages, setChatMessages] = useState<Array<{role:"user"|"assistant"; content:string}>>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string|null>(null);
  const [comfyuiUrl, setComfyuiUrl] = useState("http://localhost:8188");
  const [audioPrompt, setAudioPrompt] = useState("");
  const [videoPrompt, setVideoPrompt] = useState("");
  const [imagePrompt, setImagePrompt] = useState("");
  const [generatingAudio, setGeneratingAudio] = useState(false);
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [generatedAudioUrl, setGeneratedAudioUrl] = useState("");
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState("");
  const [generatedImageUrl, setGeneratedImageUrl] = useState("");
  const [interimText, setInterimText] = useState("");

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const busyRef = useRef(false);
  const restartRef = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recorderRef = useRef<MediaRecorder | null>(null);

  const supportsSR = useMemo(() => Boolean(getSpeechRecognitionCtor()), []);

  // ── Waveform ──────────────────────────────────────────────────────────
  const stopWaveform = useCallback(() => {
    if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null; }
    analyserRef.current = null;
    if (audioCtxRef.current) { void audioCtxRef.current.close().catch(() => {}); audioCtxRef.current = null; }
  }, []);

  const drawWave = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const draw = () => {
      analyser.getByteTimeDomainData(data);
      const { width: w, height: h } = canvas;
      ctx.clearRect(0, 0, w, h);
      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, "rgba(96,165,250,0.9)");
      grad.addColorStop(0.5, "rgba(167,139,250,0.9)");
      grad.addColorStop(1, "rgba(96,165,250,0.9)");
      ctx.lineWidth = 2;
      ctx.strokeStyle = grad;
      ctx.beginPath();
      const sliceW = w / data.length;
      let x = 0;
      for (let i = 0; i < data.length; i++) {
        const y = (data[i] / 128.0) * (h / 2);
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
        x += sliceW;
      }
      ctx.lineTo(w, h / 2);
      ctx.stroke();
      animFrameRef.current = requestAnimationFrame(draw);
    };
    draw();
  }, []);

  const startWave = useCallback(async (stream: MediaStream) => {
    stopWaveform();
    if (!window.AudioContext) return;
    const ac = new AudioContext();
    const src = ac.createMediaStreamSource(stream);
    const an = ac.createAnalyser(); an.fftSize = 1024;
    src.connect(an);
    audioCtxRef.current = ac; analyserRef.current = an;
    drawWave();
  }, [drawWave, stopWaveform]);

  // ── TTS playback ──────────────────────────────────────────────────────
  const speak = useCallback(async (text: string, lang: string) => {
    setVoiceState("speaking");
    try {
      if (ttsModel === "browser-tts") {
        await speakWithBrowser(text, lang);
      } else {
        const res = await fetch("/api/voice/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, language: lang, model: ttsModel }),
        });
        if (res.ok) {
          const { audioUrl } = (await res.json()) as { audioUrl?: string };
          if (audioUrl) {
            await new Promise<void>((resolve) => {
              const player = new Audio(audioUrl);
              audioPlayerRef.current = player;
              player.onended = () => resolve();
              player.onerror = () => resolve();
              player.play().catch(() => resolve());
            });
            audioPlayerRef.current = null;
          } else {
            await speakWithBrowser(text, lang);
          }
        } else {
          // Fallback to browser
          await speakWithBrowser(text, lang);
        }
      }
    } catch {
      await speakWithBrowser(text, lang);
    }
  }, [ttsModel, setVoiceState]);

  // ── Process transcript → AI → TTS (near 0-delay pipeline) ────────────
  const processTranscript = useCallback(async (text: string, lang: string) => {
    const clean = text.trim();
    if (!clean || busyRef.current) return;
    busyRef.current = true;
    restartRef.current = true;
    setPanelError(null);
    setVoiceState("processing");
    setTranscript(clean);
    setAiResponse("");
    try {
      // Fire AI request immediately - zero artificial delay
      const responseText = await onSubmitTranscript(clean, lang || language);
      setAiResponse(responseText);
      if (responseText.trim()) {
        await speak(responseText, lang || language);
      }
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : String(err));
    } finally {
      busyRef.current = false;
      if (restartRef.current) setVoiceState("listening");
    }
  }, [language, onSubmitTranscript, speak, setTranscript, setVoiceState]);

  // ── Start speech recognition ──────────────────────────────────────────
  const startSR = useCallback(async () => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) throw new Error("Speech Recognition not supported.");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaStreamRef.current = stream;
    await startWave(stream);

    const rec = new Ctor();
    const effectiveLang = language !== "auto"
      ? language
      : (navigator.languages?.[0] || navigator.language || "en-US");
    rec.lang = effectiveLang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (ev: SpeechRecognitionEvent) => {
      const start = typeof ev.resultIndex === "number" ? ev.resultIndex : 0;
      let interim = "";
      let final = "";
      for (let i = start; i < ev.results.length; i++) {
        const r = ev.results[i];
        const t = (r?.[0]?.transcript || "").trim();
        if (!t) continue;
        if (r?.isFinal) {
          final += " " + t;
        } else {
          interim += " " + t;
        }
      }
      if (interim.trim()) setInterimText(interim.trim());
      if (final.trim()) {
        setInterimText("");
        void processTranscript(final.trim(), effectiveLang);
      }
    };

    rec.onerror = (ev: SpeechRecognitionErrorEvent) => {
      if (ev.error !== "no-speech") setPanelError(`Voice error: ${ev.error || "unknown"}`);
    };

    rec.onend = () => {
      recognitionRef.current = null;
      if (!restartRef.current || busyRef.current) return;
      // Auto-restart with tiny delay to prevent CPU spin
      setTimeout(() => {
        void startSR().catch((e) => {
          setPanelError(e instanceof Error ? e.message : String(e));
          setVoiceState("idle");
        });
      }, 150);
    };

    recognitionRef.current = rec;
    rec.start();
  }, [language, processTranscript, setVoiceState, startWave]);

  // ── Recorder fallback (non-Chrome) ────────────────────────────────────
  const startRecorder = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaStreamRef.current = stream;
    await startWave(stream);
    const mime = pickMimeType();
    const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    chunksRef.current = [];
    rec.ondataavailable = (e) => { if (e.data?.size) chunksRef.current.push(e.data); };
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
      chunksRef.current = [];
      if (!blob.size) return;
      void (async () => {
        setVoiceState("processing");
        const form = new FormData();
        form.append("audio", new File([blob], "voice.webm", { type: blob.type }));
        form.append("language", language !== "auto" ? language : navigator.language || "en-US");
        try {
          const res = await fetch("/api/voice/stream", { method: "POST", body: form });
          if (!res.ok) throw new Error(await res.text());
          const { transcript: t, language: l } = (await res.json()) as { transcript?: string; language?: string };
          if (t?.trim()) {
            setTranscript(t.trim());
            await processTranscript(t.trim(), l || language);
          }
        } catch (e) {
          setPanelError(e instanceof Error ? e.message : String(e));
          setVoiceState("idle");
        }
      })();
    };
    recorderRef.current = rec;
    rec.start();
  }, [language, processTranscript, setTranscript, setVoiceState, startWave]);

  // ── Controls ──────────────────────────────────────────────────────────
  const stopTracks = useCallback(() => {
    recorderRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    stopWaveform();
  }, [stopWaveform]);

  const startListening = useCallback(async () => {
    if (voiceState === "listening") return;
    restartRef.current = true;
    setPanelError(null);
    setAiResponse("");
    setVoiceState("listening");
    try {
      if (supportsSR) await startSR();
      else await startRecorder();
    } catch (e) {
      setPanelError(e instanceof Error ? e.message : String(e));
      setVoiceState("idle");
      stopTracks();
    }
  }, [setVoiceState, startSR, startRecorder, stopTracks, supportsSR, voiceState]);

  const pauseListening = useCallback(() => {
    restartRef.current = false;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    if (recorderRef.current?.state === "recording") recorderRef.current.pause();
    setVoiceState("paused");
  }, [setVoiceState]);

  const resumeListening = useCallback(() => {
    if (voiceState !== "paused") return;
    if (recorderRef.current?.state === "paused") {
      recorderRef.current.resume();
      setVoiceState("listening");
      return;
    }
    void startListening();
  }, [setVoiceState, startListening, voiceState]);

  const stopListening = useCallback(() => {
    restartRef.current = false;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    stopTracks();
    audioPlayerRef.current?.pause();
    audioPlayerRef.current = null;
    window.speechSynthesis?.cancel();
    setVoiceState("idle");
  }, [setVoiceState, stopTracks]);

  // ── Media generation ──────────────────────────────────────────────────
  const sendHFChat = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    if (!hfToken.trim()) { setChatError("HuggingFace token required."); return; }
    const userMsg = { role: "user" as const, content: text };
    const newMsgs = [...chatMessages, userMsg];
    setChatMessages(newMsgs);
    setChatInput("");
    setChatLoading(true);
    setChatError(null);
    try {
      const res = await fetch(
        `https://api-inference.huggingface.co/models/${chatModel}/v1/chat/completions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${hfToken.trim()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: chatModel,
            messages: newMsgs,
            max_tokens: 1024,
            stream: false,
          }),
        }
      );
      if (!res.ok) throw new Error(`HF error ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const reply = data.choices?.[0]?.message?.content?.trim() || "(no response)";
      setChatMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (e) {
      setChatError(e instanceof Error ? e.message : String(e));
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, chatLoading, chatMessages, chatModel, hfToken]);

  const generateAudio = useCallback(async () => {
    if (!audioPrompt.trim()) return;
    setGeneratingAudio(true); setGeneratedAudioUrl(""); setPanelError(null);
    try {
      const res = await fetch("/api/generate/audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: audioPrompt, model: ttsModel }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { url } = (await res.json()) as { url?: string };
      if (url) setGeneratedAudioUrl(url);
    } catch (e) {
      setPanelError(e instanceof Error ? e.message : String(e));
    } finally {
      setGeneratingAudio(false);
    }
  }, [audioPrompt, ttsModel]);

  const generateVideo = useCallback(async () => {
    if (!videoPrompt.trim()) return;
    setGeneratingVideo(true); setGeneratedVideoUrl(""); setPanelError(null);
    try {
      const res = await fetch("/api/generate/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: videoPrompt, model: videoModel }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { url } = (await res.json()) as { url?: string };
      if (url) setGeneratedVideoUrl(url);
    } catch (e) {
      setPanelError(e instanceof Error ? e.message : String(e));
    } finally {
      setGeneratingVideo(false);
    }
  }, [videoPrompt, videoModel]);

  const generateImage = useCallback(async () => {
    if (!imagePrompt.trim()) return;
    setGeneratingImage(true); setGeneratedImageUrl(""); setPanelError(null);
    try {
      if (imageBackend === "hf") {
        // ── HuggingFace Inference API ─────────────────────────────
        if (!hfToken.trim()) throw new Error("HuggingFace token required. Enter it in the settings panel.");
        const res = await fetch(
          `https://api-inference.huggingface.co/models/${imageModel}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${hfToken.trim()}`,
              "Content-Type": "application/json",
              "x-wait-for-model": "true",
            },
            body: JSON.stringify({
              inputs: imagePrompt,
              parameters: { num_inference_steps: 4, guidance_scale: 0.0 },
            }),
          }
        );
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`HF API error: ${errText}`);
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        setGeneratedImageUrl(url);
      } else {
        // ── ComfyUI API ───────────────────────────────────────────
        const base = comfyuiUrl.replace(/\/$/, "");
        // Build a minimal ComfyUI workflow based on selected model
        const workflow = buildComfyWorkflow(imageModel, imagePrompt);
        const promptRes = await fetch(`${base}/prompt`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: workflow }),
        });
        if (!promptRes.ok) throw new Error(`ComfyUI error: ${await promptRes.text()}`);
        const { prompt_id } = (await promptRes.json()) as { prompt_id: string };
        // Poll for completion
        const imageUrl = await pollComfyHistory(base, prompt_id);
        setGeneratedImageUrl(imageUrl);
      }
    } catch (e) {
      setPanelError(e instanceof Error ? e.message : String(e));
    } finally {
      setGeneratingImage(false);
    }
  }, [imagePrompt, imageModel, imageBackend, hfToken, comfyuiUrl]);

  // ── Lifecycle ─────────────────────────────────────────────────────────
  // Sync chatModel when model-selector broadcasts a change
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: Event) => {
      const model = (e as CustomEvent<string>).detail;
      if (model) setChatModel(model);
    };
    window.addEventListener("rafaygen:hfChatModel", handler);
    return () => window.removeEventListener("rafaygen:hfChatModel", handler);
  }, []);

  useEffect(() => {
    if (!isPanelOpen) { stopListening(); clearTranscript(); setAiResponse(""); setPanelError(null); }
  }, [clearTranscript, isPanelOpen, stopListening]);

  useEffect(() => () => { stopListening(); stopWaveform(); }, [stopListening, stopWaveform]);

  useEffect(() => {
    if (!isPanelOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closePanel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closePanel, isPanelOpen]);

  if (!isPanelOpen) return null;

  // ── State label + color ───────────────────────────────────────────────
  const stateLabel: Record<typeof voiceState, string> = {
    idle: "Idle — tap Start",
    listening: "🎤 Listening...",
    processing: "⚡ Processing...",
    speaking: "🔊 Speaking...",
    paused: "⏸ Paused",
  };
  const stateColor: Record<typeof voiceState, string> = {
    idle: "text-[var(--muted)]",
    listening: "text-green-400",
    processing: "text-yellow-400",
    speaking: "text-blue-400",
    paused: "text-orange-400",
  };

  const tabs: { key: ActiveTab; label: string }[] = [
    { key: "voice", label: "🎤 Voice" },
    { key: "hf-chat", label: "🤗 HF Chat" },
    { key: "audio-gen", label: "🎵 Audio Gen" },
    { key: "video-gen", label: "🎬 Video Gen" },
    { key: "image-gen", label: "🖼️ Image Gen" },
  ];

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 px-3 py-3 backdrop-blur-sm sm:px-5 sm:py-5">
      <section className="flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] shadow-[0_24px_80px_rgba(0,0,0,0.5)]">

        {/* Header */}
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--panel-border)] px-4 py-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">RafayGen Studio</p>
            <h2 className="text-base font-bold text-[var(--foreground)]">Voice · Audio · Video · Image</h2>
          </div>
          <button
            type="button"
            onClick={closePanel}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--panel-border)] text-[var(--muted)] transition hover:bg-[var(--panel-soft)] hover:text-[var(--foreground)]"
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current"><path d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 1 0 5.7 7.12L10.58 12 5.7 16.88a1 1 0 1 0 1.41 1.41L12 13.41l4.89 4.88a1 1 0 0 0 1.41-1.41L13.42 12l4.88-4.88a1 1 0 0 0 0-1.41Z" /></svg>
          </button>
        </header>

        {/* Tabs */}
        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-[var(--panel-border)] px-3 py-2">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                activeTab === t.key
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--muted)] hover:bg-[var(--panel-soft)] hover:text-[var(--foreground)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Error */}
        {panelError && (
          <div className="shrink-0 mx-4 mt-3 rounded-lg bg-[rgba(255,107,107,0.12)] px-3 py-2 text-xs text-[var(--danger)]">
            {panelError}
          </div>
        )}

        {/* ── VOICE TAB ── */}
        {activeTab === "voice" && (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 sm:flex-row sm:p-4">

            {/* Left: waveform + transcript */}
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              {/* Waveform */}
              <div className="rounded-xl border border-[var(--panel-border)] bg-[rgba(0,0,0,0.2)] p-2">
                <canvas ref={canvasRef} width={1200} height={200} className="h-28 w-full rounded-lg" />
              </div>

              {/* State + interim */}
              <div className="flex items-center gap-2">
                <span className={`text-sm font-semibold ${stateColor[voiceState]}`}>
                  {stateLabel[voiceState]}
                </span>
                {interimText && (
                  <span className="truncate text-xs italic text-[var(--muted)]">{`"${interimText}"`}</span>
                )}
              </div>

              {/* Transcript / response */}
              <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-[var(--panel-border)] bg-[rgba(255,255,255,0.02)] p-3">
                {transcript && (
                  <div className="mb-2">
                    <p className="mb-1 text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">You said</p>
                    <p className="text-sm leading-relaxed text-[var(--foreground)]">{transcript}</p>
                  </div>
                )}
                {aiResponse && (
                  <div>
                    <p className="mb-1 text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">AI response</p>
                    <p className="text-sm leading-relaxed text-[var(--foreground)]">{aiResponse}</p>
                  </div>
                )}
                {!transcript && !aiResponse && (
                  <p className="text-xs text-[var(--muted)]">Start speaking — response plays instantly in the same language.</p>
                )}
              </div>
            </div>

            {/* Right: controls */}
            <div className="flex w-full shrink-0 flex-col gap-3 sm:w-56">

              {/* Language selector */}
              <div>
                <p className="mb-1 text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">Language</p>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full rounded-lg border border-[var(--panel-border)] bg-[var(--panel)] px-2 py-2 text-xs text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </select>
              </div>

              {/* TTS model */}
              <div>
                <p className="mb-1 text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">Voice model (TTS)</p>
                <select
                  value={ttsModel}
                  onChange={(e) => setTtsModel(e.target.value)}
                  className="w-full rounded-lg border border-[var(--panel-border)] bg-[var(--panel)] px-2 py-2 text-xs text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                >
                  {AUDIO_MODELS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>

              {/* Controls */}
              <div className="mt-auto grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void startListening()}
                  disabled={voiceState === "listening"}
                  className="rounded-lg bg-[var(--accent)] px-2 py-2.5 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-40"
                >
                  ▶ Start
                </button>
                <button
                  type="button"
                  onClick={voiceState === "paused" ? resumeListening : pauseListening}
                  className="rounded-lg border border-[var(--panel-border)] px-2 py-2.5 text-xs text-[var(--foreground)] transition hover:bg-[var(--panel-soft)]"
                >
                  {voiceState === "paused" ? "▶ Resume" : "⏸ Pause"}
                </button>
                <button
                  type="button"
                  onClick={stopListening}
                  className="rounded-lg border border-[var(--panel-border)] px-2 py-2.5 text-xs text-[var(--foreground)] transition hover:bg-[var(--panel-soft)]"
                >
                  ■ Stop
                </button>
                <button
                  type="button"
                  onClick={() => { clearTranscript(); setAiResponse(""); setInterimText(""); }}
                  className="rounded-lg border border-[var(--panel-border)] px-2 py-2.5 text-xs text-[var(--muted)] transition hover:bg-[var(--panel-soft)]"
                >
                  🗑 Clear
                </button>
              </div>
            </div>
          </div>
        )}


        {/* ── HF CHAT TAB ── */}
        {activeTab === "hf-chat" && (
          <div className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden">
            {/* Config row */}
            <div className="flex shrink-0 flex-wrap gap-2 border-b border-[var(--panel-border)] p-3">
              {/* Token */}
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">HF Token</p>
                <input
                  type="password"
                  value={hfToken}
                  onChange={(e) => setHfToken(e.target.value)}
                  className="w-full rounded-lg border border-[var(--panel-border)] bg-[var(--panel-soft)] px-2 py-1.5 text-xs text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                  placeholder="hf_xxxxxxxxxxxx"
                />
              </div>
              {/* Model selector */}
              <div className="flex min-w-[200px] flex-1 flex-col gap-1">
                <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">Chat Model</p>
                <select
                  value={chatModel}
                  onChange={(e) => setChatModel(e.target.value)}
                  className="w-full rounded-lg border border-[var(--panel-border)] bg-[var(--panel)] px-2 py-1.5 text-xs text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                >
                  {HF_CHAT_MODELS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label} [{m.tags.join(", ")}]
                    </option>
                  ))}
                </select>
                {(() => {
                  const active = HF_CHAT_MODELS.find((m) => m.value === chatModel);
                  return active ? (
                    <p className="text-[10px] text-[var(--muted)]">{active.desc}</p>
                  ) : null;
                })()}
              </div>
              <button
                type="button"
                onClick={() => { setChatMessages([]); setChatError(null); }}
                className="self-end rounded-lg border border-[var(--panel-border)] px-2 py-1.5 text-xs text-[var(--muted)] transition hover:bg-[var(--panel-soft)]"
              >
                🗑 Clear
              </button>
            </div>

            {/* Messages */}
            <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-3">
              {chatError && (
                <div className="rounded-lg bg-[rgba(255,107,107,0.12)] px-3 py-2 text-xs text-[var(--danger)]">{chatError}</div>
              )}
              {chatMessages.length === 0 && !chatLoading && (
                <p className="text-center text-xs text-[var(--muted)] pt-8">
                  Start chatting with {HF_CHAT_MODELS.find((m) => m.value === chatModel)?.label ?? chatModel}
                </p>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "rounded-br-sm bg-[var(--accent)] text-white"
                        : "rounded-bl-sm border border-[var(--panel-border)] bg-[var(--panel-soft)] text-[var(--foreground)]"
                    }`}
                  >
                    <p className="mb-0.5 text-[9px] font-bold uppercase tracking-widest opacity-60">
                      {msg.role === "user" ? "You" : chatModel.split("/").pop()}
                    </p>
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-bl-sm border border-[var(--panel-border)] bg-[var(--panel-soft)] px-4 py-3">
                    <span className="flex gap-1">
                      {[0,1,2].map((i) => (
                        <span
                          key={i}
                          className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] opacity-70"
                          style={{ animation: `bounce 1.2s ${i*0.2}s infinite` }}
                        />
                      ))}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="shrink-0 border-t border-[var(--panel-border)] p-3">
              <div className="flex gap-2">
                <textarea
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendHFChat(); }
                  }}
                  rows={2}
                  className="flex-1 resize-none rounded-xl border border-[var(--panel-border)] bg-[var(--panel-soft)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                  placeholder="Ask anything... (Enter to send, Shift+Enter for newline)"
                />
                <button
                  type="button"
                  onClick={() => void sendHFChat()}
                  disabled={chatLoading || !chatInput.trim() || !hfToken.trim()}
                  className="rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-40"
                >
                  {chatLoading ? "..." : "➤"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── AUDIO GEN TAB ── */}
        {activeTab === "audio-gen" && (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">Audio / Voice Model</p>
              <select
                value={ttsModel}
                onChange={(e) => setTtsModel(e.target.value)}
                className="w-full rounded-lg border border-[var(--panel-border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
              >
                {AUDIO_MODELS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label} ({m.provider})</option>
                ))}
              </select>
            </div>
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">Text to speak / audio prompt</p>
              <textarea
                value={audioPrompt}
                onChange={(e) => setAudioPrompt(e.target.value)}
                rows={4}
                className="w-full resize-none rounded-lg border border-[var(--panel-border)] bg-[var(--panel-soft)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                placeholder="Type text to convert to speech..."
              />
            </div>
            <button
              type="button"
              onClick={() => void generateAudio()}
              disabled={generatingAudio || !audioPrompt.trim()}
              className="rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-40"
            >
              {generatingAudio ? "Generating..." : "🎵 Generate Audio"}
            </button>
            {generatedAudioUrl && (
              <div className="rounded-xl border border-[var(--panel-border)] p-3">
                <p className="mb-2 text-xs font-semibold text-[var(--muted)]">Generated Audio</p>
                <audio controls src={generatedAudioUrl} className="w-full" />
                <a href={generatedAudioUrl} download className="mt-2 inline-block text-xs text-[var(--accent)] underline">Download</a>
              </div>
            )}
          </div>
        )}

        {/* ── VIDEO GEN TAB ── */}
        {activeTab === "video-gen" && (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">Video Model</p>
              <select
                value={videoModel}
                onChange={(e) => setVideoModel(e.target.value)}
                className="w-full rounded-lg border border-[var(--panel-border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
              >
                {VIDEO_MODELS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label} ({m.provider})</option>
                ))}
              </select>
            </div>
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">Video prompt</p>
              <textarea
                value={videoPrompt}
                onChange={(e) => setVideoPrompt(e.target.value)}
                rows={4}
                className="w-full resize-none rounded-lg border border-[var(--panel-border)] bg-[var(--panel-soft)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                placeholder="A cinematic shot of... describe your video"
              />
            </div>
            <button
              type="button"
              onClick={() => void generateVideo()}
              disabled={generatingVideo || !videoPrompt.trim()}
              className="rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-40"
            >
              {generatingVideo ? "Generating (may take ~30s)..." : "🎬 Generate Video"}
            </button>
            {generatedVideoUrl && (
              <div className="rounded-xl border border-[var(--panel-border)] p-3">
                <p className="mb-2 text-xs font-semibold text-[var(--muted)]">Generated Video</p>
                <video controls src={generatedVideoUrl} className="w-full rounded-lg" />
                <a href={generatedVideoUrl} download className="mt-2 inline-block text-xs text-[var(--accent)] underline">Download</a>
              </div>
            )}
          </div>
        )}

        {/* ── IMAGE GEN TAB ── */}
        {activeTab === "image-gen" && (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">

            {/* Backend toggle */}
            <div>
              <p className="mb-2 text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">Generation Backend</p>
              <div className="flex gap-2">
                {(["hf", "comfyui"] as ImageBackend[]).map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => {
                      setImageBackend(b);
                      // auto-select first model for that backend
                      const first = IMAGE_MODELS.find((m) => m.backend === b);
                      if (first) setImageModel(first.value);
                    }}
                    className={`flex-1 rounded-lg border px-3 py-2 text-xs font-bold transition ${
                      imageBackend === b
                        ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                        : "border-[var(--panel-border)] text-[var(--muted)] hover:bg-[var(--panel-soft)]"
                    }`}
                  >
                    {b === "hf" ? "🤗 HuggingFace" : "⚙️ ComfyUI"}
                  </button>
                ))}
              </div>
            </div>

            {/* HF token input */}
            {imageBackend === "hf" && (
              <div>
                <p className="mb-1 text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">HuggingFace Token</p>
                <input
                  type="password"
                  value={hfToken}
                  onChange={(e) => setHfToken(e.target.value)}
                  className="w-full rounded-lg border border-[var(--panel-border)] bg-[var(--panel-soft)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                  placeholder="hf_xxxxxxxxxxxxxxxxxxxxxxxx"
                />
                <p className="mt-1 text-[10px] text-[var(--muted)]">
                  Get free token at{" "}
                  <a href="https://huggingface.co/settings/tokens" target="_blank" rel="noreferrer" className="text-[var(--accent)] underline">
                    huggingface.co/settings/tokens
                  </a>
                </p>
              </div>
            )}

            {/* ComfyUI URL input */}
            {imageBackend === "comfyui" && (
              <div>
                <p className="mb-1 text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">ComfyUI Server URL</p>
                <input
                  type="text"
                  value={comfyuiUrl}
                  onChange={(e) => setComfyuiUrl(e.target.value)}
                  className="w-full rounded-lg border border-[var(--panel-border)] bg-[var(--panel-soft)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                  placeholder="http://localhost:8188"
                />
                <p className="mt-1 text-[10px] text-[var(--muted)]">
                  ComfyUI must be running locally or accessible via network.
                  Make sure the selected model checkpoint is installed.
                </p>
              </div>
            )}

            {/* Model selector — filtered by backend */}
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
                {imageBackend === "hf" ? "HuggingFace Model" : "ComfyUI Workflow"}
              </p>
              <select
                value={imageModel}
                onChange={(e) => setImageModel(e.target.value)}
                className="w-full rounded-lg border border-[var(--panel-border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
              >
                {IMAGE_MODELS.filter((m) => m.backend === imageBackend).map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              {/* Model description */}
              {(() => {
                const active = IMAGE_MODELS.find((m) => m.value === imageModel);
                return active ? (
                  <p className="mt-1 text-[11px] text-[var(--muted)]">{active.description}</p>
                ) : null;
              })()}
            </div>

            {/* Prompt */}
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">Image Prompt</p>
              <textarea
                value={imagePrompt}
                onChange={(e) => setImagePrompt(e.target.value)}
                rows={3}
                className="w-full resize-none rounded-lg border border-[var(--panel-border)] bg-[var(--panel-soft)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                placeholder="A hyper-realistic photo of a futuristic city at night..."
              />
            </div>

            {/* Generate button */}
            <button
              type="button"
              onClick={() => void generateImage()}
              disabled={generatingImage || !imagePrompt.trim() || (imageBackend === "hf" && !hfToken.trim())}
              className="rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-40"
            >
              {generatingImage
                ? imageBackend === "comfyui"
                  ? "⚙️ Generating via ComfyUI..."
                  : "🤗 Generating via HuggingFace..."
                : "🖼️ Generate Image"}
            </button>

            {/* Output */}
            {generatedImageUrl && (
              <div className="rounded-xl border border-[var(--panel-border)] p-3">
                <p className="mb-2 text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
                  Generated via {imageBackend === "hf" ? "HuggingFace" : "ComfyUI"}
                </p>
                <Image
                  src={generatedImageUrl}
                  alt="Generated"
                  width={1024}
                  height={576}
                  className="w-full rounded-lg object-cover"
                  unoptimized
                />
                <a
                  href={generatedImageUrl}
                  download="rafaygen-image.png"
                  className="mt-2 inline-block text-xs text-[var(--accent)] underline"
                >
                  ⬇ Download
                </a>
              </div>
            )}
          </div>
        )}

      </section>
    </div>
  );
}
