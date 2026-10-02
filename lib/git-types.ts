export type GitFileStatusKind =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "untracked"
  | "conflict";

export interface GitFileStatus {
  filePath: string;
  status: GitFileStatusKind;
  code: "M" | "A" | "D" | "R" | "U" | "C";
  indexStatus: string;
  worktreeStatus: string;
}

export interface GitStatusResponse {
  isGitRepository: boolean;
  repositoryRoot: string | null;
  files: GitFileStatus[];
}

export type GitDiffMode = "combined" | "staged" | "unstaged";

export type GitDiffKind = "text" | "metadata" | "binary" | "too_large" | "none";

export interface GitFileDiffResponse {
  supported: boolean;
  kind: GitDiffKind;
  status?: GitFileStatusKind;
  patch?: string;
}
