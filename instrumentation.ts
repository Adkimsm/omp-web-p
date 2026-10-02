export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // A static import would include Node-only APIs in the Edge runtime bundle.
    const { register: registerNode } = await import("@/lib/instrumentation-node");
    await registerNode();
  }
}
