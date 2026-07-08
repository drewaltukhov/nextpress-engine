import { defineConfig } from "vitest/config";
import { resolve } from "path";

// `*.pg.test.ts` files require a live Supabase Postgres connection (env vars
// + a project where bootstrap-supabase-roles.sql has been applied). Exclude
// them from the default Turso CI run; set NEXTPRESS_DB_PROVIDER=supabase to
// opt in.
const PG_TESTS = ["tests/**/*.pg.test.ts"];

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx", "tests/**/*.test-d.ts"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      ...(process.env.NEXTPRESS_DB_PROVIDER === "supabase" ? [] : PG_TESTS)
    ],
    environment: "node",
    globals: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/generated/**", "src/app/**"]
    }
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      "@core": resolve(__dirname, "./src/core"),
      "@core-plugins": resolve(__dirname, "./src/core-plugins"),
      "@plugins": resolve(__dirname, "./plugins"),
      "@themes": resolve(__dirname, "./themes"),
      "@generated": resolve(__dirname, "./src/generated")
    }
  }
});
