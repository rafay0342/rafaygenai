import type { Metadata } from "next";
import Link from "next/link";
import { getSiteUrl } from "@/lib/site";
import AdSlot from "@/components/monetization/ad-slot";
import { getMonetizationConfig } from "@/lib/monetization";

export const metadata: Metadata = {
  title: "RafayGen AI Studio - Start Creating",
  description: "Create faster with RafayGen AI Studio: chat, reasoning, coding, plus image and video workflows.",
  alternates: { canonical: "/start" },
  robots: {
    index: false,
    follow: true,
    googleBot: { index: false, follow: true },
  },
  keywords: [
    "ai studio",
    "free ai studio",
    "ai chat",
    "ai image generator",
    "ai video generator",
    "text to image ai",
    "text to video ai",
    "ai coding assistant",
    "reasoning ai",
    "RafayGen AI",
  ],
  openGraph: {
    title: "RafayGen AI Studio",
    description: "Start creating with chat, image, and video workflows in RafayGen AI Studio.",
    type: "website",
    url: "/start-b",
  },
};

export default function StartVariantPage() {
  const siteUrl = getSiteUrl();
  const studioHref = {
    pathname: "/studio",
    query: { utm_source: "start_b", utm_campaign: "studio_launch" },
  };
  const monetization = getMonetizationConfig();
  const appJsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "RafayGen AI Studio",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    url: `${siteUrl}/start-b`,
    publisher: { "@type": "Organization", name: "WaveTech Limited", url: siteUrl },
  };

  const modes = [
    { title: "Chat + Reasoning", body: "Ask deep questions, debug, and plan with structured responses." },
    { title: "AI Image Generation", body: "Generate images from text prompts with tuned routing." },
    { title: "AI Video Workflows", body: "Run text-to-video or image-to-video workflows with practical controls." },
    { title: "Voice + Transcription", body: "Capture voice, transcribe audio, and keep everything in one studio flow." },
  ];

  const steps = [
    "Pick a mode: chat, image, video, or audio.",
    "Describe your output clearly and run the task.",
    "Refine, export, and reuse your best prompts.",
  ];

  return (
    <main className="app-shell min-h-[100dvh] px-4 py-8 text-[var(--foreground)] sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="lux-hero">
          <div className="lux-hero-copy">
            <div className="lux-pill">RafayGen AI Studio</div>
            <h1>Generate smarter, ship faster.</h1>
            <p>
              Chat, reason, code, and produce images or video with one focused studio built for real output quality and
              consistent workflows.
            </p>
            <div className="lux-actions">
              <Link href={studioHref} data-analytics-label="start_b_launch_studio" className="lux-button lux-button-solid">
                Launch Studio
              </Link>
              <Link href="/" data-analytics-label="start_b_home" className="lux-button lux-button-ghost">
                Home
              </Link>
            </div>
          </div>
          <div className="lux-hero-panel">
            <div className="lux-hero-glow" />
            <div className="lux-device">
              <div className="lux-device-top">
                <span className="lux-dot" />
                <span className="lux-dot" />
                <span className="lux-dot" />
              </div>
              <div className="lux-device-body">
                <p className="lux-label">Studio quick stats</p>
                <div className="lux-thread">
                  <div className="lux-bubble assistant">Fast prompt-to-output · ~60s flow</div>
                  <div className="lux-bubble assistant">Unified workspace: chat + media</div>
                  <div className="lux-bubble assistant">Multi-device ready: desktop + mobile</div>
                  <div className="lux-bubble assistant">Reliable routing: stable results</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <AdSlot
          className="mt-3"
          client={monetization.adsenseClient}
          slot={monetization.slots.startTop}
          label="Sponsored"
          enabled={monetization.adsenseEnabled}
        />

        <section className="lux-section">
          <div className="lux-section-head">
            <div>
              <p className="lux-eyebrow">Modes</p>
              <h2>Choose what you need, keep it quiet.</h2>
              <p className="lux-body">Chat, image, video, and voice—no extra noise.</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {modes.map((item) => (
              <article key={item.title} className="lux-card">
                <h2 className="text-lg font-semibold">{item.title}</h2>
                <p className="mt-2 text-sm text-[var(--muted)]">{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="lux-section">
          <div className="lux-section-head">
            <div>
              <p className="lux-eyebrow">Start in three steps</p>
              <h2>Clarity first, output fast.</h2>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {steps.map((item) => (
              <div key={item} className="lux-card text-sm text-[var(--muted)]">
                {item}
              </div>
            ))}
          </div>
        </section>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(appJsonLd) }}
      />
    </main>
  );
}
