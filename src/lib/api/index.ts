import { ApiClient } from "./types";
import { graphqlApi } from "./graphql";
import { mockApi } from "./mock";

const USE_MOCK_API = process.env.NEXT_PUBLIC_USE_MOCK_API === "true";

export const api: ApiClient = USE_MOCK_API ? mockApi : graphqlApi;

// Re-export types for convenience
export type { ApiClient, CreateAccountInput, TradesResult } from "./types";
