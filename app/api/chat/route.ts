import { enforceLimits } from "@/lib/usage";
import { requireAuthOrGuest } from "@/lib/api-auth";
import { buildMemorySystemPrompt } from "@/lib/memory";
import { buildAgentContext } from "@/lib/agent-nlp";
import { getAllGroqKeys, getHFToken, groqFetch } from "@/lib/key-pool";
import { inferProviderFromModel, type ModelProvider } from "@/lib/model-routing";
import { buildRealtimeSystemPrompt } from "@/lib/realtime-context";
import {
  executeChatTool,
  getChatToolDefinitions,
  shouldRunToolLoop,
} from "@/lib/chat-tools";

const DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434";
const DEFAULT_OPENAI_URL = "https://api.openai.com/v1";
const DEFAULT_ANTHROPIC_URL = "https://api.anthropic.com/v1";
const DEFAULT_HF_MODEL = "stepfun-ai/Step-3.5-Flash";
const DEFAULT_OPENAI_FAST_MODEL = "gpt-5.2-mini";
const DEFAULT_OPENAI_REASONING_MODEL = "gpt-5.2";
const DEFAULT_OPENAI_FALLBACK_MODEL = "gpt-4.1-mini";
const DEFAULT_ANTHROPIC_FAST_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_ANTHROPIC_REASONING_MODEL = "claude-sonnet-4-6";
const DEFAULT_ANTHROPIC_FALLBACK_MODEL = "claude-sonnet-4-6";
const DEFAULT_GROQ_COMPOUND_MODEL = "groq/compound";
const DEFAULT_GROQ_COMPOUND_MINI_MODEL = "groq/compound-mini";
const DEFAULT_GROQ_MODEL = "meta-llama/llama-4-maverick-17b-128e-instruct";
const DEFAULT_GROQ_URL = "https://api.groq.com/openai/v1";
const HF_CHAT_API = "https://router.huggingface.co/v1/chat/completions";

const DISALLOWED_MODEL_FRAGMENTS = [
  "whisper",
  "guard",
  "prompt-guard",
  "safeguard",
  "speech",
  "audio",
  "transcribe",
  "embed",
];

const FAST_MODEL_RE = /(mini|nano|flash|instant|turbo|small|lite)/i;
const COMPLEX_TASK_RE =
  /(complex|reason|algorithm|architecture|optimi[sz]e|proof|derive|math|equation|debug|refactor|production|hard problem|detailed solution)/i;
const MATH_TASK_RE =
  /(\bmath\b|\balgebra\b|\bcalculus\b|\bgeometry\b|\btrigonometry\b|\bstatistics\b|\bprobability\b|\bmatrix\b|\bintegral\b|\bderivative\b|\bequation\b|\btheorem\b)/i;
const CODE_TASK_RE =
  /(\bcode\b|\btypescript\b|\bjavascript\b|\bpython\b|\bjava\b|\bc\+\+\b|\bgo\b|\brust\b|\bbug\b|\berror\b|\bcompile\b|\brefactor\b|\btest case\b|\bunit test\b|\balgorithm\b|\bdata structure\b)/i;

const FLASH_PROFILE_ALIASES = new Set([
  "rafay gen 2.5 flash",
  "rafaygen 2.5 flash",
  "rafaygenai 2.5 flash",
  "rafaygen flash",
  "rafay gen flash",
]);
const THINKING_PROFILE_ALIASES = new Set([
  "rafay gen 3.0 thinking",
  "rafaygen 3.0 thinking",
  "rafaygenai 3.0 thinking",
  "rafaygen thinking",
  "rafay gen thinking",
]);
const PRO_PROFILE_ALIASES = new Set([
  "rafay gen 3.1 pro",
  "rafaygen 3.1 pro",
  "rafaygenai 3.1 pro",
  "rafaygen pro",
  "rafay gen pro",
]);

type ChatMessage = { role: "user" | "assistant" | "system"; content: string };
type ChatAttachment = {
  id?: string;
  name?: string;
  type?: string;
  size?: number;
  kind?: "image" | "video" | "audio" | "document" | "file";
  textSnippet?: string;
  dataUrl?: string;
};
type ChatInputMessage = ChatMessage & { attachments?: ChatAttachment[] };
type OpenAICompatibleToolCall = {
  id: string;
  type?: "function";
  function?: {
    name?: string;
    arguments?: string;
  };
};
type OpenAIContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };
type OpenAICompatibleMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | OpenAIContentPart[] | null;
  tool_call_id?: string;
  tool_calls?: OpenAICompatibleToolCall[];
};

type ChatRequest = {
  model: string;
  messages: ChatInputMessage[];
  stream?: boolean;
  strictModel?: boolean;
  agent?: {
    enabled?: boolean;
    nlp?: boolean;
    tools?: boolean;
    realtime?: "auto" | "off" | "search" | "deep";
  };
  moderationMode?: "standard" | "strict";
  options?: {
    temperature?: number;
    top_p?: number;
    num_predict?: number;
    max_tokens?: number;
    strict_model?: boolean;
  };
};

function toInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toFloat(value: string | undefined, fallback: number) {
  const parsed = Number.parseFloat(value || "");
  return Number.isFinite(parsed) ? parsed : fallback;
}

function dedupe(values: string[]) {
  const out: string[] = [];
  for (const entry of values) {
    const clean = entry.trim();
    if (!clean) continue;
    if (!out.includes(clean)) out.push(clean);
  }
  return out;
}

function envFlag(name: string, fallback = true) {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  return !["0", "false", "off", "no"].includes(raw);
}

function buildSafetySystemPrompt(mode: ChatRequest["moderationMode"]) {
  if (mode !== "strict") return "";
  return [
    "Safety mode: strict.",
    "- Refuse instructions for malware, phishing, evasion, violent wrongdoing, sexual abuse, or other clearly harmful activity.",
    "- If a request is borderline or ambiguous, choose the safer interpretation and avoid procedural harmful detail.",
  ].join("\n");
}

function buildToolSystemPrompt(mode?: "auto" | "off" | "search" | "deep") {
  const realtimeMode = String(mode || "auto").trim().toLowerCase();
  const realtimeNote =
    realtimeMode === "off"
      ? "Avoid external realtime lookups unless the user explicitly provides a URL to inspect."
      : "Use tools for fresh facts, current events, weather, prices, recent news, or when a URL/page needs inspection. Do not guess current information when tools are available.";
  return [
    "Tool usage guidance:",
    realtimeNote,
    "When you use tools, prefer concise targeted searches and cite the resulting sources in the final answer.",
  ].join("\n");
}

function isStrictModelRequest(body: ChatRequest) {
  if (typeof body.strictModel === "boolean") return body.strictModel;
  if (typeof body.options?.strict_model === "boolean") return body.options.strict_model;
  const raw = process.env.CHAT_STRICT_MODEL?.trim().toLowerCase();
  if (!raw) return false;
  return ["1", "true", "yes", "on"].includes(raw);
}

function resolveOpenAIApiKey() {
  const direct = process.env.OPENAI_API_KEY?.trim();
  if (direct && !direct.startsWith("gsk_")) return direct;
  return "";
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

function hasProvider(provider: ModelProvider) {
  if (provider === "openai") return hasOpenAIProvider();
  if (provider === "groq") return hasGroqProvider();
  if (provider === "anthropic") return hasAnthropicProvider();
  if (provider === "hf") return hasHFProvider();
  return true;
}

function getConfiguredProvider() {
  return (process.env.CHAT_PROVIDER || "").trim().toLowerCase();
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

function resolveOperationalProvider(model: string) {
  const fallback = getDefaultProvider();
  const inferred = inferProviderFromModel(model, fallback);
  return hasProvider(inferred) ? inferred : fallback;
}

function openaiHeaders() {
  const apiKey = resolveOpenAIApiKey();
  if (!apiKey) {
    throw new Error("Missing real OPENAI_API_KEY.");
  }
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

function resolveAnthropicApiKey() {
  const direct = process.env.ANTHROPIC_API_KEY?.trim();
  if (direct) return direct;
  const openai = process.env.OPENAI_API_KEY?.trim();
  if (openai?.startsWith("sk-ant-")) return openai;
  return "";
}

function anthropicHeaders() {
  const apiKey = resolveAnthropicApiKey();
  if (!apiKey) {
    throw new Error("Missing ANTHROPIC_API_KEY.");
  }
  return {
    "x-api-key": apiKey,
    "anthropic-version": process.env.ANTHROPIC_VERSION || "2023-06-01",
    "Content-Type": "application/json",
  };
}

function getLatestUserMessage(messages: ChatMessage[]) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const item = messages[i];
    if (item.role === "user" && item.content?.trim()) return item.content.trim();
  }
  return "";
}

function isDisallowedModel(model: string) {
  const name = model.toLowerCase();
  return DISALLOWED_MODEL_FRAGMENTS.some((fragment) => name.includes(fragment));
}

function isAnthropicModel(model: string) {
  return model.toLowerCase().includes("claude");
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

function getGroqPrimaryModel() {
  return process.env.GROQ_CHAT_MODEL || process.env.GROQ_COMPOUND_MODEL || DEFAULT_GROQ_COMPOUND_MODEL;
}

function getGroqFastModel() {
  return (
    process.env.GROQ_FAST_MODEL ||
    process.env.GROQ_COMPOUND_MINI_MODEL ||
    DEFAULT_GROQ_COMPOUND_MINI_MODEL
  );
}

function getGroqVisionModel() {
  return process.env.GROQ_VISION_MODEL || DEFAULT_GROQ_MODEL;
}

function getOpenAIFastModel() {
  return process.env.OPENAI_MODEL_FAST || DEFAULT_OPENAI_FAST_MODEL;
}

function getOpenAIReasoningModel() {
  return process.env.OPENAI_MODEL_REASONING || process.env.OPENAI_MODEL_LATEST || DEFAULT_OPENAI_REASONING_MODEL;
}

function getOpenAIFallbackModel() {
  return process.env.OPENAI_FALLBACK_MODEL || getOpenAIFastModel() || DEFAULT_OPENAI_FALLBACK_MODEL;
}

function getHFDefaultModel() {
  return process.env.HF_CHAT_MODEL || process.env.FALLBACK_CHAT_MODEL || DEFAULT_HF_MODEL;
}

function getAnthropicFastModel() {
  return process.env.ANTHROPIC_MODEL_FAST || DEFAULT_ANTHROPIC_FAST_MODEL;
}

function getAnthropicReasoningModel() {
  return process.env.ANTHROPIC_MODEL_REASONING || process.env.ANTHROPIC_MODEL_LATEST || DEFAULT_ANTHROPIC_REASONING_MODEL;
}

function getAnthropicFallbackModel() {
  return process.env.ANTHROPIC_FALLBACK_MODEL || getAnthropicReasoningModel() || DEFAULT_ANTHROPIC_FALLBACK_MODEL;
}

function getProviderFallbackModel(provider: string) {
  if (provider === "openai") return getOpenAIFallbackModel();
  if (provider === "groq") {
    return process.env.GROQ_CHAT_FALLBACK || getGroqPrimaryModel() || DEFAULT_GROQ_MODEL;
  }
  if (provider === "hf") return process.env.HF_CHAT_FALLBACK || getHFDefaultModel();
  if (provider === "anthropic") return getAnthropicFallbackModel();
  return process.env.OLLAMA_CHAT_FALLBACK || process.env.NEXT_PUBLIC_DEFAULT_MODEL || "llama3.2:3b";
}

function normalizeProfileAlias(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function mapRafayGenProfileAlias(alias: string, provider: string) {
  const normalized = normalizeProfileAlias(alias);
  const isFlash = FLASH_PROFILE_ALIASES.has(normalized);
  const isThinking = THINKING_PROFILE_ALIASES.has(normalized);
  const isPro = PRO_PROFILE_ALIASES.has(normalized);
  if (!isFlash && !isThinking && !isPro) return null;
  const forcedFlash = process.env.RAFAYGEN_MODEL_FLASH?.trim();
  const forcedThinking = process.env.RAFAYGEN_MODEL_THINKING?.trim();
  const forcedPro = process.env.RAFAYGEN_MODEL_PRO?.trim();

  if (provider === "groq") {
    if (isFlash) return forcedFlash || getGroqFastModel();
    if (isThinking) return forcedThinking || getGroqPrimaryModel();
    return forcedPro || getGroqVisionModel();
  }

  if (provider === "openai") {
    if (isFlash) return forcedFlash || process.env.OPENAI_MODEL_FAST || DEFAULT_OPENAI_FAST_MODEL;
    if (isThinking) {
      return (
        forcedThinking ||
        process.env.OPENAI_MODEL_REASONING ||
        process.env.OPENAI_MODEL_LATEST ||
        DEFAULT_OPENAI_REASONING_MODEL
      );
    }
    return (
      forcedPro ||
      process.env.OPENAI_MODEL_LATEST ||
      process.env.OPENAI_MODEL_REASONING ||
      process.env.OPENAI_FALLBACK_MODEL ||
      DEFAULT_OPENAI_REASONING_MODEL
    );
  }

  if (provider === "hf") {
    if (isFlash) return forcedFlash || getHFDefaultModel();
    if (isThinking) return forcedThinking || getHFDefaultModel();
    return forcedPro || getHFDefaultModel();
  }
  if (provider === "anthropic") {
    if (isFlash) return forcedFlash || getAnthropicFastModel();
    if (isThinking) return forcedThinking || getAnthropicReasoningModel();
    return forcedPro || process.env.ANTHROPIC_MODEL_LATEST || getAnthropicFallbackModel();
  }
  if (isFlash) return forcedFlash || process.env.NEXT_PUBLIC_DEFAULT_MODEL || "llama3.2:3b";
  if (isThinking) return forcedThinking || process.env.NEXT_PUBLIC_DEFAULT_MODEL || "llama3.2:3b";
  return forcedPro || process.env.NEXT_PUBLIC_DEFAULT_MODEL || "llama3.2:3b";
}

function resolveModel(model: string | undefined, provider: string, strictModel = false) {
  const incoming = (model || "").trim();
  const providerDefault =
    provider === "openai"
      ? getOpenAIFastModel()
      : provider === "groq"
        ? getGroqFastModel()
      : provider === "anthropic"
        ? getAnthropicFastModel()
      : provider === "hf"
        ? getHFDefaultModel()
        : process.env.NEXT_PUBLIC_DEFAULT_MODEL || "llama3.2:3b";

  if (strictModel) {
    return incoming || providerDefault;
  }

  const aliased = incoming ? mapRafayGenProfileAlias(incoming, provider) : null;
  if (aliased) return aliased;

  return incoming && !isDisallowedModel(incoming) ? incoming : providerDefault;
}

function buildAnthropicMessages(messages: ChatRequest["messages"]) {
  const systemParts: string[] = [];
  const chatMessages: Array<{ role: "user" | "assistant"; content: string }> = [];

  for (const message of messages) {
    const attachmentText = formatAttachmentContext(message.attachments);
    const combined = [message.content?.trim() || "", attachmentText.trim()]
      .filter(Boolean)
      .join("\n\n")
      .trim();
    if (!combined) continue;
    if (message.role === "system") {
      systemParts.push(combined);
      continue;
    }
    chatMessages.push({
      role: message.role === "assistant" ? "assistant" : "user",
      content: combined.slice(0, 12000),
    });
  }

  return {
    system: systemParts.join("\n\n").trim(),
    messages: chatMessages,
  };
}

function sanitizeAttachment(attachment: ChatAttachment) {
  const kind = attachment.kind || "file";
  const name = (attachment.name || "file").slice(0, 180);
  const type = (attachment.type || "").slice(0, 120);
  const size = Number.isFinite(attachment.size) ? Number(attachment.size) : 0;
  const textSnippet = typeof attachment.textSnippet === "string"
    ? attachment.textSnippet.slice(0, 4200)
    : "";
  const dataUrl =
    kind === "image" &&
    typeof attachment.dataUrl === "string" &&
    /^data:image\//i.test(attachment.dataUrl) &&
    attachment.dataUrl.length <= 5_500_000
      ? attachment.dataUrl
      : "";
  return { kind, name, type, size, textSnippet, dataUrl };
}

function formatAttachmentContext(attachments: ChatAttachment[] | undefined) {
  const safe = Array.isArray(attachments)
    ? attachments.slice(0, 8).map(sanitizeAttachment)
    : [];
  if (!safe.length) return "";
  const rows = safe.map((file, index) => {
    const details = [
      `name=\"${file.name}\"`,
      file.type ? `type=\"${file.type}\"` : null,
      file.size > 0 ? `size=\"${file.size} bytes\"` : null,
      `kind=\"${file.kind}\"`,
    ]
      .filter(Boolean)
      .join(", ");
    const snippet = file.textSnippet.trim()
      ? `\ncontent_snippet:\n${file.textSnippet.trim().slice(0, 2200)}`
      : "";
    return `${index + 1}. [attached_file] ${details}${snippet}`;
  });
  return `Attached files:\n${rows.join("\n\n")}`;
}

function hasImageAttachments(messages: ChatRequest["messages"]) {
  return messages.some((message) =>
    Array.isArray(message.attachments) &&
    message.attachments.some((attachment) => sanitizeAttachment(attachment).dataUrl),
  );
}

function getOpenAIVisionModel() {
  return process.env.OPENAI_MODEL_VISION || process.env.OPENAI_MODEL_LATEST || getOpenAIFastModel();
}

function buildOpenAIMessages(messages: ChatRequest["messages"]) {
  return messages.map((message) => {
    if (!Array.isArray(message.attachments) || message.attachments.length === 0) {
      return { role: message.role, content: message.content };
    }
    const attachments = message.attachments.slice(0, 8).map(sanitizeAttachment);
    const parts: Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    > = [];

    const attachmentText = formatAttachmentContext(attachments).trim();
    const baseText = [message.content?.trim() || "", attachmentText].filter(Boolean).join("\n\n").trim();
    if (baseText) {
      parts.push({ type: "text", text: baseText.slice(0, 12000) });
    }

    for (const attachment of attachments) {
      if (attachment.dataUrl) {
        parts.push({
          type: "image_url",
          image_url: { url: attachment.dataUrl },
        });
      }
    }

    if (!parts.length) {
      parts.push({ type: "text", text: message.content || "Attachment received." });
    }
    return {
      role: message.role,
      content: parts,
    };
  });
}

function parseAssistantContent(
  content: string | OpenAIContentPart[] | null | undefined,
) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => ("text" in part ? part.text : ""))
    .filter(Boolean)
    .join("");
}

function looksDeepThinkingTask(text: string) {
  const source = text.toLowerCase();
  return COMPLEX_TASK_RE.test(source) || MATH_TASK_RE.test(source) || CODE_TASK_RE.test(source);
}

function isDeepReasoningModelName(model: string) {
  const value = model.toLowerCase();
  return /(reason|thinking|o3|o4|gpt-5|claude|maverick|compound|sonnet|opus|deepseek)/i.test(
    value,
  );
}

function pickOpenAIMaxTokens(body: ChatRequest, model: string) {
  const explicit =
    typeof body.options?.max_tokens === "number"
      ? body.options.max_tokens
      : typeof body.options?.num_predict === "number"
        ? body.options.num_predict
        : undefined;
  if (typeof explicit === "number" && Number.isFinite(explicit) && explicit > 0) {
    return explicit;
  }

  const latestUser = getLatestUserMessage(body.messages);
  const deepTask = looksDeepThinkingTask(latestUser);
  const fastModel = FAST_MODEL_RE.test(model);

  const fastCap = Math.max(120, toInt(process.env.OPENAI_FAST_MAX_TOKENS, 320));
  const complexCap = Math.max(700, toInt(process.env.OPENAI_COMPLEX_MAX_TOKENS, 1400));
  const deepCap = Math.max(complexCap, toInt(process.env.OPENAI_DEEP_MAX_TOKENS, 2200));
  const balancedCap = Math.max(300, toInt(process.env.OPENAI_BALANCED_MAX_TOKENS, 800));

  if (deepTask) return deepCap;
  if (fastModel) return fastCap;
  return balancedCap;
}

function buildOpenAIPayload({
  body,
  model,
  stream,
  compatibilityMode,
  messagesOverride,
  tools,
  toolChoice,
}: {
  body: ChatRequest;
  model: string;
  stream: boolean;
  compatibilityMode: boolean;
  messagesOverride?: OpenAICompatibleMessage[];
  tools?: unknown[];
  toolChoice?: "auto" | "none";
}) {
  const payload: Record<string, unknown> = {
    model,
    messages: messagesOverride || buildOpenAIMessages(body.messages),
    stream,
  };
  const latestUser = getLatestUserMessage(body.messages);
  const deepTask = looksDeepThinkingTask(latestUser);
  const deepModel = isDeepReasoningModelName(model);

  const explicitTemperature = typeof body.options?.temperature === "number";
  const temperature =
    explicitTemperature
      ? body.options?.temperature
      : toFloat(process.env.OPENAI_DEFAULT_TEMPERATURE, 0.2);
  if (Number.isFinite(temperature)) {
    const safeTemperature = Number(temperature);
    const tunedTemperature =
      !explicitTemperature && deepTask
        ? Math.min(safeTemperature, deepModel ? 0.12 : 0.18)
        : safeTemperature;
    payload.temperature = Math.max(0, tunedTemperature);
  }

  const explicitTopP = typeof body.options?.top_p === "number";
  const topP =
    explicitTopP
      ? body.options?.top_p
      : toFloat(process.env.OPENAI_DEFAULT_TOP_P, 0.9);
  if (Number.isFinite(topP)) {
    const safeTopP = Number(topP);
    const tunedTopP = !explicitTopP && deepTask ? Math.min(safeTopP, 0.9) : safeTopP;
    payload.top_p = Math.max(0, Math.min(1, tunedTopP));
  }

  const maxTokens = pickOpenAIMaxTokens(body, model);
  if (Number.isFinite(maxTokens) && maxTokens > 0) {
    payload.max_tokens = maxTokens;
  }

  if (!compatibilityMode) {
    const serviceTier = process.env.OPENAI_SERVICE_TIER?.trim();
    if (serviceTier) payload.service_tier = serviceTier;

    const reasoningEffort = process.env.OPENAI_REASONING_EFFORT?.trim() || (deepTask ? "high" : "");
    if (reasoningEffort && /^(gpt-|o\d)/i.test(model)) {
      payload.reasoning_effort = reasoningEffort;
    }

    if (process.env.OPENAI_STORE === "true") payload.store = true;
    if (process.env.OPENAI_STORE === "false") payload.store = false;
  }

  if (Array.isArray(tools) && tools.length) {
    payload.tools = tools;
    if (toolChoice) payload.tool_choice = toolChoice;
  }

  return payload;
}

function shouldRetryCompatibility(status: number, detail: string) {
  if (status !== 400 && status !== 422) return false;
  const text = detail.toLowerCase();
  return (
    text.includes("unknown parameter") ||
    text.includes("unrecognized") ||
    text.includes("unsupported parameter") ||
    text.includes("reasoning_effort") ||
    text.includes("service_tier")
  );
}

function isToolCompatibilityIssue(status: number, detail: string) {
  if (status !== 400 && status !== 422) return false;
  const text = detail.toLowerCase();
  return (
    text.includes("tools") ||
    text.includes("tool_choice") ||
    text.includes("tool_calls") ||
    text.includes("function calling") ||
    text.includes("functions are not supported")
  );
}

function ndjsonFromText(text: string) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      const content = text.trim();
      if (content) {
        controller.enqueue(
          encoder.encode(`${JSON.stringify({ message: { content } })}\n`),
        );
      }
      controller.close();
    },
  });
}

async function jsonResponseToAssistantText(upstream: Response) {
  const data = (await upstream.json()) as {
    choices?: Array<{
      message?: {
        content?: string | OpenAIContentPart[] | null;
      };
    }>;
    model?: string;
  };
  return {
    content: parseAssistantContent(data.choices?.[0]?.message?.content),
    model: data.model,
  };
}

type OpenAICompatSender = (args: {
  model: string;
  stream: boolean;
  compatibilityMode: boolean;
  messagesOverride?: OpenAICompatibleMessage[];
  tools?: unknown[];
  toolChoice?: "auto" | "none";
}) => Promise<Response>;

async function handleOpenAICompatibleToolLoop({
  body,
  provider,
  requestedModel,
  strictModel,
  modelCandidates,
  sendRequest,
}: {
  body: ChatRequest;
  provider: "openai" | "groq";
  requestedModel: string;
  strictModel: boolean;
  modelCandidates: string[];
  sendRequest: OpenAICompatSender;
}) {
  if (
    !shouldRunToolLoop({
      messages: body.messages,
      mode: body.agent?.realtime,
      enableTools: body.agent?.tools,
    })
  ) {
    return null;
  }

  const tools = getChatToolDefinitions();
  const latestMessage = getLatestUserMessage(body.messages);

  for (const model of modelCandidates) {
    let messages = buildOpenAIMessages(body.messages) as OpenAICompatibleMessage[];
    let usedTools = false;
    let providerSupportsTools = true;

    for (let iteration = 0; iteration < 3; iteration += 1) {
      const upstream = await sendRequest({
        model,
        stream: false,
        compatibilityMode: false,
        messagesOverride: messages,
        tools,
        toolChoice: "auto",
      });

      if (!upstream.ok) {
        const detail = await upstream.text();
        if (isModelNotFound(upstream.status, detail)) {
          break;
        }
        if (isToolCompatibilityIssue(upstream.status, detail) || shouldRetryCompatibility(upstream.status, detail)) {
          providerSupportsTools = false;
          break;
        }
        return Response.json(
          {
            error: `${provider === "groq" ? "Groq" : "OpenAI"} request failed.`,
            detail,
            status: upstream.status,
          },
          { status: upstream.status },
        );
      }

      const payload = (await upstream.json()) as {
        choices?: Array<{
          message?: {
            role?: string;
            content?: string | OpenAIContentPart[] | null;
            tool_calls?: OpenAICompatibleToolCall[];
          };
        }>;
      };
      const assistantMessage = payload.choices?.[0]?.message;
      const toolCalls =
        assistantMessage?.tool_calls?.filter(
          (item) => item?.id && item.function?.name,
        ) || [];

      if (!toolCalls.length) {
        const content = parseAssistantContent(assistantMessage?.content);
        if (!usedTools) {
          // If the model chose not to use tools, fall back to the normal streaming path.
          if (!latestMessage) return null;
          break;
        }

        if (!(body.stream ?? true)) {
          return Response.json({
            message: { content },
            model,
            requestedModel,
            routedModel: model,
            strictModel,
            toolLoop: true,
          });
        }

        return new Response(ndjsonFromText(content), {
          status: 200,
          headers: {
            "Content-Type": "application/x-ndjson",
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "X-Requested-Model": requestedModel,
            "X-Routed-Model": model,
            "X-Strict-Model": strictModel ? "1" : "0",
            "X-Tool-Loop": "1",
          },
        });
      }

      usedTools = true;
      messages = [
        ...messages,
        {
          role: "assistant",
          content: parseAssistantContent(assistantMessage?.content) || "",
          tool_calls: toolCalls,
        },
      ];

      for (const toolCall of toolCalls.slice(0, 4)) {
        const toolResult = await executeChatTool({
          name: toolCall.function?.name || "",
          rawArguments: toolCall.function?.arguments || "",
          messages: body.messages,
          realtimeMode: body.agent?.realtime,
        });
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(
            {
              ok: toolResult.ok,
              tool: toolResult.name,
              result: toolResult.content,
            },
            null,
            2,
          ),
        });
      }
    }

    if (!providerSupportsTools) {
      return null;
    }

    if (usedTools) {
      const finalResponse = await sendRequest({
        model,
        stream: body.stream ?? true,
        compatibilityMode: false,
        messagesOverride: messages,
        tools,
        toolChoice: "none",
      });
      if (!finalResponse.ok) {
        const detail = await finalResponse.text();
        if (isToolCompatibilityIssue(finalResponse.status, detail) || shouldRetryCompatibility(finalResponse.status, detail)) {
          return null;
        }
        return Response.json(
          {
            error: `${provider === "groq" ? "Groq" : "OpenAI"} request failed.`,
            detail,
            status: finalResponse.status,
          },
          { status: finalResponse.status },
        );
      }

      if (!(body.stream ?? true)) {
        const parsed = await jsonResponseToAssistantText(finalResponse);
        return Response.json({
          message: { content: parsed.content },
          model: parsed.model || model,
          requestedModel,
          routedModel: model,
          strictModel,
          toolLoop: true,
        });
      }

      return new Response(streamOpenAIToNdjson(finalResponse), {
        status: finalResponse.status,
        headers: {
          "Content-Type": "application/x-ndjson",
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
          "X-Requested-Model": requestedModel,
          "X-Routed-Model": model,
          "X-Strict-Model": strictModel ? "1" : "0",
          "X-Tool-Loop": "1",
        },
      });
    }
  }

  return null;
}

async function handleHF(body: ChatRequest) {
  const token = resolveHFTokenValue();
  if (!token) {
    return Response.json(
      { error: "HF provider not configured for this model." },
      { status: 503 },
    );
  }

  const isStream = body.stream ?? true;
  const strictModel = isStrictModelRequest(body);
  const requestedModel = resolveModel(body.model, "hf", strictModel);
  const fallbackModel = getProviderFallbackModel("hf");
  const modelCandidates = dedupe(
    strictModel ? [requestedModel] : [requestedModel, fallbackModel],
  );

  const sendRequest = ({
    model,
    compatibilityMode,
    stream,
  }: {
    model: string;
    compatibilityMode: boolean;
    stream: boolean;
  }) =>
    fetch(HF_CHAT_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        buildOpenAIPayload({
          body,
          model,
          stream,
          compatibilityMode,
        }),
      ),
    });

  let finalResponse: Response | null = null;
  let finalErrorText = "";
  let routedModel = requestedModel;

  for (const model of modelCandidates) {
    let upstream = await sendRequest({
      model,
      stream: isStream,
      compatibilityMode: false,
    });
    if (!upstream.ok) {
      const errorText = await upstream.text();

      if (shouldRetryCompatibility(upstream.status, errorText)) {
        upstream = await sendRequest({
          model,
          stream: isStream,
          compatibilityMode: true,
        });
      } else if (isModelNotFound(upstream.status, errorText)) {
        finalErrorText = errorText;
        continue;
      } else {
        return Response.json(
          {
            error: "HF request failed.",
            detail: errorText,
            status: upstream.status,
          },
          { status: upstream.status },
        );
      }

      if (!upstream.ok) {
        const retryText = await upstream.text();
        if (isModelNotFound(upstream.status, retryText)) {
          finalErrorText = retryText;
          continue;
        }
        return Response.json(
          {
            error: "HF request failed.",
            detail: retryText,
            status: upstream.status,
          },
          { status: upstream.status },
        );
      }
    }

    finalResponse = upstream;
    routedModel = model;
    break;
  }

  if (!finalResponse) {
    return Response.json(
      {
        error: "HF request failed.",
        detail: finalErrorText || "No compatible HF model available.",
        status: 400,
      },
      { status: 400 },
    );
  }

  if (!isStream) {
    const text = await finalResponse.text();
    return new Response(text, {
      status: finalResponse.status,
      headers: {
        "Content-Type": finalResponse.headers.get("content-type") || "application/json",
        "Cache-Control": "no-cache, no-transform",
        "X-Requested-Model": requestedModel,
        "X-Routed-Model": routedModel,
        "X-Strict-Model": strictModel ? "1" : "0",
      },
    });
  }

  return new Response(streamOpenAIToNdjson(finalResponse), {
    status: finalResponse.status,
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      "X-Requested-Model": requestedModel,
      "X-Routed-Model": routedModel,
      "X-Strict-Model": strictModel ? "1" : "0",
    },
  });
}

function isModelNotFound(status: number, detail: string) {
  if (status === 404) return true;
  const text = detail.toLowerCase();
  return text.includes("model") && text.includes("not found");
}

function streamOpenAIToNdjson(upstream: Response) {
  if (!upstream.body) {
    return new ReadableStream({
      start(controller) {
        controller.close();
      },
    });
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  return new ReadableStream({
    start(controller) {
      const pump = async () => {
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data:")) continue;
              const payload = trimmed.slice(5).trim();
              if (!payload) continue;
              if (payload === "[DONE]") {
                controller.close();
                return;
              }
              try {
                const json = JSON.parse(payload) as {
                  choices?: Array<{ delta?: { content?: string } }>;
                };
                const content = json.choices?.[0]?.delta?.content;
                if (content) {
                  controller.enqueue(encoder.encode(`${JSON.stringify({ message: { content } })}\n`));
                }
              } catch {
                // Ignore malformed chunks.
              }
            }
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      };

      void pump();
    },
    cancel() {
      void reader.cancel();
    },
  });
}

function streamAnthropicToNdjson(upstream: Response) {
  if (!upstream.body) {
    return new ReadableStream({
      start(controller) {
        controller.close();
      },
    });
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  return new ReadableStream({
    start(controller) {
      const pump = async () => {
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data:")) continue;
              const payload = trimmed.slice(5).trim();
              if (!payload || payload === "[DONE]") continue;
              try {
                const json = JSON.parse(payload) as {
                  type?: string;
                  delta?: { text?: string };
                };
                if (json.type === "content_block_delta" && json.delta?.text) {
                  controller.enqueue(
                    encoder.encode(`${JSON.stringify({ message: { content: json.delta.text } })}\n`),
                  );
                }
              } catch {
                // Ignore malformed event chunks.
              }
            }
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      };

      void pump();
    },
    cancel() {
      void reader.cancel();
    },
  });
}

function isAnthropicModelNotFound(status: number, detail: string) {
  if (status === 404) return true;
  const text = detail.toLowerCase();
  return text.includes("model") && (text.includes("not found") || text.includes("invalid"));
}

async function handleAnthropic(body: ChatRequest) {
  if (!hasAnthropicProvider()) {
    return Response.json(
      { error: "Anthropic provider not configured for this model." },
      { status: 503 },
    );
  }

  const baseUrl = resolveAnthropicBaseUrl();
  const isStream = body.stream ?? true;
  const strictModel = isStrictModelRequest(body);
  const requestedModel = resolveModel(body.model, "anthropic", strictModel);
  const fastModel = getAnthropicFastModel();
  const reasoningModel = getAnthropicReasoningModel();
  const fallbackModel = getProviderFallbackModel("anthropic");
  const prioritized = strictModel
    ? [requestedModel]
    : [requestedModel, reasoningModel, fastModel, fallbackModel];
  const modelCandidates = dedupe(prioritized);
  const parsedTemperature =
    typeof body.options?.temperature === "number"
      ? body.options.temperature
      : toFloat(process.env.OPENAI_DEFAULT_TEMPERATURE, 0.2);
  const parsedTopP =
    typeof body.options?.top_p === "number"
      ? body.options.top_p
      : toFloat(process.env.OPENAI_DEFAULT_TOP_P, 0.9);

  const { system, messages } = buildAnthropicMessages(body.messages);
  if (!messages.length) {
    return Response.json({ error: "Anthropic request has no user/assistant messages." }, { status: 400 });
  }

  let finalResponse: Response | null = null;
  let finalErrorText = "";
  let routedModel = requestedModel;

  for (const model of modelCandidates) {
    const maxTokens = Math.max(64, pickOpenAIMaxTokens({ ...body, model }, model));
    const payload: Record<string, unknown> = {
      model,
      messages,
      stream: isStream,
      max_tokens: maxTokens,
    };
    if (system) payload.system = system;
    if (Number.isFinite(parsedTemperature)) payload.temperature = parsedTemperature;
    if (Number.isFinite(parsedTopP)) payload.top_p = parsedTopP;

    const upstream = await fetch(`${baseUrl}/messages`, {
      method: "POST",
      headers: anthropicHeaders(),
      body: JSON.stringify(payload),
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      if (isAnthropicModelNotFound(upstream.status, detail)) {
        finalErrorText = detail;
        continue;
      }
      return Response.json(
        {
          error: "Anthropic request failed.",
          detail,
          status: upstream.status,
        },
        { status: upstream.status },
      );
    }

    finalResponse = upstream;
    routedModel = model;
    break;
  }

  if (!finalResponse) {
    return Response.json(
      {
        error: "Anthropic request failed.",
        detail: finalErrorText || "No compatible Claude model available.",
        status: 400,
      },
      { status: 400 },
    );
  }

  if (!isStream) {
    const data = (await finalResponse.json()) as {
      content?: Array<{ type?: string; text?: string }>;
      model?: string;
    };
    const content = (data.content || [])
      .filter((entry) => entry?.type === "text" && entry.text)
      .map((entry) => entry.text)
      .join("");
    return Response.json({
      message: { content },
      model: data.model || routedModel,
      requestedModel,
      routedModel,
      strictModel,
    });
  }

  return new Response(streamAnthropicToNdjson(finalResponse), {
    status: finalResponse.status,
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      "X-Requested-Model": requestedModel,
      "X-Routed-Model": routedModel,
      "X-Strict-Model": strictModel ? "1" : "0",
    },
  });
}

async function handleOpenAI(body: ChatRequest) {
  if (!hasOpenAIProvider()) {
    return Response.json(
      { error: "OpenAI provider not configured for this model." },
      { status: 503 },
    );
  }

  const baseUrl = resolveOpenAIBaseUrl();
  const isStream = body.stream ?? true;
  const strictModel = isStrictModelRequest(body);
  const requestedModel = resolveModel(body.model, "openai", strictModel);
  const fastModel = getOpenAIFastModel();
  const reasoningModel = getOpenAIReasoningModel();
  const visionModel = getOpenAIVisionModel();
  const fallbackModel = getProviderFallbackModel("openai");
  const hasImageInput = hasImageAttachments(body.messages);
  const prioritized = strictModel
    ? [requestedModel]
    : [requestedModel, hasImageInput ? visionModel : "", reasoningModel, fastModel, fallbackModel];
  const modelCandidates = dedupe(prioritized);

  const sendRequest: OpenAICompatSender = ({
    model,
    compatibilityMode,
    stream,
    messagesOverride,
    tools,
    toolChoice,
  }) =>
    fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: openaiHeaders(),
      body: JSON.stringify(
        buildOpenAIPayload({
          body,
          model,
          stream,
          compatibilityMode,
          messagesOverride,
          tools,
          toolChoice,
        }),
      ),
    });

  const toolLoopResponse = await handleOpenAICompatibleToolLoop({
    body,
    provider: "openai",
    requestedModel,
    strictModel,
    modelCandidates,
    sendRequest,
  });
  if (toolLoopResponse) return toolLoopResponse;

  let finalResponse: Response | null = null;
  let finalErrorText = "";
  let routedModel = requestedModel;

  for (const model of modelCandidates) {
    let upstream = await sendRequest({
      model,
      stream: isStream,
      compatibilityMode: false,
    });
    if (!upstream.ok) {
      const errorText = await upstream.text();

      if (shouldRetryCompatibility(upstream.status, errorText)) {
        upstream = await sendRequest({
          model,
          stream: isStream,
          compatibilityMode: true,
        });
      } else if (isModelNotFound(upstream.status, errorText)) {
        finalErrorText = errorText;
        continue;
      } else {
        return Response.json(
          {
            error: "OpenAI request failed.",
            detail: errorText,
            status: upstream.status,
          },
          { status: upstream.status },
        );
      }

      if (!upstream.ok) {
        const retryText = await upstream.text();
        if (isModelNotFound(upstream.status, retryText)) {
          finalErrorText = retryText;
          continue;
        }
        return Response.json(
          {
            error: "OpenAI request failed.",
            detail: retryText,
            status: upstream.status,
          },
          { status: upstream.status },
        );
      }
    }

    finalResponse = upstream;
    routedModel = model;
    break;
  }

  if (!finalResponse) {
    return Response.json(
      {
        error: "OpenAI request failed.",
        detail: finalErrorText || "No compatible model available.",
        status: 400,
      },
      { status: 400 },
    );
  }

  if (!isStream) {
    const text = await finalResponse.text();
    return new Response(text, {
      status: finalResponse.status,
      headers: {
        "Content-Type": finalResponse.headers.get("content-type") || "application/json",
        "Cache-Control": "no-cache, no-transform",
        "X-Requested-Model": requestedModel,
        "X-Routed-Model": routedModel,
        "X-Strict-Model": strictModel ? "1" : "0",
      },
    });
  }

  return new Response(streamOpenAIToNdjson(finalResponse), {
    status: finalResponse.status,
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      "X-Requested-Model": requestedModel,
      "X-Routed-Model": routedModel,
      "X-Strict-Model": strictModel ? "1" : "0",
    },
  });
}

async function handleGroq(body: ChatRequest) {
  if (!hasGroqProvider()) {
    return Response.json(
      { error: "Groq provider not configured for this model." },
      { status: 503 },
    );
  }

  const baseUrl = resolveGroqBaseUrl();
  const isStream = body.stream ?? true;
  const strictModel = isStrictModelRequest(body);
  const requestedModel = resolveModel(body.model, "groq", strictModel);
  const fastModel = getGroqFastModel();
  const reasoningModel = getGroqPrimaryModel();
  const visionModel = getGroqVisionModel();
  const fallbackModel = getProviderFallbackModel("groq");
  const hasImageInput = hasImageAttachments(body.messages);
  const modelCandidates = dedupe(
    strictModel
      ? [requestedModel]
      : [requestedModel, hasImageInput ? visionModel : "", reasoningModel, fastModel, fallbackModel],
  );

  const sendRequest: OpenAICompatSender = ({
    model,
    compatibilityMode,
    stream,
    messagesOverride,
    tools,
    toolChoice,
  }) => {
    const payload = JSON.stringify(
      buildOpenAIPayload({
        body,
        model,
        stream,
        compatibilityMode,
        messagesOverride,
        tools,
        toolChoice,
      }),
    );

    if (getAllGroqKeys().length > 0) {
      return groqFetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      });
    }

    return fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resolveGroqApiKey()}`,
        "Content-Type": "application/json",
      },
      body: payload,
    });
  };

  const toolLoopResponse = await handleOpenAICompatibleToolLoop({
    body,
    provider: "groq",
    requestedModel,
    strictModel,
    modelCandidates,
    sendRequest,
  });
  if (toolLoopResponse) return toolLoopResponse;

  let finalResponse: Response | null = null;
  let finalErrorText = "";
  let routedModel = requestedModel;

  for (const model of modelCandidates) {
    let upstream = await sendRequest({
      model,
      stream: isStream,
      compatibilityMode: false,
    });
    if (!upstream.ok) {
      const errorText = await upstream.text();

      if (shouldRetryCompatibility(upstream.status, errorText)) {
        upstream = await sendRequest({
          model,
          stream: isStream,
          compatibilityMode: true,
        });
      } else if (isModelNotFound(upstream.status, errorText)) {
        finalErrorText = errorText;
        continue;
      } else {
        return Response.json(
          {
            error: "Groq request failed.",
            detail: errorText,
            status: upstream.status,
          },
          { status: upstream.status },
        );
      }

      if (!upstream.ok) {
        const retryText = await upstream.text();
        if (isModelNotFound(upstream.status, retryText)) {
          finalErrorText = retryText;
          continue;
        }
        return Response.json(
          {
            error: "Groq request failed.",
            detail: retryText,
            status: upstream.status,
          },
          { status: upstream.status },
        );
      }
    }

    finalResponse = upstream;
    routedModel = model;
    break;
  }

  if (!finalResponse) {
    return Response.json(
      {
        error: "Groq request failed.",
        detail: finalErrorText || "No compatible Groq model available.",
        status: 400,
      },
      { status: 400 },
    );
  }

  if (!isStream) {
    const text = await finalResponse.text();
    return new Response(text, {
      status: finalResponse.status,
      headers: {
        "Content-Type": finalResponse.headers.get("content-type") || "application/json",
        "Cache-Control": "no-cache, no-transform",
        "X-Requested-Model": requestedModel,
        "X-Routed-Model": routedModel,
        "X-Strict-Model": strictModel ? "1" : "0",
      },
    });
  }

  return new Response(streamOpenAIToNdjson(finalResponse), {
    status: finalResponse.status,
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      "X-Requested-Model": requestedModel,
      "X-Routed-Model": routedModel,
      "X-Strict-Model": strictModel ? "1" : "0",
    },
  });
}

async function handleOllama(body: ChatRequest) {
  const baseUrl = process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_URL;
  const isStream = body.stream ?? true;
  const selectedModel = body.model;
  const options = { ...(body.options ?? {}) };
  if (
    typeof options.max_tokens !== "number" &&
    typeof options.num_predict !== "number"
  ) {
    options.num_predict = pickOpenAIMaxTokens({ ...body, model: selectedModel }, selectedModel);
  }
  const deepTask = looksDeepThinkingTask(getLatestUserMessage(body.messages));
  if (deepTask && typeof options.temperature !== "number") {
    options.temperature = 0.15;
  }
  if (deepTask && typeof options.top_p !== "number") {
    options.top_p = 0.9;
  }

  const upstream = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: selectedModel,
      messages: body.messages,
      stream: isStream,
      options,
    }),
  });

  if (!upstream.ok) {
    const errorText = await upstream.text();
    return Response.json(
      {
        error: "Ollama request failed.",
        detail: errorText,
        status: upstream.status,
      },
      { status: upstream.status },
    );
  }

  if (!isStream) {
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "application/json",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuthOrGuest(req);
    const allowGuest = envFlag("ALLOW_GUEST_CHAT", true);
    if (auth.isGuest && !allowGuest) {
      return Response.json({ error: "Login required." }, { status: 401 });
    }
    if (!auth.isGuest) {
      await enforceLimits(auth.userId);
    }
    const body = (await req.json()) as ChatRequest;

    if (!body?.model || !body?.messages?.length) {
      return Response.json({ error: "Missing model or messages." }, { status: 400 });
    }

    const provider = resolveOperationalProvider(body.model);
    const strictModel = isStrictModelRequest(body);
    const selectedModel = resolveModel(body.model, provider, strictModel);

    const memoryPrompt = auth.isGuest
      ? ""
      : await buildMemorySystemPrompt({
          userId: auth.userId,
          messages: body.messages,
        });

    const agentEnabled =
      typeof body.agent?.enabled === "boolean"
        ? body.agent.enabled
        : envFlag("AGENT_MODE_ENABLED", true);
    const nlpEnabled =
      typeof body.agent?.nlp === "boolean"
        ? body.agent.nlp
        : envFlag("AGENT_NLP_ENABLED", true);
    const toolsEnabled =
      typeof body.agent?.tools === "boolean"
        ? body.agent.tools
        : envFlag("AGENT_TOOLS_ENABLED", true);
    const nativeToolProvider = provider === "openai" || provider === "groq";
    const canUseNativeToolLoop = nativeToolProvider && agentEnabled && toolsEnabled;

    const agentContext =
      agentEnabled || nlpEnabled
        ? await buildAgentContext({
            messages: body.messages,
            enableNlp: nlpEnabled,
            enableTools: agentEnabled && toolsEnabled,
          })
        : null;
    const realtimePrompt = await buildRealtimeSystemPrompt({
      messages: body.messages,
      mode: body.agent?.realtime,
    });
    const toolPrompt = canUseNativeToolLoop ? buildToolSystemPrompt(body.agent?.realtime) : "";
    const safetyPrompt = buildSafetySystemPrompt(body.moderationMode);

    const systemPrompts = [
      memoryPrompt,
      agentContext?.systemPrompt,
      toolPrompt,
      realtimePrompt,
      safetyPrompt,
    ].filter(Boolean) as string[];
    const enrichedMessages =
      systemPrompts.length > 0
        ? [
            ...systemPrompts.map((content) => ({ role: "system" as const, content })),
            ...body.messages,
          ]
        : body.messages;

    const enrichedBody: ChatRequest = {
      ...body,
      strictModel,
      model: selectedModel,
      messages: enrichedMessages,
    };

    if (provider === "anthropic" || isAnthropicModel(selectedModel)) {
      return await handleAnthropic(enrichedBody);
    }
    if (provider === "groq") {
      return await handleGroq(enrichedBody);
    }
    if (provider === "openai") {
      return await handleOpenAI(enrichedBody);
    }
    if (provider === "hf") {
      return await handleHF(enrichedBody);
    }

    return await handleOllama(enrichedBody);
  } catch (error) {
    const message = String(error);
    let status = 500;
    if (message.includes("Unauthorized")) status = 401;
    if (message.includes("Invalid API key")) status = 403;
    if (message.includes("Daily limit")) status = 429;
    if (message.includes("Minute limit")) status = 429;
    const detail = status === 500 ? "Unexpected server error." : message;
    return Response.json({ error: detail }, { status });
  }
}
