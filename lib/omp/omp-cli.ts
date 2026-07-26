import { execFile } from "child_process";
import { existsSync } from "fs";
import { homedir } from "os";
import { delimiter, join } from "path";

/**
 * Locating and probing the user's installed `omp` CLI. omp-web never embeds
 * the (Bun-only) @oh-my-pi SDK — every live-agent capability goes through the
 * omp binary, so its absence is a first-class, user-visible state.
 */

let cachedBin: string | null | undefined;
let cachedVersion: string | null | undefined;

const BIN_NAME = process.platform === "win32" ? "omp.exe" : "omp";

/** Resolve the omp binary: OMP_WEB_OMP_BIN override, then PATH lookup. Returns
 * null when omp is not installed. Result is cached for the process lifetime. */
export function resolveOmpBin(): string | null {
  if (cachedBin !== undefined) return cachedBin;
  const override = process.env.OMP_WEB_OMP_BIN;
  if (override) {
    cachedBin = existsSync(override) ? override : null;
    return cachedBin;
  }
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, BIN_NAME);
    if (existsSync(candidate)) {
      cachedBin = candidate;
      return cachedBin;
    }
  }
  // GUI-launched processes often miss homebrew/bun dirs in PATH; probe the
  // usual install locations before giving up.
  const fallbackDirs = [
    "/opt/homebrew/bin",
    "/usr/local/bin",
    join(homedir(), ".bun", "bin"),
    join(homedir(), ".local", "bin"),
  ];
  for (const dir of fallbackDirs) {
    const candidate = join(dir, BIN_NAME);
    if (existsSync(candidate)) {
      cachedBin = candidate;
      return cachedBin;
    }
  }
  cachedBin = null;
  return cachedBin;
}

/** `omp --version` output (e.g. "omp/17.1.3"), or null when unavailable.
 * Cached after the first successful probe. */
export async function getOmpVersion(): Promise<string | null> {
  if (cachedVersion !== undefined) return cachedVersion;
  const bin = resolveOmpBin();
  if (!bin) {
    cachedVersion = null;
    return cachedVersion;
  }
  try {
    const output = await new Promise<string>((resolve, reject) => {
      execFile(bin, ["--version"], { timeout: 10_000 }, (error, stdout) => {
        if (error) reject(error);
        else resolve(stdout);
      });
    });
    cachedVersion = output.trim() || null;
  } catch {
    cachedVersion = null;
  }
  return cachedVersion;
}
