import { BrandAvatar } from "@/components/intellect/brand-avatar";
import { getDocPageBySlug, getDocPages } from "@/lib/docs";
import { getSeoPages } from "@/lib/seo-pages";

type Props = {
  searchParams: Promise<{
    kind?: string;
    slug?: string;
  }>;
};

export default async function CommunityDetailsPage({ searchParams }: Props) {
  const params = await searchParams;
  const kind = params.kind;
  const slug = params.slug;

  const resource = getSeoPages().find((item) => item.slug === slug) || getSeoPages()[0];
  const doc = (slug ? getDocPageBySlug(slug) : null) || getDocPages()[0];

  const content =
    kind === "docs"
      ? {
          title: doc.title,
          author: "WaveTech Docs",
          category: "Documentation",
          date: "March 11, 2026",
          summary: "Operational guidance covering architecture, moderation, analytics, routing, and production behavior.",
          note: "This document is part of the live RafayGen AI knowledge base and reflects the current public product surface.",
          paragraphs: doc.sections.map((section) => ({
            heading: section.heading,
            body: section.body,
          })),
        }
      : {
          title: resource.title,
          author: "WaveTech Editorial",
          category: "Resources",
          date: "March 11, 2026",
          summary: "Public-facing resource content aligned to RafayGen AI capabilities, search intent, and product messaging.",
          note: "This resource is published inside the same branded content system used for docs, support, and monetization pages.",
          paragraphs: resource.sections.map((section) => ({
            heading: section.heading,
            body: section.content,
          })),
        };

  return (
    <div className="blog-details-right-wrapper">
      <div className="rts-blog-details-area-top bg-smooth">
        <div className="container">
          <div className="row">
            <div className="col-lg-12">
              <div className="row top-blog-details-start align-items-center">
                <div className="col-lg-6 col-md-12 col-sm-12 col-xs-12 mb--30">
                  <div className="title-area">
                    <h2 className="title">{content.title}</h2>
                  </div>
                </div>
                <div className="col-lg-6 col-md-12 col-sm-12 col-xs-12">
                  <div className="authore-bd-area">
                    <div className="main">
                      <BrandAvatar kind="brand" label={content.author} size="md" compact />
                      <div className="info">
                        <span className="deg">Author</span>
                        <span className="name">{content.author}</span>
                      </div>
                    </div>
                    <div className="sub-area">
                      <p>Category</p>
                      <span className="deg">{content.category}</span>
                    </div>
                    <div className="sub-area">
                      <p>Published</p>
                      <span className="deg">{content.date}</span>
                    </div>
                  </div>
                </div>
                <div className="col-lg-12 mt--30">
                  <div className="main-image-big intellect-article-hero">
                    <span className="intellect-article-hero__eyebrow">{content.category}</span>
                    <h3>{content.title}</h3>
                    <p className="disc">{content.summary}</p>
                    <div className="intellect-article-hero__grid">
                      <div className="intellect-article-hero__grid-item">
                        <span>Source</span>
                        <strong>{content.author}</strong>
                      </div>
                      <div className="intellect-article-hero__grid-item">
                        <span>Status</span>
                        <strong>Live</strong>
                      </div>
                      <div className="intellect-article-hero__grid-item">
                        <span>Published</span>
                        <strong>{content.date}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="blog-detail-inenr-area pt--45 rts-section-gapBottom plr_sm--5 bg-smooth">
        <div className="container-bd">
          <div className="row">
            <div className="col-lg-12">
              <div className="para-area-wrapper">
                {content.paragraphs.map((section, index) => (
                  <div key={section.heading}>
                    {index === 1 ? (
                      <div className="intellect-article-note">
                        <h5 className="title">Why this page matters</h5>
                        <p>{content.note}</p>
                      </div>
                    ) : null}
                    <h4 className="title">{section.heading}</h4>
                    <p className="disc">{section.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
