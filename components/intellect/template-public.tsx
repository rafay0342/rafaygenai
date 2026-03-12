import Link from "next/link";
import type { ReactNode } from "react";
import { TemplateCopyright, TemplatePageContent } from "@/components/intellect/intellect-shell";

type TemplateMetric = {
  label: string;
  value: string;
};

export type TemplateCardItem = {
  title: string;
  body: ReactNode;
  href?: string;
  cta?: string;
  eyebrow?: string;
  highlighted?: boolean;
};

export type TemplateSectionItem = {
  heading: string;
  body: ReactNode;
  note?: ReactNode;
};

export type TemplateLinkItem = {
  href: string;
  label: string;
  primary?: boolean;
};

function cx(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(" ");
}

function columnClass(columns: 2 | 3) {
  return columns === 2 ? "col-lg-6 col-md-6 col-sm-12 col-12" : "col-lg-4 col-md-6 col-sm-12 col-12";
}

export function TemplatePublicPage({
  eyebrow,
  title,
  description,
  metrics,
  children,
  className,
}: {
  eyebrow: string;
  title: string;
  description: ReactNode;
  metrics?: TemplateMetric[];
  children: ReactNode;
  className?: string;
}) {
  const heroSignals = metrics?.slice(0, 3) || [
    { label: "Realtime", value: "On" },
    { label: "Downloads", value: "Internal" },
    { label: "Experience", value: "Responsive" },
  ];

  return (
    <TemplatePageContent className={cx("pt-[96px]", className)}>
      <div className="search__generator intellect-public-page">
        <div className="intellect-public-hero">
          <div className="intellect-public-copy">
            <span className="pre-title-bg">{eyebrow}</span>
            <h2 className="title">{title}</h2>
            <div className="disc">{description}</div>
          </div>
          <div className="intellect-public-hero-side">
            <div className="intellect-public-hero-stack">
              <span className="intellect-public-hero-kicker">Product signals</span>
              <div className="intellect-public-hero-pills">
                {heroSignals.map((metric) => (
                  <div key={`${metric.label}-${metric.value}`} className="intellect-public-hero-pill">
                    <span className="value">{metric.value}</span>
                    <span className="label">{metric.label}</span>
                  </div>
                ))}
              </div>
            </div>
            {metrics?.length ? (
              <div className="intellect-public-metrics">
                {metrics.map((metric) => (
                  <div key={`${metric.label}-${metric.value}`} className="intellect-public-metric">
                    <span className="value">{metric.value}</span>
                    <span className="label">{metric.label}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <div className="intellect-public-body">{children}</div>
      </div>
      <TemplateCopyright />
    </TemplatePageContent>
  );
}

export function TemplateCardGrid({
  items,
  columns = 3,
  className,
}: {
  items: TemplateCardItem[];
  columns?: 2 | 3;
  className?: string;
}) {
  return (
    <div className={cx("row g-5 mt--10 intellect-public-grid", className)}>
      {items.map((item, index) => (
        <div key={`${item.title}-${item.href || "static"}`} className={columnClass(columns)}>
          <div
            className={cx("single-image-generator intellect-public-card", item.highlighted && "intellect-public-card-highlighted")}
            style={{ animationDelay: `${index * 70}ms` }}
          >
            <div className="inner-content">
              <div className="left-content-area">
                {item.eyebrow ? <span className="intellect-public-card-eyebrow">{item.eyebrow}</span> : null}
                <h5 className="title">{item.title}</h5>
                <div className="disc">{item.body}</div>
              </div>
              {item.href ? (
                <Link href={item.href} className="rts-btn btn-primary">
                  {item.cta || "Open"}
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function TemplateLongformSections({
  items,
  className,
}: {
  items: TemplateSectionItem[];
  className?: string;
}) {
  return (
    <div className={cx("intellect-public-longform", className)}>
      {items.map((item) => (
        <section key={item.heading} className="intellect-public-section">
          <h4 className="title">{item.heading}</h4>
          <div className="disc">{item.body}</div>
          {item.note ? <div className="intellect-public-note">{item.note}</div> : null}
        </section>
      ))}
    </div>
  );
}

export function TemplateLinkBar({
  items,
  className,
}: {
  items: TemplateLinkItem[];
  className?: string;
}) {
  return (
    <div className={cx("intellect-public-links", className)}>
      {items.map((item) => (
        <Link
          key={`${item.href}-${item.label}`}
          href={item.href}
          className={cx("rts-btn", item.primary ? "btn-primary" : "btn-border")}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}

export function TemplateBadgeRow({
  items,
  className,
}: {
  items: string[];
  className?: string;
}) {
  return (
    <div className={cx("intellect-public-badges", className)}>
      {items.map((item) => (
        <span key={item} className="intellect-public-badge">
          {item}
        </span>
      ))}
    </div>
  );
}
