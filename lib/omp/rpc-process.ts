import { type ChildProcessWithoutNullStreams, spawn } from "child_process";
import { createInterface } from "readline";
import { resolveOmpBin } from "./omp-cli";

/**
 * Process + protocol layer for `omp --mode rpc-ui` (NDJSON over stdio).
 * Protocol v1: commands `{id, type, ...}` on stdin; `{type:"response", id, ...}`
 * plus interleaved event frames on stdout. omp announces readiness with a
 * `{type:"ready"}` frame before accepting commands. Protocol v2 chunking is
 * intentionally not negotiated — v1 writes arbitrarily long single lines and
 * readline handles those fine.
 */

export interface RpcResponseFrame {
  type: "response";
  id?: string;
  command: string;
  success: boolean;
  data?: unknown;
  error?: string;
  code?: string;
}

export type RpcFrame = { type: string; [key: string]: unknown };

export class RpcCommandError extends Error {
  readonly command: string;
  readonly code?: string;

  constructor(command: string, message: string, code?: string) {
    super(message);
    this.name = "RpcCommandError";
    this.command = command;
    this.code = code;
  }
}

interface PendingCommand {
  command: string;
  resolve: (data: unknown) => void;
  reject: (error: Error) => void;
  timer?: NodeJS.Timeout;
}

export interface RpcProcessOptions {
  /** Working directory for the agent (also passed as --cwd). */
  cwd: string;
  /** Extra CLI args appended after the base `--mode rpc-ui --cwd <cwd>`. */
  extraArgs?: string[];
  /** Environment overrides merged over process.env. */
  env?: Record<string, string>;
  /** Called for every non-response frame (events, extension UI, subagent frames). */
  onFrame?: (frame: RpcFrame) => void;
  /** Called once when the child exits, after pending commands are rejected. */
  onExit?: (info: { code: number | null; signal: NodeJS.Signals | null; stderrTail: string }) => void;
}

const STDERR_TAIL_LIMIT = 8 * 1024;

export class RpcProcess {
  readonly cwd: string;
  private child: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<string, PendingCommand>();
  private readonly frameListeners = new Set<(frame: RpcFrame) => void>();
  private readyPromise: Promise<RpcFrame>;
  private nextId = 1;
  private stderrTail = "";
  private exited = false;
  private exitInfo: { code: number | null; signal: NodeJS.Signals | null } | null = null;

  constructor(options: RpcProcessOptions) {
    const bin = resolveOmpBin();
    if (!bin) {
      throw new Error("omp binary not found. Install oh-my-pi or set OMP_WEB_OMP_BIN.");
    }
    this.cwd = options.cwd;
    if (options.onFrame) this.frameListeners.add(options.onFrame);

    const args = ["--mode", "rpc-ui", "--cwd", options.cwd, ...(options.extraArgs ?? [])];
    this.child = spawn(bin, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ["pipe", "pipe", "pipe"],
      // omp launches grandchildren (LSP servers, extension subprocesses). Run the
      // child in its own process group so dispose() can SIGTERM/SIGKILL the whole
      // tree — otherwise a crashed omp would orphan its LSP children as zombies.
      detached: true,
    });

    let resolveReady: (frame: RpcFrame) => void;
    let rejectReady: (error: Error) => void;
    this.readyPromise = new Promise<RpcFrame>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    // waitReady() is optional for callers; avoid unhandled-rejection noise when
    // the process dies before anyone awaited readiness.
    this.readyPromise.catch(() => {});

    const rl = createInterface({ input: this.child.stdout });
    rl.on("line", (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      let frame: RpcFrame;
      try {
        frame = JSON.parse(trimmed) as RpcFrame;
      } catch {
        // omp guards stdout in RPC mode, but never let a stray line kill the reader.
        return;
      }
      if (frame.type === "ready") {
        resolveReady(frame);
        return;
      }
      if (frame.type === "response") {
        this.handleResponse(frame as unknown as RpcResponseFrame);
        return;
      }
      for (const listener of this.frameListeners) {
        try {
          listener(frame);
        } catch {
          // Listener bugs must not break the protocol reader.
        }
      }
    });

    this.child.stderr.on("data", (chunk: Buffer) => {
      this.stderrTail = (this.stderrTail + chunk.toString("utf8")).slice(-STDERR_TAIL_LIMIT);
    });

    const finalize = (code: number | null, signal: NodeJS.Signals | null) => {
      if (this.exited) return;
      this.exited = true;
      this.exitInfo = { code, signal };
      const exitError = new Error(
        `omp exited (code ${code ?? "null"}, signal ${signal ?? "none"})${this.stderrTail ? `: ${this.stderrTail.slice(-500)}` : ""}`,
      );
      rejectReady(exitError);
      for (const [, entry] of this.pending) {
        if (entry.timer) clearTimeout(entry.timer);
        entry.reject(exitError);
      }
      this.pending.clear();
      options.onExit?.({ code, signal, stderrTail: this.stderrTail });
    };
    this.child.on("exit", finalize);
    this.child.on("error", (error) => {
      this.stderrTail = (this.stderrTail + `\nspawn error: ${error.message}`).slice(-STDERR_TAIL_LIMIT);
      finalize(null, null);
    });
  }

  get isAlive(): boolean {
    return !this.exited;
  }

  get exitDetails(): { code: number | null; signal: NodeJS.Signals | null; stderrTail: string } | null {
    return this.exitInfo ? { ...this.exitInfo, stderrTail: this.stderrTail } : null;
  }

  /** Resolves with the `ready` frame; rejects if the process dies first or the
   * timeout elapses. omp startup can take a few seconds (extensions, LSP). */
  waitReady(timeoutMs = 60_000): Promise<RpcFrame> {
    const timeout = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => reject(new Error(`omp RPC ready timeout after ${timeoutMs}ms`)), timeoutMs);
      timer.unref?.();
      this.readyPromise.finally(() => clearTimeout(timer)).catch(() => {});
    });
    return Promise.race([this.readyPromise, timeout]);
  }

  onFrame(listener: (frame: RpcFrame) => void): () => void {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  /** Send a command and await its response `data`. A failed response rejects
   * with RpcCommandError. No timeout by default — some commands (login,
   * long prompts via bash) legitimately take minutes, and the session wrapper
   * reclaims wedged children via idle-kill and dispose(). Callers that want a
   * cap pass `timeoutMs` (>0); when set, the timer is unref'd so it never
   * keeps the event loop alive on its own. */
  sendCommand<T = unknown>(command: { type: string; [key: string]: unknown }, timeoutMs?: number): Promise<T> {
    if (this.exited) {
      return Promise.reject(new Error("omp RPC process has exited"));
    }
    const id = `w${this.nextId++}`;
    return new Promise<T>((resolve, reject) => {
      const entry: PendingCommand = {
        command: command.type,
        resolve: resolve as (data: unknown) => void,
        reject,
      };
      if (timeoutMs && timeoutMs > 0) {
        entry.timer = setTimeout(() => {
          // Only reject if this exact entry is still pending — a reused id or a
          // response that landed between the timer firing and this callback must
          // not spuriously reject a different command.
          if (this.pending.get(id) === entry) {
            this.pending.delete(id);
            reject(new Error(`RPC command ${command.type} timed out after ${timeoutMs}ms`));
          }
        }, timeoutMs);
        // A pending command timer must never keep the event loop alive on its own
        // (it would block graceful shutdown when omp has stopped answering).
        entry.timer.unref?.();
      }
      this.pending.set(id, entry);
      this.child.stdin.write(`${JSON.stringify({ ...command, id })}\n`, (error) => {
        if (error) {
          const pending = this.pending.get(id);
          if (pending) {
            this.pending.delete(id);
            if (pending.timer) clearTimeout(pending.timer);
            reject(error);
          }
        }
      });
    });
  }

  /** Write an unsolicited protocol frame and report transport failure. */
  sendFrame(frame: { type: string; [key: string]: unknown }): Promise<void> {
    if (this.exited) return Promise.reject(new Error("omp RPC process has exited"));
    return new Promise<void>((resolve, reject) => {
      this.child.stdin.write(`${JSON.stringify(frame)}\n`, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  private handleResponse(response: RpcResponseFrame): void {
    const id = response.id;
    const entry = id ? this.pending.get(id) : undefined;
    if (!entry || !id) {
      // Unsolicited response (or a command we already timed out) — surface to
      // frame listeners so nothing is silently dropped.
      for (const listener of this.frameListeners) {
        try {
          listener(response as unknown as RpcFrame);
        } catch {}
      }
      return;
    }
    this.pending.delete(id);
    if (entry.timer) clearTimeout(entry.timer);
    if (response.success) {
      entry.resolve(response.data);
    } else {
      entry.reject(new RpcCommandError(response.command, response.error ?? "RPC command failed", response.code));
    }
  }

  /** Graceful shutdown: close stdin (omp exits on EOF), escalate to SIGTERM
   * then SIGKILL on the whole process group. Resolves once the process has
   * exited. Safe to call during server teardown — escalation timers are
   * unref'd so they never keep the event loop alive on their own. */
  async dispose(gracePeriodMs = 5_000): Promise<void> {
    if (this.exited) return;
    const exited = new Promise<void>((resolve) => {
      if (this.exited) return resolve();
      this.child.once("exit", () => resolve());
    });
    try {
      this.child.stdin.end();
    } catch {}
    // -pid targets the child's whole process group (set up via detached:true),
    // so grandchildren (LSP, extension subprocesses) die with omp instead of
    // being orphaned. Falls back to killing just the child if the group is
    // gone or unsupported.
    const killGroup = (signal: NodeJS.Signals) => {
      try {
        process.kill(-this.child.pid!, signal);
      } catch {
        try { this.child.kill(signal); } catch {}
      }
    };
    const timer = setTimeout(() => {
      if (!this.exited) killGroup("SIGTERM");
    }, gracePeriodMs);
    const killTimer = setTimeout(() => {
      if (!this.exited) killGroup("SIGKILL");
    }, gracePeriodMs * 2);
    timer.unref?.();
    killTimer.unref?.();
    await exited;
    clearTimeout(timer);
    clearTimeout(killTimer);
  }
}
