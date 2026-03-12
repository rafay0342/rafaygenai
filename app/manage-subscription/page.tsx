"use client";

import Link from "next/link";
import { useState } from "react";
import { TemplatePageContent } from "@/components/intellect/intellect-shell";

const monthlyPlans = [
  {
    name: "Basic",
    price: "$Free",
    period: "/month",
    active: false,
    href: "/register?plan=free",
    features: ["Unlimited chat", "3 media generations / 48h", "Docs access", "Basic analytics"],
  },
  {
    name: "Pro",
    price: "$15",
    period: "/month",
    active: false,
    href: "/register?plan=pro",
    features: ["6 AI image generations / week", "1 video generation / month", "4 min voice / month", "Priority speed"],
  },
  {
    name: "Premium",
    price: "$25",
    period: "/month",
    active: true,
    href: "/register?plan=premium",
    features: ["High quality image routes", "6 video generations / week", "Advanced multimodal models", "Priority support"],
  },
];

const annualPlans = monthlyPlans.map((item) => ({
  ...item,
  price: item.price === "$Free" ? "$Free" : item.name === "Premium" ? "$225" : "$135",
  period: "/year",
}));

const faqs = [
  {
    title: "How do paid plans affect media generation?",
    content: "Paid plans unlock higher limits, better image/video routing, and longer voice generation windows.",
  },
  {
    title: "Can I keep my existing content and docs?",
    content: "Yes. Your live content, AI configuration, model routing, and backend logic stay intact.",
  },
  {
    title: "Do downloads stay inside the app?",
    content: "Yes. Generated files use internal preview and download routes through your existing backend.",
  },
];

export default function ManageSubscriptionPage() {
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const plans = billing === "monthly" ? monthlyPlans : annualPlans;

  return (
    <TemplatePageContent className="pt-[96px]">
      <div className="pricing-plane-area rts-section-gapBottom">
        <div className="container">
          <div className="row">
            <div className="col-lgl-12">
              <div className="title-conter-area">
                <h2 className="title">Manage Subscription</h2>
                <span className="pre-title-bg">
                  Want to get more out of RafayGen AI? Subscribe to one of our professional plans.
                </span>
              </div>
            </div>
          </div>

          <div className="tab-area-pricing-two mt--30">
            <ul className="nav nav-tabs pricing-button-one two">
              <li className="nav-item">
                <button type="button" className={`nav-link ${billing === "monthly" ? "active" : ""}`} onClick={() => setBilling("monthly")}>
                  Monthly Pricing
                </button>
              </li>
              <li className="nav-item">
                <button type="button" className={`nav-link ${billing === "annual" ? "active" : ""}`} onClick={() => setBilling("annual")}>
                  Annual Pricing
                </button>
              </li>
              <li className="save-badge">
                <span>SAVE 25%</span>
              </li>
            </ul>
            <div className="row g-5 mt--10">
              {plans.map((plan) => (
                <div key={plan.name} className="col-lg-4 col-md-6 col-sm-12 col-12">
                  <div className={`single-pricing-single-two ${plan.active ? "active" : ""}`}>
                    <div className="head">
                      <span className="top">{plan.name}</span>
                      <div className="date-use">
                        <h4 className="title">{plan.price}</h4>
                        <span>{plan.period}</span>
                      </div>
                    </div>
                    <div className="body">
                      <p className="para">Production-ready AI access with live chat, media routes, and internal downloads.</p>
                      <div className="check-wrapper">
                        {plan.features.map((feature) => (
                          <div key={feature} className="check-area">
                            <i className="fa-solid fa-check" />
                            <p>{feature}</p>
                          </div>
                        ))}
                      </div>
                      <Link href={plan.href} className="pricing-btn">
                        Get Started
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="accordion-area-one mt--60">
            <div className="accordion">
              {faqs.map((item, index) => (
                <div key={item.title} className="accordion-item">
                  <h2 className="accordion-header">
                    <button
                      className={`accordion-button ${openIndex === index ? "" : "collapsed"}`}
                      type="button"
                      onClick={() => setOpenIndex((current) => (current === index ? null : index))}
                    >
                      {item.title}
                    </button>
                  </h2>
                  <div className={`accordion-collapse collapse ${openIndex === index ? "show" : ""}`}>
                    <div className="accordion-body">{item.content}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </TemplatePageContent>
  );
}
