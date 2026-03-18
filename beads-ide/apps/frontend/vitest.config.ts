import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

// biome-ignore lint/style/noDefaultExport: Vitest config requires default export
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "happy-dom",
    globals: true,
    include: ["tests/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["tests/e2e/**", "node_modules/**"],
    benchmark: {
      include: ["tests/**/*.bench.{ts,tsx}"],
      exclude: ["tests/e2e/**"],
      reporters: ["verbose"],
    },
  },
});
