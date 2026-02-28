"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
        <h2>Something went wrong</h2>
        <p style={{ color: "#666" }}>{error.message}</p>
        {error.digest && (
          <p style={{ color: "#999", fontSize: "0.875rem" }}>
            Digest: {error.digest}
          </p>
        )}
        <button
          onClick={() => reset()}
          style={{
            marginTop: "1rem",
            padding: "0.5rem 1rem",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
