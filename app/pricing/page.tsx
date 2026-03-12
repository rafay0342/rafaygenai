import type { Metadata } from "next";
import Link from "next/link";
import {
  TemplateCardGrid,
  TemplateLinkBar,
  TemplatePublicPage,
  type TemplateCardItem,
} from "@/components/intellect/template-public";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Pricing plans for RafayGen AI covering free, pro, and premium access.",
  alternates: { canonical: "/pricing" },
};

export default function PricingPage() {
  const cards: TemplateCardItem[] = [
    {
      title: "Starter",
      eyebrow: "Free",
      body: (
        <>
          <p>Chat access, docs, and limited image or voice usage for testing the workspace.</p>
          <p>Best for evaluation and first-time onboarding.</p>
        </>
      ),
      highlighted: true,
    },
    {
      title: "Pro",
      eyebrow: "$15 / month",
      body: (
        <>
          <p>More image generation, faster routes, and broader multimodal coverage.</p>
          <p>Best for regular creators and technical users.</p>
        </>
      ),
    },
    {
      title: "Premium",
      eyebrow: "$25 / month",
      body: (
        <>
          <p>Higher media limits, stronger routing, and priority support.</p>
          <p>Best for advanced workflows and business usage.</p>
        </>
      ),
    },
  ];

  return (
    <TemplatePublicPage
      eyebrow="RafayGen Plans"
      title="Clear pricing for chat, media, and voice workflows"
      description="Choose a plan based on usage volume, media needs, and support expectations. The public pricing page stays indexable and the in-app billing page handles account actions."
      metrics={[
        { label: "Plans", value: "3" },
        { label: "Billing", value: "Monthly + annual" },
        { label: "Upgrade path", value: "Live" },
      ]}
    >
      <TemplateCardGrid items={cards} />
      <div className="intellect-public-cta-panel">
        <div>
          <h4>Need account-level billing controls?</h4>
          <p>Open the subscription area to compare limits, switch billing cadence, and start a plan.</p>
        </div>
        <div className="intellect-public-cta-actions">
          <Link href="/manage-subscription" className="rts-btn btn-primary">
            Open billing
          </Link>
          <Link href="/contact" className="rts-btn btn-border">
            Contact sales
          </Link>
        </div>
      </div>
      <TemplateLinkBar
        items={[
          { href: "/manage-subscription", label: "Manage Subscription", primary: true },
          { href: "/resources", label: "Resources" },
          { href: "/contact", label: "Contact" },
        ]}
      />
    </TemplatePublicPage>
  );
}
