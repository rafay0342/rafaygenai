import type { Metadata } from "next";
import Link from "next/link";
import {
  TemplateBadgeRow,
  TemplateCardGrid,
  TemplateLinkBar,
  TemplatePublicPage,
  type TemplateCardItem,
} from "@/components/intellect/template-public";

export const metadata: Metadata = {
  title: "Start with RafayGen AI",
  description: "Start with RafayGen AI chat, image, and voice workflows from one public landing page.",
  alternates: { canonical: "/start" },
};

export default function StartPage() {
  const cards: TemplateCardItem[] = [
    {
      title: "AI chat",
      eyebrow: "Reasoning + tools",
      body: "Open the chat workspace for structured answers, coding help, and live model routing.",
      href: "/chatbot",
      cta: "Open chat",
      highlighted: true,
    },
    {
      title: "Image studio",
      eyebrow: "Preview + download",
      body: "Generate images with internal preview links and app-native download handling.",
      href: "/image-generator",
      cta: "Open image studio",
    },
    {
      title: "Voice studio",
      eyebrow: "Speech + transcription",
      body: "Use voice workflows for TTS, transcription, and conversational interaction.",
      href: "/voicegenerator",
      cta: "Open voice studio",
    },
  ];

  return (
    <TemplatePublicPage
      eyebrow="Start Here"
      title="Choose the RafayGen AI workflow you want to run"
      description="This start page gives search engines and users a clean 200 route into the live product instead of a redirect. Open the exact surface you need from here."
      metrics={[
        { label: "Entry routes", value: "3" },
        { label: "Experience", value: "Public + app" },
        { label: "Status", value: "Live" },
      ]}
    >
      <TemplateBadgeRow items={["Chat", "Image generation", "Voice", "Downloads", "Realtime routing"]} />
      <TemplateCardGrid items={cards} />
      <TemplateLinkBar
        items={[
          { href: "/chatbot", label: "Open AI Chat", primary: true },
          { href: "/start-b", label: "Studio Landing" },
          { href: "/resources", label: "Resources" },
          { href: "/docs", label: "Docs" },
        ]}
      />
      <div className="intellect-public-cta-panel">
        <div>
          <h4>Need the full authenticated workspace?</h4>
          <p>Open the studio for saved chats, media jobs, and account-connected usage.</p>
        </div>
        <div className="intellect-public-cta-actions">
          <Link href="/studio" className="rts-btn btn-primary">
            Open studio
          </Link>
          <Link href="/login" className="rts-btn btn-border">
            Sign in
          </Link>
        </div>
      </div>
    </TemplatePublicPage>
  );
}
