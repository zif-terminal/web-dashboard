import type { NextConfig } from "next";

const HASURA_URL = process.env.HASURA_URL || "http://167.99.145.4";
const AUTH_URL = process.env.AUTH_URL || "http://167.99.145.4";
const DISCOVERY_URL = process.env.DISCOVERY_URL || "http://localhost:8082";

const nextConfig: NextConfig = {
  output: "standalone",
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
      {
        source: "/api/discover/:path*",
        destination: `${DISCOVERY_URL}/:path*`,
      },
    ];
  },
};

export default nextConfig;
