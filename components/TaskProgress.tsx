"use client";

import { useState } from "react";
import type { TodoPhase } from "@/lib/pi-types";
import { useI18n } from "@/lib/i18n";

export function TaskProgress({ phases }: { phases: TodoPhase[] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const total = phases.reduce((sum, phase) => sum + phase.tasks.length, 0);
  const done = phases.reduce((sum, phase) => sum + phase.tasks.filter((task) => task.status === "completed" || task.status === "abandoned").length, 0);
  return (
    <section style={{ margin: "0 0 8px", border: "1px solid var(--border)", borderRadius: "var(--radius-control)", background: "var(--bg-panel)" }}>
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} style={{ width: "100%", padding: "7px 10px", display: "flex", justifyContent: "space-between", border: 0, background: "transparent", color: "var(--text)", cursor: "pointer", fontSize: 12 }}>
        <span>{t("chatWindow.taskProgress")}</span><span style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{phases.length ? `${done}/${total}` : t("chatWindow.taskListNotProvided")}</span>
      </button> 
      {open && phases.length > 0 && <div style={{ padding: "0 10px 8px", display: "grid", gap: 8 }}>
        {phases.map((phase) => <div key={phase.name}>
          <div style={{ color: "var(--text)", fontSize: 12, fontWeight: 600 }}>{phase.name}</div>
          {phase.tasks.map((task, index) => <div key={`${phase.name}-${index}`} style={{ paddingLeft: 8, color: "var(--text-muted)", fontSize: 11 }}>
            {task.status}: {task.content}{task.blocker ? ` — ${task.blocker}` : ""}
          </div>)}
        </div>)}
      </div>}
      {open && phases.length === 0 && <div style={{ padding: "0 10px 8px", color: "var(--text-muted)", fontSize: 11 }}>{t("chatWindow.taskListNotProvided")}</div>}
    </section>
  );
}
