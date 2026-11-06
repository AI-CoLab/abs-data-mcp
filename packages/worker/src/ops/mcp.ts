/**
 * The MCP projection of an operation catalogue (DESIGN.md decision 34): each
 * operation a tool, each MCP App view a `ui://` resource the tool points at, and
 * the UI extension advertised. The shape of app-kit's `registerMcpTools`, minus
 * capability classes — this Worker has one standing (anyone), so the catalogue
 * is the list.
 *
 * A tool's result goes back twice, as the spec allows: `structuredContent` for
 * clients that read the output schema, and the same JSON as text for the rest.
 * NotFound and Refused are tool errors the model can read and act on.
 */
import {
  EXTENSION_ID as UI_EXTENSION_ID,
  RESOURCE_MIME_TYPE,
  RESOURCE_URI_META_KEY,
  getUiCapability,
  registerAppResource,
} from "@modelcontextprotocol/ext-apps/server";
import type { ClientCapabilities, McpServer, ServerContext } from "@modelcontextprotocol/server";
import { type AnyOperation, type Call, type McpAppView, NotFound, READ_ONLY, Refused } from "./define.ts";

export interface McpOptions {
  /** The capabilities the client declared on this request, when it declared any.
   *  Views are left out only for a client that declared capabilities without the UI
   *  extension; a client that declared nothing (a 2025-revision request after its
   *  initialize) still sees them, and a host that cannot render one ignores the pointer. */
  client?: ClientCapabilities | undefined;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** The tool's `_meta` with its view: the pointer under `ui`, and under the older flat key hosts still read. */
const toolMeta = <Ctx>(operation: AnyOperation<Ctx>, view: McpAppView): Record<string, unknown> => ({
  ...operation.meta,
  ui: {
    resourceUri: view.uri,
    ...(operation.mcpAppViewVisibility ? { visibility: operation.mcpAppViewVisibility } : {}),
  },
  [RESOURCE_URI_META_KEY]: view.uri,
});

export function registerMcpAppView(server: McpServer, view: McpAppView): void {
  const ui = view.ui;
  registerAppResource(
    server,
    view.name,
    view.uri,
    { description: view.description, ...(ui ? { _meta: { ui } } : {}) },
    async () => ({
      contents: [{ uri: view.uri, mimeType: RESOURCE_MIME_TYPE, text: view.html, ...(ui ? { _meta: { ui } } : {}) }],
    }),
  );
}

export function callOf(ctx: ServerContext): Call {
  return {
    signal: ctx.mcpReq.signal,
    progress: () => {},
    log: (level, data) => {
      void ctx.mcpReq.log(level, data).catch(() => {});
    },
  };
}

/** Whether to point tools at views for this client. */
export const showsViews = (client: ClientCapabilities | undefined): boolean =>
  client === undefined || getUiCapability(client) !== undefined;

/**
 * Register every operation as a tool on a server made for this request. `ctxFor`
 * builds the operation's context from the SDK's per-request context (who is
 * calling, from what client), so nothing request-scoped is captured at startup.
 */
export function registerOperations<Ctx>(
  server: McpServer,
  catalogue: readonly AnyOperation<Ctx>[],
  ctxFor: (mcp: ServerContext) => Ctx,
  options: McpOptions = {},
): Set<McpAppView> {
  const views = new Set<McpAppView>();
  const withViews = showsViews(options.client);
  for (const operation of catalogue) {
    if (operation.tool === false) continue;
    const view = withViews ? operation.mcpAppView : undefined;
    if (view) views.add(view);
    server.registerTool(
      operation.name,
      {
        title: operation.summary,
        description: operation.description,
        inputSchema: operation.input,
        outputSchema: operation.output,
        annotations: { ...READ_ONLY, ...operation.annotations, title: operation.summary },
        ...(operation.icons ? { icons: operation.icons } : {}),
        ...(view ? { _meta: toolMeta(operation, view) } : operation.meta ? { _meta: operation.meta } : {}),
      },
      async (args: unknown, mcp: ServerContext) => {
        try {
          const input = operation.input.parse(args);
          const result: unknown = await operation.handler(input, ctxFor(mcp), callOf(mcp));
          if (!isRecord(result)) throw new TypeError(`${operation.name} returned something other than an object`);
          return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }], structuredContent: result };
        } catch (error) {
          if (error instanceof NotFound || error instanceof Refused) {
            return { isError: true, content: [{ type: "text" as const, text: error.message }] };
          }
          throw error;
        }
      },
    );
  }
  for (const view of views) registerMcpAppView(server, view);
  if (catalogue.some((operation) => operation.mcpAppView)) {
    server.server.registerCapabilities({ extensions: { [UI_EXTENSION_ID]: {} } });
  }
  return views;
}
