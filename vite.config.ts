import { defineConfig } from "vite";

// GitHub Pages serves the site from /<repo-name>/. The deploy workflow sets BASE_PATH;
// local dev and other static hosts use "/".
export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  build: { target: "esnext" },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
