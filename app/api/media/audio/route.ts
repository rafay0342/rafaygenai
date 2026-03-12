import { requireAuthOrGuest } from "@/lib/api-auth";
import { checkMediaLimit } from "@/lib/plan-limits";
import { enforceLimits } from "@/lib/usage";
import { generateAudioViaGroq } from "@/lib/groq-tts";
import { generateAudioViaHF } from "@/lib/huggingface";
import {
  generateAudioViaQwenTTS,
  type QwenTtsLanguage,
  type QwenTtsSpeaker,
} from "@/lib/qwen-tts";

type AudioProvider = "auto" | "groq" | "hf" | "qwen";
type VoiceProfile =
  | "default"
  | "female_clear"
  | "astra"
  | "vanguard"
  | "lumina"
  | "aegis"
  | "helix"
  | "serena"
  | "titan"
  | "navigator"
  | "pulse"
  | "regal";
type LanguageHint = "auto" | "en" | "hi" | "ur";

const VOICE_PROFILES = new Set<VoiceProfile>([
  "default",
  "female_clear",
  "astra",
  "vanguard",
  "lumina",
  "aegis",
  "helix",
  "serena",
  "titan",
  "navigator",
  "pulse",
  "regal",
]);

function envFlag(name: string, fallback = true) {
  const raw = process.env[name];
  if (raw == null) return fallback;
  if (raw === "1") return true;
  if (raw === "0") return false;
  return raw.toLowerCase() === "true" || raw.toLowerCase() === "yes";
}

function dedupeProviders(items: AudioProvider[]) {
  const out: AudioProvider[] = [];
  for (const item of items) {
    if (!out.includes(item)) out.push(item);
  }
  return out;
}

function hasGroqKey() {
  if (process.env.GROQ_API_KEY?.trim()) return true;
  for (let i = 1; i <= 6; i += 1) {
    const key = process.env[`GROQ_API_KEY_${i}`];
    if (key?.trim()) return true;
  }
  return false;
}

function normalizeProvider(raw: string | undefined): AudioProvider {
  const value = (raw || "").trim().toLowerCase();
  if (value === "groq" || value === "hf" || value === "qwen" || value === "auto") {
    return value;
  }
  return "auto";
}

function normalizeVoiceProfile(raw: string | undefined): VoiceProfile {
  const value = (raw || "").trim().toLowerCase();
  if (VOICE_PROFILES.has(value as VoiceProfile)) {
    return value as VoiceProfile;
  }
  return "default";
}

function normalizeLanguageHint(raw: string | undefined): LanguageHint {
  const value = (raw || "").trim().toLowerCase();
  if (!value) return "auto";
  if (value.startsWith("hi") || value === "hindi") return "hi";
  if (value.startsWith("ur") || value === "urdu") return "ur";
  if (value.startsWith("en") || value === "english") return "en";
  return "auto";
}

function toQwenLanguage(languageHint: LanguageHint): QwenTtsLanguage {
  if (languageHint === "en") return "English";
  return "Auto";
}

function pickQwenSpeaker(languageHint: LanguageHint, voiceProfile: VoiceProfile): QwenTtsSpeaker | undefined {
  if (voiceProfile === "default") return undefined;
  if (voiceProfile === "female_clear") {
    if (languageHint === "hi" || languageHint === "ur") {
      return (process.env.QWEN_TTS_SPEAKER_SOUTH_ASIA as QwenTtsSpeaker | undefined) || "Serena";
    }
    return (process.env.QWEN_TTS_SPEAKER as QwenTtsSpeaker | undefined) || "Serena";
  }
  const map: Partial<Record<VoiceProfile, QwenTtsSpeaker>> = {
    astra: "Serena",
    vanguard: "Ryan",
    lumina: "Vivian",
    aegis: "Dylan",
    helix: "Eric",
    serena: "Serena",
    titan: "Aiden",
    navigator: "Ryan",
    pulse: "Eric",
    regal: "Vivian",
  };
  const picked = map[voiceProfile];
  if (picked) return picked;
  if (languageHint === "hi" || languageHint === "ur") {
    return (process.env.QWEN_TTS_SPEAKER_SOUTH_ASIA as QwenTtsSpeaker | undefined) || "Serena";
  }
  return (process.env.QWEN_TTS_SPEAKER as QwenTtsSpeaker | undefined) || "Serena";
}

function providerOrderForRequest({
  requested,
  configured,
  voiceProfile,
  languageHint,
}: {
  requested: AudioProvider;
  configured: AudioProvider;
  voiceProfile: VoiceProfile;
  languageHint: LanguageHint;
}) {
  if (requested !== "auto") return [requested];
  if (voiceProfile !== "default") {
    const qualityOrder =
      languageHint === "hi" || languageHint === "ur"
        ? (["groq", "qwen", "hf"] as AudioProvider[])
        : (["groq", "qwen", "hf"] as AudioProvider[]);
    return qualityOrder;
  }
  if (configured === "auto") return ["qwen", "groq", "hf"] as AudioProvider[];
  return dedupeProviders([configured, "qwen", "groq", "hf"]);
}

export async function POST(req: Request) {
  try {
    if (!req.headers.get("content-type")?.includes("application/json")) {
      return Response.json({ error: "Content-Type must be application/json." }, { status: 400 });
    }
    let body: {
      prompt?: string;
      provider?: AudioProvider;
      voiceProfile?: VoiceProfile | string;
      languageHint?: string;
    };
    try {
      body = (await req.json()) as typeof body;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "parse error";
      return Response.json({ error: `Invalid JSON body: ${msg}` }, { status: 400 });
    }

    const auth = await requireAuthOrGuest(req);
    const allowGuest = envFlag("ALLOW_GUEST_MEDIA", true);
    if (auth.isGuest && !allowGuest) {
      return Response.json({ error: "Login required." }, { status: 401 });
    }
    if (!auth.isGuest) {
      await enforceLimits(auth.userId);
      // Plan-based media limit check
      const planCheckVoice = await checkMediaLimit(auth.userId, "voice");
      if (!planCheckVoice.allowed) {
        return Response.json(
          {
            error: planCheckVoice.reason || "Voice generation limit reached.",
            limitHit: true,
            resetAt: planCheckVoice.resetAt?.toISOString(),
          },
          { status: 429 },
        );
      }
    }
    if (!body.prompt) {
      return Response.json({ error: "Missing prompt." }, { status: 400 });
    }

    const requested = normalizeProvider(body.provider);
    const voiceProfile = normalizeVoiceProfile(body.voiceProfile);
    const languageHint = normalizeLanguageHint(body.languageHint);
    const configuredRaw = process.env.MEDIA_AUDIO_PROVIDER;
    const configured = normalizeProvider(configuredRaw);
    const resolvedConfigured = configured === "auto" && hasGroqKey() ? "groq" : configured;
    const order = providerOrderForRequest({
      requested,
      configured: resolvedConfigured,
      voiceProfile,
      languageHint,
    });

    const errors: string[] = [];
    for (const entry of order) {
      try {
        const result =
          entry === "groq"
            ? await generateAudioViaGroq({
                text: body.prompt,
                voice: voiceProfile === "default" ? undefined : voiceProfile,
              })
            : entry === "qwen"
              ? await generateAudioViaQwenTTS({
                  text: body.prompt,
                  language: toQwenLanguage(languageHint),
                  speaker: pickQwenSpeaker(languageHint, voiceProfile),
                })
              : await generateAudioViaHF({ text: body.prompt });
        return Response.json({ ...result, provider: entry });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${entry}: ${message}`);
      }
    }

    throw new Error(`Audio generation failed. ${errors.join(" | ")}`);
  } catch (error) {
    const message = String(error);
    const status =
      message.includes("Unauthorized") ? 401 : message.includes("limit") ? 429 : 500;
    return Response.json({ error: message }, { status });
  }
}
