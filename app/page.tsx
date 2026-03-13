import type { Metadata } from "next";
import Link from "next/link";
import { BrandAvatar } from "@/components/intellect/brand-avatar";
import { TemplateCopyright, TemplatePageContent } from "@/components/intellect/intellect-shell";
import { RealtimePanel } from "@/components/realtime/realtime-panel";

export const metadata: Metadata = {
  title: "RafayGen Agent Dashboard",
  description: "Unified SaaS workspace for chat, media generation, and realtime operations.",
  keywords: ["AI dashboard", "SaaS", "RafayGen Agent", "image generator", "voice generator"],
};

const primaryCards = [
  {
    href: "/chatbot",
    label: "Realtime assistant",
    title: "AI Chat Workspace",
    copy: "Multi-step reasoning, tool calling, and live search in one workflow.",
  },
  {
    href: "/image-generator",
    label: "Media studio",
    title: "Image Generation",
    copy: "Curated prompts, model routing, and instant previews for teams.",
  },
  {
    href: "/voicegenerator",
    label: "Voice stack",
    title: "Speech Studio",
    copy: "Text-to-speech, downloadable assets, and voice presets at scale.",
  },
];

const platformCards = [
  {
    href: "/community-feed",
    title: "Knowledge Feed",
    copy: "Publish updates, docs, and community content without leaving the platform.",
  },
  {
    href: "/manage-subscription",
    title: "Billing & Plans",
    copy: "Control usage tiers, billing status, and upgrade flows with confidence.",
  },
  {
    href: "/docs",
    title: "Operational Docs",
    copy: "Deployment, analytics, safety, and compliance guidelines in one hub.",
  },
];

const valueProps = [
  {
    title: "SaaS-ready UX",
    copy: "Consistent navigation, scannable sections, and polished responsive layouts.",
  },
  {
    title: "Realtime operations",
    copy: "Supabase change streams keep dashboards in sync with live activity.",
  },
  {
    title: "Production workflows",
    copy: "Deploy, monitor, and ship updates with built-in runbooks and CI hooks.",
  },
];

export default function HomePage() {
  return (
    <TemplatePageContent className="saas-shell">
      <section className="saas-hero">
        <div className="saas-hero__copy">
          <span className="saas-pill">RafayGen Agent SaaS</span>
          <h1>Run your AI product with live chat, media generation, and realtime ops.</h1>
          <p>
            A production-ready control center for AI workflows. Manage agents, assets, and subscriptions with a
            premium SaaS experience across every device.
          </p>
          <div className="saas-actions">
            <Link href="/chatbot" className="saas-btn saas-btn--primary">
              Open AI Chat
            </Link>
            <Link href="/pricing" className="saas-btn saas-btn--ghost">
              View Plans
            </Link>
          </div>
          <div className="saas-hero__metrics">
            <div>
              <strong>Live</strong>
              <span>Agent routing + tools</span>
            </div>
            <div>
              <strong>Unified</strong>
              <span>Media + content + ops</span>
            </div>
            <div>
              <strong>Secure</strong>
              <span>Auth, billing, and usage</span>
            </div>
          </div>
        </div>
        <div className="saas-hero__panel">
          <div className="saas-hero__panel-card">
            <span className="saas-eyebrow">Operational overview</span>
            <h3>Control every surface</h3>
            <p>Chat, media, docs, and subscriptions stay aligned in a single dashboard.</p>
            <div className="saas-hero__panel-grid">
              {valueProps.map((item) => (
                <div key={item.title} className="saas-panel-pill">
                  <strong>{item.title}</strong>
                  <span>{item.copy}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="saas-section">
        <div className="saas-section__header">
          <div>
            <p className="saas-eyebrow">Core workspaces</p>
            <h2>Everything your AI team needs in one place</h2>
          </div>
          <Link href="/docs" className="saas-link">
            Explore documentation
          </Link>
        </div>
        <div className="saas-card-grid">
          {primaryCards.map((card) => (
            <Link key={card.href} href={card.href} className="saas-card">
              <span className="saas-eyebrow">{card.label}</span>
              <div className="saas-card__hero">
                <BrandAvatar kind="assistant" label={card.title} size="lg" />
              </div>
              <h3>{card.title}</h3>
              <p className="saas-muted">{card.copy}</p>
              <span className="saas-card__cta">Open workspace</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="saas-section saas-section--alt">
        <div className="saas-section__header">
          <div>
            <p className="saas-eyebrow">Platform</p>
            <h2>Scale content, billing, and community without friction</h2>
          </div>
        </div>
        <div className="saas-card-grid saas-card-grid--compact">
          {platformCards.map((card) => (
            <Link key={card.href} href={card.href} className="saas-card saas-card--compact">
              <h3>{card.title}</h3>
              <p className="saas-muted">{card.copy}</p>
              <span className="saas-card__cta">Open</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="saas-section">
        <div className="saas-section__header">
          <div>
            <p className="saas-eyebrow">Realtime</p>
            <h2>Live telemetry with external DB sync</h2>
          </div>
        </div>
        <div className="saas-grid">
          <RealtimePanel />
          <div className="saas-card saas-card--realtime">
            <div className="saas-card__header">
              <div>
                <p className="saas-eyebrow">Persistence</p>
                <h3>Supabase storage & workflows</h3>
                <p className="saas-muted">
                  Store generated assets, connect workflows, and keep realtime pipelines reliable.
                </p>
              </div>
            </div>
            <div className="saas-card__body">
              <ul className="saas-list">
                <li>Secure storage buckets for media assets.</li>
                <li>Change streams for job status updates.</li>
                <li>Websocket-ready integrations for dashboards.</li>
              </ul>
              <Link href="/docs" className="saas-btn saas-btn--ghost">
                View data guide
              </Link>
            </div>
          </div>
        </div>
      </section>

      <TemplateCopyright />
    </TemplatePageContent>
  );
}
