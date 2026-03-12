"use client";

import { memo, useEffect, useRef, useState, useCallback } from "react";
import { useAI } from "@/components/studio/providers";

// ── HF Chat models (same list as voice-panel, kept in sync) ──────────
const HF_CHAT_MODELS = [
  { label: "Gemma 3 27B IT", value: "google/gemma-3-27b-it", tags: "Google" },
  { label: "Gemma 3 12B IT", value: "google/gemma-3-12b-it", tags: "Google" },
  { label: "Gemma 3 4B IT", value: "google/gemma-3-4b-it", tags: "Google·Fast" },
  { label: "Gemma 2 27B IT", value: "google/gemma-2-27b-it", tags: "Google" },
  { label: "Gemma 2 9B IT", value: "google/gemma-2-9b-it", tags: "Google·Fast" },
  { label: "Llama 3.3 70B Instruct", value: "meta-llama/Llama-3.3-70B-Instruct", tags: "Meta" },
  { label: "Llama 3.1 8B Instruct", value: "meta-llama/Llama-3.1-8B-Instruct", tags: "Meta·Fast" },
  { label: "Mistral 7B Instruct v0.3", value: "mistralai/Mistral-7B-Instruct-v0.3", tags: "Mistral·Free" },
  { label: "Mixtral 8x7B Instruct", value: "mistralai/Mixtral-8x7B-Instruct-v0.1", tags: "Mistral" },
  { label: "Phi-4 (14B)", value: "microsoft/phi-4", tags: "Microsoft" },
  { label: "Phi-3.5 Mini Instruct", value: "microsoft/Phi-3.5-mini-instruct", tags: "Microsoft·Fast" },
  { label: "Qwen2.5 72B Instruct", value: "Qwen/Qwen2.5-72B-Instruct", tags: "Qwen" },
  { label: "Qwen2.5 7B Instruct", value: "Qwen/Qwen2.5-7B-Instruct", tags: "Qwen·Fast" },
  { label: "Zephyr 7B Beta", value: "HuggingFaceH4/zephyr-7b-beta", tags: "HF·Free" },
  { label: "DeepSeek R1 Distill 7B", value: "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B", tags: "DeepSeek·Fast" },
];

export const ModelSelector = memo(function ModelSelector() {
  const { model, models, loadingModels, modelsError, setModel, refreshModels } = useAI();
  const [open, setOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // HF Chat model selector state
  const [hfOpen, setHfOpen] = useState(false);
  const [hfModel, setHfModel] = useState("google/gemma-3-4b-it");
  const [hfDropStyle, setHfDropStyle] = useState<React.CSSProperties>({});
  const hfTriggerRef = useRef<HTMLButtonElement | null>(null);
  const hfDropRef = useRef<HTMLDivElement | null>(null);

  const calcPos = useCallback((
    btnRef: React.RefObject<HTMLButtonElement | null>,
    width: number
  ): React.CSSProperties => {
    if (!btnRef.current) return {};
    const rect = btnRef.current.getBoundingClientRect();
    const vh = window.innerHeight;
    const dropH = 360;
    const up = vh - rect.bottom < dropH + 16 && rect.top > dropH + 16;
    return {
      position: "fixed",
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)) + "px",
      maxHeight: Math.min(dropH, vh * 0.6) + "px",
      overflowY: "auto" as const,
      top: up ? "auto" : rect.bottom + 8 + "px",
      bottom: up ? vh - rect.top + 8 + "px" : "auto",
      width: width + "px",
      zIndex: 9999,
    };
  }, []);

  // Main model selector position
  useEffect(() => {
    if (!open) return;
    const update = () => setDropdownStyle(calcPos(triggerRef, 290));
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => { window.removeEventListener("scroll", update, true); window.removeEventListener("resize", update); };
  }, [open, calcPos]);

  // HF chat selector position
  useEffect(() => {
    if (!hfOpen) return;
    const update = () => setHfDropStyle(calcPos(hfTriggerRef, 280));
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => { window.removeEventListener("scroll", update, true); window.removeEventListener("resize", update); };
  }, [hfOpen, calcPos]);

  // Close on outside click
  useEffect(() => {
    if (!open && !hfOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (open && !triggerRef.current?.contains(t) && !dropdownRef.current?.contains(t)) setOpen(false);
      if (hfOpen && !hfTriggerRef.current?.contains(t) && !hfDropRef.current?.contains(t)) setHfOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open, hfOpen]);

  const activeModel = models.find((e) => e.id === model) || (models.length ? models[0] : null);
  const activeHF = HF_CHAT_MODELS.find((m) => m.value === hfModel);

  // Broadcast HF model change so voice-panel can pick it up
  const selectHFModel = (v: string) => {
    setHfModel(v);
    setHfOpen(false);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("rafaygen:hfChatModel", { detail: v }));
    }
  };

  return (
    <>
      {/* ── Live model selector (existing) ─────────────── */}
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((p) => !p)}
        className="h-9 min-w-[100px] max-w-[160px] sm:max-w-[210px] truncate rounded-xl border border-[var(--panel-border)] bg-[var(--panel)] px-3 text-left text-sm text-[var(--foreground)] shadow-sm transition hover:border-[var(--accent)]"
      >
        <span className="block truncate font-medium text-xs">
          {loadingModels ? "Loading..." : activeModel?.label || "Select model"}
        </span>
        <span className="block truncate text-[10px] text-[var(--muted)]">
          {activeModel?.provider ?? "Live model"} · live
        </span>
      </button>

      {/* ── HF Chat model selector (NEW neighbor button) ── */}
      <button
        ref={hfTriggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={hfOpen}
        onClick={() => setHfOpen((p) => !p)}
        className="h-9 min-w-[90px] max-w-[130px] sm:max-w-[185px] truncate rounded-xl border border-[var(--panel-border)] bg-[var(--panel)] px-3 text-left text-sm text-[var(--foreground)] shadow-sm transition hover:border-[var(--accent)]"
        title="HuggingFace Chat Model"
      >
        <span className="block truncate font-medium text-xs">
          🤗 {activeHF?.label ?? hfModel.split("/").pop()}
        </span>
        <span className="block truncate text-[10px] text-[var(--muted)]">
          {activeHF?.tags ?? "HF"} · chat
        </span>
      </button>

      {/* ── Live model dropdown ─────────────────────────── */}
      {open && (
        <div
          ref={dropdownRef}
          style={dropdownStyle}
          className="rounded-xl border border-[var(--panel-border)] bg-[var(--panel)] p-2 shadow-[0_16px_40px_rgba(0,0,0,0.32)]"
        >
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Live Models</p>
            <button
              type="button"
              onClick={() => { void refreshModels(); }}
              className="rounded-md px-2 py-1 text-[11px] text-[var(--muted)] transition hover:bg-[var(--panel-soft)] hover:text-[var(--foreground)]"
            >
              ↻ Refresh
            </button>
          </div>
          <div role="listbox" className="max-h-72 overflow-y-auto pr-1">
            {modelsError && (
              <p className="rounded-lg bg-[rgba(255,107,107,0.12)] px-3 py-2 text-xs text-[var(--danger)]">{modelsError}</p>
            )}
            {!models.length && !loadingModels && (
              <p className="rounded-lg border border-dashed border-[var(--panel-border)] px-3 py-3 text-xs text-[var(--muted)]">No running models detected.</p>
            )}
            {loadingModels && <p className="px-3 py-2 text-xs text-[var(--muted)]">Loading models...</p>}
            {models.map((entry) => {
              const active = entry.id === model;
              return (
                <button
                  key={entry.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => { setModel(entry.id); setOpen(false); }}
                  className={`mb-1 w-full rounded-lg px-3 py-2 text-left transition ${
                    active ? "bg-[var(--accent)]/20 text-[var(--foreground)]" : "hover:bg-[var(--panel-soft)] text-[var(--foreground)]"
                  }`}
                >
                  <span className="block truncate text-sm font-medium">{entry.label}</span>
                  <span className="block truncate text-[11px] text-[var(--muted)]">{entry.provider} · {entry.id}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── HF Chat model dropdown ──────────────────────── */}
      {hfOpen && (
        <div
          ref={hfDropRef}
          style={hfDropStyle}
          className="rounded-xl border border-[var(--panel-border)] bg-[var(--panel)] p-2 shadow-[0_16px_40px_rgba(0,0,0,0.32)]"
        >
          <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
            🤗 HF Chat Models
          </p>
          <div className="max-h-72 overflow-y-auto pr-1 space-y-0.5">
            {HF_CHAT_MODELS.map((m) => {
              const active = m.value === hfModel;
              return (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => selectHFModel(m.value)}
                  className={`w-full rounded-lg px-3 py-2 text-left transition ${
                    active ? "bg-[var(--accent)]/20" : "hover:bg-[var(--panel-soft)]"
                  } text-[var(--foreground)]`}
                >
                  <span className="block truncate text-xs font-semibold">{m.label}</span>
                  <span className="block text-[10px] text-[var(--muted)]">{m.tags} · {m.value.split("/")[0]}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
});
