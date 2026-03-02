import type { NextConfig } from "next";

// Backend URLs - can be overridden via environment variables
const HASURA_URL = process.env.HASURA_URL || "http://167.99.145.4";
const AUTH_URL = process.env.AUTH_URL || "http://167.99.145.4";
// C1.1: vault_manager service for deposit flow (port 8085).
const VAULT_MANAGER_URL = process.env.VAULT_MANAGER_URL || "http://localhost:8085";

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
      {
        // C1.1: proxy Hyperliquid vault listing API calls to vault_manager.
        source: "/api/vault/:path*",
        destination: `${VAULT_MANAGER_URL}/vault/:path*`,
      },
      {
        // C1.1: proxy strategy vault deposit API calls to vault_manager.
        // Handles: /api/strategy-vault/{slug}/deposit/prepare
        //          /api/strategy-vault/{slug}/deposit
        //          /api/strategy-vault/{slug}/deposit/verify
        source: "/api/strategy-vault/:path*",
        destination: `${VAULT_MANAGER_URL}/strategy-vault/:path*`,
      },
    ];
  },
};

export default nextConfig;
