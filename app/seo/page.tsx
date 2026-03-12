import type { Metadata } from "next";
import {
  TemplateBadgeRow,
  TemplateCardGrid,
  TemplateLinkBar,
  TemplatePublicPage,
  type TemplateCardItem,
} from "@/components/intellect/template-public";
import { getSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Free AI Tools and Generators",
  description:
    "RafayGen AI is a free AI platform for chat, coding, reasoning, image generation, and video generation across devices.",
  alternates: { canonical: "/seo" },
  keywords: [
    "free ai",
    "free ai chat",
    "ai tools",
    "ai generator",
    "ai image generator",
    "ai video generator",
    "text to image ai",
    "text to video ai",
    "ai chatbot",
    "ai coding assistant",
    "ai math solver",
    "ai assistant",
    "gemini ai",
    "deepseek ai",
    "ai action figure",
    "ai barbie",
    "ghibli ai art",
    "ai trends 2025",
  ],
};

export default function SeoLanding() {
  const siteUrl = getSiteUrl();
  const featureCards: TemplateCardItem[] = [
    { title: "AI chat and reasoning", body: "Free AI chat and reasoning for everyday questions and deeper problem solving.", highlighted: true },
    { title: "Coding assistance", body: "AI coding support for debugging, planning, refactors, and implementation notes." },
    { title: "Math workflows", body: "AI math solver guidance with step-by-step clarity and practical explanations." },
    { title: "Image generation", body: "Text-to-image routes with internal previews and app-native download links." },
    { title: "Video generation", body: "Hosted GPU video workflows with async status tracking and output delivery." },
    { title: "Voice and transcription", body: "Speech, voice, and multimodal routes supported across providers." },
  ];
  const featuredResources: TemplateCardItem[] = [
    { title: "AI Coding Assistant", body: "Debugging and implementation patterns.", href: "/resources/ai-coding-assistant", cta: "Read guide" },
    { title: "AI Math Solver", body: "Reasoning-first math workflows.", href: "/resources/ai-math-solver", cta: "Read guide" },
    { title: "Reasoning Model Platform", body: "How model routing supports deeper answers.", href: "/resources/reasoning-model-platform", cta: "Read guide" },
    { title: "AI Image + Video Workflows", body: "Prompt-to-media execution paths.", href: "/resources/ai-image-video-generation", cta: "Read guide" },
  ];
  const trendTerms = ["Gemini", "DeepSeek", "AI action figure", "AI Barbie", "Ghibli-style AI art"];
  const faq = [
    {
      q: "Is RafayGen AI free to use?",
      a: "RafayGen AI includes free AI chat, free AI image generation, and free AI video workflows depending on provider availability.",
    },
    {
      q: "Does it work on mobile and all browsers?",
      a: "Yes. RafayGen AI runs in modern browsers including Chrome, Safari, Firefox, and Edge across iOS, Android, Windows, macOS, and Linux.",
    },
    {
      q: "What are the main use cases?",
      a: "Users rely on RafayGen AI for chat, coding help, reasoning, math assistance, and media generation in one workspace.",
    },
  ];
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a,
      },
    })),
  };
  const appJsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "RafayGen AI",
    operatingSystem: "Web",
    applicationCategory: "BusinessApplication",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    url: siteUrl,
  };

  return (
    <>
      <TemplatePublicPage
        eyebrow="RafayGen AI"
        title="Free AI tools for chat, coding, images, video, and voice"
        description="RafayGen AI is a free AI platform built for fast, reliable answers and media workflows across devices."
        metrics={[
          { label: "Platform", value: "Web" },
          { label: "Core flows", value: "5+" },
          { label: "Pricing", value: "Free" },
        ]}
      >
        <TemplateBadgeRow items={trendTerms} />
        <TemplateCardGrid items={featureCards} />
        <TemplateCardGrid items={featuredResources} columns={2} />
        <TemplateCardGrid
          items={faq.map((item) => ({
            title: item.q,
            body: item.a,
          }))}
          columns={2}
        />
        <TemplateLinkBar
          items={[
            { href: "/login", label: "Start with RafayGen", primary: true },
            { href: "/start", label: "Open Studio" },
            { href: "/resources", label: "Read Resources" },
            { href: "/rafaygen-ai", label: "Platform Overview" },
          ]}
        />
      </TemplatePublicPage>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(appJsonLd) }}
      />
    </>
  );
}
