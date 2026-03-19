import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

// biome-ignore lint/style/noDefaultExport: Vite config requires default export
export default defineConfig({
  plugins: [
    TanStackRouterVite({
      routesDirectory: "./src/routes",
      generatedRouteTree: "./src/routeTree.gen.ts",
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      "@beads-ide/frankenmermaid": resolve(__dirname, "../../packages/frankenmermaid/frankenmermaid.js"),
    },
  },
  server: {
    port: 5173,
    allowedHosts: ["bcc.startupfactory.services"],
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
