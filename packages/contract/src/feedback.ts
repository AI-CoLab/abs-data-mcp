/**
 * Feedback: one shape for every way in (DESIGN.md decision 33). The web form,
 * the MCP `submit_feedback` tool and the in-chat feedback view all send this,
 * and the Worker validates it once. Kept flat and $ref-free on purpose: Copilot
 * Studio drops tools whose input schema uses $ref and truncates type arrays.
 */
import { z } from "zod";

/** What the feedback is about. "abs" marks a report about ABS's own data or API
 *  (wrong figures, a broken endpoint) rather than this connector — the maintainers
 *  can pass those on to ABS. */
export const FEEDBACK_ABOUT = ["connector", "abs"] as const;
export type FeedbackAbout = (typeof FEEDBACK_ABOUT)[number];

export const FEEDBACK_KINDS = ["bug", "data", "missing", "idea", "docs", "praise", "other"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

/** The words a form shows for each kind. */
export const FEEDBACK_KIND_LABELS: Record<FeedbackKind, string> = {
  bug: "Something broke or behaved oddly",
  data: "A number or label looks wrong",
  missing: "A table or option I expected is missing",
  idea: "An idea or improvement",
  docs: "The guides or descriptions were unclear",
  praise: "It worked well",
  other: "Something else",
};

export const FEEDBACK_ABOUT_LABELS: Record<FeedbackAbout, string> = {
  connector: "This connector (the tools, the guides, this site)",
  abs: "ABS's own data or API",
};

/** Where a submission came from. Set by the Worker, never by the caller. */
export const FEEDBACK_CHANNELS = ["web", "mcp", "mcp-view"] as const;
export type FeedbackChannel = (typeof FEEDBACK_CHANNELS)[number];

export const FEEDBACK_STATUSES = ["new", "triaged", "forwarded", "closed"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const SUMMARY_MAX = 200;
export const DETAILS_MAX = 5000;

export const feedbackInputSchema = z.object({
  kind: z.enum(FEEDBACK_KINDS).describe(
    "bug: something broke; data: a figure or label looks wrong; missing: an expected table or option is absent; idea: an improvement; docs: unclear guidance; praise: it worked well; other",
  ),
  about: z
    .enum(FEEDBACK_ABOUT)
    .default("connector")
    .describe("connector: this connector or its site; abs: ABS's own data or API (so it can be passed on to ABS)"),
  summary: z.string().trim().min(3).max(SUMMARY_MAX).describe("One line, in the person's own words"),
  details: z
    .string()
    .trim()
    .max(DETAILS_MAX)
    .optional()
    .describe("What happened and what was expected. No personal information about anyone."),
  tool: z.string().max(64).optional().describe("The tool involved, e.g. get_data"),
  table: z.string().max(64).optional().describe("The ABS table id involved, e.g. CPI"),
  selection: z
    .string()
    .max(1000)
    .optional()
    .describe("The selection or query involved, as JSON or the SDMX key"),
  error: z.string().max(1000).optional().describe("The error reason or message returned, if any"),
  assistant: z.string().max(80).optional().describe("The AI tool in use, e.g. Claude, ChatGPT, Copilot"),
  contact: z
    .email()
    .max(254)
    .optional()
    .describe("Only if the person chose to give an email address for a reply. Never guess or fill one in."),
  shareWithAbs: z
    .boolean()
    .default(false)
    .describe("Only true if the person agreed this may be passed on to ABS, contact address included"),
});
export type FeedbackInput = z.input<typeof feedbackInputSchema>;
export type FeedbackParsed = z.output<typeof feedbackInputSchema>;

/**
 * The web form's body: the same fields plus a spam trap — a hidden field people
 * never fill. Only the web route reads it (a filled trap gets a normal-looking
 * answer and is not stored); it is not part of the tool, so an assistant can
 * never trip it by mistake.
 */
export const FEEDBACK_HONEYPOT_FIELD = "website";
export const webFeedbackInputSchema = feedbackInputSchema.extend({
  [FEEDBACK_HONEYPOT_FIELD]: z.string().max(200).optional(),
});
export type WebFeedbackInput = z.input<typeof webFeedbackInputSchema>;

export const feedbackOutputSchema = z.object({
  id: z.string().describe("Reference for this submission, e.g. FB-7Q2K9C"),
  receivedAt: z.string(),
  message: z.string(),
});
export type FeedbackOutput = z.infer<typeof feedbackOutputSchema>;

/** The draft the `feedback_form` tool hands its view: the same fields, all optional. */
export const feedbackDraftSchema = feedbackInputSchema.partial();
export type FeedbackDraft = z.infer<typeof feedbackDraftSchema>;

export const feedbackFormOutputSchema = z.object({
  draft: feedbackDraftSchema,
  /** What the person (or the model, on a host without the view) should do next. */
  next: z.string(),
});
export type FeedbackFormOutput = z.infer<typeof feedbackFormOutputSchema>;

/** One stored submission, as the admin page reads it. */
export const feedbackRecordSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  channel: z.enum(FEEDBACK_CHANNELS),
  kind: z.enum(FEEDBACK_KINDS),
  about: z.enum(FEEDBACK_ABOUT),
  summary: z.string(),
  details: z.string().nullable(),
  tool: z.string().nullable(),
  table: z.string().nullable(),
  selection: z.string().nullable(),
  error: z.string().nullable(),
  assistant: z.string().nullable(),
  clientName: z.string().nullable(),
  clientVersion: z.string().nullable(),
  contact: z.string().nullable(),
  shareWithAbs: z.boolean(),
  runId: z.string(),
  status: z.enum(FEEDBACK_STATUSES),
  adminNote: z.string().nullable(),
});
export type FeedbackRecord = z.infer<typeof feedbackRecordSchema>;

export const feedbackUpdateSchema = z.object({
  status: z.enum(FEEDBACK_STATUSES).optional(),
  adminNote: z.string().max(2000).nullable().optional(),
});
export type FeedbackUpdate = z.infer<typeof feedbackUpdateSchema>;
