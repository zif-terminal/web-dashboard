import type { NextConfig } from "next";

// Backend URLs - can be overridden via environment variables
const HASURA_URL = process.env.HASURA_URL || "http://167.99.145.4";
const AUTH_URL = process.env.AUTH_URL || "http://167.99.145.4";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/auth/:path*",
        destination: `${AUTH_URL}/auth/:path*`,
      },
      {
        source: "/api/graphql",
        destination: `${HASURA_URL}/v1/graphql`,
      },
    ];
  },
};

export default nextConfig;
