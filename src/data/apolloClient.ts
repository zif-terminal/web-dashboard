import {
  ApolloClient, InMemoryCache, HttpLink, split, from,
} from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { onError } from '@apollo/client/link/error';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { getMainDefinition } from '@apollo/client/utilities';
import { createClient } from 'graphql-ws';
import { getToken, clearSession } from './authStore';
import { pushError } from '../lib/errorBus';

/**
 * Apollo + Hasura wiring for LIVE (webhook-auth) mode.
 *
 *  - HTTP link  → queries + mutations
 *  - graphql-ws → subscriptions (Hasura speaks the graphql-ws protocol)
 *  - split()    → routes subscription ops to WS, everything else to HTTP
 *
 * The session token (from authStore) is injected into BOTH transports:
 *   • httpLink  → `Authorization: Bearer <token>` request header (via setContext)
 *   • wsLink    → graphql-ws `connectionParams` (read fresh per connect)
 *
 * No admin secret, no private keys — the browser only carries the opaque session
 * token (see TP/SL security posture). On a 401 / unauthenticated error we clear the
 * session so the login gate re-appears.
 */
export function makeApolloClient() {
  const httpUrl = import.meta.env.VITE_HASURA_HTTP as string;
  const wsUrl = import.meta.env.VITE_HASURA_WS as string;

  const httpLink = new HttpLink({ uri: httpUrl });

  // Attach the bearer token to every HTTP request, read fresh each time.
  const authLink = setContext((_op, { headers }) => {
    const token = getToken();
    return {
      headers: {
        ...headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    };
  });

  // Redirect-to-login on auth failure (Hasura emits access-denied; the transport
  // can also surface a 401). clearSession() flips the gate back to <Login/>.
  // ONLY genuine auth-layer rejections — NOT 'validation-failed' or
  // 'no-subscriptions-exist' (those are ordinary query errors, e.g. a malformed
  // subscription, and clearing the session on them caused a login loop). Token
  // expiry is handled deterministically by the startup isTokenValid() check.
  const AUTH_GQL_CODES = ['access-denied', 'invalid-jwt', 'invalid-headers', 'jwt-expired'];

  // Anonymous-role signature (#181 / relates #130 #179): when a token silently
  // resolves to Hasura role=anonymous, the anonymous role can't SEE the app's
  // tables, so EVERY field errors with the exact Hasura validation message
  // "field '<name>' not found in type: 'query_root'" (code: validation-failed).
  // Ordinarily validation-failed is a plain query bug (a malformed subscription)
  // and clearing on it caused a login loop — so we DO NOT clear on validation-failed
  // generally. We ONLY treat it as an auth failure when the message matches this
  // very specific "not found in type: 'query_root'/'subscription_root'" shape,
  // which for our known-good queries can only mean the role lost table visibility
  // (i.e. anonymous). Normal empty results carry NO errors and never trip this.
  const ANON_MSG_RE = /field '.+' not found in type: '(query_root|subscription_root|mutation_root)'/i;
  const isAnonFieldError = (e: any): boolean => {
    const code = (e?.extensions?.code as string | undefined) ?? '';
    const msg = (e?.message ?? '') as string;
    return code === 'validation-failed' && ANON_MSG_RE.test(msg);
  };

  const errorLink = onError(({ networkError, graphQLErrors, operation }) => {
    const gql = graphQLErrors ?? [];
    const is401 =
      (networkError as any)?.statusCode === 401 ||
      gql.some((e) => AUTH_GQL_CODES.includes((e.extensions?.code as string) ?? '')) ||
      gql.some(isAnonFieldError);
    if (is401) {
      clearSession();
      // Auth failures drop to <Login/> — the redirect IS the surface, so no toast.
      return;
    }

    // Global error surface (#204): every OTHER query/mutation failure becomes a
    // visible toast (with the operation name) instead of silently vanishing.
    // The errorBus dedupes, so a retrying op won't flood.
    const opName = operation?.operationName || undefined;
    for (const e of gql) {
      pushError(e.message || 'Request failed', opName);
    }
    if (networkError && gql.length === 0) {
      // A bare network failure (server unreachable, CORS, dropped connection) with
      // no GraphQL errors — surface it once with a clear, non-technical message.
      pushError(
        (networkError as any)?.message || 'Network error — could not reach the server',
        opName ?? 'network',
      );
    }
  });

  // Auth-failure signals that can arrive on the WS subscription channel.
  // Hasura emits these when the token is missing, expired, or resolves to
  // the anonymous role that has no subscriptions registered.
  // ONLY genuine auth-layer rejection codes. Explicitly NOT 'validation-failed'
  // or 'no-subscriptions-exist' — those are ordinary query errors (a malformed
  // subscription emits validation-failed) and clearing on them caused a login
  // loop. Expiry is handled by the startup isTokenValid() check, so this WS path
  // only needs to catch a hard auth rejection.
  const WS_AUTH_CODES = new Set(['invalid-jwt', 'invalid-headers', 'access-denied', 'jwt-expired']);
  const WS_AUTH_MSGS: string[] = [];

  const wsLink = new GraphQLWsLink(
    createClient({
      url: wsUrl,
      // connectionParams is a function → re-read the token on every (re)connect,
      // so a fresh login after a drop reconnects authenticated.
      connectionParams: () => {
        const token = getToken();
        return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      },
      retryAttempts: 10,
      shouldRetry: () => true,
      // on* callbacks give us early-exit before Apollo's errorLink sees WS errors.
      on: {
        // Connection-level error: fired when the WS handshake or server init
        // fails (e.g. Hasura rejects connectionParams → expired token).
        error: (err: unknown) => {
          const errors = Array.isArray(err) ? err : [err];
          const isAuthErr = errors.some((e: any) => {
            const code = (e?.extensions?.code as string | undefined) ?? '';
            const msg = ((e?.message ?? e?.toString?.()) as string).toLowerCase();
            return (
              WS_AUTH_CODES.has(code) ||
              WS_AUTH_MSGS.some((m) => msg.includes(m))
            );
          });
          if (isAuthErr) clearSession();
        },
        // Subscription-level message: Hasura can also return auth errors here
        // (e.g. "no subscriptions exist" for the anonymous role).
        message: (msg: any) => {
          if (msg?.type !== 'error') return;
          const payload = Array.isArray(msg.payload) ? msg.payload : [msg.payload];
          const isAuthErr = payload.some((e: any) => {
            const code = (e?.extensions?.code as string | undefined) ?? '';
            const message = ((e?.message ?? '') as string).toLowerCase();
            return (
              WS_AUTH_CODES.has(code) ||
              WS_AUTH_MSGS.some((m) => message.includes(m)) ||
              // Anonymous-role signature on the subscription channel (#181):
              // the anonymous role can't see the table → validation-failed with
              // "field '...' not found in type: 'subscription_root'".
              isAnonFieldError(e)
            );
          });
          if (isAuthErr) clearSession();
        },
      },
    }),
  );

  // Route subscriptions over WS, everything else over HTTP.
  const transport = split(
    ({ query }) => {
      const def = getMainDefinition(query);
      return def.kind === 'OperationDefinition' && def.operation === 'subscription';
    },
    wsLink,
    from([authLink, httpLink]),
  );

  return new ApolloClient({
    link: from([errorLink, transport]),
    cache: new InMemoryCache(),
    // App state lives in Zustand (rAF-batched); the Apollo cache is a transport detail.
    defaultOptions: { watchQuery: { fetchPolicy: 'no-cache' } },
  });
}
