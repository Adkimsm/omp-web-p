import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import { TEXT_PREVIEW_MAX_BYTES } from "./file-types";
import type { GitDiffMode, GitFileDiffResponse, GitFileStatus, GitStatusResponse } from "./git-types";
import { classifyGitStatus, parseGitPorcelainV1, type GitPorcelainEntry } from "./git-status";

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 10_000;
const GIT_STATUS_MAX_BUFFER = 8 * 1024 * 1024;
const GIT_DIFF_MAX_BUFFER = TEXT_PREVIEW_MAX_BYTES * 8;

async function git(cwd: string, args: string[], maxBuffer = GIT_STATUS_MAX_BUFFER): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", cwd, "--literal-pathspecs", ...args], {
    timeout: GIT_TIMEOUT_MS,
    maxBuffer,
    env: { ...process.env, LC_ALL: "C", GIT_OPTIONAL_LOCKS: "0" },
  });
  return stdout;
}

async function findRepositoryRoot(cwd: string): Promise<string | null> {
  try { return (await git(cwd, ["rev-parse", "--show-toplevel"])).trim() || null; } catch { return null; }
}

function isWithinPath(parent: string, target: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(target));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function toGitPath(filePath: string): string { return filePath.split(path.sep).join("/"); }

async function readStatusEntries(repositoryRoot: string): Promise<GitPorcelainEntry[]> {
  return parseGitPorcelainV1(await git(repositoryRoot, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]));
}

export async function getGitStatus(cwd: string): Promise<GitStatusResponse> {
  const repositoryRoot = await findRepositoryRoot(cwd);
  if (!repositoryRoot) return { isGitRepository: false, repositoryRoot: null, files: [] };
  const entries = await readStatusEntries(repositoryRoot);
  const files = entries.flatMap((entry): GitFileStatus[] => {
    const filePath = path.resolve(repositoryRoot, entry.path);
    if (!isWithinPath(cwd, filePath)) return [];
    return [{ filePath, ...classifyGitStatus(entry), indexStatus: entry.indexStatus, worktreeStatus: entry.worktreeStatus }];
  });
  return { isGitRepository: true, repositoryRoot, files };
}

function hasNullByte(content: Buffer): boolean { return content.includes(0); }

function createAddedFilePatch(gitPath: string, content: string): string {
  const hasTrailingNewline = content.endsWith("\n");
  const lines = content.split("\n");
  if (hasTrailingNewline) lines.pop();
  const body = lines.map((line) => `+${line}`).join("\n");
  const noNewlineMarker = !hasTrailingNewline && lines.length > 0 ? "\n\\ No newline at end of file" : "";
  if (lines.length === 0) return [`diff --git a/${gitPath} b/${gitPath}`, "new file mode 100644", "--- /dev/null", `+++ b/${gitPath}`].join("\n");
  return [`diff --git a/${gitPath} b/${gitPath}`, "new file mode 100644", "--- /dev/null", `+++ b/${gitPath}`, `@@ -0,0 +1,${lines.length} @@`, `${body}${noNewlineMarker}`].join("\n");
}

function diffKind(patch: string): "text" | "metadata" | "binary" {
  if (/^Binary files |GIT binary patch/m.test(patch)) return "binary";
  return patch.includes("\n@@ ") ? "text" : "metadata";
}

function diffArgs(mode: GitDiffMode, hasHead: boolean): string[] {
  if (mode === "staged") return ["diff", "--cached", "--no-color", "--no-ext-diff", "--no-textconv", "--unified=3"];
  if (mode === "unstaged") return ["diff", "--no-color", "--no-ext-diff", "--no-textconv", "--unified=3"];
  return ["diff", ...(hasHead ? ["HEAD"] : ["--cached"]), "--no-color", "--no-ext-diff", "--no-textconv", "--unified=3"];
}

async function hasHead(repositoryRoot: string): Promise<boolean> {
  try { await git(repositoryRoot, ["rev-parse", "--verify", "HEAD"]); return true; } catch { return false; }
}

export async function getGitFileDiff(cwd: string, filePath: string, mode: GitDiffMode = "combined"): Promise<GitFileDiffResponse> {
  const repositoryRoot = await findRepositoryRoot(cwd);
  if (!repositoryRoot || !isWithinPath(repositoryRoot, filePath)) return { supported: false, kind: "none" };
  const resolvedFilePath = path.resolve(filePath);
  const relativePath = toGitPath(path.relative(repositoryRoot, resolvedFilePath));
  const entries = await readStatusEntries(repositoryRoot);
  const entry = entries.find((candidate) => candidate.path === relativePath || candidate.originalPath === relativePath);
  if (!entry) return { supported: false, kind: "none" };
  const status = classifyGitStatus(entry).status;
  const paths = entry.originalPath && entry.originalPath !== entry.path ? [entry.originalPath, entry.path] : [entry.path];

  // Untracked content has no Git diff object. It is a working-tree addition only.
  if (status === "untracked") {
    if (mode === "staged") return { supported: true, status, kind: "none" };
    let stat: fs.Stats;
    try { stat = fs.lstatSync(resolvedFilePath); } catch { return { supported: false, kind: "none", status }; }
    if (!stat.isFile()) return { supported: false, kind: "none", status };
    if (stat.size > TEXT_PREVIEW_MAX_BYTES) return { supported: true, status, kind: "too_large" };
    const content = fs.readFileSync(resolvedFilePath);
    if (hasNullByte(content)) return { supported: true, status, kind: "binary" };
    const patch = createAddedFilePatch(relativePath, content.toString("utf8"));
    return { supported: true, status, kind: patch.includes("@@ ") ? "text" : "metadata", patch };
  }

  const args = [...diffArgs(mode, await hasHead(repositoryRoot)), "--", ...paths];
  let patch: string;
  try {
    patch = await git(repositoryRoot, args, GIT_DIFF_MAX_BUFFER);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
      return { supported: true, status, kind: "too_large" };
    }
    throw error;
  }
  if (!patch) return { supported: true, status, kind: "none" };
  const kind = diffKind(patch);
  return { supported: true, status, kind, patch };
}
