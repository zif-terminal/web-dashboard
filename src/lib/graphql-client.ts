import { GraphQLClient } from "graphql-request";
import Cookies from "js-cookie";

export const TOKEN_COOKIE_NAME = "zif_auth_token";

function getGraphQLEndpoint(): string {
  const endpoint =
    process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT || "/api/graphql";

  // Handle relative URLs in browser
  if (typeof window !== "undefined" && endpoint.startsWith("/")) {
    return `${window.location.origin}${endpoint}`;
  }

  return endpoint;
}

export function getGraphQLClient(): GraphQLClient {
  const token = Cookies.get(TOKEN_COOKIE_NAME);

  return new GraphQLClient(getGraphQLEndpoint(), {
    headers: token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : {},
  });
}

export function getAuthenticatedClient(token: string): GraphQLClient {
  return new GraphQLClient(getGraphQLEndpoint(), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}
