/**
 * Feedback from the people using the front door (DESIGN.md decision 33): the
 * web form, the MCP `submit_feedback` tool and the in-chat feedback view all
 * write here. Not catalogue data — it never joins the declared or observed
 * groups, and the crawler never touches it.
 *
 * Privacy by construction: no IP address is stored, only a salted hash that
 * changes daily (enough to cap submissions per sender per day, useless for
 * tracking anyone across days). Contact is optional and given by the person.
 * `share_with_abs` records their consent to pass a report on to ABS.
 */
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const feedback = sqliteTable(
  "feedback",
  {
    /** "FB-" + 6 base32 characters: short enough to quote back. */
    id: text("id").primaryKey(),
    createdAt: text("created_at").notNull(),
    /** "web" | "mcp" | "mcp-view" — set by the Worker, never the caller. */
    channel: text("channel").notNull(),
    /** "bug" | "data" | "missing" | "idea" | "docs" | "praise" | "other" */
    kind: text("kind").notNull(),
    /** "connector" | "abs" — "abs" is about ABS's own data or API. */
    about: text("about").notNull(),
    summary: text("summary").notNull(),
    details: text("details"),
    /** What the person was doing, when they (or their assistant) said. */
    tool: text("tool"),
    tableId: text("table_id"),
    selection: text("selection"),
    error: text("error"),
    /** The AI tool the person named, and the MCP client that sent it (clientInfo). */
    assistant: text("assistant"),
    clientName: text("client_name"),
    clientVersion: text("client_version"),
    contact: text("contact"),
    shareWithAbs: integer("share_with_abs", { mode: "boolean" }).notNull().default(false),
    /** The catalogue observation the connector was answering from. */
    runId: text("run_id").notNull(),
    /** "new" | "triaged" | "forwarded" | "closed" */
    status: text("status").notNull().default("new"),
    adminNote: text("admin_note"),
    /** SHA-256 of (salt, UTC date, client IP): a per-day rate key, not an identity. */
    senderHash: text("sender_hash").notNull(),
  },
  (t) => [
    index("feedback_time_idx").on(t.createdAt),
    index("feedback_status_idx").on(t.status, t.createdAt),
    index("feedback_sender_idx").on(t.senderHash, t.createdAt),
  ],
);
