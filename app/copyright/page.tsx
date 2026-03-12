import type { Metadata } from "next";
import {
  TemplateLinkBar,
  TemplateLongformSections,
  TemplatePublicPage,
} from "@/components/intellect/template-public";

export const metadata: Metadata = {
  title: "Copyright Policy",
  description:
    "Copyright policy for RafayGen AI with guidance on reporting infringement and protecting intellectual property.",
  alternates: {
    canonical: "/copyright",
  },
};

export default function CopyrightPage() {
  return (
    <TemplatePublicPage
      eyebrow="Copyright Policy"
      title="Copyright Policy"
      description="Last updated: March 11, 2026. RafayGen AI respects intellectual property rights and expects users to do the same."
      metrics={[
        { label: "Rights notices", value: "Reviewed" },
        { label: "Repeat abuse", value: "Restricted" },
        { label: "Contact path", value: "Live" },
      ]}
    >
      <TemplateLongformSections
        items={[
          {
            heading: "Respect for rights",
            body: "Do not upload or generate content that infringes copyrights, trademarks, or other proprietary rights.",
          },
          {
            heading: "Reporting infringement",
            body: "If you believe content on RafayGen AI infringes your rights, contact us with a clear description, the location of the content, and proof of ownership.",
          },
          {
            heading: "Response process",
            body: "We review credible notices and may remove content or restrict access when required. Repeat violations may result in account suspension or termination.",
          },
        ]}
      />
      <TemplateLinkBar
        items={[
          { href: "/", label: "Home" },
          { href: "/content-policy", label: "Content Policy" },
          { href: "/contact", label: "Contact" },
        ]}
      />
    </TemplatePublicPage>
  );
}
