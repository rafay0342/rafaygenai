"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type LiveModel = {
  id: string;
  label: string;
  provider: string;
  running: boolean;
};

type AIContextValue = {
  model: string;
  models: LiveModel[];
  loadingModels: boolean;
  modelsError: string | null;
  setModel: (nextModel: string) => void;
  refreshModels: () => Promise<void>;
};

type UIContextValue = {
  isDrawerOpen: boolean;
  isProfileMenuOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  setProfileMenuOpen: (next: boolean) => void;
};

export type VoiceState = "idle" | "listening" | "processing" | "speaking" | "paused";

type VoiceContextValue = {
  isPanelOpen: boolean;
  voiceState: VoiceState;
  transcript: string;
  language: string;
  openPanel: () => void;
  closePanel: () => void;
  setVoiceState: (nextState: VoiceState) => void;
  setTranscript: (nextTranscript: string) => void;
  setLanguage: (nextLanguage: string) => void;
  clearTranscript: () => void;
};

const MODEL_STORAGE_KEY = "rafaygen:liveModel";

const AIContext = createContext<AIContextValue | null>(null);
const UIContext = createContext<UIContextValue | null>(null);
const VoiceContext = createContext<VoiceContextValue | null>(null);

function inferProviderFromModel(modelId: string) {
  const id = modelId.toLowerCase();
  if (id.startsWith("claude") || id.includes("anthropic")) return "anthropic";
  if (id.includes("llama") || id.startsWith("groq/") || id.includes("mixtral")) return "groq";
  if (id.startsWith("gpt") || id.startsWith("o3") || id.startsWith("o4")) return "openai";
  if (id.includes("qwen") || id.includes("mistral") || id.includes("gemma")) return "hf";
  return "auto";
}

function prettifyModelLabel(modelId: string) {
  return modelId
    .replace(/^models?\//i, "")
    .replace(/[._-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeModelList(payload: unknown): LiveModel[] {
  const maybeModels =
    payload && typeof payload === "object" && "models" in payload
      ? (payload as { models?: unknown }).models
      : [];
  if (!Array.isArray(maybeModels)) return [];

  const normalized: LiveModel[] = [];
  for (const entry of maybeModels) {
    if (typeof entry === "string") {
      const cleanId = entry.trim();
      if (!cleanId) continue;
      normalized.push({
        id: cleanId,
        label: prettifyModelLabel(cleanId),
        provider: inferProviderFromModel(cleanId),
        running: true,
      });
      continue;
    }

    if (!entry || typeof entry !== "object") continue;
    const raw = entry as Partial<LiveModel> & { id?: string; model?: string; name?: string };
    const cleanId = String(raw.id || raw.model || raw.name || "").trim();
    if (!cleanId) continue;
    normalized.push({
      id: cleanId,
      label: String(raw.label || prettifyModelLabel(cleanId)),
      provider: String(raw.provider || inferProviderFromModel(cleanId)),
      running: raw.running !== false,
    });
  }
  return normalized.filter((entry, index, list) => list.findIndex((it) => it.id === entry.id) === index);
}

export function AIProvider({ children }: { children: ReactNode }) {
  const [models, setModels] = useState<LiveModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(true);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [model, setModelState] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(MODEL_STORAGE_KEY);
    if (stored) setModelState(stored);
  }, []);

  const setModel = useCallback((nextModel: string) => {
    setModelState(nextModel);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(MODEL_STORAGE_KEY, nextModel);
    }
  }, []);

  const refreshModels = useCallback(async () => {
    setLoadingModels(true);
    setModelsError(null);
    try {
      const response = await fetch("/api/models/live", {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const payload = (await response.json()) as unknown;
      const liveModels = normalizeModelList(payload).filter((entry) => entry.running);
      setModels(liveModels);
      if (!liveModels.length) {
        setModelState("");
      } else if (!liveModels.some((entry) => entry.id === model)) {
        const fallbackModel = liveModels[0].id;
        setModelState(fallbackModel);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(MODEL_STORAGE_KEY, fallbackModel);
        }
      }
    } catch (error) {
      setModelsError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingModels(false);
    }
  }, [model]);

  useEffect(() => {
    void refreshModels();
  }, [refreshModels]);

  const value = useMemo<AIContextValue>(
    () => ({
      model,
      models,
      loadingModels,
      modelsError,
      setModel,
      refreshModels,
    }),
    [model, models, loadingModels, modelsError, setModel, refreshModels],
  );

  return <AIContext.Provider value={value}>{children}</AIContext.Provider>;
}

export function UIProvider({ children }: { children: ReactNode }) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isProfileMenuOpen, setProfileMenuOpen] = useState(false);

  const openDrawer = useCallback(() => setIsDrawerOpen(true), []);
  const closeDrawer = useCallback(() => {
    setIsDrawerOpen(false);
    setProfileMenuOpen(false);
  }, []);
  const toggleDrawer = useCallback(() => {
    setIsDrawerOpen((prev) => !prev);
  }, []);

  // ── FIX: Listen to the custom event dispatched by AppNav ──
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleToggle = () => toggleDrawer();
    const handleOpen = () => openDrawer();
    const handleClose = () => closeDrawer();
    window.addEventListener("rafaygen:toggleDrawer", handleToggle);
    window.addEventListener("rafaygen:openDrawer", handleOpen);
    window.addEventListener("rafaygen:closeDrawer", handleClose);
    return () => {
      window.removeEventListener("rafaygen:toggleDrawer", handleToggle);
      window.removeEventListener("rafaygen:openDrawer", handleOpen);
      window.removeEventListener("rafaygen:closeDrawer", handleClose);
    };
  }, [toggleDrawer, openDrawer, closeDrawer]);

  const value = useMemo<UIContextValue>(
    () => ({
      isDrawerOpen,
      isProfileMenuOpen,
      openDrawer,
      closeDrawer,
      toggleDrawer,
      setProfileMenuOpen,
    }),
    [isDrawerOpen, isProfileMenuOpen, openDrawer, closeDrawer, toggleDrawer],
  );

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function VoiceProvider({ children }: { children: ReactNode }) {
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [language, setLanguage] = useState("auto");

  const openPanel = useCallback(() => setIsPanelOpen(true), []);
  const closePanel = useCallback(() => {
    setIsPanelOpen(false);
    setVoiceState("idle");
    setTranscript("");
  }, []);
  const clearTranscript = useCallback(() => setTranscript(""), []);

  const value = useMemo<VoiceContextValue>(
    () => ({
      isPanelOpen,
      voiceState,
      transcript,
      language,
      openPanel,
      closePanel,
      setVoiceState,
      setTranscript,
      setLanguage,
      clearTranscript,
    }),
    [isPanelOpen, voiceState, transcript, language, openPanel, closePanel, clearTranscript],
  );

  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AIProvider>
      <UIProvider>
        <VoiceProvider>{children}</VoiceProvider>
      </UIProvider>
    </AIProvider>
  );
}

export function useAI() {
  const context = useContext(AIContext);
  if (!context) throw new Error("useAI must be used inside AIProvider.");
  return context;
}

export function useUI() {
  const context = useContext(UIContext);
  if (!context) throw new Error("useUI must be used inside UIProvider.");
  return context;
}

export function useVoice() {
  const context = useContext(VoiceContext);
  if (!context) throw new Error("useVoice must be used inside VoiceProvider.");
  return context;
}
