"use client";

import Image from "next/image";
import { useState } from "react";

const STATIC_MODELS = [
  { id: "rafaygenai-2.5-flash", name: "RafayGen 2.5 Flash" },
  { id: "rafaygenai-3.0-thinking", name: "RafayGen 3.0 Thinking" },
  { id: "rafaygenai-3.1-pro", name: "RafayGen 3.1 Pro" },
];

export default function AIDashboard() {
  const [prompt, setPrompt] = useState("");
  const [image, setImage] = useState("");
  const [text, setText] = useState("");
  const [model, setModel] = useState(STATIC_MODELS[0].id);
  const [loading, setLoading] = useState(false);

  async function generateText() {
    if (!prompt.trim()) return;
    setLoading(true);
    setText("");
    try {
      const res = await fetch("/api/generate-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      setText(JSON.stringify(data, null, 2));
    } catch (err) {
      setText("Error: " + String(err));
    } finally {
      setLoading(false);
    }
  }

  async function generateImage() {
    if (!prompt.trim()) return;
    setLoading(true);
    setImage("");
    try {
      const res = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, model }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setText("Image error: " + (d.error || res.status));
        return;
      }
      const blob = await res.blob();
      setImage(URL.createObjectURL(blob));
    } catch (err) {
      setText("Error: " + String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: "12px 0" }}>
      <input
        placeholder="Enter prompt..."
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        style={{ width: "100%", maxWidth: 480, padding: "8px 12px", borderRadius: 8 }}
      />
      <br /><br />
      <select
        value={model}
        onChange={(e) => setModel(e.target.value)}
        style={{ padding: "8px 12px", borderRadius: 8 }}
      >
        {STATIC_MODELS.map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </select>
      <br /><br />
      <button onClick={generateText} disabled={loading} style={{ marginRight: 10 }}>
        {loading ? "..." : "Generate Text"}
      </button>
      <button onClick={generateImage} disabled={loading}>
        {loading ? "..." : "Generate Image"}
      </button>
      <br /><br />
      {text && (
        <pre style={{ background: "#111", color: "#eee", padding: 16, borderRadius: 8, overflowX: "auto" }}>
          {text}
        </pre>
      )}
      {image && (
        <Image
          src={image}
          alt="Generated"
          width={1024}
          height={1024}
          unoptimized
          style={{ maxWidth: "100%", height: "auto", borderRadius: 12, marginTop: 8 }}
        />
      )}
    </div>
  );
}
