import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project. A stray package-lock.json in a
  // parent directory otherwise makes Next.js infer the wrong root.
  turbopack: {
    root: __dirname,
  },
  // pdfkit ships .afm font metrics it reads from disk at runtime; bundling
  // strips them, so it must stay external (the inspection-PDF route).
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
