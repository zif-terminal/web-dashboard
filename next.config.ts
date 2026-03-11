import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Discovery proxy moved to API route (src/app/api/discover/[...path]/route.ts)
  // to enforce auth. No rewrites needed.
};

export default nextConfig;
