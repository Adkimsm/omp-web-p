import { existsSync, promises as fs } from "fs";
import { homedir } from "os";
import * as path from "path";
import { parse as parseYaml } from "yaml";
import { getAgentDir } from "@/lib/omp/paths";
import type { SkillInfo } from "@/lib/api-types";
import { annotateSkillsWithInstallInfo } from "@/lib/skill-lock";

/**
 * Pure-Node skill discovery mirroring omp's providers
 * (oh-my-pi/packages/coding-agent/src/discovery/{builtin,claude,agents,codex,github}.ts).
 * omp-web cannot import the Bun-only SDK, so the scan rules are replicated:
 * each provider contributes <root>/<name>/SKILL.md skills, higher-priority
 * providers win name collisions, and `enabled: false` frontmatter hides a
 * skill entirely.
 */

export interface SkillDiagnostic {
  type: "error" | "warning" | "info";
  message: string;
  path?: string;
}

export interface SkillsWithDiagnostics {
  skills: SkillInfo[];
  diagnostics: SkillDiagnostic[];
}

interface SkillScanRoot {
  dir: string;
  /** Provider label surfaced as sourceInfo.source (".omp", ".claude", ...). */
  source: string;
  scope: "user" | "project";
  /** omp skips skills without a description for these providers. */
  requireDescription?: boolean;
}

export interface ParsedSkillFrontmatter {
  frontmatter: Record<string, unknown>;
  body: string;
}

/** Split YAML frontmatter from a markdown document. Returns an empty
 * frontmatter object when no `---` block is present or YAML is invalid. */
export function parseSkillFrontmatter(content: string): ParsedSkillFrontmatter {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(content);
  if (!match) return { frontmatter: {}, body: content };
  try {
    const parsed = parseYaml(match[1]) as unknown;
    const frontmatter =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    return { frontmatter, body: content.slice(match[0].length) };
  } catch {
    return { frontmatter: {}, body: content.slice(match[0].length) };
  }
}

function isTruthyFlag(value: unknown): boolean {
  return value === true || value === "true";
}

/** Ancestor directories from cwd up to the git repo root (or $HOME / fs root),
 * closest first — matches omp's project-level walk-up discovery. */
function getAncestorDirs(cwd: string): string[] {
  const home = homedir();
  const dirs: string[] = [];
  let current = path.resolve(cwd);
  while (true) {
    dirs.push(current);
    if (existsSync(path.join(current, ".git"))) break;
    if (current === home) break;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return dirs;
}

/** Scan roots in omp's provider priority order (highest first): .omp (100),
 * .claude (80), .agent/.agents + .codex + .github (70), managed skills (5). */
function buildScanRoots(cwd: string): SkillScanRoot[] {
  const home = homedir();
  const agentDir = getAgentDir();
  const ancestors = getAncestorDirs(cwd);
  const projectAncestors = ancestors.filter((dir) => dir !== home);
  const roots: SkillScanRoot[] = [];

  // builtin (.omp): project walk-up first (closest first), then user dir.
  for (const dir of projectAncestors) {
    roots.push({ dir: path.join(dir, ".omp", "skills"), source: ".omp", scope: "project", requireDescription: true });
  }
  roots.push({ dir: path.join(agentDir, "skills"), source: ".omp", scope: "user", requireDescription: true });

  // claude compat: user ~/.claude/skills + project .claude/skills walk-up.
  const claudeHome = process.env.CLAUDE_CONFIG_DIR || path.join(home, ".claude");
  roots.push({ dir: path.join(claudeHome, "skills"), source: ".claude", scope: "user" });
  for (const dir of projectAncestors) {
    roots.push({ dir: path.join(dir, ".claude", "skills"), source: ".claude", scope: "project" });
  }

  // agent dirs compat (.agent/.agents): project walk-up + user home.
  for (const dir of projectAncestors) {
    roots.push({ dir: path.join(dir, ".agent", "skills"), source: ".agents", scope: "project" });
    roots.push({ dir: path.join(dir, ".agents", "skills"), source: ".agents", scope: "project" });
  }
  roots.push({ dir: path.join(home, ".agent", "skills"), source: ".agents", scope: "user" });
  roots.push({ dir: path.join(home, ".agents", "skills"), source: ".agents", scope: "user" });

  // codex compat: user ~/.codex/skills + project .codex/skills.
  roots.push({ dir: path.join(home, ".codex", "skills"), source: ".codex", scope: "user" });
  roots.push({ dir: path.join(cwd, ".codex", "skills"), source: ".codex", scope: "project" });

  // github compat: <repoRoot>/.github/skills.
  const repoRoot = ancestors[ancestors.length - 1];
  roots.push({ dir: path.join(repoRoot, ".github", "skills"), source: ".github", scope: "project", requireDescription: true });

  // managed auto-learn skills (lowest priority).
  roots.push({ dir: path.join(agentDir, "managed-skills"), source: "managed", scope: "user", requireDescription: true });

  return roots;
}

async function scanRoot(root: SkillScanRoot, diagnostics: SkillDiagnostic[]): Promise<SkillInfo[]> {
  let entries;
  try {
    entries = await fs.readdir(root.dir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      diagnostics.push({
        type: "warning",
        message: `Failed to read skills directory: ${String(error)}`,
        path: root.dir,
      });
    }
    return [];
  }

  const skills: SkillInfo[] = [];
  await Promise.all(entries.map(async (entry) => {
    if (entry.name.startsWith(".")) return;
    if (!entry.isDirectory() && !entry.isSymbolicLink()) return;
    const skillPath = path.join(root.dir, entry.name, "SKILL.md");
    let content: string;
    try {
      content = await fs.readFile(skillPath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        diagnostics.push({ type: "warning", message: "Failed to read skill file", path: skillPath });
      }
      return;
    }
    const { frontmatter } = parseSkillFrontmatter(content);
    if (frontmatter.enabled === false) return;
    const description = typeof frontmatter.description === "string" ? frontmatter.description : "";
    if (root.requireDescription && !description) return;
    const rawName = frontmatter.name;
    const name = typeof rawName === "string" && rawName.trim() ? rawName.trim() : entry.name;
    skills.push({
      name,
      description,
      filePath: skillPath,
      baseDir: path.join(root.dir, entry.name),
      disableModelInvocation:
        isTruthyFlag(frontmatter["disable-model-invocation"]) ||
        isTruthyFlag(frontmatter.disableModelInvocation) ||
        isTruthyFlag(frontmatter.hide),
      sourceInfo: { source: root.source, scope: root.scope },
    });
  }));
  return skills;
}

/** Discover skills for a cwd the way omp does. Name collisions resolve to the
 * highest-priority provider (scan-root order); result is sorted by name. */
export async function discoverSkills(cwd: string): Promise<SkillsWithDiagnostics> {
  const diagnostics: SkillDiagnostic[] = [];
  const byName = new Map<string, SkillInfo>();
  for (const root of buildScanRoots(cwd)) {
    for (const skill of await scanRoot(root, diagnostics)) {
      if (!byName.has(skill.name)) byName.set(skill.name, skill);
    }
  }
  const skills = [...byName.values()].sort((a, b) => {
    const cmp = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    return cmp !== 0 ? cmp : a.filePath.localeCompare(b.filePath);
  });
  return { skills, diagnostics };
}

export async function loadSkillsWithInstallInfo(cwd: string) {
  const { skills, diagnostics } = await discoverSkills(cwd);
  return {
    skills: annotateSkillsWithInstallInfo(skills, { cwd, agentDir: getAgentDir() }),
    diagnostics,
  };
}
