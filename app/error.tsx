"use client";

import { useEffect } from "react";
import { translate } from "@/lib/i18n";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application error:", error);
  }, [error]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: "2rem",
        gap: "1rem",
        textAlign: "center",
      }}
    >
      <svg
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--text-dim)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 600, color: "var(--text)" }}>
        {translate("errors.appCrash.title")}
      </h2>
      <p style={{ margin: 0, color: "var(--text-muted)", maxWidth: "28rem", fontSize: "0.875rem" }}>
        {translate("errors.appCrash.description")}
      </p>
      {error.digest && (
        <code
          style={{
            fontSize: "0.75rem",
            color: "var(--text-dim)",
            background: "var(--bg-panel)",
            padding: "0.25rem 0.5rem",
            borderRadius: "4px",
          }}
        >
          {error.digest}
        </code>
      )}
      <button
        onClick={reset}
        style={{
          marginTop: "0.5rem",
          padding: "0.5rem 1.5rem",
          fontSize: "0.875rem",
          fontWeight: 500,
          border: "1px solid var(--border)",
          borderRadius: "8px",
          background: "var(--accent)",
          color: "var(--bg)",
          cursor: "pointer",
        }}
      >
        {translate("errors.appCrash.retry")}
      </button>
    </div>
  );
}
