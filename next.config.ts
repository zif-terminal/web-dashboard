import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/auth/:path*",
        destination: "http://167.99.145.4/auth/:path*",
      },
      {
        source: "/api/graphql",
        destination: "http://167.99.145.4/v1/graphql",
      },
    ];
  },
};

export default nextConfig;
