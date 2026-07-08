export async function register() {
  // Boot only on the Node runtime — bootEngine uses node:path / node:fs / libsql
  // which aren't available on Next.js's Edge runtime.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { bootEngine } = await import("./core/boot");
  try {
    await bootEngine();
    console.log("[instrumentation] NextPress kernel booted.");
  } catch (err) {
    console.error("[instrumentation] kernel boot failed:", err);
    // Do NOT throw — Next.js would refuse to serve. Prefer a degraded boot.
  }

  // Supabase mode only: health-check both pg pools right after boot so connection
  // failures surface here (with full stack trace) instead of on a user's first
  // request as an opaque 500. Failure IS fatal — a broken pool serving traffic
  // would produce 100% errors anyway.
  const { readEnv } = await import("./core/env");
  const env = readEnv();
  if (env.provider === "supabase") {
    try {
      const { dbAdmin, dbPublic } = await import("./core/db/instance");
      const { sql } = await import("drizzle-orm");
      const admin = await dbAdmin();
      const pub = await dbPublic();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (admin as any).execute(sql`SELECT 1 AS hc`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (pub as any).execute(sql`SELECT 1 AS hc`);
      console.log("[instrumentation] Supabase pool health-check passed.");
    } catch (err) {
      console.error("[instrumentation] Supabase pool health-check FAILED:", err);
      throw err;
    }
  }
}
