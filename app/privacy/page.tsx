import type { Metadata } from "next";
import {
  TemplateLinkBar,
  TemplateLongformSections,
  TemplatePublicPage,
} from "@/components/intellect/template-public";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Privacy Policy for RafayGen AI by WaveTech Limited covering data usage, account security, and user controls.",
  alternates: {
    canonical: "/privacy",
  },
};

export default function PrivacyPage() {
  return (
    <TemplatePublicPage
      eyebrow="Privacy Policy"
      title="Privacy Policy"
      description="Last updated: March 11, 2026. This policy explains what information RafayGen AI processes when users access public pages, create accounts, and use AI features."
      metrics={[
        { label: "Operator", value: "WaveTech" },
        { label: "Data scope", value: "Accounts + usage" },
        { label: "Ads", value: "Config based" },
      ]}
    >
      <TemplateLongformSections
        items={[
          {
            heading: "Who we are",
            body: "RafayGen AI is operated by WaveTech Limited. This policy explains what information we process when users access public pages, create accounts, and use AI features.",
          },
          {
            heading: "Data we process",
            body: "We may process account information such as email, authentication records, usage logs, prompts, generated outputs, and uploaded files required for requested features.",
          },
          {
            heading: "How data is used",
            body: "Data is used to authenticate users, route AI requests, enforce platform safety and rate limits, debug service quality, and maintain operational integrity.",
          },
          {
            heading: "Cookies and analytics",
            body: "We use essential cookies for login sessions and security. Additional analytics or advertising cookies may be used where applicable and configured under relevant legal requirements.",
          },
          {
            heading: "Advertising and AdSense",
            body: "When advertising is enabled, Google AdSense or similar providers may display ads on public pages. These partners may use cookies or device identifiers to measure performance and deliver relevant ads.",
          },
          {
            heading: "Security and retention",
            body: "We implement technical and operational safeguards to reduce unauthorized access risk and retain data only as long as necessary to provide the service, meet legal obligations, resolve disputes, and enforce agreements.",
          },
          {
            heading: "Children's privacy and user rights",
            body: "RafayGen AI is not directed to children under 13. Users may request access, correction, or deletion of account-related data where legally applicable.",
          },
        ]}
      />
      <TemplateLinkBar
        items={[
          { href: "/", label: "Home" },
          { href: "/terms", label: "Terms" },
          { href: "/contact", label: "Contact" },
        ]}
      />
    </TemplatePublicPage>
  );
}
