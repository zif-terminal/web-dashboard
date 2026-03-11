import { GraphQLClient } from "graphql-request";

function getGraphQLEndpoint(): string {
  const endpoint =
    process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT || "/api/graphql";

  // Handle relative URLs in browser
  if (typeof window !== "undefined" && endpoint.startsWith("/")) {
    return `${window.location.origin}${endpoint}`;
  }

  return endpoint;
}

/**
 * Returns a GraphQL client that posts to our API proxy route.
 * The proxy reads the HttpOnly auth cookie server-side and injects
 * the Authorization header — no client-side token handling needed.
 */
export function getGraphQLClient(): GraphQLClient {
  return new GraphQLClient(getGraphQLEndpoint());
}
