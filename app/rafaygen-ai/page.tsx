import type { Metadata } from "next";
import {
  TemplateCardGrid,
  TemplateLinkBar,
  TemplatePublicPage,
  type TemplateCardItem,
} from "@/components/intellect/template-public";

export const metadata: Metadata = {
  title: "RafayGen AI Platform",
  description:
    "RafayGen AI is a free AI platform by WaveTech Limited for chat, coding, reasoning, image, video, and voice workflows.",
  alternates: {
    canonical: "/rafaygen-ai",
  },
  keywords: [
    "free ai",
    "ai platform",
    "ai tools",
    "ai chatbot",
    "ai coding assistant",
    "ai math solver",
    "ai image generator",
    "ai video generator",
    "voice ai",
    "RafayGen",
  ],
};

export default function RafaygenAiPage() {
  const cards: TemplateCardItem[] = [
    {
      title: "Production-ready agents",
      eyebrow: "Core strength",
      body: "Fast, reliable, and tuned for reasoning-first chat with precise intent handling.",
      highlighted: true,
    },
    {
      title: "Coding + math depth",
      eyebrow: "Execution",
      body: "Debugging, refactors, architecture notes, and math proofs in a single calm surface.",
    },
    {
      title: "Voice + media ready",
      eyebrow: "Multimodal",
      body: "Voice, transcription, image, and video workflows unified in the same premium UI.",
    },
  ];

  return (
    <TemplatePublicPage
      eyebrow="WaveTech Limited"
      title="RafayGen AI platform overview"
      description="A premium agent workspace for reasoning-heavy chat, coding, math, and multimodal execution across one branded product."
      metrics={[
        { label: "Workspace", value: "Unified" },
        { label: "Media modes", value: "3+" },
        { label: "Reasoning", value: "High" },
      ]}
    >
      <TemplateCardGrid items={cards} />
      <TemplateLinkBar
        items={[
          { href: "/start", label: "Open Studio", primary: true },
          { href: "/resources", label: "Resources" },
          { href: "/privacy", label: "Privacy" },
          { href: "/terms", label: "Terms" },
        ]}
      />
    </TemplatePublicPage>
  );
}
