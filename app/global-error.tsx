"use client";

import { useEffect } from "react";

// Global error boundary — this must NOT import from @/lib/* because the error
// may be caused by a module loading failure. Use inline minimal styles and
// hardcoded English text (this is the absolute fallback).
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global application error:", error);
  }, [error]);

  return (
    <html>
      <body>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            padding: "2rem",
            gap: "1rem",
            fontFamily: "system-ui, -apple-system, sans-serif",
            textAlign: "center",
            color: "#1a1a1a",
            background: "#fff",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 600 }}>
            Something went wrong
          </h2>
          <p style={{ margin: 0, color: "#666", maxWidth: "28rem", fontSize: "0.875rem" }}>
            An unexpected error occurred. Try reloading the page.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: "0.5rem",
              padding: "0.5rem 1.5rem",
              fontSize: "0.875rem",
              fontWeight: 500,
              border: "1px solid #ddd",
              borderRadius: "8px",
              background: "#4F46E5",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
