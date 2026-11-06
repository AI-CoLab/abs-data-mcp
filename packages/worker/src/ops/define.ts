/**
 * What an operation IS, with nothing of how it is served (DESIGN.md decision 34).
 *
 * A deliberate mirror of @aicolab/app-kit's `./api/define`: the same names, the
 * same shapes, the same handler signature `(input, ctx, call)`, so that moving the
 * front door onto app-kit is an import swap for everything written against this
 * file — not a rewrite. What app-kit has and this does not (capability classes
 * per standing, tasks, skills, the asks) is left out rather than imitated; the
 * subset here is exactly what this Worker uses. Do not grow it in new directions:
 * anything app-kit would spell differently belongs in app-kit.
 *
 * New operations are written here. The four original verbs and Code Mode are still
 * registered directly in ../mcp.ts and served over HTTP by oRPC (decision 27); they
 * join this catalogue when the front door moves to app-kit.
 */
import type { McpUiResourceMeta, McpUiToolMeta } from "@modelcontextprotocol/ext-apps";
import type { Icon, LoggingLevel, ToolAnnotations } from "@modelcontextprotocol/server";
import type { z } from "zod";

/** How an operation is reached over REST: OpenAPI-style path, GET query or POST JSON body. */
export interface RestBinding {
  method: "GET" | "POST";
  path: string;
}

/** A progress report, as MCP's `notifications/progress` carries it. */
export interface Progress {
  progress: number;
  total?: number;
  message?: string;
}

/** What a handler sees of its caller (app-kit's `Call`, without the asks). */
export interface Call {
  signal: AbortSignal;
  progress(report: Progress): void;
  log(level: LoggingLevel, data: unknown): void;
}

/**
 * An MCP App view (`io.modelcontextprotocol/ui`): one built HTML document, its
 * `ui://` URI carrying a hash of the document so a new build is a new URI and a
 * host never pairs a cached view with newer data.
 */
export interface McpAppView {
  name: string;
  html: string;
  description?: string;
  ui?: McpUiResourceMeta;
  uri: string;
}

/** FNV-1a over the text, in base 36: a short content version for a URI. */
const contentHash = (text: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return hash.toString(36);
};

export const defineMcpAppView = (view: Omit<McpAppView, "uri">): McpAppView => ({
  ...view,
  uri: `ui://${view.name}/${contentHash(view.html)}.html`,
});

export interface Operation<Ctx, Input extends z.ZodObject, Output extends z.ZodObject> {
  /** snake_case; the MCP tool name and the OpenAPI operationId. */
  name: string;
  /** One line, for tool titles and OpenAPI summaries. */
  summary: string;
  /** What it returns and when to use it, written for an agent as much as a developer. */
  description: string;
  tags?: string[];
  input: Input;
  output: Output;
  rest: RestBinding;
  /** Read-only, idempotent, closed-world unless said otherwise. A write says so here. */
  annotations?: ToolAnnotations;
  /** `false`: a route only, never a tool. */
  tool?: false;
  /** The MCP App view that renders this operation's result, for a host that shows views. */
  mcpAppView?: McpAppView;
  /** Who may see the tool when it has a view: the model, the view, or both (the default). */
  mcpAppViewVisibility?: McpUiToolMeta["visibility"];
  icons?: Icon[];
  /** Protocol metadata (`_meta`) on the tool. */
  meta?: Record<string, unknown>;
  handler: (input: z.output<Input>, ctx: Ctx, call: Call) => Promise<z.output<Output>>;
}

export type AnyOperation<Ctx> = Operation<Ctx, z.ZodObject, z.ZodObject>;

/** What every operation says of itself unless it says otherwise: a read that changes nothing. */
export const READ_ONLY: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

/** A `define` bound to the app's context type: each entry keeps its exact types. */
export const operationsFor =
  <Ctx>() =>
  <Input extends z.ZodObject, Output extends z.ZodObject>(
    operation: Operation<Ctx, Input, Output>,
  ): Operation<Ctx, Input, Output> =>
    operation;

/** "No such thing": 404 over REST, an error result over MCP. */
export class NotFound extends Error {}

/** "Not now, and this is why": 409 (or 429 where `retryAfterSeconds` is set) over REST,
 *  an error result carrying the reason over MCP. */
export class Refused extends Error {
  constructor(
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}
