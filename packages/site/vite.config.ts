// The front door's own pages — the landing page (/) and the feedback admin page
// (/admin) — built to dist/pages, which the Worker serves as static assets
// (wrangler.toml [assets]). The MCP App views are a separate build
// (vite.views.config.ts): a page a model host renders in a sandboxed frame is one
// self-contained file, not part of this site.
import { resolve } from "node:path";
import solidPlugin from "@solidjs/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [solidPlugin()],
  resolve: {
    alias: { "solid-js/web": "@solidjs/web" },
  },
  build: {
    outDir: "dist/pages",
    emptyOutDir: true,
    cssTarget: ["chrome130", "safari18", "firefox133"],
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, "index.html"),
        admin: resolve(import.meta.dirname, "admin/index.html"),
      },
    },
  },
  server: {
    // `pnpm dev` here serves the pages alone; the doors they call are the Worker's.
    proxy: { "/api": "http://localhost:8787", "/mcp": "http://localhost:8787" },
  },
});
