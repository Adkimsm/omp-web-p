"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Command } from "cmdk";
import { File, Moon, Plus, Sun, MessageSquare, GitBranch, Settings2 } from "lucide-react";
import type { SessionInfo } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { useTheme } from "@/hooks/useTheme";

type Props = {
  onSelectSession: (session: SessionInfo) => void;
  onNewSession: () => void;
  currentModel?: string | null;
  cwd?: string | null;
  onOpenFile: (filePath: string) => void;
  onOpenChanges: () => void;
  onOpenModels: () => void;
};

function relativeTime(value: string, locale: string): string {
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.max(0, Math.floor(diff / 60000));
  if (mins < 1) return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(0, "minute");
  if (mins < 60) return new Intl.RelativeTimeFormat(locale, { numeric: "always" }).format(-mins, "minute");
  const hours = Math.floor(mins / 60);
  if (hours < 24) return new Intl.RelativeTimeFormat(locale, { numeric: "always" }).format(-hours, "hour");
  return new Intl.RelativeTimeFormat(locale, { numeric: "always" }).format(-Math.floor(hours / 24), "day");
}

export function CommandPalette({ onSelectSession, onNewSession, currentModel, cwd, onOpenFile, onOpenChanges, onOpenModels }: Props) {
  const { t, locale } = useI18n();
  const { isDark, toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<Array<{ path: string; isDir: boolean }>>([]);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState(false);

  const loadSessions = useCallback(() => {
    void fetch("/api/sessions")
      .then((response) => response.ok ? response.json() as Promise<{ sessions: SessionInfo[] }> : Promise.reject(new Error("request failed")))
      .then((data) => setSessions(data.sessions))
      .catch(() => setSessions([]));
  }, []);

  useEffect(() => {
    if (!open || !cwd) { setFiles([]); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setFileLoading(true); setFileError(false);
      const params = new URLSearchParams({ cwd });
      if (query.trim()) params.set("q", query.trim());
      void fetch(`/api/file-index?${params}`, { signal: controller.signal })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error("request failed")))
        .then((data: { files?: string[]; matches?: Array<{ path: string; isDir: boolean }> }) => {
          setFiles((data.matches ?? (data.files ?? []).map((path) => ({ path, isDir: false }))).slice(0, 20));
        })
        .catch((error: unknown) => {
          const aborted = error instanceof DOMException && error.name === "AbortError";
          if (!aborted) { setFiles([]); setFileError(true); }
        })
        .finally(() => { if (!controller.signal.aborted) setFileLoading(false); });
    }, 150);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [open, cwd, query]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      } else if (event.key === "Escape" && open) {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open]);

  useEffect(() => { if (open) { loadSessions(); setQuery(""); } }, [open, loadSessions]);
  if (!open || typeof document === "undefined") return null;
  const choose = (action: () => void) => { action(); setOpen(false); };
  return createPortal(
    <div role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setOpen(false); }} style={{ position: "fixed", inset: 0, zIndex: 2000, background: "color-mix(in srgb, var(--text) 22%, transparent)", paddingTop: "20vh" }}>
      <Command label={t("commandPalette.label")} shouldFilter={false} style={{ width: "min(92vw, 560px)", maxHeight: "min(70vh, 560px)", margin: "0 auto", overflow: "hidden", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--radius-modal)", boxShadow: "var(--shadow-modal)", animation: "scale-in var(--dur-med) var(--ease-out-warm)" }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}><Command.Input autoFocus value={query} onValueChange={setQuery} placeholder={t("commandPalette.placeholder")} style={{ width: "100%", border: 0, outline: 0, background: "transparent", color: "var(--text)", fontSize: 15 }} /></div>
        <Command.List style={{ padding: "8px", overflowY: "auto", maxHeight: "min(55vh, 440px)" }}>
          <Command.Empty style={{ padding: 20, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>{t("commandPalette.empty")}</Command.Empty>
          <Command.Group heading={t("commandPalette.sessions")}>{sessions.map((session) => <Command.Item key={session.id} value={`session:${session.name ?? session.id} ${session.cwd}`} onSelect={() => choose(() => onSelectSession(session))} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: "var(--radius-control)", color: "var(--text)", cursor: "pointer" }}><MessageSquare size={15} color="var(--accent)" /><span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{session.name || session.id}</span><span style={{ color: "var(--text-dim)", fontSize: 11 }}>{relativeTime(session.modified, locale)}</span></Command.Item>)}</Command.Group>
          <Command.Group heading={t("commandPalette.files")}>
            {!cwd ? <div style={{ padding: "9px 10px", color: "var(--text-dim)", fontSize: 12 }}>{t("commandPalette.noWorkspace")}</div> : fileLoading ? <div style={{ padding: "9px 10px", color: "var(--text-muted)", fontSize: 12 }}>{t("commandPalette.loadingFiles")}</div> : fileError ? <div style={{ padding: "9px 10px", color: "var(--danger, #dc2626)", fontSize: 12 }}>{t("commandPalette.filesFailed")}</div> : files.length === 0 ? <div style={{ padding: "9px 10px", color: "var(--text-dim)", fontSize: 12 }}>{t("commandPalette.noFiles")}</div> : files.map((entry) => <Command.Item key={`file:${entry.path}`} value={`file:${entry.path}`} disabled={entry.isDir} onSelect={() => { if (!entry.isDir) choose(() => onOpenFile(entry.path)); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: "var(--radius-control)", color: entry.isDir ? "var(--text-dim)" : "var(--text)", cursor: entry.isDir ? "default" : "pointer" }}><File size={15} color="var(--accent)" /><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.path}</span></Command.Item>)}
          </Command.Group>
          <Command.Group heading={t("commandPalette.actions")}>
            <Command.Item value="action:new-session" onSelect={() => choose(onNewSession)} style={{ display: "flex", gap: 10, padding: "9px 10px", borderRadius: "var(--radius-control)", color: "var(--text)", cursor: "pointer" }}><Plus size={15} color="var(--accent)" />{t("commandPalette.newSession")}</Command.Item>
            <Command.Item value="action:changes" onSelect={() => choose(onOpenChanges)} style={{ display: "flex", gap: 10, padding: "9px 10px", borderRadius: "var(--radius-control)", color: "var(--text)", cursor: "pointer" }}><GitBranch size={15} color="var(--accent)" />{t("commandPalette.openChanges")}</Command.Item>
            <Command.Item value="action:models" onSelect={() => choose(onOpenModels)} style={{ display: "flex", gap: 10, padding: "9px 10px", borderRadius: "var(--radius-control)", color: "var(--text)", cursor: "pointer" }}><Settings2 size={15} color="var(--accent)" />{t("commandPalette.openModels")}</Command.Item>
            <Command.Item value="action:theme" onSelect={() => choose(toggleTheme)} style={{ display: "flex", gap: 10, padding: "9px 10px", borderRadius: "var(--radius-control)", color: "var(--text)", cursor: "pointer" }}>{isDark ? <Sun size={15} color="var(--accent)" /> : <Moon size={15} color="var(--accent)" />}{t("commandPalette.toggleTheme")}</Command.Item>
          </Command.Group>
          <Command.Group heading={t("commandPalette.models")}><Command.Item value="model:current" disabled style={{ padding: "9px 10px", color: "var(--text-muted)", fontSize: 13 }}>{t("commandPalette.currentModel")}: {currentModel ?? t("commandPalette.notAvailable")}</Command.Item></Command.Group>
        </Command.List>
        <div style={{ borderTop: "1px solid var(--border)", padding: "8px 14px", color: "var(--text-dim)", fontSize: 11 }}>{t("commandPalette.hints")}</div>
      </Command>
    </div>, document.body,
  );
}

export default CommandPalette;
