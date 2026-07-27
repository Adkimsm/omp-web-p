export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { configureHttpDispatcher } = await import("@/lib/http-dispatcher");
  configureHttpDispatcher();

  // Warm the shared utility omp process so the first models/auth request does
  // not pay the multi-second cold spawn (measured 1.2-4s on a real install).
  // Fire-and-forget: register() must not block boot, and a missing omp binary
  // is reported per-request by the routes — log once here and move on.
  void (async () => {
    try {
      const { runUtilityCommand } = await import("@/lib/omp/rpc-utility");
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
