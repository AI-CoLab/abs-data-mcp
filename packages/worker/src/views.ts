/**
 * The front door's MCP App views (DESIGN.md decision 35): one built HTML file
 * each (packages/site, `pnpm build:views`), imported as text and served as a
 * `ui://` resource whose URI carries a hash of the file.
 *
 *   feedback  the feedback form, prefilled by the model (feedback_form); the
 *             person edits and sends it. Sends through the host to
 *             submit_feedback; where the host cannot proxy calls, POSTs to the
 *             web endpoint, hence the one connect domain.
 *   data      get_data's result as a chart and a table, with the full-pull link.
 *
 * The same components could be mounted on the front door's own pages over the
 * HTTP door — app-kit's "one view, two hosts" — through the ViewHost seam they
 * are written against (packages/site/src/views/view-host.ts).
 */
import feedbackHtml from "../../site/dist/views/feedback/index.html";
import dataHtml from "../../site/dist/views/data/index.html";
import { defineMcpAppView } from "./ops/define.ts";

const PRODUCTION_ORIGIN = "https://abs-data-front-door.aicolab.workers.dev";

export const feedbackView = defineMcpAppView({
  name: "abs-data-feedback",
  html: feedbackHtml,
  description: "A feedback form the person reviews, edits and sends themselves.",
  ui: { csp: { connectDomains: [PRODUCTION_ORIGIN] }, prefersBorder: true },
});

export const dataView = defineMcpAppView({
  name: "abs-data-chart",
  html: dataHtml,
  description: "ABS observations as a line chart and a table, with the link to the complete pull.",
  ui: { prefersBorder: true },
});
