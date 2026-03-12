import type { Metadata } from "next";
import {
  TemplateLinkBar,
  TemplateLongformSections,
  TemplatePublicPage,
} from "@/components/intellect/template-public";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Terms of Service for RafayGen AI by WaveTech Limited including usage rules, account responsibilities, and platform limitations.",
  alternates: {
    canonical: "/terms",
  },
};

export default function TermsPage() {
  return (
    <TemplatePublicPage
      eyebrow="Terms of Service"
      title="Terms of Service"
      description="Last updated: March 11, 2026. These terms govern access to RafayGen AI, including acceptable use, account responsibility, and service limitations."
      metrics={[
        { label: "Eligibility", value: "13+" },
        { label: "Output review", value: "Required" },
        { label: "Availability", value: "Best effort" },
      ]}
    >
      <TemplateLongformSections
        items={[
          {
            heading: "Acceptance and account responsibility",
            body: "By using RafayGen AI, you agree to these terms. You are responsible for safeguarding your login credentials and activities under your account.",
          },
          {
            heading: "Acceptable use",
            body: "Do not use the platform for illegal activities, abuse, unauthorized access attempts, malware distribution, or harmful content generation.",
          },
          {
            heading: "User content and output",
            body: "You retain rights to your inputs and are responsible for the content you submit. Review AI outputs before use or publication, especially in high-stakes contexts.",
          },
          {
            heading: "Intellectual property",
            body: "The RafayGen AI platform, branding, and underlying software are owned by WaveTech Limited. You may not copy, resell, or reverse engineer the service without written permission.",
          },
          {
            heading: "Service availability and termination",
            body: "We aim for reliable uptime but do not guarantee uninterrupted operation. We may suspend or terminate access if a user violates these terms or creates risk for the service.",
          },
          {
            heading: "Changes to terms",
            body: "Terms may be updated periodically. Continued use after updates means you accept the revised terms.",
          },
        ]}
      />
      <TemplateLinkBar
        items={[
          { href: "/", label: "Home" },
          { href: "/privacy", label: "Privacy" },
          { href: "/contact", label: "Contact" },
        ]}
      />
    </TemplatePublicPage>
  );
}
