/**
 * ABS Data API front door — one Worker, several doors, one observed contract.
 *
 *   POST /mcp                 MCP 2026-07-28 (stateless), four fixed verbs + Code Mode
 *   POST /rpc                 Cap'n Web RPC door (HTTP batch; GET upgrades to WebSocket) — the SDK's transport
 *   GET  /api/...             HTTP door (oRPC): /api/tables, /api/tables/{id}, ...
 *   GET  /api/docs            Scalar reference
 *   GET  /api/openapi.json    the corrected OpenAPI document
 *   POST /api/feedback        feedback from the web form (decision 33); the same operation as submit_feedback
 *   *    /api/admin/...       the maintainers' feedback inbox API (bearer token)
 *   GET  /                    the landing page for a browser; provenance and links as JSON for anything else
 *   GET  /admin               the feedback inbox page
 *
 * Every door answers from the same observed catalogue; none hardcodes the
 * surface. Availability is always empirical: observed options from D1, exact
 * combination checks live against ABS (decision 24). Cache-first (decision 22).
 */
import { CLIENT_CAPABILITIES_META_KEY, type ClientCapabilities, createMcpHandler } from "@modelcontextprotocol/server";
import { BRANDED_CODELISTS, LITERAL_CODELISTS, MANIFEST, TABLES } from "@abs/contract";
import { FEEDBACK_HONEYPOT_FIELD } from "@abs/contract/feedback";
import * as options from "@abs/contract/generated";
import type { Env } from "./env.ts";
import { Catalogue } from "./catalogue.ts";
import cataloguePage from "../../../artifact/abs-cartography.html";

// Named entrypoint handed to Code Mode sandboxes via ctx.exports (decision 21).
export { AbsToolsEntrypoint } from "./codemode.ts";
import { buildMcpServer } from "./mcp.ts";
import { httpHandler } from "./http.ts";
import { recentChecks, runRefreshCheck } from "./refresh.ts";
import { handleRpc } from "./rpc.ts";
import { classify, enforce, limitedResponse } from "./limits.ts";
import { handleAdmin } from "./admin.ts";
import { catalogue as operations, feedbackId, type DoorCtx } from "./feedback.ts";
import { serveRest } from "./ops/rest.ts";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" } as const;

/** The public feedback endpoint answers any origin: the in-chat view may post from a sandboxed frame. */
const FEEDBACK_CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, x-abs-channel",
  "access-control-max-age": "86400",
} as const;

const PAGE_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
} as const;

/** Wants a page rather than data: a browser navigation. */
const wantsHtml = (request: Request): boolean => (request.headers.get("accept") ?? "").includes("text/html");

/** The capabilities an MCP request declared in its 2026-07-28 envelope, if any. */
async function declaredClient(request: Request): Promise<ClientCapabilities | undefined> {
  if (request.method !== "POST") return undefined;
  const body: unknown = await request.clone().json().catch(() => undefined);
  const params = (body as { params?: { _meta?: Record<string, unknown> } } | undefined)?.params;
  const caps = params?._meta?.[CLIENT_CAPABILITIES_META_KEY];
  return caps && typeof caps === "object" ? (caps as ClientCapabilities) : undefined;
}

/** Serve a built page or asset, with the page headers; undefined when there are no assets (tests, bare dev). */
async function asset(env: Env, request: Request, path?: string): Promise<Response | undefined> {
  if (!env.ASSETS) return undefined;
  const target = path ? new Request(new URL(path, request.url), request) : request;
  const res = await env.ASSETS.fetch(target);
  if (res.status === 404) return undefined;
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(PAGE_HEADERS)) out.headers.set(k, v);
  return out;
}

/**
 * The web form's door to submit_feedback. A filled spam trap gets an answer that
 * looks like success and nothing is stored; otherwise the trap is removed and the
 * body goes to the operation like any other.
 */
async function webFeedback(request: Request, url: URL, env: Env): Promise<Response> {
  const body: unknown = await request.clone().json().catch(() => undefined);
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const record = body as Record<string, unknown>;
    if (typeof record[FEEDBACK_HONEYPOT_FIELD] === "string" && record[FEEDBACK_HONEYPOT_FIELD] !== "") {
      const id = feedbackId();
      return new Response(
        JSON.stringify({ id, receivedAt: new Date().toISOString(), message: `Thank you — your feedback was received as ${id}.` }),
        { status: 201, headers: { ...JSON_HEADERS, ...FEEDBACK_CORS, "cache-control": "no-store" } },
      );
    }
    delete record[FEEDBACK_HONEYPOT_FIELD];
    request = new Request(request, { body: JSON.stringify(record) });
  }
  const channel = request.headers.get("x-abs-channel") === "mcp-view" ? "mcp-view" : "web";
  const ctxFor = (r: Request): DoorCtx => ({ env, channel, ip: r.headers.get("cf-connecting-ip") ?? "unknown" });
  const res = (await serveRest(request, url, operations, "/api", ctxFor)) ?? json({ error: "not found" }, 404, 0);
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(FEEDBACK_CORS)) out.headers.set(k, v);
  return out;
}

function json(body: unknown, status = 200, cacheSeconds = 300): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...JSON_HEADERS, "cache-control": `public, max-age=${cacheSeconds}` },
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Rate limits, once, for every door (decision 22): by what the request will
    // cost — a catalogue read, an upstream ABS call, or a sandboxed execute.
    const classified = await classify(request, url);
    const exceeded = await enforce(env, request, classified.tiers);
    if (exceeded) return limitedResponse(exceeded, classified);

    if (url.pathname === "/mcp") {
      // The SDK's own Web-standard handler (it ships a workerd provider): one
      // McpServer per request, no session. What the client declared decides
      // whether tools point at MCP App views; its address keys feedback limits.
      const client = await declaredClient(request);
      const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
      const handler = createMcpHandler(() => buildMcpServer(env, ctx, { ip, client }));
      const response = await handler.fetch(request);
      ctx.waitUntil(handler.close());
      return response;
    }

    // The RPC door (Cap'n Web): what @abs/sdk speaks. One target per request;
    // capnweb handles batch POSTs and WebSocket upgrades itself.
    if (url.pathname === "/rpc") return handleRpc(request, env);

    // The menu as one document — the equivalent of the OpenAPI spec in
    // Cloudflare's two-tool Code Mode: every table, its key structure and
    // coverage, and every small-dimension option with labels (~2MB). Humans grep
    // it; the planned Code Mode `search` tool will read it in a no-network
    // isolate. Large dimensions list their codelist and size; their options are
    // reached through search_options. Cached for a day: it changes per crawl.
    // Must precede the generic /api branch, which would otherwise claim it.
    // Freshness: what the daily checks found. Empty until the first cron run.
    // Precedes the generic /api branch, which would otherwise claim it.
    if (url.pathname === "/api/status") {
      const checks = await recentChecks(env);
      const latest = checks[0];
      return json(
        {
          catalogue: { runId: MANIFEST.runId, observedAt: MANIFEST.observedAt },
          refresh: latest
            ? {
                lastCheckedAt: latest.checkedAt,
                status: latest.status,
                slice: `${latest.slice + 1}/${latest.slices}`,
                newFlows: latest.newFlows,
                removedFlows: latest.removedFlows,
                reversionedFlows: latest.reversionedFlows,
                marginalChanges: latest.marginalChanges,
                errors: latest.errors,
              }
            : null,
          recent: checks.map((c) => ({ checkedAt: c.checkedAt, status: c.status, slice: c.slice, flowsChecked: c.flowsChecked, changes: (c.marginalChanges as unknown[]).length })),
        },
        200,
        300,
      );
    }

    // Feedback (decision 33): the web form's POST and its preflight, then the
    // operation catalogue's other REST bindings, then the maintainers' inbox API.
    // All precede the generic /api branch, which would otherwise claim them.
    if (url.pathname === "/api/feedback") {
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: FEEDBACK_CORS });
      return webFeedback(request, url, env);
    }
    if (url.pathname.startsWith("/api/feedback/")) {
      const ctxFor = (r: Request): DoorCtx => ({ env, channel: "web", ip: r.headers.get("cf-connecting-ip") ?? "unknown" });
      const res = await serveRest(request, url, operations, "/api", ctxFor);
      if (res) return res;
    }
    const admin = await handleAdmin(request, url, env);
    if (admin) return admin;

    if (url.pathname === "/api/catalogue.json") {
      const literal: Record<string, unknown> = {};
      for (const id of LITERAL_CODELISTS) {
        literal[id] = (options as Record<string, unknown>)[id.replace(/[^A-Za-z0-9_]/g, "_")];
      }
      return json(
        {
          provenance: { runId: MANIFEST.runId, observedAt: MANIFEST.observedAt },
          corpus: MANIFEST.corpus,
          verbs: `${url.origin}/api/openapi.json`,
          tables: TABLES,
          options: { literal, branded: BRANDED_CODELISTS },
        },
        200,
        86_400,
      );
    }

    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      const { matched, response } = await httpHandler.handle(request, {
        prefix: "/api",
        context: { catalogue: new Catalogue(env.CATALOGUE) },
      });
      if (matched && response) {
        if (request.method === "GET" && response.ok && !response.headers.has("cache-control")) {
          const cached = new Response(response.body, response);
          cached.headers.set("cache-control", "public, max-age=300");
          return cached;
        }
        return response;
      }
      return json({ error: "not found" }, 404, 0);
    }

    if (url.pathname === "/healthz") return json({ ok: true, runId: MANIFEST.runId }, 200, 0);

    // The browsable catalogue, live on this origin (it detects it can call /api).
    if (url.pathname === "/catalogue") {
      return new Response(cataloguePage, {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=3600" },
      });
    }

    // The pages (packages/site): the landing page for a browser at /, the inbox
    // at /admin, and their hashed assets. Anything asking / for data gets the
    // JSON service description below, as before.
    // Asked by directory ("/", "/admin/"), never by file: the asset handler
    // canonicalises /index.html to /, which would bounce back here forever.
    if (url.pathname === "/" && wantsHtml(request)) {
      const page = await asset(env, request, "/");
      if (page) return page;
    }
    if (url.pathname === "/admin" || url.pathname === "/admin/") {
      const page = await asset(env, request, "/admin/");
      if (page) {
        page.headers.set("x-robots-tag", "noindex, nofollow");
        page.headers.set("content-security-policy", "frame-ancestors 'none'");
        return page;
      }
    }
    if (url.pathname.startsWith("/assets/") || url.pathname === "/icon.svg") {
      const file = await asset(env, request);
      if (file) return file;
    }

    if (url.pathname === "/") {
      return json({
        service: "abs-data-front-door",
        description:
          "The ABS Data API as it actually behaves. Every table and option offered is confirmed to serve data; " +
          "every selection is verified live before fetching.",
        provenance: { runId: MANIFEST.runId, observedAt: MANIFEST.observedAt },
        corpus: MANIFEST.corpus,
        doors: {
          mcp: `${url.origin}/mcp`,
          rpc: `${url.origin}/rpc`,
          api: `${url.origin}/api/tables`,
          docs: `${url.origin}/api/docs`,
          openapi: `${url.origin}/api/openapi.json`,
          catalogue: `${url.origin}/api/catalogue.json`,
          browse: `${url.origin}/catalogue`,
          feedback: `${url.origin}/api/feedback`,
          status: `${url.origin}/api/status`,
        },
        page: `${url.origin}/ (send Accept: text/html for the landing page)`,
      });
    }

    return json({ error: "not found" }, 404, 0);
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runRefreshCheck(env, { now: new Date(controller.scheduledTime) }).then(
        (s) => console.log(`refresh check ${s.id}: ${s.status}; slice ${s.slice + 1}/${s.slices}, ${s.flowsChecked} flows, ${s.marginalChanges.length} marginal changes, ${s.newFlows.length} new, ${s.removedFlows.length} removed, ${s.errors.length} errors, ${s.durationMs}ms`),
        (err) => console.error(`refresh check failed: ${err instanceof Error ? err.stack ?? err.message : String(err)}`),
      ),
    );
  },
} satisfies ExportedHandler<Env>;
