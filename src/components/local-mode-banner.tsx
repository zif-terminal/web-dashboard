const HASURA_URL = process.env.HASURA_URL || "http://167.99.145.4";
const AUTH_URL = process.env.AUTH_URL || "http://167.99.145.4";

function isLocalMode(): boolean {
  return (
    HASURA_URL.includes("localhost") ||
    HASURA_URL.includes("127.0.0.1") ||
    AUTH_URL.includes("localhost") ||
    AUTH_URL.includes("127.0.0.1")
  );
}

export function LocalModeBanner() {
  if (!isLocalMode()) {
    return null;
  }

  return (
    <div className="bg-yellow-500 text-yellow-950 text-center text-sm py-1.5 px-4 font-medium">
      Local Development Mode — Connected to {HASURA_URL}
    </div>
  );
}
