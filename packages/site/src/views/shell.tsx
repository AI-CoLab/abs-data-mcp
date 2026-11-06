/**
 * The MCP App view shell for a Solid view (DESIGN.md decision 35): connects to
 * the host over the frame's message channel, follows the host's theme and style
 * variables, hands the view the tool's result (and its arguments, when the host
 * sends them ahead) and a ViewHost whose calls the host proxies to the server's
 * tools, and reports the view's size as it changes.
 *
 * Same signature as @aicolab/app-kit's `mountMcpAppView`, so `main.tsx` files
 * switch to app-kit's by changing one import.
 */
import { App, applyDocumentTheme, applyHostStyleVariables } from "@modelcontextprotocol/ext-apps";
import { type JSX, render } from "@solidjs/web";
import { createSignal } from "solid-js";
import type { ViewHost } from "./view-host.ts";

type HostContext = ReturnType<App["getHostContext"]>;

export interface McpAppViewState {
  /** The tool's structured content, once the host has sent the result; undefined before. */
  result: () => unknown;
  /** The tool's arguments, when the host sends them ahead of the result. */
  input: () => Record<string, unknown> | undefined;
  host: ViewHost;
}

const textOf = (content: { type: string; text?: string }[] | undefined): string =>
  (content ?? [])
    .map((block) => (block.type === "text" ? (block.text ?? "") : ""))
    .filter(Boolean)
    .join("\n");

export async function mountMcpAppView(
  info: { name: string; version: string },
  root: Element,
  draw: (state: McpAppViewState) => JSX.Element,
): Promise<App> {
  const app = new App(info, {});
  const [result, setResult] = createSignal<unknown>(undefined);
  const [input, setInput] = createSignal<Record<string, unknown> | undefined>(undefined);
  const applyHost = (context: HostContext) => {
    if (context?.theme) applyDocumentTheme(context.theme);
    if (context?.styles?.variables) applyHostStyleVariables(context.styles.variables);
  };
  // Handlers before connecting: the host may send the input and the result at once.
  app.ontoolinput = (params) => setInput(params.arguments);
  app.ontoolresult = (params) => setResult(params.structuredContent);
  app.onhostcontextchanged = applyHost;
  const host: ViewHost = {
    name: "the MCP App host",
    canCall: () => app.getHostCapabilities()?.serverTools !== undefined,
    call: async (name, args) => {
      const out = await app.callServerTool({ name, arguments: args });
      if (out.isError) throw new Error(textOf(out.content as { type: string; text?: string }[]) || `${name} failed`);
      return out.structuredContent;
    },
    openLink: (url) => {
      void app.openLink({ url });
    },
  };
  render(() => draw({ result, input, host }), root);
  await app.connect();
  applyHost(app.getHostContext());
  app.setupSizeChangedNotifications();
  return app;
}
