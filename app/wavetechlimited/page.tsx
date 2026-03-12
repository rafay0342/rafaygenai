import type { Metadata } from "next";
import {
  TemplateCardGrid,
  TemplateLinkBar,
  TemplatePublicPage,
  type TemplateCardItem,
} from "@/components/intellect/template-public";

export const metadata: Metadata = {
  title: "WaveTech Limited",
  description:
    "WaveTech Limited builds RafayGen AI, an advanced AI studio for production-grade chat, code, math, and media workflows.",
  alternates: {
    canonical: "/wavetechlimited",
  },
};

export default function WavetechLimitedPage() {
  const cards: TemplateCardItem[] = [
    {
      title: "Practical software quality",
      eyebrow: "Company focus",
      body: "Stable infrastructure, clear product surfaces, and accountable documentation for users, search engines, and platform reviewers.",
      highlighted: true,
    },
    {
      title: "Public trust surfaces",
      eyebrow: "Operational clarity",
      body: "We maintain public support and policy pages to help users understand platform behavior, usage boundaries, and communication channels.",
    },
    {
      title: "AI product delivery",
      eyebrow: "RafayGen AI",
      body: "WaveTech Limited builds fast and reliable AI-driven productivity across technical and business workflows.",
    },
  ];

  return (
    <TemplatePublicPage
      eyebrow="WaveTech Limited"
      title="Company overview"
      description="WaveTech Limited is the company behind RafayGen AI. The platform is built for fast and reliable AI-driven productivity across technical and business workflows."
      metrics={[
        { label: "Company", value: "WaveTech" },
        { label: "Product", value: "RafayGen AI" },
        { label: "Focus", value: "Production" },
      ]}
    >
      <TemplateCardGrid items={cards} />
      <TemplateLinkBar
        items={[
          { href: "/", label: "Home" },
          { href: "/resources", label: "Resources" },
          { href: "/studio", label: "Open Studio", primary: true },
          { href: "/contact", label: "Contact" },
        ]}
      />
    </TemplatePublicPage>
  );
}
