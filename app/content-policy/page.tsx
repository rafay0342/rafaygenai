import type { Metadata } from "next";
import {
  TemplateLinkBar,
  TemplateLongformSections,
  TemplatePublicPage,
} from "@/components/intellect/template-public";

export const metadata: Metadata = {
  title: "Content Policy",
  description:
    "Content policy for RafayGen AI covering acceptable use, prohibited content, and reporting guidelines.",
  alternates: {
    canonical: "/content-policy",
  },
};

export default function ContentPolicyPage() {
  return (
    <TemplatePublicPage
      eyebrow="Content Policy"
      title="Content Policy"
      description="Last updated: March 11, 2026. This policy explains what content is allowed on RafayGen AI and how moderation and enforcement are handled."
      metrics={[
        { label: "Moderation", value: "Active" },
        { label: "Unsafe content", value: "Blocked" },
        { label: "Reports", value: "Supported" },
      ]}
    >
      <TemplateLongformSections
        items={[
          {
            heading: "Purpose",
            body: "RafayGen AI is built for constructive use cases such as research, writing, coding, analysis, and media workflows.",
          },
          {
            heading: "Prohibited content",
            body: "Do not use the service to create illegal, abusive, hateful, exploitative, fraudulent, or infringing content.",
          },
          {
            heading: "User responsibilities",
            body: "You are responsible for the prompts you submit and the outputs you publish. Review AI-generated content before use and ensure it complies with applicable laws and platform policies.",
          },
          {
            heading: "Moderation and enforcement",
            body: "We apply automated and operational checks to reduce unsafe content. We may remove content, restrict features, or suspend accounts if we detect policy violations.",
          },
          {
            heading: "Report issues",
            body: "If you encounter harmful or policy-violating content, contact us with details so we can investigate and take action.",
          },
        ]}
      />
      <TemplateLinkBar
        items={[
          { href: "/", label: "Home" },
          { href: "/privacy", label: "Privacy" },
          { href: "/terms", label: "Terms" },
          { href: "/contact", label: "Contact" },
        ]}
      />
    </TemplatePublicPage>
  );
}
