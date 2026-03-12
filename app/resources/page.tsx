import type { Metadata } from "next";
import AdSlot from "@/components/monetization/ad-slot";
import {
  TemplateCardGrid,
  TemplateLinkBar,
  TemplatePublicPage,
  type TemplateCardItem,
} from "@/components/intellect/template-public";
import { getMonetizationConfig } from "@/lib/monetization";
import { getSeoPages } from "@/lib/seo-pages";

export const metadata: Metadata = {
  title: "Resources",
  description:
    "Explore RafayGen AI resources covering coding, reasoning, math, speech-to-text, and multimodal AI workflows.",
  keywords: [
    "RafayGen resources",
    "AI coding guides",
    "AI math solver guides",
    "speech to text workflows",
    "AI image and video workflows",
  ],
  alternates: {
    canonical: "/resources",
  },
  openGraph: {
    title: "RafayGen AI Resources",
    description:
      "Technical resources from RafayGen AI for coding, reasoning, math, speech-to-text, and multimodal workflows.",
    type: "website",
    url: "/resources",
  },
};

export default function ResourcesPage() {
  const pages = getSeoPages();
  const monetization = getMonetizationConfig();
  const cards: TemplateCardItem[] = pages.map((page, index) => ({
    title: page.title,
    eyebrow: index < 3 ? "Featured resource" : "Resource page",
    body: page.description,
    href: `/resources/${page.slug}`,
    cta: "Read page",
    highlighted: index === 0,
  }));

  return (
    <TemplatePublicPage
      eyebrow="RafayGen AI Resources"
      title="Knowledge and resources for practical AI workflows"
      description="Technical pages focused on coding, reasoning, math, search, speech, and media workflows across the RafayGen product surface."
      metrics={[
        { label: "Published resources", value: String(pages.length) },
        { label: "User intent", value: "Public" },
        { label: "Ad slots", value: monetization.adsenseEnabled ? "Enabled" : "Ready" },
      ]}
    >
      <TemplateLinkBar
        items={[
          { href: "/chatbot", label: "Open AI Chat", primary: true },
          { href: "/login", label: "Sign In" },
          { href: "/seo", label: "AI Search Trends" },
        ]}
      />
      <AdSlot
        className="mt--10"
        client={monetization.adsenseClient}
        slot={monetization.slots.resourcesTop}
        label="Sponsored"
        enabled={monetization.adsenseEnabled}
      />
      <TemplateCardGrid items={cards} />
    </TemplatePublicPage>
  );
}
