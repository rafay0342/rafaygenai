import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RafayGen AI",
    short_name: "RafayGen",
    description:
      "RafayGen AI by WaveTech Limited: free AI chat, coding, reasoning, voice, image, and video workflows.",
    start_url: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#2563eb",
    lang: "en",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
      { src: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { src: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { src: "/favicon-48.png", sizes: "48x48", type: "image/png" },
      { src: "/favicon-64.png", sizes: "64x64", type: "image/png" },
      { src: "/favicon-128.png", sizes: "128x128", type: "image/png" },
      { src: "/favicon-256.png", sizes: "256x256", type: "image/png" },
      { src: "/favicon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
