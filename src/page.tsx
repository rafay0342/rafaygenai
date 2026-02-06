"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { signOut, useSession } from "next-auth/react";

type Role = "user" | "assistant" | "system";

type Message = {
  role: Role;
  content: string;
};

type MediaItem = {
  kind: "image" | "video" | "gif" | "unknown";
  url: string;
};

type ConnectionMode = "proxy" | "browser";

const DEFAULT_SYSTEM_PROMPT =
  "You are RafayGen The Ai LLM Studio, a sharp local-first assistant. Be concise, practical, and action-oriented.";

const PROMPT_TEMPLATES = [
  {
    label: "General task",
    value:
      "Task: <what you want>\nContext: <important background>\nConstraints: <time, tools, budget, format>\nOutput format: <bullets / table / code>",
  },
  {
    label: "Coding help",
    value:
      "Goal: <feature/bugfix>\nStack: <language/framework>\nCode context: <file paths or snippets>\nConstraints: <style/perf/security>\nOutput: <patch or steps>",
  },
  {
    label: "Debugging",
    value:
      "Problem: <error + symptoms>\nEnvironment: <OS, versions>\nSteps to reproduce:\n1. ...\nLogs:\n<error logs>\nExpected: <what should happen>",
  },
  {
    label: "Summarize",
    value:
      "Summarize this for: <audience>\nLength: <short/medium/long>\nFocus: <key points>\nText:\n<content>",
  },
  {
    label: "Rewrite",
    value:
      "Rewrite as: <tone/style>\nLength: <shorter/same/longer>\nMust keep: <facts/phrases>\nText:\n<content>",
  },
  {
    label: "Brainstorm",
    value:
      "Brainstorm: <topic>\nConstraints: <budget/tech/etc>\nCount: <number>\nStyle: <practical/creative>",
  },
  {
    label: "Plan",
    value:
      "Create a plan for: <goal>\nConstraints: <time/resources>\nOutput: <milestones + tasks>",
  },
  {
    label: "Compare",
    value:
      "Compare: <A vs B>\nCriteria: <cost, speed, quality>\nOutput: <table + recommendation>",
  },
  {
    label: "Decision",
    value:
      "Decision: <what to choose>\nPriorities: <ranked list>\nContext: <current situation>",
  },
  {
    label: "Image prompt",
    value:
      "Subject: <main subject>\nStyle: <photorealistic / cinematic / illustration>\nLighting: <soft, dramatic, neon>\nComposition: <close-up, wide, rule-of-thirds>\nDetails: <textures, mood>\nNegative: <avoid artifacts, blur, extra limbs>",
  },
];

const MODEL_PRESETS = [
  {
    id: "rafaygenai-2",
    label: "RafayGenAI 2",
    note: "Balanced general assistant.",
  },
  {
    id: "rafaygenai-2.5-flash",
    label: "RafayGenAI 2.5 Flash",
    note: "Fastest response mode.",
  },
  {
    id: "rafaygenai-3",
    label: "RafayGenAI 3",
    note: "Advanced reasoning.",
  },
  {
    id: "rafaygenai-3-pro",
    label: "RafayGenAI 3 Pro",
    note: "Pro-level expertise (stable).",
  },
  {
    id: "rafaygenai-4-pro",
    label: "RafayGenAI 4 Pro",
    note: "Experimental fire-level power.",
  },
] as const;

const EXPERIMENTAL_RE = /(preview|exp|experimental|beta|latest|edge)/i;
const FAST_RE = /(mini|flash|instant|turbo|small|lite)/i;
const PRO_RE = /\bpro\b/i;
const SIZE_RE = /(\d+(?:\.\d+)?)\s*b/i;

function parseModelSize(name: string) {
  const match = name.match(SIZE_RE);
  if (!match) return null;
  const size = Number(match[1]);
  return Number.isFinite(size) ? size : null;
}

function scoreModel(name: string, presetId: string) {
  const n = name.toLowerCase();
  let score = 0;
  const size = parseModelSize(n);
  const isExperimental = EXPERIMENTAL_RE.test(n);
  const isFast = FAST_RE.test(n);

  if (n.includes("gpt-4.1")) score += 90;
  else if (n.includes("gpt-4o")) score += 85;
  else if (n.includes("gpt-4")) score += 80;
  else if (n.includes("gpt-3.5")) score += 60;

  if (size) {
    score += Math.min(size, 200);
  }

  if (presetId === "rafaygenai-2.5-flash") {
    if (isFast) score += 60;
    if (size && size <= 8) score += 35;
    if (size && size >= 34) score -= 25;
    if (isExperimental) score -= 5;
  } else if (presetId === "rafaygenai-4-pro") {
    if (isExperimental) score += 60;
    if (PRO_RE.test(n)) score += 15;
    if (size && size >= 70) score += 30;
    if (isFast) score -= 10;
  } else if (presetId === "rafaygenai-3-pro") {
    if (isExperimental) score -= 20;
    if (PRO_RE.test(n)) score += 10;
    if (size && size >= 34) score += 20;
  } else if (presetId === "rafaygenai-3") {
    if (size && size >= 20) score += 15;
  } else if (presetId === "rafaygenai-2") {
    if (isFast) score += 10;
    if (size && size <= 13) score += 10;
  }

  return score;
}

function mapPresetToModel(
  presetId: string,
  availableModels: string[],
  fallback: string,
) {
  if (!availableModels.length) return fallback;
  let best = availableModels[0];
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const entry of availableModels) {
    const score = scoreModel(entry, presetId);
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }
  return best;
}

export default function Home() {
  const { data: session } = useSession();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [model, setModel] = useState("llama3.2:3b");
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [temperature, setTemperature] = useState(0.7);
  const [topP, setTopP] = useState(0.9);
  const [mode, setMode] = useState<ConnectionMode>("proxy");
  const [baseUrl, setBaseUrl] = useState("http://localhost:11434");
  const [isStreaming, setIsStreaming] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(
    "rafaygenai-2.5-flash",
  );
  const [presetMapping, setPresetMapping] = useState<Record<string, string>>({});
  const [isPresetMenuOpen, setIsPresetMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [apiKeyName, setApiKeyName] = useState("Default");
  const [apiKeys, setApiKeys] = useState<
    Array<{ id: string; name: string; prefix: string; createdAt: string }>
  >([]);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [usage, setUsage] = useState<{
    count: number;
    limit: number;
    minuteCount: number;
    minuteLimit: number;
  } | null>(null);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceLanguage, setVoiceLanguage] = useState<
    "en" | "ur" | "roman-ur"
  >("en");
  const [autoSendVoice, setAutoSendVoice] = useState(true);
  const [transliterateVoice, setTransliterateVoice] = useState(true);

  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const partialTranscriptRef = useRef("");
  const inputRef = useRef("");
  const presetMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  useEffect(() => {
    inputRef.current = input;
  }, [input]);

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
    void loadModels();
    void loadKeys();
    void loadUsage();
    void loadHistory();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (!voices.length) return;
      voiceRef.current = selectVoice(voices, voiceLanguage);
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, [voiceLanguage]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => {
      setIsListening(false);
      if (autoSendVoice) {
        const trimmed = inputRef.current.trim();
        if (trimmed && !isStreaming) {
          void sendMessage();
        }
      }
    };
    recognition.onerror = (event: any) => {
      setError(`Voice error: ${event.error}`);
      setIsListening(false);
    };
    recognition.onresult = (event: any) => {
      let interim = "";
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) {
          finalText += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      if (interim) {
        const previousPartial = partialTranscriptRef.current;
        partialTranscriptRef.current = interim;
        setInput((prev) => {
          const base = prev.replace(previousPartial, "").trim();
          return base ? `${base} ${interim}` : interim;
        });
      }
      if (finalText) {
        partialTranscriptRef.current = "";
        setInput((prev) => {
          const trimmed = prev.trim();
          return trimmed ? `${trimmed} ${finalText.trim()}` : finalText.trim();
        });
      }
    };
    recognitionRef.current = recognition;
  }, []);

  const hasMessages = messages.length > 0;
  const activePreset = MODEL_PRESETS.find(
    (preset) => preset.id === selectedPresetId,
  );
  const activePresetLabel = activePreset ? activePreset.label : "Custom model";

  const composedMessages = useMemo(() => {
    const trimmed = systemPrompt.trim();
    if (!trimmed) return messages;
    return [{ role: "system", content: trimmed }, ...messages];
  }, [messages, systemPrompt]);

  const sendMessage = async () => {
    if (!input.trim() || isStreaming) return;
    setError(null);
    if (voiceEnabled && typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      speechQueueRef.current = [];
      isSpeakingRef.current = false;
      setIsSpeaking(false);
    }

    const rawInput = input.trim();
    let modelInput = rawInput;
    let displayInput = rawInput;
    if (transliterateVoice) {
      const transliterated = await transliterateText(rawInput);
      if (transliterated && transliterated !== rawInput) {
        modelInput = transliterated;
        displayInput = `${rawInput}\n\n[Urdu]\n${transliterated}`;
      } else {
        modelInput = transliterated || rawInput;
      }
    }

    const userMessage: Message = { role: "user", content: displayInput };
    setInput("");

    setMessages((prev) => [...prev, userMessage, { role: "assistant", content: "" }]);
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const payload = {
      model,
      messages: [
        ...composedMessages,
        { role: "user", content: modelInput },
      ],
      stream: true,
      options: { temperature, top_p: topP },
    };

    const endpoint =
      mode === "proxy" ? "/api/chat" : `${baseUrl.replace(/\/$/, "")}/api/chat`;

    let assistantText = "";
    let speakBuffer = "";
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const text = await response.text();
        throw new Error(text || "Request failed.");
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
          if (!line.trim()) continue;
          try {
            const chunk = JSON.parse(line);
            const content = chunk?.message?.content;
            if (content) {
              assistantText += content;
              if (voiceEnabled) {
                speakBuffer += content;
                const now = Date.now();
                if (speakBuffer.length >= 40 || now - lastSpeakRef.current > 800) {
                  const chunk = speakBuffer.trim();
                  speakBuffer = "";
                  if (chunk) enqueueSpeech(chunk);
                }
              }
              setMessages((prev) => {
                const next = [...prev];
                const lastIndex = next.length - 1;
                const last = next[lastIndex];
                if (last?.role === "assistant") {
                  next[lastIndex] = { ...last, content: last.content + content };
                }
                return next;
              });
            }
          } catch (parseError) {
            setError(String(parseError));
          }
        }
      }
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
      setIsStreaming(false);
      abortRef.current = null;
      void loadUsage();
      if (voiceEnabled && speakBuffer.trim()) {
        enqueueSpeech(speakBuffer.trim());
      }
      if (assistantText.trim()) {
        void saveHistory([
          userMessage,
          { role: "assistant", content: assistantText },
        ]);
      }
    }
  };

  const saveHistory = async (items: Message[]) => {
    try {
      await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: items }),
      });
    } catch {
      // Ignore history errors.
    }
  };

  const transliterateText = async (text: string) => {
    try {
      const response = await fetch("/api/transliterate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, model }),
      });
      if (!response.ok) return text;
      const data = (await response.json()) as { text?: string };
      return data.text || text;
    } catch {
      return text;
    }
  };

  const speakText = (text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    if (!voiceEnabled) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();
    const voices = window.speechSynthesis.getVoices();
    voiceRef.current = selectVoice(voices, voiceLanguage);
    const utterance = new SpeechSynthesisUtterance(text);
    if (voiceRef.current) {
      utterance.voice = voiceRef.current;
    }
    utterance.rate = 1.15;
    utterance.pitch = 1.2;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  const speechQueueRef = useRef<string[]>([]);
  const isSpeakingRef = useRef(false);
  const lastSpeakRef = useRef(0);

  const enqueueSpeech = (text: string) => {
    if (!text) return;
    speechQueueRef.current.push(text);
    lastSpeakRef.current = Date.now();
    if (!isSpeakingRef.current) {
      void playNextSpeech();
    }
  };

  const playNextSpeech = async () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const next = speechQueueRef.current.shift();
    if (!next) return;
    isSpeakingRef.current = true;
    window.speechSynthesis.resume();
    const voices = window.speechSynthesis.getVoices();
    voiceRef.current = selectVoice(voices, voiceLanguage);
    const utterance = new SpeechSynthesisUtterance(next);
    if (voiceRef.current) {
      utterance.voice = voiceRef.current;
    }
    utterance.rate = 1.05;
    utterance.pitch = 1.2;
    utterance.onstart = () => {
      setIsSpeaking(true);
    };
    utterance.onend = () => {
      setIsSpeaking(false);
      isSpeakingRef.current = false;
      void playNextSpeech();
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      isSpeakingRef.current = false;
      void playNextSpeech();
    };
    window.speechSynthesis.speak(utterance);
  };

  const testVoice = () => {
    speakText("Hello, I am your RafayGen voice assistant. How can I help?");
  };

  const toggleListening = () => {
    if (!recognitionRef.current) {
      setError("Voice input not supported in this browser.");
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
      return;
    }
    try {
      recognitionRef.current.lang =
        voiceLanguage === "ur" ? "ur-PK" : "en-US";
      recognitionRef.current.start();
    } catch (err) {
      setError(String(err));
    }
  };

  const selectVoice = (
    voices: SpeechSynthesisVoice[],
    mode: "en" | "ur" | "roman-ur",
  ) => {
    if (!voices.length) return null;
    if (mode === "ur") {
      return (
        voices.find((voice) => /ur/i.test(voice.lang)) ||
        voices.find((voice) => /female|woman|girl/i.test(voice.name)) ||
        voices[0]
      );
    }
    const preferred =
      voices.find((voice) => /Samantha/i.test(voice.name)) ||
      voices.find((voice) => /Ava|Serena|Victoria|Zira/i.test(voice.name)) ||
      voices.find((voice) => /female|woman|girl/i.test(voice.name)) ||
      voices.find((voice) => /en/i.test(voice.lang));
    return preferred || voices[0];
  };

  const loadModels = async () => {
    setLoadingModels(true);
    setError(null);
    try {
      const response = await fetch("/api/models");
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = (await response.json()) as { models: string[] };
      setModels(data.models);
      const nextMapping: Record<string, string> = {};
      for (const preset of MODEL_PRESETS) {
        nextMapping[preset.id] = mapPresetToModel(
          preset.id,
          data.models,
          model,
        );
      }
      setPresetMapping(nextMapping);
      if (selectedPresetId) {
        const mapped = nextMapping[selectedPresetId];
        if (mapped && mapped !== model) {
          setModel(mapped);
        }
      } else if (data.models.length && !data.models.includes(model)) {
        setModel(data.models[0]);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoadingModels(false);
    }
  };

  const loadHistory = async () => {
    try {
      const response = await fetch("/api/history");
      if (!response.ok) return;
      const data = (await response.json()) as { messages?: Message[] };
      if (data.messages?.length) {
        setMessages(data.messages);
      }
    } catch {
      // Ignore history load errors.
    }
  };

  const loadKeys = async () => {
    setError(null);
    try {
      const response = await fetch("/api/keys");
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = (await response.json()) as {
        keys: Array<{ id: string; name: string; prefix: string; createdAt: string }>;
      };
      setApiKeys(data.keys);
    } catch (err) {
      setError(String(err));
    }
  };

  const loadUsage = async () => {
    try {
      const response = await fetch("/api/usage");
      if (!response.ok) return;
      const data = (await response.json()) as {
        count: number;
        limit: number;
        minuteCount: number;
        minuteLimit: number;
      };
      setUsage({
        count: data.count,
        limit: data.limit,
        minuteCount: data.minuteCount,
        minuteLimit: data.minuteLimit,
      });
    } catch {
      // ignore
    }
  };

  const createKey = async () => {
    setError(null);
    try {
      const response = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: apiKeyName }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = (await response.json()) as {
        key: string;
        saved: { id: string; name: string; prefix: string; createdAt: string };
      };
      setNewKey(data.key);
      setApiKeys((prev) => [data.saved, ...prev]);
    } catch (err) {
      setError(String(err));
    }
  };

  const runTool = async (tool: "fetch" | "read" | "exec") => {
    const prompt =
      tool === "fetch"
        ? "Enter a URL to fetch"
        : tool === "read"
          ? "Enter a file path to read"
          : "Enter a command to run";
    const inputValue = window.prompt(prompt);
    if (!inputValue) return;

    setError(null);
    try {
      const response = await fetch(`/api/tools/${tool}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          tool === "fetch"
            ? { url: inputValue }
            : tool === "read"
              ? { path: inputValue }
              : { command: inputValue },
        ),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = (await response.json()) as { output: string };
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Tool (${tool}) output:\n${data.output}`,
        },
      ]);
    } catch (err) {
      setError(String(err));
    }
  };

  const generateMedia = async (type: "image" | "video") => {
    const inputValue = window.prompt(
      type === "image" ? "Image prompt" : "Video prompt",
    );
    if (!inputValue) return;
    setError(null);
    try {
      const response = await fetch(`/api/media/${type}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: inputValue }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = (await response.json()) as {
        files: Array<{
          filename: string;
          subfolder?: string;
          type?: string;
          kind: "image" | "video" | "gif" | "unknown";
        }>;
      };
      const mapped = data.files.map((file) => {
        const params = new URLSearchParams();
        params.set("filename", file.filename);
        if (file.subfolder) params.set("subfolder", file.subfolder);
        if (file.type) params.set("type", file.type);
        return {
          kind: file.kind,
          url: `/api/media/file?${params.toString()}`,
        };
      });
      setMediaItems((prev) => [...mapped, ...prev]);
    } catch (err) {
      setError(String(err));
    } finally {
      void loadUsage();
    }
  };

  const stopStreaming = () => {
    abortRef.current?.abort();
    setIsStreaming(false);
  };

  const clearChat = () => {
    setMessages([]);
    setError(null);
  };

  return (
    <div className="app-shell relative min-h-screen overflow-x-hidden px-4 py-8 text-white sm:px-8">
      <div className="absolute -left-20 top-24 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(61,242,255,0.35),transparent_70%)] blur-3xl" />
      <div className="absolute -right-12 top-64 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(255,79,216,0.3),transparent_70%)] blur-3xl" />

      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="neon-panel flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-[var(--panel-border)] bg-[var(--panel)]/75 px-6 py-4 backdrop-blur">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
              RafayGen Ai
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">
              The Ai LLM Studio
            </h1>
          </div>
          <div className="flex items-center gap-3 text-sm text-[var(--muted)]">
            <span className="neon-chip rounded-full border border-[var(--panel-border)] px-3 py-1">
              {mode === "proxy" ? "Server Proxy" : "Browser Local"}
            </span>
            <span className="neon-chip rounded-full border border-[var(--panel-border)] px-3 py-1">
              Model: {model}
            </span>
            {usage ? (
              <span className="neon-chip rounded-full border border-[var(--panel-border)] px-3 py-1">
                Usage: {usage.count}/{usage.limit} • Min {usage.minuteCount}/
                {usage.minuteLimit}
              </span>
            ) : null}
            {session?.user?.email ? (
              <button
                className="rounded-full border border-[var(--panel-border)] px-3 py-1 text-xs text-[var(--muted)] transition hover:text-white"
                onClick={() => signOut()}
                type="button"
              >
                Sign out
              </button>
            ) : null}
            {session?.user?.role === "admin" ? (
              <a
                className="rounded-full border border-[var(--panel-border)] px-3 py-1 text-xs text-[var(--muted)] transition hover:text-white"
                href="/admin"
              >
                Admin
              </a>
            ) : null}
          </div>
        </header>

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="neon-panel flex flex-col gap-4 rounded-3xl border border-[var(--panel-border)] bg-[var(--panel)]/75 p-6 backdrop-blur">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Session</h2>
              <div className="flex gap-2">
                <button
                  className="rounded-full border border-[var(--panel-border)] px-4 py-2 text-sm text-[var(--muted)] transition hover:text-white"
                  onClick={clearChat}
                  type="button"
                >
                  Clear
                </button>
                {isStreaming ? (
                  <button
                    className="rounded-full bg-[var(--danger)] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[#ff9c92]"
                    onClick={stopStreaming}
                    type="button"
                  >
                    Stop
                  </button>
                ) : null}
              </div>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto rounded-2xl border border-[var(--panel-border)] bg-[#0e0e14] p-4 text-sm text-[var(--muted)]">
              {!hasMessages ? (
                <div className="rounded-2xl border border-dashed border-[var(--panel-border)] p-6 text-center">
                  <p className="text-base text-white">
                    Ask something and watch the stream.
                  </p>
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    The console is ready. Connect to Ollama and start chatting.
                  </p>
                </div>
              ) : null}
              {messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={`flex ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[90%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      message.role === "user"
                        ? "bg-[var(--accent)] text-black"
                        : "bg-[#1b1c26] text-white"
                    }`}
                  >
                    <span className="mb-1 block text-[10px] uppercase tracking-[0.2em] text-black/50">
                      {message.role}
                    </span>
                    <p>{message.content}</p>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            {mediaItems.length ? (
              <div className="neon-panel rounded-2xl border border-[var(--panel-border)] bg-[#0b0d18] p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                  Media
                </p>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {mediaItems.map((item, index) => (
                    <div
                      key={`${item.url}-${index}`}
                      className="neon-panel overflow-hidden rounded-2xl border border-[var(--panel-border)] bg-[#0a0b14]"
                    >
                      {item.kind === "video" ? (
                        <video
                          controls
                          className="h-full w-full object-cover"
                          src={item.url}
                        />
                      ) : (
                        <img
                          alt="Generated"
                          className="h-full w-full object-cover"
                          src={item.url}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="neon-panel rounded-2xl border border-[var(--panel-border)] bg-[#0b0c16] p-4">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
                placeholder="Type your prompt, then press Enter…"
                className="h-28 w-full resize-none rounded-xl border border-transparent bg-transparent text-sm leading-relaxed text-white outline-none placeholder:text-[var(--muted)]"
              />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-[var(--muted)]">
                  Shift+Enter for newline.
                </p>
                <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
                  <div
                    ref={presetMenuRef}
                    className="relative w-full sm:w-auto"
                  >
                    <button
                      type="button"
                      onClick={() => setIsPresetMenuOpen((prev) => !prev)}
                      className="flex w-full items-center justify-between gap-2 rounded-full border border-[var(--panel-border)] bg-[var(--panel)]/70 px-4 py-2 text-xs text-white transition sm:w-auto"
                    >
                      <span className="truncate">{activePresetLabel}</span>
                      <span className="text-[10px]">▼</span>
                    </button>
                    {isPresetMenuOpen ? (
                      <div className="absolute right-0 z-20 mt-2 w-full min-w-[220px] max-h-[60vh] overflow-y-auto rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] shadow-[0_12px_30px_rgba(0,0,0,0.25)]">
                        {MODEL_PRESETS.map((preset) => {
                          const isActive = selectedPresetId === preset.id;
                          return (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => {
                                const mapped =
                                  presetMapping[preset.id] ||
                                  mapPresetToModel(preset.id, models, model);
                                setSelectedPresetId(preset.id);
                                setModel(mapped);
                                setIsPresetMenuOpen(false);
                              }}
                              className={`flex w-full flex-col items-start gap-1 px-4 py-3 text-left text-xs ${
                                isActive
                                  ? "bg-[var(--accent)] text-black"
                                  : "bg-transparent text-white"
                              }`}
                            >
                              <span className="text-[11px] font-semibold">
                                {preset.label}
                              </span>
                              <span
                                className={`text-[10px] ${
                                  isActive ? "text-black/60" : "text-[var(--muted)]"
                                }`}
                              >
                                {preset.note}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                  <button
                    className="rounded-full bg-[var(--accent-strong)] px-5 py-2 text-sm font-semibold text-black shadow-[0_0_20px_rgba(255,79,216,0.35)] transition hover:bg-[#ff79e5]"
                    onClick={sendMessage}
                    type="button"
                    disabled={isStreaming}
                  >
                    Send
                  </button>
                </div>
            </div>
            </div>

            {error ? (
              <div className="rounded-xl border border-[rgba(255,107,107,0.6)] bg-[rgba(255,107,107,0.12)] p-3 text-xs text-[var(--danger)]">
                {error}
              </div>
            ) : null}
          </div>

          <aside className="neon-panel flex flex-col gap-4 rounded-3xl border border-[var(--panel-border)] bg-[var(--panel)]/75 p-6 backdrop-blur">
            <div>
              <h2 className="text-lg font-semibold">Connection</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Choose how the web app talks to Ollama.
              </p>
            </div>

            <div className="flex flex-col gap-3 text-sm">
              <label className="neon-panel flex items-center justify-between rounded-2xl border border-[var(--panel-border)] px-4 py-3">
                <span>Server Proxy</span>
                <input
                  type="radio"
                  name="mode"
                  checked={mode === "proxy"}
                  onChange={() => setMode("proxy")}
                />
              </label>
              <label className="neon-panel flex items-center justify-between rounded-2xl border border-[var(--panel-border)] px-4 py-3">
                <span>Browser Local</span>
                <input
                  type="radio"
                  name="mode"
                  checked={mode === "browser"}
                  onChange={() => setMode("browser")}
                />
              </label>
            </div>

            {mode === "browser" ? (
              <div className="neon-panel rounded-2xl border border-[var(--panel-border)] bg-[#0b0d18] p-4 text-xs text-[var(--muted)]">
                <p className="text-white">Browser Local notes</p>
                <p className="mt-2">
                  Ollama must allow your origin. Set{" "}
                  <span className="font-mono text-white">OLLAMA_ORIGINS=*</span>{" "}
                  or your site URL before launching Ollama.
                </p>
                <p className="mt-2">
                  Browser Local talks directly to Ollama and bypasses server
                  usage limits.
                </p>
              </div>
            ) : null}

            <div className="space-y-2 text-sm">
              <label className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                Ollama Base URL
              </label>
              <input
                className="w-full rounded-xl border border-[var(--panel-border)] bg-[#0b0c16] px-3 py-2 text-sm text-white outline-none"
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder="http://localhost:11434"
              />
              <p className="text-xs text-[var(--muted)]">
                Used only in Browser Local mode.
              </p>
            </div>

            <div className="mt-4">
              <h3 className="text-sm font-semibold">Model</h3>
              <div className="mt-2 flex items-center gap-2">
                <input
                  className="flex-1 rounded-xl border border-[var(--panel-border)] bg-[#0b0c16] px-3 py-2 text-sm text-white outline-none"
                  value={model}
                  onChange={(event) => {
                    setSelectedPresetId(null);
                    setModel(event.target.value);
                  }}
                  placeholder="llama3.1:8b"
                />
                <button
                  className="rounded-full border border-[var(--panel-border)] px-3 py-2 text-xs text-[var(--muted)] transition hover:text-white"
                  onClick={loadModels}
                  type="button"
                  disabled={loadingModels}
                >
                  {loadingModels ? "Loading..." : "Refresh"}
                </button>
              </div>
              <p className="mt-2 text-xs text-[var(--muted)]">
                Use any model installed in Ollama.
              </p>
              {models.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {models.map((entry) => (
                    <button
                      key={entry}
                      type="button"
                      className={`rounded-full px-3 py-1 text-xs ${
                        model === entry
                          ? "bg-[var(--accent)] text-black shadow-[0_0_16px_rgba(61,242,255,0.45)]"
                          : "border border-[var(--panel-border)] text-[var(--muted)] hover:text-white"
                      }`}
                      onClick={() => {
                        setSelectedPresetId(null);
                        setModel(entry);
                      }}
                    >
                      {entry}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                  System prompt
                </label>
                <textarea
                  className="mt-2 h-24 w-full resize-none rounded-xl border border-[var(--panel-border)] bg-[#0b0c16] px-3 py-2 text-xs text-white outline-none"
                  value={systemPrompt}
                  onChange={(event) => setSystemPrompt(event.target.value)}
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                  Temperature: {temperature.toFixed(2)}
                </label>
                <input
                  type="range"
                  min="0"
                  max="1.5"
                  step="0.05"
                  value={temperature}
                  onChange={(event) => setTemperature(Number(event.target.value))}
                  className="mt-2 w-full"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                  Top P: {topP.toFixed(2)}
                </label>
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.05"
                  value={topP}
                  onChange={(event) => setTopP(Number(event.target.value))}
                  className="mt-2 w-full"
                />
              </div>
            </div>

            <div className="mt-6 space-y-3">
              <h3 className="text-sm font-semibold">Tools</h3>
              <div className="flex flex-wrap gap-2">
                <button
                  className="rounded-full border border-[var(--panel-border)] px-3 py-2 text-xs text-[var(--muted)] transition hover:text-white"
                  type="button"
                  onClick={() => runTool("fetch")}
                >
                  Web fetch
                </button>
                <button
                  className="rounded-full border border-[var(--panel-border)] px-3 py-2 text-xs text-[var(--muted)] transition hover:text-white"
                  type="button"
                  onClick={() => runTool("read")}
                >
                  File read
                </button>
                <button
                  className="rounded-full border border-[var(--panel-border)] px-3 py-2 text-xs text-[var(--muted)] transition hover:text-white"
                  type="button"
                  onClick={() => runTool("exec")}
                >
                  Run command
                </button>
                <button
                  className="rounded-full border border-[var(--panel-border)] px-3 py-2 text-xs text-[var(--muted)] transition hover:text-white"
                  type="button"
                  onClick={() => generateMedia("image")}
                >
                  Generate image
                </button>
                <button
                  className="rounded-full border border-[var(--panel-border)] px-3 py-2 text-xs text-[var(--muted)] transition hover:text-white"
                  type="button"
                  onClick={() => generateMedia("video")}
                >
                  Generate video
                </button>
              </div>
              <p className="text-xs text-[var(--muted)]">
                Tools run on the server with safety limits.
              </p>
            </div>

            <div className="mt-6 space-y-3">
              <h3 className="text-sm font-semibold">Voice assistant</h3>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className={`rounded-full px-3 py-2 text-xs font-semibold text-black shadow-[0_0_16px_rgba(61,242,255,0.35)] transition ${
                    voiceEnabled
                      ? "bg-[var(--accent)]"
                      : "bg-[#2a2f3a] text-[var(--muted)]"
                  }`}
                  onClick={() => setVoiceEnabled((prev) => !prev)}
                >
                  {voiceEnabled ? "Voice on" : "Voice off"}
                </button>
                <button
                  type="button"
                  className={`rounded-full border border-[var(--panel-border)] px-3 py-2 text-xs text-[var(--muted)] transition hover:text-white ${
                    isListening ? "neon-chip" : ""
                  }`}
                  onClick={toggleListening}
                >
                  {isListening ? "Stop mic" : "Start mic"}
                </button>
                <button
                  type="button"
                  className="rounded-full border border-[var(--panel-border)] px-3 py-2 text-xs text-[var(--muted)] transition hover:text-white"
                  onClick={testVoice}
                >
                  Test voice
                </button>
                <div className="flex flex-wrap items-center gap-2">
                  {[
                    { id: "en", label: "English" },
                    { id: "ur", label: "Urdu" },
                    { id: "roman-ur", label: "Roman Urdu" },
                  ].map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={`rounded-full px-3 py-2 text-xs ${
                        voiceLanguage === option.id
                          ? "bg-[var(--accent)] text-black shadow-[0_0_16px_rgba(61,242,255,0.35)]"
                          : "border border-[var(--panel-border)] text-[var(--muted)] hover:text-white"
                      }`}
                      onClick={() =>
                        setVoiceLanguage(option.id as "en" | "ur" | "roman-ur")
                      }
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className={`rounded-full px-3 py-2 text-xs ${
                    autoSendVoice
                      ? "bg-[var(--accent)] text-black shadow-[0_0_16px_rgba(61,242,255,0.35)]"
                      : "border border-[var(--panel-border)] text-[var(--muted)] hover:text-white"
                  }`}
                  onClick={() => setAutoSendVoice((prev) => !prev)}
                >
                  {autoSendVoice ? "Auto-send on" : "Auto-send off"}
                </button>
                <button
                  type="button"
                  className={`rounded-full px-3 py-2 text-xs ${
                    transliterateVoice
                      ? "bg-[var(--accent)] text-black shadow-[0_0_16px_rgba(61,242,255,0.35)]"
                      : "border border-[var(--panel-border)] text-[var(--muted)] hover:text-white"
                  }`}
                  onClick={() => setTransliterateVoice((prev) => !prev)}
                >
                  {transliterateVoice ? "Transliterate on" : "Transliterate off"}
                </button>
                <div className="voice-wave">
                  {[0, 1, 2, 3, 4].map((index) => (
                    <span
                      key={index}
                      className={`voice-bar ${
                        isListening || isSpeaking ? "active" : ""
                      }`}
                    />
                  ))}
                </div>
              </div>
              <p className="text-xs text-[var(--muted)]">
                Roman Urdu uses English recognition; Urdu uses ur-PK voices if available.
              </p>
            </div>

            <div className="mt-6 space-y-3">
              <h3 className="text-sm font-semibold">Prompt templates</h3>
              <div className="flex flex-wrap gap-2">
                {PROMPT_TEMPLATES.map((template) => (
                  <button
                    key={template.label}
                    type="button"
                  className="rounded-full border border-[var(--panel-border)] px-3 py-2 text-xs text-[var(--muted)] transition hover:text-white"
                  onClick={() => setInput(template.value)}
                >
                  {template.label}
                </button>
              ))}
            </div>
              <p className="text-xs text-[var(--muted)]">
                Click a template to drop it into the composer.
              </p>
            </div>

            <div className="mt-6 space-y-3">
              <h3 className="text-sm font-semibold">API Keys</h3>
              <div className="flex gap-2">
                <input
                className="flex-1 rounded-xl border border-[var(--panel-border)] bg-[#0b0c16] px-3 py-2 text-sm text-white outline-none"
                  value={apiKeyName}
                  onChange={(event) => setApiKeyName(event.target.value)}
                  placeholder="Key name"
                />
                <button
                  className="rounded-full bg-[var(--accent-strong)] px-3 py-2 text-xs font-semibold text-black shadow-[0_0_18px_rgba(255,79,216,0.35)] transition hover:bg-[#ff79e5]"
                  type="button"
                  onClick={createKey}
                >
                  Create
                </button>
              </div>
              {newKey ? (
                <div className="rounded-xl border border-[var(--panel-border)] bg-[#101018] p-3 text-xs">
                  <p className="text-[var(--muted)]">New key (copy now):</p>
                  <p className="mt-1 break-all font-mono text-white">{newKey}</p>
                </div>
              ) : null}
              <button
                className="rounded-full border border-[var(--panel-border)] px-3 py-2 text-xs text-[var(--muted)] transition hover:text-white"
                type="button"
                onClick={loadKeys}
              >
                Refresh keys
              </button>
              <div className="space-y-2 text-xs text-[var(--muted)]">
                {apiKeys.map((key) => (
                  <div
                    key={key.id}
                    className="flex items-center justify-between rounded-xl border border-[var(--panel-border)] px-3 py-2"
                  >
                    <span>{key.name}</span>
                    <span className="font-mono text-white">
                      {key.prefix}••••
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
}
