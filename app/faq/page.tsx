"use client";

import { useState } from "react";
import { TemplatePageContent } from "@/components/intellect/intellect-shell";

const faqItems = [
  {
    title: "How does realtime data work in RafayGen AI?",
    content: "Realtime mode is handled by your existing backend tools and model routing. The UI refresh does not change that runtime behavior.",
  },
  {
    title: "Can chat, image, and voice outputs be downloaded internally?",
    content: "Yes. Your app already exposes preview and download routes for generated media, and the refreshed pages surface those links directly in the interface.",
  },
  {
    title: "Does this migration change models, secrets, or database data?",
    content: "No. The migration preserves existing AI configuration, content, features, settings, models, logo, secrets, credentials, and database behavior.",
  },
  {
    title: "Is reset password fully implemented?",
    content: "No direct password-reset backend exists yet. The template reset page safely offers email sign-in link access instead of breaking the flow.",
  },
];

export default function FaqPage() {
  const [activeIndex, setActiveIndex] = useState<number | null>(0);

  return (
    <TemplatePageContent className="pt-[96px]">
      <div className="rts-faq-area rts-section-gapBottom bg_faq">
        <div className="container">
          <div className="row">
            <div className="col-lg-12">
              <div className="title-conter-area dashboard">
                <h2 className="title">
                  Questions About RafayGen AI?
                  <br />
                  We have Answers!
                </h2>
                <p className="disc">
                  Please feel free to reach out to us. We are always happy to assist you and provide any additional
                  information you may need.
                </p>
              </div>
            </div>
          </div>
          <div className="row mt--60">
            <div className="col-lg-12">
              <div className="accordion-area-one">
                <div className="accordion">
                  {faqItems.map((item, index) => (
                    <div className="accordion-item" key={item.title}>
                      <h2 className="accordion-header">
                        <button
                          className={`accordion-button ${activeIndex === index ? "" : "collapsed"}`}
                          type="button"
                          onClick={() => setActiveIndex((current) => (current === index ? null : index))}
                        >
                          {item.title}
                        </button>
                      </h2>
                      <div className={`accordion-collapse collapse ${activeIndex === index ? "show" : ""}`}>
                        <div className="accordion-body">{item.content}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </TemplatePageContent>
  );
}
