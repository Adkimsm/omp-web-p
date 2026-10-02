import path from "node:path";
import { existsSync } from "fs";
import { NextRequest, NextResponse } from "next/server";
import { getAllowedFileRoots, isExistingFilePathAllowed, isFilePathAllowed, isWindowsAbsolutePath } from "@/lib/file-access";
import { getGitFileDiff } from "@/lib/git-changes";
import type { GitDiffMode } from "@/lib/git-types";

const DIFF_MODES: readonly GitDiffMode[] = ["combined", "staged", "unstaged"];

export async function GET(request: NextRequest) {
  try {
    const cwd = request.nextUrl.searchParams.get("cwd")?.trim() ?? "";
    const filePath = request.nextUrl.searchParams.get("path")?.trim() ?? "";
    const requestedMode = request.nextUrl.searchParams.get("mode")?.trim() ?? "combined";
    if (!DIFF_MODES.includes(requestedMode as GitDiffMode)) {
      return NextResponse.json({ error: "Invalid Git diff mode", code: "invalid_git_diff_mode" }, { status: 400 });
    }
    if (!cwd || (!cwd.startsWith("/") && !isWindowsAbsolutePath(cwd))) {
      return NextResponse.json({ error: "cwd must be an absolute path", code: "cwd_must_be_absolute" }, { status: 400 });
    }
    if (!filePath || (!filePath.startsWith("/") && !isWindowsAbsolutePath(filePath))) {
      return NextResponse.json({ error: "path must be an absolute path", code: "path_must_be_absolute" }, { status: 400 });
    }

    const allowedRoots = await getAllowedFileRoots();
    const relativeToCwd = path.relative(path.resolve(cwd), path.resolve(filePath));
    const isWithinCwd = relativeToCwd === "" || (!relativeToCwd.startsWith(`..${path.sep}`) && relativeToCwd !== ".." && !path.isAbsolute(relativeToCwd));
    if (!isWithinCwd || !isFilePathAllowed(cwd, allowedRoots) || !isFilePathAllowed(filePath, allowedRoots)) {
      return NextResponse.json({ error: "Access denied", code: "access_denied" }, { status: 403 });
    }
    if (!isExistingFilePathAllowed(cwd, allowedRoots)) {
      return NextResponse.json({ error: "Access denied", code: "access_denied" }, { status: 403 });
    }
    // Existing paths must resolve through symlinks; a missing path can be a tracked deletion.
    if (!isExistingFilePathAllowed(filePath, allowedRoots) && existsSync(filePath)) {
      return NextResponse.json({ error: "Access denied", code: "access_denied" }, { status: 403 });
    }

    const result = await getGitFileDiff(cwd, filePath, requestedMode as GitDiffMode);
    if (!result.supported) {
      return NextResponse.json({ error: "File not found", code: "file_not_found" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error), code: "git_diff_failed" }, { status: 500 });
  }
}
