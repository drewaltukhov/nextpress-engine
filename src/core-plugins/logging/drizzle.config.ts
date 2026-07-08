import type { Config } from "drizzle-kit";

export default {
  schema: "./src/core-plugins/logging/schema/index.ts",
  out: "./src/core-plugins/logging/migrations",
  dialect: "turso",
  dbCredentials: {
    url: process.env.TURSO_DATABASE_URL ?? "file:./.local/dev.db",
    authToken: process.env.TURSO_AUTH_TOKEN
  },
  verbose: true,
  strict: true
} satisfies Config;
