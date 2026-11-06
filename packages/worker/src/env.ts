export interface Env {
  CATALOGUE: D1Database;
  RAW_ARCHIVE: R2Bucket;
  /** Worker Loader (Dynamic Workers, open beta). Absent when the account lacks it. */
  LOADER?: WorkerLoader;
  /** Rate Limiting bindings, one per tier (limits.ts). Absent = unlimited (local dev). */
  READS?: RateLimit;
  UPSTREAM?: RateLimit;
  EXECUTE?: RateLimit;
  /** Feedback writes (web form and submit_feedback), per client IP (decision 33). */
  FEEDBACK?: RateLimit;
  /** The built pages (packages/site/dist/pages): the landing page, /admin, their assets. */
  ASSETS?: Fetcher;
  /** Bearer token for /api/admin/*. Unset = the admin API answers 503, never open. */
  FEEDBACK_ADMIN_TOKEN?: string;
  /** Salt for the daily sender hash. Unset in local dev; set as a secret in production. */
  FEEDBACK_SALT?: string;
}

export const ABS_BASE = "https://data.api.abs.gov.au/rest";

/**
 * Headers for every upstream call. ABS sits behind CloudFront, which answers
 * 403 to requests without a User-Agent — and workerd sends none by default, so
 * the first Worker-originated oracle checks all failed closed. Identify
 * ourselves explicitly, always.
 */
export function absHeaders(accept: string): Record<string, string> {
  return {
    accept,
    "user-agent": "abs-data-front-door/0.1 (+https://github.com/AI-CoLab/abs-data-mcp)",
  };
}
