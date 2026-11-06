/**
 * MCP resources: the map as documents, so a client can *read* what the tools
 * query. Static resources are cached publicly for a day (they change per
 * crawl); the per-table template answers on demand.
 */
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/server";
import { OpenAPIGenerator } from "@orpc/openapi";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { httpContract } from "@abs/contract/http";
import { BRANDED_CODELISTS, FINDINGS_MD, LITERAL_CODELISTS, MANIFEST, TABLE_IDS, TABLES } from "@abs/contract";

/** Table ids for a typed prefix (completion/complete): prefix matches first, then substring, at most 100. */
export function completeTableId(value: string): string[] {
  const q = value.trim().toUpperCase();
  const ids = TABLE_IDS as readonly string[];
  if (!q) return ids.slice(0, 100);
  const starts = ids.filter((id) => id.toUpperCase().startsWith(q));
  const contains = ids.filter((id) => !id.toUpperCase().startsWith(q) && id.toUpperCase().includes(q));
  return [...starts, ...contains].slice(0, 100);
}
import * as generated from "@abs/contract/generated";
import type { Catalogue } from "./catalogue.ts";
import { OPENAPI_INFO } from "./http.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const STATIC_HINT = { ttlMs: DAY_MS, cacheScope: "public" as const };

export const GUIDE_MD = `# Using ABS Data

This server gives you the Australian Bureau of Statistics' public data, fetched live:
${MANIFEST.corpus.tables.toLocaleString("en-AU")} tables, and every table and option
offered here has data. The data is ABS's, licensed CC BY 4.0.

## Working from what the person cares about

People rarely name a dataset. They say who they are and what they are trying to
decide ("I'm a financial counsellor; are working families going backwards?"). Work
out what the question depends on — prices, wages, rents, population, a place, a
period — search for each, fetch what bears on it, and answer in their terms: what
the numbers show, where each one comes from, and what they should be careful not to
over-claim. The words they used to ask should shape the answer as well as the search.

## The four verbs

1. **search_tables** — find tables by words, geography level (e.g. SA2, LGA) or
   frequency (A, Q, M). Matches names, topics, dimension names *and option labels*:
   "unemployment" finds Labour Force tables and names the Unemployment rate measure
   in \`matchedOptions\`. Census tables published at several geography levels are
   collapsed to one result; \`familyGeographies\` lists the rest.
2. **describe_table** — the key structure (dimensions in order), coverage dates, and
   options. Dimensions with up to 64 options list them inline; larger ones
   (geography, occupations, 161 CPI indices) give a count — use search_options.
3. **search_options** — find option codes by label inside one dimension of one table.
   Suburb names, industries, price indices.
4. **get_data** — \`select\` maps dimension ids to option codes or labels (several
   values allowed). Omitted dimensions match everything. The selection is verified
   live against ABS before fetching, so a successful call always returns real data.
   Default: the most recent 12 periods per series, capped at 500 observations; the
   response includes the exact ABS URL for the complete pull.

## When a selection fails

You are told which dimension is the problem and what *is* valid, given your other
choices — as an input request you can answer, or as a typed error carrying
\`validOptions\`. For an empty combination, \`alternatives\` lists every other single
dimension whose loosening recovers data: "Melbourne rents quarterly" fails because
quarterly Rents exist only for the national aggregate, while Melbourne Rents are
monthly — both routes are reported.

Labels can be ambiguous (CPI's INDEX has two options named "Rents"); the response
says so and lists the candidates — pass the code.

## Reading the numbers

Small-area series are volatile: a suburb's building approvals can be dominated by a
single development clearing in one month. Read multi-year totals, not single years.
Coverage differs per table; check \`coverage\` before assuming a period exists.

## Provenance

Every response carries \`provenance.runId\`: which observation of ABS it answers from.
`;

export function registerResources(server: McpServer, catalogue: Catalogue): void {
  server.registerResource(
    "guide",
    "abs://guide",
    { title: "How to use the ABS Data front door", description: "Usage guide for the four verbs, failure handling and reading the numbers.", mimeType: "text/markdown", cacheHint: STATIC_HINT },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: GUIDE_MD }] }),
  );

  server.registerResource(
    "findings",
    "abs://findings",
    { title: "How ABS's metadata compares with its data", description: "For technical readers: how much of what ABS's published metadata implies actually has data, and how the API's endpoints behave.", mimeType: "text/markdown", cacheHint: STATIC_HINT },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: FINDINGS_MD }] }),
  );

  server.registerResource(
    "catalogue",
    "abs://catalogue",
    {
      title: "The catalogue as one document",
      description: "Every table, its key structure and coverage, and every small-dimension option with labels (~2.6MB JSON). Large dimensions list their codelist and size.",
      mimeType: "application/json",
      cacheHint: STATIC_HINT,
    },
    async (uri) => {
      const literal: Record<string, unknown> = {};
      for (const id of LITERAL_CODELISTS) literal[id] = (generated as Record<string, unknown>)[id.replace(/[^A-Za-z0-9_]/g, "_")];
      const doc = {
        provenance: { runId: MANIFEST.runId, observedAt: MANIFEST.observedAt },
        corpus: MANIFEST.corpus,
        tables: TABLES,
        options: { literal, branded: BRANDED_CODELISTS },
      };
      return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(doc) }] };
    },
  );

  let openapiCache: string | undefined;
  server.registerResource(
    "openapi",
    "abs://openapi",
    { title: "OpenAPI 3.1 document", description: "The HTTP API's specification, generated from the same contract as these tools.", mimeType: "application/json", cacheHint: STATIC_HINT },
    async (uri) => {
      if (!openapiCache) {
        const generator = new OpenAPIGenerator({ schemaConverters: [new ZodToJsonSchemaConverter()] });
        openapiCache = JSON.stringify(await generator.generate(httpContract, { info: OPENAPI_INFO, servers: [{ url: "/api" }] }));
      }
      return { contents: [{ uri: uri.href, mimeType: "application/json", text: openapiCache }] };
    },
  );

  // Per-table resource: abs://table/CPI. Not enumerated in resources/list (1,227
  // entries would swamp it) — readable directly once a table id is known, and
  // completable: a client that offers completion suggests ids as they are typed.
  server.registerResource(
    "table",
    new ResourceTemplate("abs://table/{id}", { list: undefined, complete: { id: completeTableId } }),
    { title: "A table's description", description: "Key structure, coverage and options for one table — the same as describe_table.", mimeType: "application/json" },
    async (uri, variables) => {
      const id = String(variables["id"] ?? "");
      const described = await catalogue.describeTable(id);
      const text = described ? JSON.stringify(described, null, 2) : JSON.stringify({ error: `No table "${id}" serves data.` });
      return { contents: [{ uri: uri.href, mimeType: "application/json", text }] };
    },
  );
}
