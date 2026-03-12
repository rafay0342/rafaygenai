import type { Metadata } from "next";
import {
  TemplateCardGrid,
  TemplateLinkBar,
  TemplatePublicPage,
  type TemplateCardItem,
} from "@/components/intellect/template-public";

export const metadata: Metadata = {
  title: "Monetization Readiness Checklist",
  description:
    "Publisher checklist for RafayGen AI by WaveTech Limited covering content quality, policy compliance, ads.txt, and review readiness.",
  alternates: {
    canonical: "/monetization-ready",
  },
  keywords: [
    "adsense ready",
    "publisher checklist",
    "monetization readiness",
    "ads.txt",
    "policy compliance",
    "RafayGen AI",
  ],
};

export default function MonetizationReadyPage() {
  const cards: TemplateCardItem[] = [
    {
      title: "Publisher checklist",
      eyebrow: "Content and trust",
      body: "Clear primary purpose, useful public content pages, policy pages, functional navigation, original content, and ads.txt readiness.",
      highlighted: true,
    },
    {
      title: "Compliance signals",
      eyebrow: "UX and policy",
      body: "Public pages are distinct from private dashboards, redirects are intentional, page load is optimized for mobile and desktop, and AI content is explained clearly.",
    },
    {
      title: "Ad placement rules",
      eyebrow: "Operational guardrails",
      body: "Ads are enabled only through configuration, restricted to public pages, responsive by default, and excluded from private routes.",
    },
  ];

  return (
    <TemplatePublicPage
      eyebrow="RafayGen AI • WaveTech Limited"
      title="Monetization Readiness Checklist"
      description="This page summarizes the publisher-quality steps taken for RafayGen AI to support transparent review of monetization readiness and advertising compliance."
      metrics={[
        { label: "ads.txt", value: "Present" },
        { label: "Policy pages", value: "Published" },
        { label: "Ad state", value: "Config based" },
      ]}
    >
      <TemplateCardGrid items={cards} />
      <TemplateLinkBar
        items={[
          { href: "/", label: "Home" },
          { href: "/start", label: "Open Studio", primary: true },
          { href: "/resources", label: "Resources" },
          { href: "/privacy", label: "Privacy" },
          { href: "/terms", label: "Terms" },
          { href: "/contact", label: "Contact" },
        ]}
      />
    </TemplatePublicPage>
  );
}
