import type { Metadata } from "next";
import {
  TemplateCardGrid,
  TemplateLinkBar,
  TemplatePublicPage,
  type TemplateCardItem,
} from "@/components/intellect/template-public";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Contact WaveTech Limited for RafayGen AI support, account requests, policy questions, and business inquiries.",
  alternates: {
    canonical: "/contact",
  },
};

export default function ContactPage() {
  const cards: TemplateCardItem[] = [
    {
      title: "Support Email",
      eyebrow: "Accounts and technical help",
      body: "support@wavetechlimited.com",
      href: "mailto:support@wavetechlimited.com",
      cta: "Email support",
      highlighted: true,
    },
    {
      title: "Privacy Requests",
      eyebrow: "Data and compliance",
      body: "privacy@wavetechlimited.com",
      href: "mailto:privacy@wavetechlimited.com",
      cta: "Email privacy",
    },
    {
      title: "What to include",
      eyebrow: "Faster resolution",
      body: "Registered email, issue summary, exact error text, screenshots, timestamps, and browser/device details.",
    },
  ];

  return (
    <TemplatePublicPage
      eyebrow="Contact"
      title="Contact WaveTech Limited"
      description="For RafayGen AI account support, policy requests, or business queries, contact our team with clear details so we can respond quickly."
      metrics={[
        { label: "Response path", value: "Email" },
        { label: "Business", value: "WaveTech" },
        { label: "Support state", value: "Open" },
      ]}
    >
      <TemplateCardGrid items={cards} />
      <TemplateLinkBar
        items={[
          { href: "/", label: "Home" },
          { href: "/privacy", label: "Privacy" },
          { href: "/terms", label: "Terms" },
        ]}
      />
    </TemplatePublicPage>
  );
}
