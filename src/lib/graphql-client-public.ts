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
 * Returns a GraphQL client with NO auth token attached.
 * Hasura will assign the "anonymous" role to these requests,
 * granting read-only access to public wallet data (A1.5).
 */
export function getPublicGraphQLClient(): GraphQLClient {
  return new GraphQLClient(getGraphQLEndpoint(), {
    headers: {},
  });
}
