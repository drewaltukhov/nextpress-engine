import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const config = [
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      // App-router only; the Pages-router rule warns when /pages doesn't exist.
      "@next/next/no-html-link-for-pages": "off"
    }
  },
  {
    ignores: [".next/**", ".source/**", ".worktrees/**", ".claude/worktrees/**", "node_modules/**", "src/generated/**", "**/*.sql", "next-env.d.ts"]
  }
];

export default config;
