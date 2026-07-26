"use client";

import { LOCALES, useI18n } from "@/lib/i18n";

/** Compact language toggle for the top bar — cycles EN → 中文 → 日本語.
 * Styled to match the adjacent theme toggle button. */
export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();
  const index = Math.max(0, LOCALES.findIndex((l) => l.value === locale));
  const current = LOCALES[index];
  const next = LOCALES[(index + 1) % LOCALES.length];

  return (
    <button
      type="button"
      onClick={() => setLocale(next.value)}
      title={t("languageSwitcher.switchTo", { language: next.label })}
      aria-label={t("languageSwitcher.switchTo", { language: next.label })}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        minWidth: 36, height: 36, padding: "0 8px",
        background: "none", border: "none", borderRight: "1px solid var(--border)",
        color: "var(--text-muted)", cursor: "pointer", flexShrink: 0, transition: "color 0.12s",
        fontSize: 11, whiteSpace: "nowrap",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
    >
      {current.label}
    </button>
  );
}
