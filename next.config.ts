import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  turbopack: {
    // Force the workspace root to this project so .env.local and lockfile are picked correctly during build
    root: __dirname,
  },
};

export default nextConfig;
