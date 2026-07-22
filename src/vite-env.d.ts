/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_MOCK?: string;
  readonly VITE_HASURA_HTTP?: string;
  readonly VITE_HASURA_WS?: string;
  readonly VITE_AUTH_URL?: string;
  // #202 dark-launch flag for the reduce-only HL TP/SL "set-and-rest" feature.
  // When absent or !== 'true' the entire in-browser order-placement surface is
  // hidden and its code paths never run. Default OFF so prod stays read-only.
  readonly VITE_ENABLE_HL_ORDERS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
