import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}", "./themes/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: []
};

export default config;
