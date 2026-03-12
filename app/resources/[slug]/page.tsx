import type { Metadata } from "next";
import AdSlot from "@/components/monetization/ad-slot";
import {
  TemplateBadgeRow,
  TemplateCardGrid,
  TemplateLinkBar,
  TemplateLongformSections,
  TemplatePublicPage,
  type TemplateCardItem,
  type TemplateSectionItem,
} from "@/components/intellect/template-public";
import { getMonetizationConfig } from "@/lib/monetization";
import { getSiteUrl } from "@/lib/site";
import { getSeoPageBySlug, getSeoPages, type SeoPage } from "@/lib/seo-pages";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  return getSeoPages().map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = getSeoPageBySlug(slug);
  if (!page) {
    return {
      title: "Resources",
      description: "RafayGen AI resources covering practical AI workflows and product guidance.",
    };
  }
  return {
    title: page.title,
    description: page.description,
    keywords: page.keywords,
    alternates: {
      canonical: `/resources/${page.slug}`,
    },
    openGraph: {
      title: page.title,
      description: page.description,
      type: "article",
      url: `/resources/${page.slug}`,
    },
    twitter: {
      title: page.title,
      description: page.description,
      card: "summary_large_image",
    },
  };
}

export default async function ResourceDetailPage({ params }: Props) {
  const { slug } = await params;
  const page: SeoPage =
    getSeoPageBySlug(slug) ??
    ({
      slug,
      title: "Resource overview",
      description: "This resource route is reserved for RafayGen AI guidance and public workflow content.",
      intro: "This page is not published yet. Browse the resources index to open the currently available guides.",
      keywords: ["resources", "rafaygen", "ai workflows"],
      sections: [
        {
          heading: "Available now",
          content:
            "Use the resources index to open current pages for coding, reasoning, speech, multimodal workflows, and SEO-oriented guidance.",
        },
      ],
    } as SeoPage);

  const siteUrl = getSiteUrl();
  const monetization = getMonetizationConfig();
  const pageUrl = `${siteUrl}/resources/${page.slug}`;
  const implementationChecklist = [
    "Define the exact workflow outcome before writing prompts.",
    "Use small iterative tests, then scale once quality is stable.",
    "Track response quality with clear pass/fail criteria.",
    "Keep a fallback path for provider or latency issues.",
    "Review outputs before publishing or production usage.",
  ];
  const quickFaq = [
    {
      q: `How does ${page.title} help in real projects?`,
      a: "It provides practical guidance designed for real workflows rather than abstract examples.",
    },
    {
      q: "Can this be used by both technical and non-technical teams?",
      a: "Yes. The resource language is implementation-focused, but structured so mixed teams can align quickly.",
    },
    {
      q: "Is this content updated as the platform evolves?",
      a: "Yes. Resource pages are reviewed and updated as features, models, and platform routing improve.",
    },
  ];
  const editorialNote =
    "These resources are written and reviewed by the WaveTech Limited team. Last reviewed March 11, 2026.";
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: page.title,
    description: page.description,
    author: {
      "@type": "Organization",
      name: "WaveTech Limited",
    },
    publisher: {
      "@type": "Organization",
      name: "WaveTech Limited",
    },
    mainEntityOfPage: pageUrl,
    url: pageUrl,
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: `${siteUrl}/`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Resources",
        item: `${siteUrl}/resources`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: page.title,
        item: pageUrl,
      },
    ],
  };
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: quickFaq.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a,
      },
    })),
  };
  const sections: TemplateSectionItem[] = page.sections.map((section) => ({
    heading: section.heading,
    body: section.content,
  }));
  const checklistCards: TemplateCardItem[] = implementationChecklist.map((item, index) => ({
    title: `Implementation ${index + 1}`,
    body: item,
    highlighted: index === 0,
  }));
  const faqCards: TemplateCardItem[] = quickFaq.map((item) => ({
    title: item.q,
    body: item.a,
  }));

  return (
    <>
      <TemplatePublicPage
        eyebrow="Resource detail"
        title={page.title}
        description={page.intro}
        metrics={[
          { label: "Sections", value: String(page.sections.length) },
          { label: "Review", value: "Live" },
          { label: "Publisher", value: "WaveTech" },
        ]}
      >
        <TemplateBadgeRow items={page.keywords.slice(0, 6)} />
        <TemplateLongformSections items={sections} />
        <TemplateCardGrid items={checklistCards} columns={2} />
        <AdSlot
          className="mt--10"
          client={monetization.adsenseClient}
          slot={monetization.slots.resourceInline}
          label="Sponsored"
          enabled={monetization.adsenseEnabled}
        />
        <TemplateCardGrid items={faqCards} columns={2} />
        <TemplateLongformSections
          items={[
            {
              heading: "Editorial note",
              body: editorialNote,
            },
          ]}
        />
        <TemplateLinkBar
          items={[
            { href: "/resources", label: "All resources" },
            { href: "/studio", label: "Open Studio", primary: true },
          ]}
        />
      </TemplatePublicPage>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
    </>
  );
}
