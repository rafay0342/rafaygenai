import { requireAuthOrGuest } from "@/lib/api-auth";
import { getAllGroqKeys, getHFToken } from "@/lib/key-pool";
import {
  dedupeStrings,
  inferProviderFromModel,
  pickBestModelForPreset,
  STUDIO_PRESET_IDS,
  type ModelProvider,
  type StudioPresetId,
} from "@/lib/model-routing";

const DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434";
const DEFAULT_OPENAI_URL = "https://api.openai.com/v1";
const DEFAULT_ANTHROPIC_URL = "https://api.anthropic.com/v1";
const DEFAULT_GROQ_URL = "https://api.groq.com/openai/v1";
const DEFAULT_GROQ_COMPOUND_MODEL = "groq/compound";
const DEFAULT_GROQ_COMPOUND_MINI_MODEL = "groq/compound-mini";
const DEFAULT_GROQ_MAVERICK_MODEL = "meta-llama/llama-4-maverick-17b-128e-instruct";
const DEFAULT_GROQ_SCOUT_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
const DEFAULT_ANTHROPIC_FAST_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_ANTHROPIC_REASONING_MODEL = "claude-sonnet-4-6";
const DEFAULT_ANTHROPIC_PRO_MODEL = "claude-opus-4-6";
const HF_MODELS_API = "https://router.huggingface.co/v1/models";
const MODELS_CACHE_TTL_MS = 30_000;
const MODELS_FETCH_TIMEOUT_MS = 6_500;

type ModelProfileMeta = {
  id: StudioPresetId;
  label: string;
  note: string;
  description: string;
  provider: string;
  model: string;
};

type ModelsPayload = {
  models: string[];
  profiles: Record<StudioPresetId, string>;
  profileMeta: Record<StudioPresetId, ModelProfileMeta>;
  warning?: string;
  warnings?: string[];
};

type ProviderModelsResult = {
  models: string[];
  warning?: string;
};

const PROFILE_META_BASE: Record<StudioPresetId, Omit<ModelProfileMeta, "provider" | "model">> = {
  "rafaygenai-2.5-flash": {
    id: "rafaygenai-2.5-flash",
    label: "RafayGen Flash",
    note: "Fast",
    description: "Quick responses for everyday prompts.",
  },
  "rafaygenai-3.0-thinking": {
    id: "rafaygenai-3.0-thinking",
    label: "RafayGen Thinking",
    note: "Reasoning",
    description: "Balanced reasoning for multi-step work.",
  },
  "rafaygenai-3.1-pro": {
    id: "rafaygenai-3.1-pro",
    label: "RafayGen Pro",
    note: "Pro",
    description: "Best depth and quality for complex tasks.",
  },
  "hf-qwen3-thinking": {
    id: "hf-qwen3-thinking",
    label: "Qwen3 Thinking",
    note: "HF",
    description: "Qwen reasoning model via Hugging Face.",
  },
  "hf-gpt5-reasoning": {
    id: "hf-gpt5-reasoning",
    label: "GPT-5.2 HF",
    note: "HF Reasoning",
    description: "Reasoning-oriented HF route without Groq fallback.",
  },
  "hf-glm47-flash": {
    id: "hf-glm47-flash",
    label: "GLM-4.7 Flash",
    note: "HF Fast",
    description: "Fast GLM-style HF model for lightweight chat.",
  },
  "hf-gemini3-pro": {
    id: "hf-gemini3-pro",
    label: "Gemini 3 Pro",
    note: "Premium",
    description: "Premium multimodal-style preset mapped to provider-native models.",
  },
  "hf-ming-omni": {
    id: "hf-ming-omni",
    label: "Ming Omni",
    note: "Any-to-Any",
    description: "Omni/multimodal preset with HF-native routing.",
  },
  "hf-qwen-img-edit": {
    id: "hf-qwen-img-edit",
    label: "Qwen Image Edit",
    note: "Vision",
    description: "Vision/edit-capable preset without cross-provider fallback.",
  },
};

let modelsPayloadCache:
  | {
      key: string;
      expiresAt: number;
      payload: ModelsPayload;
    }
  | null = null;

function toProviderLabel(provider: ModelProvider) {
  if (provider === "openai") return "OpenAI";
  if (provider === "groq") return "Groq";
  if (provider === "anthropic") return "Anthropic";
  if (provider === "hf") return "Hugging Face";
  return "Ollama";
}

function getConfiguredProvider() {
  return (process.env.CHAT_PROVIDER || "").trim().toLowerCase();
}

function resolveOpenAIApiKey() {
  const direct = process.env.OPENAI_API_KEY?.trim() || "";
  return direct && !direct.startsWith("gsk_") ? direct : "";
}

function resolveGroqApiKey() {
  const direct = process.env.GROQ_API_KEY?.trim();
  if (direct) return direct;

  const openai = process.env.OPENAI_API_KEY?.trim();
  if (openai?.startsWith("gsk_")) return openai;

  const poolKeys = getAllGroqKeys();
  return poolKeys[0] || "";
}

function resolveHFTokenValue() {
  return (
    getHFToken("paid")?.token ||
    getHFToken("free")?.token ||
    process.env.HF_TOKEN?.trim() ||
    ""
  );
}

function resolveAnthropicApiKey() {
  const direct = process.env.ANTHROPIC_API_KEY?.trim();
  if (direct) return direct;
  const openai = process.env.OPENAI_API_KEY?.trim();
  if (openai?.startsWith("sk-ant-")) return openai;
  return "";
}

function hasOpenAIProvider() {
  return Boolean(resolveOpenAIApiKey());
}

function hasGroqProvider() {
  return Boolean(resolveGroqApiKey());
}

function hasAnthropicProvider() {
  return Boolean(resolveAnthropicApiKey());
}

function hasHFProvider() {
  return Boolean(resolveHFTokenValue());
}

function getDefaultProvider(): ModelProvider {
  const configured = getConfiguredProvider();
  if (configured === "openai" && hasOpenAIProvider()) return "openai";
  if (configured === "groq" && hasGroqProvider()) return "groq";
  if (configured === "anthropic" && hasAnthropicProvider()) return "anthropic";
  if (configured === "hf" && hasHFProvider()) return "hf";
  if (configured === "ollama") return "ollama";

  if (hasOpenAIProvider()) return "openai";
  if (hasGroqProvider()) return "groq";
  if (hasAnthropicProvider()) return "anthropic";
  if (hasHFProvider()) return "hf";
  return "ollama";
}

function resolveOpenAIBaseUrl() {
  const explicit = process.env.OPENAI_BASE_URL?.trim();
  if (explicit && !/groq\.com/i.test(explicit)) {
    return explicit.replace(/\/+$/, "");
  }
  return DEFAULT_OPENAI_URL;
}

function resolveGroqBaseUrl() {
  const explicitGroq = process.env.GROQ_API_BASE_URL?.trim();
  if (explicitGroq) return explicitGroq.replace(/\/+$/, "");

  const explicitOpenAI = process.env.OPENAI_BASE_URL?.trim();
  if (explicitOpenAI && /groq\.com/i.test(explicitOpenAI)) {
    return explicitOpenAI.replace(/\/+$/, "");
  }

  return DEFAULT_GROQ_URL;
}

function resolveAnthropicBaseUrl() {
  return (process.env.ANTHROPIC_BASE_URL || DEFAULT_ANTHROPIC_URL).replace(/\/+$/, "");
}

function openaiHeaders() {
  const apiKey = resolveOpenAIApiKey();
  if (!apiKey) throw new Error("Missing real OPENAI_API_KEY.");
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

function groqHeaders() {
  const apiKey = resolveGroqApiKey();
  if (!apiKey) throw new Error("Missing GROQ_API_KEY.");
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

function anthropicHeaders() {
  const apiKey = resolveAnthropicApiKey();
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY.");
  return {
    "x-api-key": apiKey,
    "anthropic-version": process.env.ANTHROPIC_VERSION || "2023-06-01",
    "Content-Type": "application/json",
  };
}

function hfHeaders() {
  const token = resolveHFTokenValue();
  if (!token) throw new Error("Missing HF token.");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function isChatModel(id: string) {
  const name = id.toLowerCase();
  if (name.includes("whisper")) return false;
  if (name.includes("guard")) return false;
  if (name.includes("prompt-guard")) return false;
  if (name.includes("safeguard")) return false;
  if (name.includes("speech")) return false;
  if (name.includes("audio")) return false;
  if (name.includes("transcribe")) return false;
  if (name.includes("embed")) return false;
  return true;
}

function isLikelyHFChatModel(id: string) {
  const name = id.toLowerCase();
  return (
    isChatModel(id) &&
    /(qwen|glm|gpt-oss|step|gemma|deepseek|mistral|pixtral|llama|coder|vl|vision|omni|meta-llama)/i.test(
      name,
    )
  );
}

function getCuratedOpenAIModels() {
  return dedupeStrings([
    process.env.OPENAI_MODEL_FAST || "",
    process.env.OPENAI_MODEL_LATEST || "",
    process.env.OPENAI_MODEL_REASONING || "",
    process.env.OPENAI_FALLBACK_MODEL || "",
    "gpt-5.2-mini",
    "gpt-5.2",
    "gpt-5-mini",
    "gpt-5",
    "o4-mini",
    "o3",
    "gpt-4.1-mini",
  ]);
}

function getCuratedGroqModels() {
  return dedupeStrings([
    process.env.RAFAYGEN_MODEL_FLASH || "",
    process.env.RAFAYGEN_MODEL_THINKING || "",
    process.env.RAFAYGEN_MODEL_PRO || "",
    process.env.GROQ_CHAT_MODEL || "",
    process.env.GROQ_COMPOUND_MODEL || "",
    process.env.GROQ_FAST_MODEL || "",
    process.env.GROQ_COMPOUND_MINI_MODEL || "",
    process.env.GROQ_VISION_MODEL || "",
    DEFAULT_GROQ_COMPOUND_MODEL,
    DEFAULT_GROQ_COMPOUND_MINI_MODEL,
    DEFAULT_GROQ_MAVERICK_MODEL,
    DEFAULT_GROQ_SCOUT_MODEL,
  ]);
}

function getCuratedAnthropicModels() {
  return dedupeStrings([
    process.env.ANTHROPIC_MODEL_FAST || "",
    process.env.ANTHROPIC_MODEL_REASONING || "",
    process.env.ANTHROPIC_MODEL_LATEST || "",
    process.env.ANTHROPIC_FALLBACK_MODEL || "",
    DEFAULT_ANTHROPIC_FAST_MODEL,
    DEFAULT_ANTHROPIC_REASONING_MODEL,
    DEFAULT_ANTHROPIC_PRO_MODEL,
  ]);
}

function getCuratedHFModels() {
  return dedupeStrings([
    process.env.HF_CHAT_MODEL || "",
    process.env.HF_CHAT_FALLBACK || "",
    "Qwen/Qwen3-4B-Thinking-2507",
    "Qwen/Qwen2.5-72B-Instruct",
    "Qwen/Qwen2.5-VL-72B-Instruct",
    "zai-org/GLM-4.5-Air",
    "zai-org/GLM-4.5V",
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "stepfun-ai/Step-3.5-Flash",
  ]);
}

function scoreDiscoveredModel(id: string) {
  const name = id.toLowerCase();
  const provider = inferProviderFromModel(id, "groq");
  let score = 0;

  if (name.includes("gpt-oss-120b")) score += 245;
  else if (name.includes("qwen3")) score += 230;
  else if (name.includes("glm-4.7")) score += 225;
  else if (name.includes("glm-4.5v")) score += 220;
  else if (name.includes("groq/compound")) score += 215;
  else if (name.includes("llama-4-maverick")) score += 205;
  else if (name.includes("gpt-5.2")) score += 205;
  else if (name.includes("claude-opus")) score += 200;
  else if (name.includes("claude-sonnet")) score += 190;
  else if (name.includes("step-3.5")) score += 185;
  else if (name.includes("qwen2.5")) score += 175;
  else if (name.includes("llama-4-scout")) score += 170;
  else if (name.includes("gpt-oss-20b")) score += 165;
  else if (name.includes("gpt-4.1")) score += 160;

  if (provider === "openai") score += 10;
  if (provider === "anthropic") score += 8;
  if (provider === "hf") score += 6;
  if (provider === "groq") score += 6;
  if (/(mini|flash|fast|turbo|air)/i.test(name)) score += 4;
  return score;
}

function sortModels(models: string[]) {
  return [...models].sort((a, b) => scoreDiscoveredModel(b) - scoreDiscoveredModel(a));
}

async function fetchWithTimeout(
  input: string,
  init?: RequestInit,
  timeoutMs = MODELS_FETCH_TIMEOUT_MS,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchOpenAIModels(): Promise<ProviderModelsResult> {
  if (!hasOpenAIProvider()) return { models: [] };

  const curated = getCuratedOpenAIModels();
  const response = await fetchWithTimeout(`${resolveOpenAIBaseUrl()}/models`, {
    headers: openaiHeaders(),
  });

  if (!response.ok) {
    return {
      models: curated,
      warning: `OpenAI error ${response.status}`,
    };
  }

  const data = (await response.json()) as { data?: Array<{ id: string }> };
  const discovered = (data.data || []).map((entry) => entry.id).filter(isChatModel);
  return { models: sortModels(dedupeStrings([...curated, ...discovered])) };
}

async function fetchGroqModels(): Promise<ProviderModelsResult> {
  if (!hasGroqProvider()) return { models: [] };

  const curated = getCuratedGroqModels();
  const response = await fetchWithTimeout(`${resolveGroqBaseUrl()}/models`, {
    headers: groqHeaders(),
  });

  if (!response.ok) {
    return {
      models: curated,
      warning: `Groq error ${response.status}`,
    };
  }

  const data = (await response.json()) as { data?: Array<{ id: string }> };
  const discovered = (data.data || []).map((entry) => entry.id).filter(isChatModel);
  return { models: sortModels(dedupeStrings([...curated, ...discovered])) };
}

async function fetchAnthropicModels(): Promise<ProviderModelsResult> {
  if (!hasAnthropicProvider()) return { models: [] };

  const curated = getCuratedAnthropicModels();
  const response = await fetchWithTimeout(`${resolveAnthropicBaseUrl()}/models`, {
    headers: anthropicHeaders(),
  });

  if (!response.ok) {
    return {
      models: curated,
      warning: `Anthropic error ${response.status}`,
    };
  }

  const data = (await response.json()) as { data?: Array<{ id: string }> };
  const discovered = (data.data || []).map((entry) => entry.id).filter(isChatModel);
  return { models: sortModels(dedupeStrings([...curated, ...discovered])) };
}

async function fetchHFModels(): Promise<ProviderModelsResult> {
  if (!hasHFProvider()) return { models: [] };

  const curated = getCuratedHFModels();
  const response = await fetchWithTimeout(HF_MODELS_API, {
    headers: hfHeaders(),
  });

  if (!response.ok) {
    return {
      models: curated,
      warning: `HF error ${response.status}`,
    };
  }

  const raw = (await response.json()) as
    | { data?: Array<{ id?: string; modelId?: string; name?: string }> }
    | Array<{ id?: string; modelId?: string; name?: string }>;
  const entries = Array.isArray(raw) ? raw : (raw.data || []);
  const discovered = entries
    .map((entry) => String(entry.id || entry.modelId || entry.name || "").trim())
    .filter(Boolean)
    .filter(isLikelyHFChatModel);

  return { models: sortModels(dedupeStrings([...curated, ...discovered])) };
}

async function fetchOllamaModels(): Promise<ProviderModelsResult> {
  const response = await fetchWithTimeout(`${process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_URL}/api/tags`);
  if (!response.ok) {
    return { models: [], warning: `Ollama error ${response.status}` };
  }
  const data = (await response.json()) as { models?: Array<{ name: string }> };
  const discovered = (data.models || []).map((entry) => entry.name).filter(isChatModel);
  return { models: sortModels(dedupeStrings(discovered)) };
}

function defaultProfileFallbacks(defaultProvider: ModelProvider): Record<StudioPresetId, string> {
  const localDefault = process.env.NEXT_PUBLIC_DEFAULT_MODEL || "gpt-5.2-mini";
  const groqFlash =
    process.env.RAFAYGEN_MODEL_FLASH ||
    process.env.GROQ_FAST_MODEL ||
    process.env.GROQ_COMPOUND_MINI_MODEL ||
    DEFAULT_GROQ_COMPOUND_MINI_MODEL;
  const groqThinking =
    process.env.RAFAYGEN_MODEL_THINKING ||
    process.env.GROQ_CHAT_MODEL ||
    process.env.GROQ_COMPOUND_MODEL ||
    DEFAULT_GROQ_COMPOUND_MODEL;
  const groqPro =
    process.env.RAFAYGEN_MODEL_PRO ||
    process.env.GROQ_VISION_MODEL ||
    process.env.GROQ_CHAT_MODEL ||
    DEFAULT_GROQ_MAVERICK_MODEL;
  const openAiFlash = process.env.OPENAI_MODEL_FAST || "gpt-5.2-mini";
  const openAiThinking =
    process.env.OPENAI_MODEL_REASONING || process.env.OPENAI_MODEL_LATEST || "gpt-5.2";
  const anthropicFlash = process.env.ANTHROPIC_MODEL_FAST || DEFAULT_ANTHROPIC_FAST_MODEL;
  const anthropicThinking =
    process.env.ANTHROPIC_MODEL_REASONING ||
    process.env.ANTHROPIC_MODEL_LATEST ||
    DEFAULT_ANTHROPIC_REASONING_MODEL;

  const defaultsByProvider: Record<ModelProvider, [string, string, string]> = {
    groq: [groqFlash, groqThinking, groqPro],
    openai: [
      openAiFlash,
      openAiThinking,
      process.env.OPENAI_MODEL_LATEST || process.env.OPENAI_FALLBACK_MODEL || openAiThinking,
    ],
    anthropic: [
      anthropicFlash,
      anthropicThinking,
      process.env.ANTHROPIC_MODEL_LATEST || DEFAULT_ANTHROPIC_PRO_MODEL,
    ],
    hf: [
      process.env.HF_CHAT_FALLBACK || process.env.HF_CHAT_MODEL || "Qwen/Qwen2.5-7B-Instruct",
      process.env.HF_CHAT_MODEL || "Qwen/Qwen3-4B-Thinking-2507",
      "openai/gpt-oss-120b",
    ],
    ollama: [localDefault, localDefault, localDefault],
  };

  const [flashDefault, thinkingDefault, proDefault] =
    defaultsByProvider[defaultProvider] || defaultsByProvider.groq;

  return {
    "rafaygenai-2.5-flash": flashDefault,
    "rafaygenai-3.0-thinking": thinkingDefault,
    "rafaygenai-3.1-pro": proDefault,
    "hf-qwen3-thinking": "Qwen/Qwen3-4B-Thinking-2507",
    "hf-gpt5-reasoning": "openai/gpt-oss-120b",
    "hf-glm47-flash": "zai-org/GLM-4.5-Air",
    "hf-gemini3-pro": "zai-org/GLM-4.5V",
    "hf-ming-omni": "zai-org/GLM-4.5V",
    "hf-qwen-img-edit": "Qwen/Qwen2.5-VL-72B-Instruct",
  };
}

function buildProfileMapping(
  models: string[],
  defaultProvider: ModelProvider,
): Record<StudioPresetId, string> {
  const defaults = defaultProfileFallbacks(defaultProvider);
  const available = dedupeStrings(models.filter(isChatModel));
  return STUDIO_PRESET_IDS.reduce(
    (acc, presetId) => {
      acc[presetId] = pickBestModelForPreset(available, presetId, defaults[presetId]);
      return acc;
    },
    {} as Record<StudioPresetId, string>,
  );
}

function buildProfileMeta(
  profiles: Record<StudioPresetId, string>,
  defaultProvider: ModelProvider,
): Record<StudioPresetId, ModelProfileMeta> {
  return STUDIO_PRESET_IDS.reduce(
    (acc, presetId) => {
      const model = profiles[presetId];
      const provider = inferProviderFromModel(model, defaultProvider);
      acc[presetId] = {
        ...PROFILE_META_BASE[presetId],
        provider: toProviderLabel(provider),
        model,
      };
      return acc;
    },
    {} as Record<StudioPresetId, ModelProfileMeta>,
  );
}

function makeCacheKey() {
  return [
    getDefaultProvider(),
    resolveOpenAIBaseUrl(),
    resolveGroqBaseUrl(),
    resolveAnthropicBaseUrl(),
    hasOpenAIProvider() ? "openai:on" : "openai:off",
    hasGroqProvider() ? "groq:on" : "groq:off",
    hasAnthropicProvider() ? "anthropic:on" : "anthropic:off",
    hasHFProvider() ? "hf:on" : "hf:off",
    process.env.RAFAYGEN_MODEL_FLASH || "",
    process.env.RAFAYGEN_MODEL_THINKING || "",
    process.env.RAFAYGEN_MODEL_PRO || "",
    process.env.HF_CHAT_MODEL || "",
    process.env.HF_CHAT_FALLBACK || "",
  ].join("|");
}

function withCacheHeaders(payload: ModelsPayload) {
  return Response.json(payload, {
    headers: {
      "Cache-Control": "private, max-age=15",
    },
  });
}

export async function GET(req: Request) {
  try {
    await requireAuthOrGuest(req);

    const cacheKey = makeCacheKey();
    if (
      modelsPayloadCache &&
      modelsPayloadCache.key === cacheKey &&
      modelsPayloadCache.expiresAt > Date.now()
    ) {
      return withCacheHeaders(modelsPayloadCache.payload);
    }

    const defaultProvider = getDefaultProvider();
    const providerResults = await Promise.all([
      fetchGroqModels(),
      fetchOpenAIModels(),
      fetchAnthropicModels(),
      fetchHFModels(),
      defaultProvider === "ollama"
        ? fetchOllamaModels()
        : Promise.resolve<ProviderModelsResult>({ models: [] }),
    ]);

    let merged = sortModels(
      dedupeStrings(providerResults.flatMap((result) => result.models).filter(isChatModel)),
    );

    const warnings = providerResults
      .map((result) => result.warning)
      .filter((warning): warning is string => Boolean(warning));

    if (!merged.length) {
      const ollama = await fetchOllamaModels();
      merged = sortModels(dedupeStrings(ollama.models.filter(isChatModel)));
      if (ollama.warning) warnings.push(ollama.warning);
    }

    const profiles = buildProfileMapping(merged, defaultProvider);
    const payload: ModelsPayload = {
      models: merged,
      profiles,
      profileMeta: buildProfileMeta(profiles, defaultProvider),
      warning: warnings[0],
      warnings: warnings.length ? warnings : undefined,
    };

    modelsPayloadCache = {
      key: cacheKey,
      expiresAt: Date.now() + MODELS_CACHE_TTL_MS,
      payload,
    };

    return withCacheHeaders(payload);
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
