import "./globals.css";

import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { Suspense } from "react";
import Providers from "./providers";
import { getSiteUrl } from "@/lib/site";
import { getMonetizationConfig } from "@/lib/monetization";
import AnalyticsClient from "@/components/analytics-client";
import IntellectShell from "@/components/intellect/intellect-shell";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

const siteUrl = getSiteUrl();
const monetization = getMonetizationConfig();
const themeInitScript = `
  try {
    var key = "rafaygen:theme";
    var stored = window.localStorage.getItem(key);
    var theme = stored === "dark" || stored === "claude" ? "dark" : "light";
    if (stored === "claude") {
      window.localStorage.setItem(key, "dark");
    }
    document.documentElement.setAttribute("data-theme", theme);
  } catch (error) {
    document.documentElement.setAttribute("data-theme", "light");
  }
`;

const seoKeywords = [
  "free ai",
  "free ai chat",
  "ai chatbot",
  "ai assistant",
  "ai tools",
  "ai tools free",
  "ai coding assistant",
  "ai math solver",
  "reasoning ai",
  "ai image generator",
  "ai art generator",
  "ai video generator",
  "text to video ai",
  "text to image ai",
  "ai voice",
  "speech to text ai",
  "ai agents",
  "multimodal ai",
  "chatgpt alternative",
  "gemini ai",
  "deepseek ai",
  "perplexity ai",
  "grok ai",
  "google ai studio",
  "free ai image",
  "free ai video",
  "ai action figure",
  "ai barbie",
  "ghibli ai art",
  "RafayGen AI",
  "WaveTech Limited",
];

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "RafayGen Agent",
    template: "%s | RafayGen Agent",
  },
  description:
    "RafayGen AI by WaveTech Limited: free AI chat, coding, reasoning, voice, image, and video workflows in one web platform.",
  keywords: seoKeywords,
  applicationName: "RafayGen Agent",
  creator: "WaveTech Limited",
  publisher: "WaveTech Limited",
  category: "technology",
  other: {
    "google-adsense-account": "ca-pub-5897402176074721",
  },
  alternates: {
    canonical: "/",
    languages: {
      "en-US": "/",
    },
  },
  openGraph: {
    title: "RafayGen Agent",
    description:
      "Free AI chat, coding, reasoning, voice, image, and video generation in one modern web app.",
    type: "website",
    url: "/",
    siteName: "RafayGen Agent",
    images: [
      {
        url: "/og-image.svg",
        width: 1200,
        height: 630,
        alt: "RafayGen Agent by WaveTech Limited",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "RafayGen Agent",
    description: "Free AI chat, coding, reasoning, and media generation platform.",
    images: ["/og-image.svg"],
  },
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon.ico", sizes: "any", type: "image/x-icon" },
    ],
    shortcut: "/favicon-32.png",
    apple: [{ url: "/favicon-256.png", sizes: "256x256", type: "image/png" }],
  },
  manifest: "/manifest.webmanifest",
  verification: {
    google:
      process.env.GOOGLE_SITE_VERIFICATION ||
      process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ||
      "",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f8fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0e15" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
      data-theme="light"
      suppressHydrationWarning
    >
      <head>
        {/* eslint-disable-next-line @next/next/no-css-tags */}
        <link rel="stylesheet" href="/intellect/css/style.css" />
        {/* eslint-disable-next-line @next/next/no-css-tags */}
        <link rel="stylesheet" href="/intellect/css/rafaygen-overrides.css" />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {monetization.adsenseEnabled && (
          <script
            async
            src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-5897402176074721"
            crossOrigin="anonymous"
          />
        )}
      </head>
      <body className="antialiased">
        <Providers>
          <IntellectShell>{children}</IntellectShell>
        </Providers>
        <Suspense fallback={null}>
          <AnalyticsClient />
        </Suspense>
      </body>
    </html>
  );
}
