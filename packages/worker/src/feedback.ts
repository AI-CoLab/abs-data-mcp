/**
 * Feedback (DESIGN.md decision 33): two operations in the front door's catalogue,
 * written against ./ops/define (app-kit's shape), and the storage behind them.
 *
 *   feedback_form    read-only. Opens the in-chat feedback view prefilled with the
 *                    model's draft; the person edits and sends it from the view.
 *                    Nothing is sent by this tool. On a host without views, its
 *                    answer tells the model to confirm in chat before sending.
 *   submit_feedback  the write. The tool (a host asks before running a write), the
 *                    view's Send button (through the host), and the web form
 *                    (POST /api/feedback) all arrive here.
 *
 * Abuse is made cheap rather than blocked, as for the rest of the door (decision
 * 22): a per-minute edge limit (limits.ts FEEDBACK), a per-sender daily cap and a
 * global daily cap in D1, length caps in the schema, and a spam trap on the web
 * route. No IP address is stored: the sender key is a salted hash that changes
 * every UTC day.
 */
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { MANIFEST } from "@abs/contract";
import {
  FEEDBACK_ABOUT,
  FEEDBACK_CHANNELS,
  FEEDBACK_KINDS,
  FEEDBACK_STATUSES,
  type FeedbackChannel,
  type FeedbackRecord,
  type FeedbackUpdate,
  feedbackDraftSchema,
  feedbackFormOutputSchema,
  feedbackInputSchema,
  feedbackOutputSchema,
} from "@abs/contract/feedback";
import * as tables from "@abs/schema/tables";
import type { Env } from "./env.ts";
import { operationsFor, Refused } from "./ops/define.ts";
import { feedbackView } from "./views.ts";

/** Who is calling and through which door: built per request by each surface. */
export interface DoorCtx {
  env: Env;
  channel: FeedbackChannel;
  /** The client's address, for the daily sender hash only. Never stored. */
  ip: string;
  /** The MCP client, from clientInfo, when the request carried it. */
  client?: { name?: string | undefined; version?: string | undefined } | undefined;
}

const define = operationsFor<DoorCtx>();

/** Per sender per UTC day, and for everyone per UTC day. */
export const FEEDBACK_DAILY_PER_SENDER = 20;
export const FEEDBACK_DAILY_TOTAL = 1000;

// ------------------------------------------------------------- identifiers

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32: no I, L, O, U

/** "FB-" + 6 characters: ~10^9 values, short enough to read out or quote back. */
export function feedbackId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let out = "FB-";
  for (const b of bytes) out += ALPHABET[b % 32];
  return out;
}

const utcDay = (d: Date): string => d.toISOString().slice(0, 10);

/** A per-day rate key: SHA-256 of salt, UTC date and address. Useless across days. */
export async function senderHash(env: Env, ip: string, now: Date): Promise<string> {
  const salt = env.FEEDBACK_SALT ?? "abs-front-door-local";
  const data = new TextEncoder().encode(`${salt}|${utcDay(now)}|${ip}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return [...digest.slice(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const secondsToUtcMidnight = (now: Date): number => {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(60, Math.ceil((next - now.getTime()) / 1000));
};

/** Strip control characters (keeping newlines and tabs) from free text. */
const clean = (s: string | undefined): string | undefined =>
  s === undefined ? undefined : s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim() || undefined;

// --------------------------------------------------------------- operations

export const feedbackForm = define({
  name: "feedback_form",
  summary: "Open a feedback form",
  description:
    "Open a feedback form for the person, prefilled with your draft, so they can report a problem or suggest an " +
    "improvement to this ABS connector — or flag something wrong in ABS's own data. Use it whenever the person wants " +
    "to give feedback, or agrees when you offer after something went wrong. Fill in what you know from the " +
    "conversation: kind, a one-line summary in their words, details, and the tool, table, selection and error " +
    "involved. Never include personal information about anyone, and never fill in a contact email the person did " +
    "not give you. This tool sends nothing: on hosts that show interactive views the person reviews, edits and " +
    "sends the form themselves; elsewhere, follow the `next` field.",
  input: feedbackDraftSchema,
  output: feedbackFormOutputSchema,
  rest: { method: "POST", path: "/feedback/form" },
  mcpAppView: feedbackView,
  handler: async (draft) => ({
    draft,
    next:
      "If a feedback form is showing, the person can edit and send it there — do not also call submit_feedback. " +
      "If no form is showing (this host does not display interactive views), show the person this draft in the " +
      "chat, ask them to confirm or change it (and whether they want to add an email address for a reply, or let " +
      "ABS see a data report), and only after they say yes call submit_feedback with the final text.",
  }),
});

export const submitFeedback = define({
  name: "submit_feedback",
  summary: "Send feedback to the maintainers",
  description:
    "Send feedback about this ABS connector (or a report about ABS's own data) to its maintainers. Only call this " +
    "after the person has seen the exact text and said to send it — prefer feedback_form, which lets them edit it " +
    "first. Use about='abs' for wrong figures or broken behaviour in ABS's own data or API; set shareWithAbs only " +
    "if the person agreed it may be passed on to ABS. Never include personal information about anyone, and include " +
    "a contact email only if the person gave one for a reply. Returns a reference like FB-7Q2K9C to give the person.",
  input: feedbackInputSchema,
  output: feedbackOutputSchema,
  rest: { method: "POST", path: "/feedback" },
  // A write that adds a row and changes nothing else: hosts ask before running it.
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    const now = new Date();
    const db = drizzle(ctx.env.CATALOGUE, { schema: tables });
    const hash = await senderHash(ctx.env, ctx.ip, now);
    const dayStart = `${utcDay(now)}T00:00:00.000Z`;

    const [mine] = await db
      .select({ n: count() })
      .from(tables.feedback)
      .where(and(eq(tables.feedback.senderHash, hash), gte(tables.feedback.createdAt, dayStart)));
    if ((mine?.n ?? 0) >= FEEDBACK_DAILY_PER_SENDER) {
      throw new Refused(
        `Thank you — that is ${FEEDBACK_DAILY_PER_SENDER} pieces of feedback from this address today, the daily limit. ` +
          "Please try again tomorrow, or open an issue at https://github.com/AI-CoLab/abs-data-mcp/issues.",
        secondsToUtcMidnight(now),
      );
    }
    const [all] = await db.select({ n: count() }).from(tables.feedback).where(gte(tables.feedback.createdAt, dayStart));
    if ((all?.n ?? 0) >= FEEDBACK_DAILY_TOTAL) {
      throw new Refused(
        "The feedback inbox has reached its daily limit. Please try again tomorrow, or open an issue at " +
          "https://github.com/AI-CoLab/abs-data-mcp/issues.",
        secondsToUtcMidnight(now),
      );
    }

    const row = {
      id: feedbackId(),
      createdAt: now.toISOString(),
      channel: ctx.channel,
      kind: input.kind,
      about: input.about,
      summary: clean(input.summary) ?? input.summary,
      details: clean(input.details) ?? null,
      tool: clean(input.tool) ?? null,
      tableId: clean(input.table) ?? null,
      selection: clean(input.selection) ?? null,
      error: clean(input.error) ?? null,
      assistant: clean(input.assistant) ?? null,
      clientName: ctx.client?.name?.slice(0, 120) ?? null,
      clientVersion: ctx.client?.version?.slice(0, 60) ?? null,
      contact: input.contact ?? null,
      shareWithAbs: input.about === "abs" && input.shareWithAbs,
      runId: MANIFEST.runId,
      status: "new",
      adminNote: null,
      senderHash: hash,
    };
    await db.insert(tables.feedback).values(row);
    console.log(`feedback ${row.id}: ${row.channel} ${row.kind}/${row.about}${row.clientName ? ` via ${row.clientName}` : ""}`);
    return {
      id: row.id,
      receivedAt: row.createdAt,
      message:
        `Thank you — your feedback was received as ${row.id}. ` +
        (row.contact ? "The maintainers may reply to the address you gave. " : "") +
        "Quote the reference if you want to follow it up or have it removed.",
    };
  },
});

/** The front door's operation catalogue: what ./ops/mcp and ./ops/rest project. */
export const catalogue = [feedbackForm, submitFeedback];

// ------------------------------------------------------------ admin reads

type Row = typeof tables.feedback.$inferSelect;

const asRecord = (r: Row): FeedbackRecord => ({
  id: r.id,
  createdAt: r.createdAt,
  channel: (FEEDBACK_CHANNELS as readonly string[]).includes(r.channel) ? (r.channel as FeedbackRecord["channel"]) : "web",
  kind: (FEEDBACK_KINDS as readonly string[]).includes(r.kind) ? (r.kind as FeedbackRecord["kind"]) : "other",
  about: (FEEDBACK_ABOUT as readonly string[]).includes(r.about) ? (r.about as FeedbackRecord["about"]) : "connector",
  summary: r.summary,
  details: r.details,
  tool: r.tool,
  table: r.tableId,
  selection: r.selection,
  error: r.error,
  assistant: r.assistant,
  clientName: r.clientName,
  clientVersion: r.clientVersion,
  contact: r.contact,
  shareWithAbs: r.shareWithAbs,
  runId: r.runId,
  status: (FEEDBACK_STATUSES as readonly string[]).includes(r.status) ? (r.status as FeedbackRecord["status"]) : "new",
  adminNote: r.adminNote,
});

export interface FeedbackQuery {
  status?: string | undefined;
  about?: string | undefined;
  channel?: string | undefined;
  limit: number;
  offset: number;
}

export async function listFeedback(env: Env, q: FeedbackQuery): Promise<{ total: number; items: FeedbackRecord[] }> {
  const db = drizzle(env.CATALOGUE, { schema: tables });
  const f = tables.feedback;
  const where = and(
    q.status ? eq(f.status, q.status) : undefined,
    q.about ? eq(f.about, q.about) : undefined,
    q.channel ? eq(f.channel, q.channel) : undefined,
  );
  const [total] = await db.select({ n: count() }).from(f).where(where);
  const rows = await db.select().from(f).where(where).orderBy(desc(f.createdAt)).limit(q.limit).offset(q.offset);
  return { total: total?.n ?? 0, items: rows.map(asRecord) };
}

export async function updateFeedback(env: Env, id: string, update: FeedbackUpdate): Promise<FeedbackRecord | undefined> {
  const db = drizzle(env.CATALOGUE, { schema: tables });
  const f = tables.feedback;
  const set: Partial<Row> = {};
  if (update.status) set.status = update.status;
  if (update.adminNote !== undefined) set.adminNote = update.adminNote;
  if (Object.keys(set).length > 0) await db.update(f).set(set).where(eq(f.id, id));
  const [row] = await db.select().from(f).where(eq(f.id, id)).limit(1);
  return row ? asRecord(row) : undefined;
}

/** For tests and the admin page's header: how many are waiting. */
export async function countNew(env: Env): Promise<number> {
  const db = drizzle(env.CATALOGUE, { schema: tables });
  const [r] = await db.select({ n: sql<number>`count(*)` }).from(tables.feedback).where(eq(tables.feedback.status, "new"));
  return r?.n ?? 0;
}
