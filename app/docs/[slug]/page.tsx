import type { Metadata } from "next";
import AdSlot from "@/components/monetization/ad-slot";
import {
  TemplateCardGrid,
  TemplateLinkBar,
  TemplateLongformSections,
  TemplatePublicPage,
  type TemplateCardItem,
  type TemplateSectionItem,
} from "@/components/intellect/template-public";
import { getMonetizationConfig } from "@/lib/monetization";
import { getDocPageBySlug, getDocPages, type DocPage } from "@/lib/docs";

type Props = {
  params: { slug: string };
};

export async function generateStaticParams() {
  return getDocPages().map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = getDocPageBySlug(params.slug);
  if (!page) {
    return {
      title: "Documentation",
      description: "RafayGen AI documentation and platform guidance.",
    };
  }
  return {
    title: page.title,
    description: page.description,
    keywords: page.keywords,
    alternates: { canonical: `/docs/${page.slug}` },
    openGraph: {
      title: page.title,
      description: page.description,
      url: `/docs/${page.slug}`,
    },
  };
}

export default function DocDetailPage({ params }: Props) {
  const page: DocPage =
    getDocPageBySlug(params.slug) ??
    ({
      slug: params.slug,
      title: "Documentation",
      description: "RafayGen AI documentation and platform guidance.",
      keywords: ["documentation", "rafaygen", "platform"],
      hero: {
        lead: "This documentation route is not yet published.",
        detail: "Visit the docs index for the full list of available guides and resources.",
      },
      sections: [
        {
          heading: "Find the right guide",
          body: "Head back to the docs index to open AdSense, analytics, moderation, and architecture guidance.",
          callout: "We keep all production-ready docs under /docs so every public URL stays live and responsive.",
        },
      ],
      checklist: [],
    } as DocPage);
  const monetization = getMonetizationConfig();
  const sections: TemplateSectionItem[] = page.sections.map((section) => ({
    heading: section.heading,
    body: section.body,
    note: section.callout,
  }));
  const checklistCards: TemplateCardItem[] =
    (page as DocPage).checklist?.map((item, index) => ({
      title: `Checklist ${index + 1}`,
      body: item,
      highlighted: index === 0,
    })) || [];

  return (
    <TemplatePublicPage
      eyebrow={`Documentation • ${page.title}`}
      title={page.title}
      description={
        <>
          <p>{page.hero.lead}</p>
          <p>{page.hero.detail}</p>
        </>
      }
      metrics={[
        { label: "Sections", value: String(page.sections.length) },
        { label: "Keywords", value: String(page.keywords.length) },
        { label: "Status", value: "Reviewed" },
      ]}
    >
      <TemplateLongformSections items={sections} />
      {checklistCards.length ? <TemplateCardGrid items={checklistCards} columns={2} /> : null}
      <AdSlot
        className="mx-auto max-w-3xl"
        client={monetization.adsenseClient}
        slot={monetization.slots.resourcesTop}
        label="Sponsored"
        enabled={monetization.adsenseEnabled}
      />
      <TemplateLinkBar
        items={[
          { href: "/docs", label: "Back to docs" },
          { href: "/contact", label: "Contact team" },
        ]}
      />
    </TemplatePublicPage>
  );
}
