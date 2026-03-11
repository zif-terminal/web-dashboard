import type { NextConfig } from "next";

const DISCOVERY_URL = process.env.DISCOVERY_URL || "http://localhost:8082";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      {
        // Auth and GraphQL routes are handled by API routes (HttpOnly cookie auth).
        // Only discovery still uses a rewrite (no auth needed).
        source: "/api/discover/:path*",
        destination: `${DISCOVERY_URL}/:path*`,
      },
    ];
  },
};

export default nextConfig;
