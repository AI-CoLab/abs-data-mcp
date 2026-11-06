// One MCP App view per build: `VIEW=feedback` or `VIEW=data`. Each is a single
// HTML file with its script and styles inlined (dist/views/<name>/index.html),
// which the Worker imports as text and serves as a `ui://` resource. The same
// shape as app-kit's `build:mcp-app-view`, so the views move into it unchanged.
import solidPlugin from "@solidjs/vite-plugin";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const view = process.env["VIEW"];
if (view !== "feedback" && view !== "data") throw new Error("VIEW must be feedback or data");

export default defineConfig({
  root: `src/views/${view}`,
  plugins: [solidPlugin(), viteSingleFile()],
  resolve: {
    alias: { "solid-js/web": "@solidjs/web" },
  },
  build: {
    outDir: `../../../dist/views/${view}`,
    // Overwrite in place: emptying the folder first briefly removes the file the
    // Worker imports, and a running `wrangler dev` wedges on the missing import.
    emptyOutDir: false,
    cssTarget: ["chrome130", "safari18", "firefox133"],
  },
});
