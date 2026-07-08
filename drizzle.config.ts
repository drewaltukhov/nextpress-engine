import type { Config } from "drizzle-kit";

export default {
  schema: "./src/core/db/schema/index.ts",
  out: "./src/core/db/migrations/core",
  dialect: "turso",
  dbCredentials: {
    url: process.env.TURSO_DATABASE_URL ?? "file:./.local/dev.db",
    authToken: process.env.TURSO_AUTH_TOKEN
  },
  verbose: true,
  strict: true
} satisfies Config;
