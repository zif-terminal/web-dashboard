export function LocalModeBanner() {
  const hasuraUrl = process.env.HASURA_URL || "http://167.99.145.4";
  const authUrl = process.env.AUTH_URL || "http://167.99.145.4";

  const isLocalMode =
    hasuraUrl.includes("localhost") ||
    hasuraUrl.includes("127.0.0.1") ||
    authUrl.includes("localhost") ||
    authUrl.includes("127.0.0.1");

  if (!isLocalMode) {
    return null;
  }

  return (
    <div className="bg-yellow-500 text-yellow-950 text-center text-sm py-1.5 px-4 font-medium">
      Local Development Mode — Connected to {hasuraUrl}
    </div>
  );
}
