import type { Metadata } from "next";
import Link from "next/link";
import { BrandAvatar } from "@/components/intellect/brand-avatar";
import { TemplateCopyright, TemplatePageContent } from "@/components/intellect/intellect-shell";

export const metadata: Metadata = {
  title: "RafayGen Agent Dashboard",
  description: "Unified dashboard for chat, image, voice, documentation, and subscription workflows.",
  keywords: ["AI dashboard", "RafayGen Agent", "image generator", "voice generator", "chatbot"],
};

const dashboardCards = [
  {
    href: "/chatbot",
    eyebrow: "Realtime assistant",
    metric: "Web + tools",
    title: "AI Chat Workspace",
    description: "Reasoning, coding, live search, and multi-step answers using your existing routed models.",
  },
  {
    href: "/image-generator",
    eyebrow: "Media output",
    metric: "Preview + download",
    title: "Image Studio",
    description: "Prompt-to-image generation with in-app previews, moderation, and internal download links.",
  },
  {
    href: "/voicegenerator",
    eyebrow: "Speech delivery",
    metric: "Audio files",
    title: "Voice Studio",
    description: "Text-to-speech with language hints, provider routing, audio playback, and direct downloads.",
  },
];

const utilityCards = [
  {
    href: "/community-feed",
    title: "Knowledge Feed",
    description: "Browse docs and public resource pages in a branded content feed instead of stock template cards.",
  },
  {
    href: "/manage-subscription",
    title: "Plans & Billing",
    description: "Subscription controls, usage upgrades, and monetization-ready pricing flows for your live app.",
  },
  {
    href: "/docs",
    title: "Documentation",
    description: "Architecture, analytics, safety, monetization, and deployment guidance for RafayGen AI.",
  },
];

const heroPanels = [
  { eyebrow: "Agent mode", value: "Live", label: "Realtime routes + internal tools stay active" },
  { eyebrow: "Media outputs", value: "Native", label: "Preview and download links remain inside your app" },
  { eyebrow: "Operations", value: "Ready", label: "Docs, billing, moderation, and support pages stay aligned" },
];

export default function HomePage() {
  return (
    <TemplatePageContent className="pt-[96px]">
      <div className="banner-badge bg_image intellect-home-banner">
        <div className="inner">
          <h3 className="title">RafayGen Agent for realtime chat, media generation, and branded public content</h3>
          <p className="dsic">
            Your existing models, moderation, live web access, docs, subscriptions, and download routes stay intact,
            while the public UI now presents them as a RafayGen product instead of stock template content.
          </p>
          <div className="intellect-home-actions">
            <Link href="/chatbot" className="rts-btn btn-blur">
              Open AI Chat
            </Link>
            <Link href="/docs" className="rts-btn btn-primary">
              View Docs
            </Link>
          </div>
          <div className="intellect-home-pills">
            <span className="intellect-home-pill">Realtime answers</span>
            <span className="intellect-home-pill">Internal media downloads</span>
            <span className="intellect-home-pill">AdSense-ready content pages</span>
          </div>
          <div className="inner-right-iamge">
            <div className="intellect-home-hero-visual">
              {heroPanels.map((panel) => (
                <div key={panel.eyebrow} className="intellect-home-hero-panel">
                  <span className="eyebrow">{panel.eyebrow}</span>
                  <span className="value">{panel.value}</span>
                  <span className="label">{panel.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="search__generator mt--50">
        <h4 className="title color-white-title-home">Welcome to RafayGen Agent</h4>

        <div className="tab-content mt--50">
          <div className="row g-5">
            {dashboardCards.map((card) => (
              <div key={card.href} className="col-xl-4 col-lg-6 col-md-6 col-sm-12 col-12">
                <div className="single-image-generator intellect-home-card">
                  <div className="intellect-home-card-media">
                    <span className="intellect-home-card-media__eyebrow">{card.eyebrow}</span>
                    <BrandAvatar kind="assistant" label={card.title} size="lg" />
                    <div className="intellect-home-card-media__copy">
                      <h5>{card.title}</h5>
                      <p className="disc">{card.description}</p>
                    </div>
                    <span className="intellect-home-card-media__metric">{card.metric}</span>
                  </div>
                  <div className="intellect-home-card-actions">
                    <Link href={card.href} className="rts-btn btn-primary">
                      Open
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="row g-5 mt--10">
          {utilityCards.map((card) => (
            <div key={card.href} className="col-xl-4 col-lg-6 col-md-6 col-sm-12 col-12">
              <div className="single-image-generator intellect-home-card">
                <div className="intellect-home-card-media">
                  <span className="intellect-home-card-media__eyebrow">Platform</span>
                  <BrandAvatar kind="brand" label={card.title} size="md" />
                  <span className="intellect-home-card-media__metric">Live route</span>
                </div>
                <div className="intellect-home-card-actions">
                  <h5 className="title">{card.title}</h5>
                  <p className="disc">{card.description}</p>
                  <Link href={card.href} className="rts-btn btn-primary">
                    Open
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <TemplateCopyright />
    </TemplatePageContent>
  );
}
