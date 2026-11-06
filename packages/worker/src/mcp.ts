/**
 * The MCP door: four fixed verbs over the observed catalogue.
 *
 * Nothing here changes when ABS changes — the tools query the catalogue at
 * request time, so alignment with the other doors is automatic (decision 21).
 * Built on MCP 2026-07-28 via SDK v2: stateless, one server per request.
 *
 * Invalid selections use the Multi Round-Trip Request pattern: instead of an
 * error, `get_data` returns `input_required` carrying the observed valid
 * options for the offending dimension; the client answers and retries the same
 * call. That turns "wrong option" into a one-step correction.
 */
import {
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  type ClientCapabilities,
  McpServer,
  type ServerContext,
  type ToolAnnotations,
  acceptedContent,
  inputRequired,
} from "@modelcontextprotocol/server";
import { RESOURCE_URI_META_KEY } from "@modelcontextprotocol/ext-apps/server";
import {
  MANIFEST,
  describeTableInputSchema,
  describeTableOutputSchema,
  getDataInputSchema,
  getDataOutputSchema,
  searchOptionsInputSchema,
  searchOptionsOutputSchema,
  searchTablesInputSchema,
  searchTablesOutputSchema,
  type InvalidSelection,
  type Selection,
} from "@abs/contract";
import { Catalogue } from "./catalogue.ts";
import { resolveSelection } from "./resolve.ts";
import { fetchData } from "./abs-data.ts";
import { registerResources } from "./resources.ts";
import { registerPrompts } from "./prompts.ts";
import { registerCodeMode } from "./codemode.ts";
import type { Env } from "./env.ts";
import { catalogue as operations, type DoorCtx } from "./feedback.ts";
import { registerMcpAppView, registerOperations, showsViews } from "./ops/mcp.ts";
import { dataView } from "./views.ts";

const NAME = "abs-data";
const VERSION = MANIFEST.runId;
const ORIGIN = "https://abs-data-front-door.aicolab.workers.dev";

/** The first 512 characters stand alone (ChatGPT reads only that much up front). */
export const INSTRUCTIONS =
  "ABS Data (observed): the Australian Bureau of Statistics' data, offering only tables and options confirmed to " +
  "serve data. Flow: search_tables → describe_table → search_options (large dimensions such as geography) → " +
  "get_data. A failed selection names the valid options; use them rather than guessing. Quote numbers only from " +
  "get_data results, with provenance.runId. If the person wants to report a problem or an idea, use feedback_form " +
  "(they review and send it); never call submit_feedback without their explicit OK.\n\n" +
  "More: Code Mode `search` runs code over the whole catalogue document and `execute` runs multi-series analysis " +
  "in a sandbox. Resources: abs://guide (how to use this server), abs://findings (what ABS's metadata gets wrong), " +
  "abs://table/{id}. Prompts: suburb_dossier, compare_capitals, explain_metadata_gap, report_issue. Small-area " +
  "series are volatile; read multi-year totals, not single years.";

/** Every catalogue verb reads; get_data reaches ABS live, so it is open-world. */
const READS: ToolAnnotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const LIVE_READ: ToolAnnotations = { ...READS, openWorldHint: true };

function jsonResult<T>(value: T, links: Array<{ uri: string; name: string; title?: string }> = []) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(value, null, 2) },
      // Resource links: the table's description as a document the client can open or attach.
      ...links.map((l) => ({ type: "resource_link" as const, mimeType: "application/json", ...l })),
    ],
    structuredContent: value as Record<string, unknown>,
  };
}

const tableLink = (id: string) => ({ uri: `abs://table/${encodeURIComponent(id)}`, name: id, title: `ABS table ${id}` });

/** Who is calling, for the feedback operations: the client from the request's envelope, where it sent one. */
function doorCtx(env: Env, ip: string, mcp: ServerContext): DoorCtx {
  const envelope = mcp.mcpReq.envelope as Record<string, unknown> | undefined;
  const info = envelope?.[CLIENT_INFO_META_KEY] as { name?: unknown; version?: unknown } | undefined;
  return {
    env,
    channel: "mcp",
    ip,
    client: info
      ? {
          name: typeof info.name === "string" ? info.name : undefined,
          version: typeof info.version === "string" ? info.version : undefined,
        }
      : undefined,
  };
}

export interface BuildOptions {
  /** The client's address (cf-connecting-ip), for the feedback sender hash only. */
  ip: string;
  /** Capabilities the request declared (2026-07-28 envelope), when it carried any. */
  client?: ClientCapabilities | undefined;
}

function errorResult(error: InvalidSelection) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify(error, null, 2) }],
    structuredContent: error as unknown as Record<string, unknown>,
  };
}

export function buildMcpServer(env: Env, ctx: ExecutionContext, opts: BuildOptions = { ip: "unknown" }): McpServer {
  const catalogue = new Catalogue(env.CATALOGUE);
  const views = showsViews(opts.client);
  // Cache hints for the 2026-07-28 cacheable results: the surface changes only
  // per crawl, so shared caches may hold tools/list for a day (decision 22).
  const server = new McpServer(
    {
      name: NAME,
      title: "ABS Data (observed)",
      version: VERSION,
      websiteUrl: ORIGIN,
      icons: [{ src: `${ORIGIN}/icon.svg`, mimeType: "image/svg+xml", sizes: ["any"] }],
    },
    { cacheHints: MCP_CACHE_HINTS, instructions: INSTRUCTIONS },
  );

  server.registerTool(
    "search_tables",
    {
      title: "Search ABS tables",
      description:
        "Find ABS statistical tables (dataflows) by topic words, geography level or frequency. Matches " +
        "table names, topics and dimension names, and also option labels inside dimensions — a search for " +
        "'rent' finds CPI through its INDEX option 'Rents' and reports the match in matchedOptions. Census " +
        "tables published at several geography levels are collapsed to one result with familyGeographies " +
        "listing the others (use the geography filter to pick one). Every result is confirmed to serve " +
        "data — nothing here comes from documentation alone. Start here, then describe_table.",
      inputSchema: searchTablesInputSchema,
      outputSchema: searchTablesOutputSchema,
      annotations: { ...READS, title: "Search ABS tables" },
    },
    async (input) => jsonResult(await catalogue.searchTables(input)),
  );

  server.registerTool(
    "describe_table",
    {
      title: "Describe a table",
      description:
        "A table's dimensions in key order, its coverage dates, and its observed options. Dimensions with up to " +
        "64 options list them inline with labels; larger ones (geography, occupations) say how many and are " +
        "searchable with search_options.",
      inputSchema: describeTableInputSchema,
      outputSchema: describeTableOutputSchema,
      annotations: { ...READS, title: "Describe a table" },
    },
    async (input) => {
      const described = await catalogue.describeTable(input.table);
      if (!described) {
        return errorResult({
          table: input.table,
          dimension: null,
          given: null,
          reason: "unknown_table",
          message: `No table "${input.table}" serves data. Use search_tables.`,
        });
      }
      return jsonResult(described, [tableLink(input.table)]);
    },
  );

  server.registerTool(
    "search_options",
    {
      title: "Search a dimension's options",
      description:
        "Find option codes by label text within one dimension of one table — e.g. a suburb name in a geography " +
        "dimension. Returns codes to use in get_data's select.",
      inputSchema: searchOptionsInputSchema,
      outputSchema: searchOptionsOutputSchema,
      annotations: { ...READS, title: "Search a dimension's options" },
    },
    async (input) => jsonResult(await catalogue.searchOptions(input.table, input.dimension, input.query, input.limit)),
  );

  server.registerTool(
    "get_data",
    {
      title: "Get data",
      description:
        "Fetch observations. `select` maps dimension ids to option codes or labels (several allowed); omitted " +
        "dimensions match everything. The selection is verified live against ABS before fetching, so a call " +
        "that succeeds always returns real data. Returns up to maxRows observations (default 500, most recent " +
        "12 periods per series unless a period range is given), a summary, and the URL for the complete pull. " +
        "If an option or combination does not exist you are asked to choose from the valid ones.",
      inputSchema: getDataInputSchema,
      outputSchema: getDataOutputSchema,
      annotations: { ...LIVE_READ, title: "Get data" },
      // On a host that shows MCP App views, the result also renders as a chart and a table.
      ...(views ? { _meta: { ui: { resourceUri: dataView.uri }, [RESOURCE_URI_META_KEY]: dataView.uri } } : {}),
    },
    async (input, ctx) => {
      // Fold in any correction the client supplied on a retry.
      const select: Selection = { ...input.select };
      for (const dimension of Object.keys(input.select)) {
        const answer = acceptedContent<{ value: string }>(ctx.mcpReq.inputResponses, dimension);
        if (answer?.value) select[dimension] = answer.value;
      }
      const resolved = await resolveSelection(catalogue, input.table, select);
      if (resolved.ok) return jsonResult(await fetchData(resolved.value, { ...input, select }), [tableLink(input.table)]);

      const err = resolved.error;
      // Correctable in one round trip: ask for a valid option for the dimension —
      // but only if the client can take an input request. A client without form
      // elicitation gets the same facts as a typed error instead of a protocol
      // error (the SDK rejects input_required for such clients).
      // The SDK lifts the envelope keys out of _meta into mcpReq.envelope, keyed
      // by their raw meta names — the same place its own capability check reads.
      type Caps = { elicitation?: { form?: unknown } } | undefined;
      const envelope = ctx.mcpReq.envelope as Record<string, unknown> | undefined;
      const caps = envelope?.[CLIENT_CAPABILITIES_META_KEY] as Caps;
      const canElicit = caps?.elicitation?.form !== undefined;
      const correctable =
        err.reason === "unknown_option" ||
        err.reason === "ambiguous_option" ||
        err.reason === "no_data_for_combination";
      if (canElicit && err.dimension && correctable) {
        const codes = (err.validOptions ?? []).map((o) => o.code);
        const labels = (err.validOptions ?? []).map((o) => (o.label ? `${o.code} = ${o.label}` : o.code));
        return inputRequired({
          inputRequests: {
            [err.dimension]: inputRequired.elicit({
              message:
                `${err.message}\n\nChoose a value for ${err.dimension}` +
                (labels.length ? `:\n${labels.join("\n")}` : "."),
              requestedSchema: {
                type: "object",
                properties: {
                  value: {
                    type: "string",
                    title: err.dimension,
                    description: `Option code for ${err.dimension} in ${err.table}`,
                    ...(codes.length > 0 ? { enum: codes } : {}),
                  },
                },
                required: ["value"],
              },
            }),
          },
        });
      }
      return errorResult(err);
    },
  );

  registerResources(server, catalogue);
  registerPrompts(server);
  registerCodeMode(server, env, ctx);
  // The operations written against ./ops/define (app-kit's shape): feedback_form and
  // submit_feedback, with the feedback view; and the chart view get_data points at.
  registerOperations(server, operations, (mcp) => doorCtx(env, opts.ip, mcp), { client: opts.client });
  if (views) registerMcpAppView(server, dataView);
  return server;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const PUBLIC_DAY = { ttlMs: DAY_MS, cacheScope: "public" as const };
const MCP_CACHE_HINTS = {
  "tools/list": PUBLIC_DAY,
  "prompts/list": PUBLIC_DAY,
  "resources/list": PUBLIC_DAY,
  "resources/templates/list": PUBLIC_DAY,
  "server/discover": PUBLIC_DAY,
};
