"use client";

import { useEffect, useState } from "react";
import type { ExtensionUiRequest } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { useModalDialog } from "@/hooks/useModalDialog";

export type ExtensionDialogRequest = Extract<
  ExtensionUiRequest,
  { method: "select" | "confirm" | "input" | "editor" }
>;

export type ExtensionDialogResponse =
  | { value: string }
  | { confirmed: boolean }
  | { cancelled: true };

/**
 * Overlay dialog for `select` / `confirm` / `input` / `editor` extension UI
 * requests. Polished UX:
 *   - entrance animation (fade backdrop + scale-in panel)
 *   - focus trap: focus moves into the dialog on open and is returned to the
 *     opener on close; Tab/Shift-Tab wrap inside (via useModalDialog)
 *   - Escape closes as "cancelled" (document-level, top-of-stack only)
 *   - backdrop click closes as "cancelled"
 * Logic and i18n keys are unchanged from the in-ChatWindow original.
 */
export function ExtensionDialog({
  request,
  onRespond,
}: {
  request: ExtensionDialogRequest;
  onRespond: (request: ExtensionDialogRequest, response: ExtensionDialogResponse) => Promise<void>;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState(request.method === "editor" ? request.prefill ?? "" : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValue(request.method === "editor" ? request.prefill ?? "" : "");
    setError(null);
  }, [request]);

  const respond = async (response: ExtensionDialogResponse) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try { await onRespond(request, response); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };
  const cancel = () => void respond({ cancelled: true });
  // useModalDialog gives us: focus-in on open, focus-restore on close,
  // document-level Escape (top-of-stack), and Tab wrapping inside the panel.
  const panelRef = useModalDialog<HTMLDivElement>({
    onClose: cancel,
    active: true,
  });

  const submitValue = () => {
    if (request.method === "confirm") {
      void respond({ confirmed: true });
    } else {
      void respond({ value });
    }
  };

  return (
    <div
      className="animate-fade-in"
      onMouseDown={(event) => {
        // Close when the pointer goes down on the backdrop itself (not when
        // the press starts inside the panel and is dragged out).
        if (event.target === event.currentTarget) cancel();
      }}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 90,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        background: "rgba(0,0,0,0.18)",
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={request.title}
        tabIndex={-1}
        className="animate-scale-in"
        style={{
          width: "min(560px, 100%)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          background: "var(--bg)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.28)",
          overflow: "hidden",
          outline: "none",
          opacity: busy ? 0.7 : 1,
          pointerEvents: busy ? "none" : "auto",
        }}
      >
        {error && <div role="alert" style={{ padding: "8px 14px", color: "var(--accent-strong)", fontSize: 12, borderBottom: "1px solid var(--border)" }}>{error}</div>}
        <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ color: "var(--text)", fontSize: 14, fontWeight: 650 }}>{request.title}</div>
          <div style={{ marginTop: 3, color: "var(--text-dim)", fontSize: 11, fontFamily: "var(--font-mono)" }}>{t("chatWindow.extensionRequest")}</div>
        </div>

        <div style={{ padding: 14 }}>
          {request.method === "confirm" && (
            <div style={{ color: "var(--text-muted)", fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{request.message}</div>
          )}
          {request.method === "select" && (
            <div style={{ display: "grid", gap: 8 }}>
              {request.options.map((option) => (
                <button
                  key={option}
                  onClick={() => void respond({ value: option })}
                  style={{
                    width: "100%",
                    padding: "9px 10px",
                    borderRadius: 7,
                    border: "1px solid var(--border)",
                    background: "var(--bg-panel)",
                    color: "var(--text)",
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: 13,
                    transition: "background-color 0.12s, border-color 0.12s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "var(--bg-panel)"; }}
                >
                  {option}
                </button>
              ))}
            </div>
          )}
          {request.method === "input" && (
            <input
              autoFocus
              value={value}
              placeholder={request.placeholder}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitValue();
              }}
              style={{
                width: "100%",
                padding: "9px 10px",
                borderRadius: 7,
                border: "1px solid var(--border)",
                background: "var(--bg-panel)",
                color: "var(--text)",
                outline: "none",
                fontSize: 13,
              }}
            />
          )}
          {request.method === "editor" && (
            <textarea
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submitValue();
              }}
              style={{
                width: "100%",
                minHeight: 220,
                padding: 10,
                borderRadius: 7,
                border: "1px solid var(--border)",
                background: "var(--bg-panel)",
                color: "var(--text)",
                outline: "none",
                resize: "vertical",
                fontSize: 13,
                lineHeight: 1.55,
                fontFamily: "var(--font-mono)",
              }}
            />
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "10px 14px", borderTop: "1px solid var(--border)", background: "var(--bg-panel)" }}>
          <button
            onClick={cancel}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "var(--bg)",
              color: "var(--text-muted)",
              cursor: "pointer",
              transition: "background-color 0.12s, color 0.12s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--text)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "var(--bg)"; e.currentTarget.style.color = "var(--text-muted)"; }}
          >
            {t("chatWindow.cancel")}
          </button>
          {request.method === "confirm" ? (
            <button
              onClick={submitValue}
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                border: "1px solid var(--accent)",
                background: "var(--accent)",
                color: "#fff",
                cursor: "pointer",
                transition: "background-color 0.12s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent-hover)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "var(--accent)"; }}
            >
              {t("chatWindow.confirm")}
            </button>
          ) : request.method !== "select" ? (
            <button
              onClick={submitValue}
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                border: "1px solid var(--accent)",
                background: "var(--accent)",
                color: "#fff",
                cursor: "pointer",
                transition: "background-color 0.12s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent-hover)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "var(--accent)"; }}
            >
              {t("chatWindow.submit")}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
