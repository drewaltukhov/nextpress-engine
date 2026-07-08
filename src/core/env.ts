export type DbProvider = "turso" | "supabase";

export interface EnvConfig {
  provider: DbProvider;
  databaseUrl: string;
  authToken: string | undefined;
  /** Postgres connection URL for the `nextpress_admin` role (Supabase mode only). */
  databaseUrlAdmin: string | undefined;
  /** Postgres connection URL for the `nextpress_public` role (Supabase mode only). */
  databaseUrlPublic: string | undefined;
  disabledPlugins: ReadonlySet<string>;
  safeMode: boolean;
}

function assertPostgresUrl(value: string | undefined, name: string): string {
  if (!value || value.trim().length === 0) {
    throw new Error(`NextPress: Supabase mode requires ${name} to be set in env.`);
  }
  if (!/^postgres(ql)?:\/\//.test(value)) {
    throw new Error(
      `NextPress: ${name} must be a postgres:// URL (got "${value.slice(0, 12)}…").`
    );
  }
  return value;
}

export function readEnv(): EnvConfig {
  const rawProvider = process.env.NEXTPRESS_DB_PROVIDER?.trim().toLowerCase();
  const provider: DbProvider = rawProvider === "supabase" ? "supabase" : "turso";

  const databaseUrl = process.env.TURSO_DATABASE_URL?.trim() || "file:./.local/dev.db";
  const authToken = process.env.TURSO_AUTH_TOKEN?.trim() || undefined;

  let databaseUrlAdmin: string | undefined;
  let databaseUrlPublic: string | undefined;

  if (provider === "supabase") {
    databaseUrlAdmin = assertPostgresUrl(process.env.DATABASE_URL, "DATABASE_URL");
    databaseUrlPublic = assertPostgresUrl(
      process.env.DATABASE_URL_PUBLIC,
      "DATABASE_URL_PUBLIC"
    );
  }

  const disabledRaw = process.env.NEXTPRESS_DISABLE_PLUGINS ?? "";
  const disabledPlugins = new Set(
    disabledRaw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
  );

  const safeMode = process.env.NEXTPRESS_SAFE_MODE === "1";

  return {
    provider,
    databaseUrl,
    authToken,
    databaseUrlAdmin,
    databaseUrlPublic,
    disabledPlugins,
    safeMode
  };
}
