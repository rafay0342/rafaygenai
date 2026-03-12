import type { Metadata } from "next";
import AdSlot from "@/components/monetization/ad-slot";
import {
  TemplateCardGrid,
  TemplatePublicPage,
  type TemplateCardItem,
} from "@/components/intellect/template-public";
import { getMonetizationConfig } from "@/lib/monetization";
import { getDocPages } from "@/lib/docs";

export const metadata: Metadata = {
  title: "AI Documentation",
  description: "Documentation for RafayGen AI covering architecture, models, moderation, and analytics.",
  alternates: { canonical: "/docs" },
  keywords: ["documentation", "ai docs", "rafaygen", "analytics"],
};

export default function DocsIndexPage() {
  const pages = getDocPages();
  const monetization = getMonetizationConfig();
  const totalSections = pages.reduce((count, page) => count + page.sections.length, 0);
  const cards: TemplateCardItem[] = pages.map((page) => ({
    title: page.title,
    eyebrow: `${page.sections.length} sections`,
    body: page.description,
    href: `/docs/${page.slug}`,
    cta: "Read full doc",
  }));
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: pages.map((page) => ({
      "@type": "Question",
      name: page.title,
      acceptedAnswer: {
        "@type": "Answer",
        text: page.description,
      },
    })),
  };

  return (
    <>
      <TemplatePublicPage
        eyebrow="RafayGen AI Docs"
        title="Documentation for an operational AI studio"
        description="Explore architecture, model behavior, analytics, safety, and deployment guidance that keep RafayGen AI production-ready."
        metrics={[
          { label: "Published guides", value: String(pages.length) },
          { label: "Core sections", value: String(totalSections) },
          { label: "Policy status", value: "Live" },
        ]}
      >
        <AdSlot
          className="mx-auto max-w-3xl"
          client={monetization.adsenseClient}
          slot={monetization.slots.resourcesTop}
          label="Sponsored"
          enabled={monetization.adsenseEnabled}
        />
        <TemplateCardGrid items={cards} className="mt--30" />
      </TemplatePublicPage>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
    </>
  );
}
