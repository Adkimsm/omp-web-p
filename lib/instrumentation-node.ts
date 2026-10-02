import { configureHttpDispatcher } from "@/lib/http-dispatcher";
import { runUtilityCommand } from "@/lib/omp/rpc-utility";
import { getAgentDir } from "@/lib/session-reader";

export async function register(): Promise<void> {
  configureHttpDispatcher();

  // Startup diagnostics: node version, agent dir, pid. Cheap to emit and the
  // only signal in the logs that the server runtime actually came up. Kept to
  // one line so it greps cleanly; failures here must never block boot.
  try {
    console.log(
      `[omp-web] starting (node ${process.version}, pid ${process.pid}, agent-dir ${getAgentDir()})`,
    );
  } catch {
    // Diagnostics are best-effort.
  }

  // Warm the shared utility omp process so the first models/auth request does
  // not pay the multi-second cold spawn (measured 1.2-4s on a real install).
  // Fire-and-forget: register() must not block boot, and a missing omp binary
  // is reported per-request by the routes — log once here and move on.
  // The shared process registers its own SIGINT/SIGTERM/exit disposal hook on
  // first use (lib/omp/rpc-utility.ts), as the session registry does.
  void (async () => {
    try {
      await runUtilityCommand({ type: "get_state" });
    } catch (error) {
      console.warn(
        `[omp-web] omp utility warm-up failed (routes will retry on demand): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  })();
}
