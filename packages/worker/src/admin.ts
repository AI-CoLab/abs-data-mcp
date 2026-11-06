/**
 * The maintainers' feedback inbox API (DESIGN.md decision 33), read by /admin.
 *
 *   GET   /api/admin/feedback?status=&about=&channel=&limit=&offset=
 *   PATCH /api/admin/feedback/{id}     { status?, adminNote? }
 *
 * Bearer token (the FEEDBACK_ADMIN_TOKEN secret), compared in constant time. No
 * token configured means the API refuses (503) — it is never open by omission.
 * At the move to app-kit this becomes the maintainer standing's class beside the
 * public one, behind the platform's sign-in instead of a shared token.
 */
import { FEEDBACK_ABOUT, FEEDBACK_CHANNELS, FEEDBACK_STATUSES, feedbackUpdateSchema } from "@abs/contract/feedback";
import type { Env } from "./env.ts";
import { listFeedback, updateFeedback } from "./feedback.ts";

const HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } as const;
const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body, null, 2), { status, headers: HEADERS });

async function authorised(env: Env, request: Request): Promise<boolean> {
  const expected = env.FEEDBACK_ADMIN_TOKEN;
  if (!expected) return false;
  const given = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1]?.trim() ?? "";
  const enc = new TextEncoder();
  // Hash both sides first so the comparison is constant-time whatever the lengths.
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(given)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b) && given.length > 0;
}

const oneOf = (allowed: readonly string[], value: string | null): string | undefined =>
  value && allowed.includes(value) ? value : undefined;

export async function handleAdmin(request: Request, url: URL, env: Env): Promise<Response | undefined> {
  if (!url.pathname.startsWith("/api/admin/")) return undefined;
  if (!env.FEEDBACK_ADMIN_TOKEN) return json({ error: "the admin API is not configured (set FEEDBACK_ADMIN_TOKEN)" }, 503);
  if (!(await authorised(env, request))) return json({ error: "unauthorised" }, 401);

  if (url.pathname === "/api/admin/feedback" && request.method === "GET") {
    const p = url.searchParams;
    const limit = Math.min(200, Math.max(1, Number(p.get("limit") ?? 50) || 50));
    const offset = Math.max(0, Number(p.get("offset") ?? 0) || 0);
    return json(
      await listFeedback(env, {
        status: oneOf(FEEDBACK_STATUSES, p.get("status")),
        about: oneOf(FEEDBACK_ABOUT, p.get("about")),
        channel: oneOf(FEEDBACK_CHANNELS, p.get("channel")),
        limit,
        offset,
      }),
    );
  }

  const one = /^\/api\/admin\/feedback\/(FB-[0-9A-Z]{6})$/.exec(url.pathname);
  if (one?.[1] && request.method === "PATCH") {
    const body: unknown = await request.json().catch(() => undefined);
    const parsed = feedbackUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: "invalid", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, 400);
    }
    const updated = await updateFeedback(env, one[1], parsed.data);
    return updated ? json(updated) : json({ error: "not found" }, 404);
  }

  return json({ error: "not found" }, 404);
}
