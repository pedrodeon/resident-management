import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project. A stray package-lock.json in a
  // parent directory otherwise makes Next.js infer the wrong root.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
