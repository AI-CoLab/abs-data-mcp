/**
 * The REST projection of an operation catalogue (DESIGN.md decision 34): each
 * operation's `rest` binding as a route under a base path. Deliberately small —
 * app-kit's `restRouter` (Hono + chanfana, with its own OpenAPI document) takes
 * this file's place when the front door moves, and the operations do not change.
 *
 * Errors carry the same meanings on every surface: invalid input is 400 with the
 * issues, NotFound 404, Refused 409 — or 429 with Retry-After when the refusal
 * says when to come back.
 */
import { z } from "zod";
import { type AnyOperation, type Call, NotFound, Refused } from "./define.ts";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } as const;

const json = (body: unknown, status: number, extra: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body, null, 2), { status, headers: { ...JSON_HEADERS, ...extra } });

const callOf = (request: Request): Call => ({ signal: request.signal, progress: () => {}, log: () => {} });

/** Match a path template (`/feedback/{id}`) against a path; the variables, or null. */
function match(template: string, path: string): Record<string, string> | null {
  const t = template.split("/");
  const p = path.split("/");
  if (t.length !== p.length) return null;
  const vars: Record<string, string> = {};
  for (let i = 0; i < t.length; i++) {
    const seg = t[i] ?? "";
    const got = p[i] ?? "";
    const v = /^\{(.+)\}$/.exec(seg);
    if (v?.[1]) vars[v[1]] = decodeURIComponent(got);
    else if (seg !== got) return null;
  }
  return vars;
}

/**
 * Serve `request` from the catalogue if a binding matches; undefined otherwise, so
 * the caller can fall through to its other doors.
 */
export async function serveRest<Ctx>(
  request: Request,
  url: URL,
  catalogue: readonly AnyOperation<Ctx>[],
  base: string,
  ctxFor: (request: Request) => Ctx,
): Promise<Response | undefined> {
  if (!url.pathname.startsWith(base)) return undefined;
  const path = url.pathname.slice(base.length) || "/";
  for (const operation of catalogue) {
    const vars = match(operation.rest.path, path);
    if (!vars) continue;
    if (request.method !== operation.rest.method) {
      return json({ error: "method not allowed", allow: operation.rest.method }, 405, { allow: operation.rest.method });
    }
    let raw: Record<string, unknown> = { ...vars };
    if (operation.rest.method === "GET") {
      for (const [k, v] of url.searchParams) raw[k] = v;
    } else {
      const contentType = request.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) return json({ error: "send JSON (content-type: application/json)" }, 415);
      const body: unknown = await request.json().catch(() => undefined);
      if (typeof body !== "object" || body === null || Array.isArray(body)) return json({ error: "the body must be a JSON object" }, 400);
      raw = { ...(body as Record<string, unknown>), ...vars };
    }
    const parsed = operation.input.safeParse(raw);
    if (!parsed.success) {
      return json(
        { error: "invalid", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
        400,
      );
    }
    try {
      const result = await operation.handler(parsed.data, ctxFor(request), callOf(request));
      return json(result, operation.rest.method === "POST" ? 201 : 200);
    } catch (error) {
      if (error instanceof NotFound) return json({ error: "not found", message: error.message }, 404);
      if (error instanceof Refused) {
        if (error.retryAfterSeconds !== undefined) {
          return json(
            { reason: "rate_limited", message: error.message, retryAfterSeconds: error.retryAfterSeconds },
            429,
            { "retry-after": String(error.retryAfterSeconds) },
          );
        }
        return json({ error: "refused", message: error.message }, 409);
      }
      if (error instanceof z.ZodError) return json({ error: "invalid", issues: error.issues }, 400);
      throw error;
    }
  }
  return undefined;
}
