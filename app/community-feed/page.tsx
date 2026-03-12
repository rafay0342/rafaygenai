"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useMemo, useState } from "react";
import { BrandAvatar } from "@/components/intellect/brand-avatar";
import { TemplateCopyright, TemplatePageContent } from "@/components/intellect/intellect-shell";
import { getDocPages } from "@/lib/docs";
import { getSeoPages } from "@/lib/seo-pages";

type FeedItem = {
  kind: "docs" | "resources";
  slug: string;
  title: string;
  description: string;
};

export default function CommunityFeedPage() {
  const [activeTab, setActiveTab] = useState<"image" | "content" | "voice">("image");
  const [query, setQuery] = useState("");

  const docs = getDocPages().map(
    (item): FeedItem => ({
      kind: "docs",
      slug: item.slug,
      title: item.title,
      description: item.description,
    }),
  );
  const resources = getSeoPages().map(
    (item): FeedItem => ({
      kind: "resources",
      slug: item.slug,
      title: item.title,
      description: item.description,
    }),
  );

  const items = useMemo(() => {
    const base =
      activeTab === "content"
        ? docs
        : activeTab === "voice"
          ? resources.filter((item) => /voice|speech|prompt|business/i.test(item.title))
          : resources;

    const normalized = query.trim().toLowerCase();
    if (!normalized) return base;
    return base.filter(
      (item) =>
        item.title.toLowerCase().includes(normalized) ||
        item.description.toLowerCase().includes(normalized),
    );
  }, [activeTab, docs, query, resources]);

  return (
    <>
      <TemplatePageContent className="pt-[96px]">
        <div className="search__generator">
          <div className="nav-search-between">
            <div className="left-area">
              <h4 className="title">Knowledge Feed</h4>
              <form action="#" onSubmit={(event) => event.preventDefault()}>
                <input type="text" placeholder="Search docs and resources..." value={query} onChange={(event) => setQuery(event.target.value)} />
                <button type="submit">Search</button>
              </form>
            </div>

            <ul className="nav nav-pills mb-3">
              <li className="nav-item">
                <button type="button" className={`nav-link ${activeTab === "image" ? "active" : ""}`} onClick={() => setActiveTab("image")}>
                  <img src="/intellect/images/icons/10.png" alt="" />
                  Resources
                </button>
              </li>
              <li className="nav-item">
                <button type="button" className={`nav-link ${activeTab === "content" ? "active" : ""}`} onClick={() => setActiveTab("content")}>
                  <img src="/intellect/images/icons/11.png" alt="" />
                  Documentation
                </button>
              </li>
              <li className="nav-item">
                <button type="button" className={`nav-link ${activeTab === "voice" ? "active" : ""}`} onClick={() => setActiveTab("voice")}>
                  <img src="/intellect/images/icons/12.png" alt="" />
                  Voice Workflows
                </button>
              </li>
            </ul>
          </div>

          <div className="mt--50">
            <div className="row g-5">
              {items.map((item, index) => (
                <div key={`${item.kind}-${item.slug}`} className="col-lg-4 col-md-4 col-sm-6 col-12 col-show-5">
                  <div className="single-cummunity-feed">
                    <Link
                      href={`/community-details?kind=${item.kind}&slug=${item.slug}`}
                      prefetch={false}
                      className="thumbnail"
                    >
                      <div className={`intellect-feed-cover ${item.kind === "docs" ? "intellect-feed-cover--docs" : ""}`}>
                        <span className="intellect-feed-cover__eyebrow">
                          {item.kind === "docs" ? "Operational document" : "Search resource"}
                        </span>
                        <h5 className="intellect-feed-cover__title">{item.title}</h5>
                        <div className="intellect-feed-cover__meta">
                          <span className="intellect-feed-token">{item.kind === "docs" ? "Docs" : "Resource"}</span>
                          <span className="intellect-feed-token">{index < 3 ? "Featured" : "Live"}</span>
                        </div>
                      </div>
                    </Link>
                    <div className="inner-content-area">
                      <div className="top">
                        <div className="left-area">
                          <div className="intellect-feed-author">
                            <BrandAvatar kind="brand" label="WaveTech" size="sm" compact />
                            <p>{item.kind === "docs" ? "WaveTech Docs" : "WaveTech Editorial"}</p>
                          </div>
                        </div>
                        <div className="love-reaction">
                          <div className="icon intellect-feed-token">
                            <span>{item.kind === "docs" ? "Structured" : "Public"}</span>
                          </div>
                        </div>
                      </div>
                      <p className="disc">{item.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <TemplateCopyright />
      </TemplatePageContent>
    </>
  );
}
