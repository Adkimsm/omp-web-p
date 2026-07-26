# omp-web — Design & Porting Contract

omp-web is a fork of [agegr/pi-web](https://github.com/agegr/pi-web) (MIT) adapted for
[can1357/oh-my-pi](https://github.com/can1357/oh-my-pi) (`omp`), with built-in i18n (en / zh-CN / ja).

## Architecture decision (LOCKED)

pi-web embedded the pi SDK in-process. The `@oh-my-pi/*` npm packages ship Bun-only TypeScript
(bun:sqlite, Bun.file — cannot run inside Node/Next). Therefore omp-web:

1. **Stays a Node-hosted Next.js app** (bin launcher, undici proxy, build chain unchanged).
2. **Live sessions**: spawns the user's installed `omp` binary in RPC mode
   (`omp --mode rpc-ui`, NDJSON over stdio) — one child process per active session.
   This also eliminates version drift between a pinned SDK and the user's omp install.
3. **Session browsing**: pure-Node reader for omp's v3 session JSONL format.
4. **Models/auth**: RPC commands (`get_available_models`, `get_login_providers`, `login`).
5. **models.yml / config.yml**: direct YAML read/write. **Plugins**: `omp plugin` CLI.
6. **No `@earendil-works/*` and no `@oh-my-pi/*` runtime dependencies at all.**

## omp facts (verified against source + live smoke test)

- Agent dir: `~/.omp/agent` (env `PI_CODING_AGENT_DIR` overrides; `PI_CONFIG_DIR` renames `.omp`;
  `OMP_PROFILE`/`PI_PROFILE` relocate to `~/.omp/profiles/<name>/agent`; XDG layout only if
  `$XDG_DATA_HOME/omp` exists). Source of truth: `oh-my-pi/packages/utils/src/dirs.ts`.
- Sessions: `<agentDir>/sessions/<dirSlug>/<fileSafeTimestamp>_<uuid>.jsonl`.
  Dir slug (see `coding-agent/src/session/session-paths.ts`): cwd under $HOME →
  `-<relative-with-[/\:]→dashes>`; under tmpdir → `-tmp-...`; else legacy `--abs-dashed--`.
- Session file format v3 (`session-entries.ts`, `session-manager.ts`, `session-title-slot.ts`):
  - Line 1: fixed **256-byte** padded title slot `{"type":"title","v":1,"title",...,"pad"}`
    (rewritable in place; title truncated by code points to fit; pad spaces to 256 bytes incl. `\n`).
  - Line 2: header `{"type":"session","version":3,"id","timestamp","cwd",...}`.
  - Then entries forming a tree via `(id, parentId)`: `message`, `model_change`,
    `thinking_level_change`, `compaction`, `branch_summary`, `custom`, `custom_message`,
    `label`, `title_change`, `session_init`, `ttsr_injection`, `mode_change`,
    `service_tier_change`, ...
  - Large payloads (images) externalized to content-addressed blob store `<agentDir>/blobs`.
  - Old pi v1/v2 files still load in omp via migrations; omp-web only needs read support for v2/v3
    shapes it encounters (title slot may be absent in old files — header is then line 1).
- Branch-context algorithm: port from `coding-agent/src/session/session-context.ts` (pure logic).
- Config: `<agentDir>/config.yml` (settings), `<agentDir>/models.yml` (custom models),
  `<agentDir>/mcp.json`, skills in `<agentDir>/skills` + project `.omp/skills` + compat dirs
  (`.claude/skills` etc.), auth in `<agentDir>/agent.db` (SQLite — DO NOT touch; auth goes via RPC).
- CLI: binary `omp`. Useful flags: `--mode rpc|rpc-ui`, `--cwd`, `--resume <id>`,
  `--session-dir <dir>`, `--no-session`, `--no-extensions`, `--no-skills`, `--no-lsp`,
  `--export <session>`, `-p/--print`. `rpc-ui` additionally bridges extension/tool UI over
  the wire and disables PTY. Verified: on start it prints
  `{"type":"ready","protocolVersion":1,"supportedProtocolVersions":[1,2],"maxFrameBytes":1048576,...}`.
- RPC protocol (`coding-agent/src/modes/rpc/rpc-types.ts`): commands on stdin
  `{id?, type, ...}`; responses `{type:"response", command, success, data|error, id}`;
  AgentSessionEvent frames interleaved on stdout; also `available_commands_update`,
  `extension_ui_request` (methods incl. `open_url` for OAuth), `subagent_*` frames.
  We use protocol **v1** (no chunking needed; Node readline handles long lines).
- Event union vs pi-web expectations:
  - KEEP: `agent_start`, `message_start/update/end`, `tool_execution_start/update/end`,
    `auto_retry_start/end`, `auto_compaction_start/end` (payload changed: reason/action/skipped).
  - GONE: `prompt_done` → use `agent_end` with `isTerminal !== false`;
    `prompt_error` → failed `response` frames + `notice` events (level:"error");
    `queue_update` → poll `get_state.queuedMessageCount` after message_end/agent_end;
    `compaction_start/end` → `compact` response + auto_compaction events.
  - NEW (handle or safely ignore): `turn_start/end`, `notice`, `thinking_level_changed`,
    `todo_reminder`, `irc_message`, `goal_updated`, `retry_fallback_*`, `ttsr_triggered`.

## File ownership map (for parallel implementation — DO NOT edit files owned by another workstream)

- **A (sessions/browsing)**: `lib/omp/session-files.ts` (new), `lib/session-reader.ts`,
  `lib/types.ts`, `lib/session-title.ts`, `app/api/sessions/**`, `lib/skill-lock.ts` (path fix).
- **B (RPC/live)**: `lib/omp/rpc-process.ts` (provided — extend if needed), `lib/rpc-manager.ts`,
  `app/api/agent/**`, `hooks/useAgentSession.ts`, `lib/agent-client.ts`, `lib/pi-types.ts`.
- **C (models/auth)**: `app/api/models/**`, `app/api/models-config/**`, `app/api/auth/**`,
  `components/ModelsConfig.tsx`.
- **D (branding/skills/plugins)**: `package.json`, `next.config.ts`, `bin/**`, `app/layout.tsx`,
  `app/page.tsx`, `README.md`, `lib/skills-service.ts`, `app/api/skills/**`, `app/api/plugins/**`,
  `instrumentation.ts`, `proxy.ts` (rename env vars only), `AGENTS.md`.
- **Shared, pre-provided by the orchestrator (read-only for all)**: `lib/omp/paths.ts`,
  `lib/omp/omp-cli.ts`, `lib/omp/rpc-process.ts`, `DESIGN.md`.
- Need a new npm dependency? Note it in your final report; do NOT edit package.json unless you are D.
  Pre-approved: D adds `yaml`.

## Internal API contracts (keep these signatures so workstreams compose)

- `lib/rpc-manager.ts` must keep exporting: `AgentSessionWrapper`, `getRpcSession(sessionId)`,
  `getRunningRpcSessionIds()`, `subscribeRunningSessions(listener)`, `notifyRunningChange()`,
  `startRpcSession(...)` (signature may gain/lose options but keep the name).
- `lib/session-reader.ts` must keep exporting: `listAllSessions`, `invalidateSessionListCache`,
  `resolveSessionPath`, `resolveSessionIdByPath`, `cacheSessionPath`, `invalidateSessionPathCache`,
  `readSessionHeader`, `getSessionEntries`, `buildSessionContext`, plus `getAgentDir` re-export
  (now from `lib/omp/paths`).
- `lib/omp/rpc-process.ts` (provided): `class RpcProcess` — see file for API.

## Branding

- Package/bin: `omp-web`; default port **30177**; env `OMP_WEB_HOSTNAME`, `OMP_WEB_NO_OPEN`,
  `OMP_WEB_OMP_BIN` (override omp binary path), `PORT`.
- Titles/metadata: "omp web" / "Web UI for the oh-my-pi coding agent".
- localStorage keys: `omp-theme`, `omp-lang` (update layout.tsx inline script + useTheme).
- Version display: omp-web's own package version + detected `omp --version` at runtime
  (`/api/omp-version` or embedded in an existing payload). Remove NEXT_PUBLIC_PI_VERSION plumbing.
- Keep MIT LICENSE; README credits agegr/pi-web as origin and badlogic/pi-mono lineage.

## i18n (phase 3 — after the port builds)

Hand-rolled: `lib/i18n/` with `I18nProvider` + `useI18n()` → `{locale, setLocale, t}`;
flat-key JSON dicts `en.json`, `zh-CN.json`, `ja.json` (~490 strings); `t(key, vars)` does
`{var}` interpolation; persist under `omp-lang` mirroring the theme pattern; default from
`navigator.language`; set `document.documentElement.lang`; language picker (EN/中文/日本語)
in AppShell next to the theme toggle. Untranslated-by-design: file-type badges, model IDs, paths.
