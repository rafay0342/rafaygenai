"use client";

import { useEffect, useMemo, useState } from "react";
import { TemplateCopyright, TemplatePageContent } from "@/components/intellect/intellect-shell";

type Job = {
  id: string;
  status: string;
  progress: number;
  previewUrl?: string | null;
  outputUrl?: string | null;
  error?: string | null;
};

type VideoPreset = "720p60" | "1080p60" | "2k30" | "4k30";

const PRESETS = [
  { id: "720p60", label: "720p @60fps" },
  { id: "1080p60", label: "1080p @60fps" },
  { id: "2k30", label: "2K @30fps" },
  { id: "4k30", label: "4K @30fps" },
] as const;

export default function VideoPage() {
  const [prompt, setPrompt] = useState("");
  const [preset, setPreset] = useState<VideoPreset>("1080p60");
  const [length, setLength] = useState(30);
  const [job, setJob] = useState<Job | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [aspect, setAspect] = useState<"16:9" | "1:1">("16:9");
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => prompt.trim().length > 5 && !isSubmitting, [prompt, isSubmitting]);

  useEffect(() => {
    if (!job?.id) return;
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/video-jobs/${job.id}`);
        if (!res.ok) return;
        const data = (await res.json()) as Job;
        setJob(data);
        if (data.status === "completed" || data.status === "failed") {
          clearInterval(id);
        }
      } catch (err) {
        console.error("poll error", err);
      }
    }, 4000);
    return () => clearInterval(id);
  }, [job?.id]);

  async function submit() {
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/video-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          preset,
          aspect,
          targetDurationSec: length,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      const data = (await res.json()) as Job;
      setJob(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <TemplatePageContent className="pt-[96px]">
      <div className="search__generator intellect-public-page">
        <div className="intellect-public-hero">
          <div className="intellect-public-copy">
            <span className="pre-title-bg">Video Lab</span>
            <h2 className="title">Text to Video (hosted GPU)</h2>
            <div className="disc">
              Jobs are dispatched to persistent ComfyUI endpoints so the CUDA media farm stays active. The multi-GPU
              setup keeps video generation fast, refined, and ready whenever you submit a prompt.
            </div>
          </div>
          <div className="intellect-public-metrics">
            <div className="intellect-public-metric">
              <span className="value">20-120s</span>
              <span className="label">Job duration</span>
            </div>
            <div className="intellect-public-metric">
              <span className="value">4</span>
              <span className="label">Preset profiles</span>
            </div>
            <div className="intellect-public-metric">
              <span className="value">GPU</span>
              <span className="label">Hosted pipeline</span>
            </div>
          </div>
        </div>

        <div className="intellect-public-section">
          <div className="row g-5">
            <div className="col-lg-6 col-md-6 col-sm-12 col-12">
              <label className="mb-0 d-block">
                <span className="intellect-public-card-eyebrow">Prompt</span>
                <textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  rows={6}
                  className="form-control"
                  placeholder="Cinematic aerial of futuristic city at sunrise, neon reflections, slow camera push..."
                />
              </label>
            </div>
            <div className="col-lg-6 col-md-6 col-sm-12 col-12">
              <div className="row g-4">
                <div className="col-12">
                  <label className="mb-0 d-block">
                    <span className="intellect-public-card-eyebrow">Preset</span>
                    <select
                      value={preset}
                      onChange={(event) => setPreset(event.target.value as VideoPreset)}
                      className="form-select"
                    >
                      {PRESETS.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="col-12">
                  <label className="mb-0 d-block">
                    <span className="intellect-public-card-eyebrow">Aspect</span>
                    <select
                      value={aspect}
                      onChange={(event) => setAspect(event.target.value as "16:9" | "1:1")}
                      className="form-select"
                    >
                      <option value="16:9">16:9 (widescreen)</option>
                      <option value="1:1">1:1 (square)</option>
                    </select>
                  </label>
                </div>
                <div className="col-12">
                  <label className="mb-0 d-block">
                    <span className="intellect-public-card-eyebrow">Length (sec)</span>
                    <input
                      type="number"
                      min={20}
                      max={120}
                      value={length}
                      onChange={(event) => setLength(Number(event.target.value))}
                      className="form-control"
                    />
                  </label>
                </div>
                <div className="col-12">
                  <button
                    disabled={!canSubmit}
                    onClick={submit}
                    className="rts-btn btn-primary w-100"
                    type="button"
                  >
                    {isSubmitting ? "Submitting..." : "Create job"}
                  </button>
                  {error ? <p className="intellect-inline-error">{error}</p> : null}
                </div>
              </div>
            </div>
          </div>
        </div>

        {job ? (
          <div className="intellect-public-section">
            <h4 className="title">Job {job.id}</h4>
            <p className="disc">Status: {job.status}</p>
            <div className="progress mb--30">
              <div
                className="progress-bar"
                role="progressbar"
                style={{ width: `${Math.min(job.progress ?? 5, 100)}%` }}
                aria-valuenow={Math.min(job.progress ?? 5, 100)}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
            {job.previewUrl ? (
              <div className="mb--30">
                <span className="intellect-public-card-eyebrow">Preview</span>
                <video className="w-100 rounded-4" src={job.previewUrl} controls />
              </div>
            ) : null}
            {job.outputUrl && job.outputUrl !== job.previewUrl ? (
              <div className="mb--30">
                <span className="intellect-public-card-eyebrow">Final</span>
                <video className="w-100 rounded-4" src={job.outputUrl} controls />
              </div>
            ) : null}
            {job.error ? <p className="intellect-inline-error">{job.error}</p> : null}
          </div>
        ) : null}
      </div>
      <TemplateCopyright />
    </TemplatePageContent>
  );
}
