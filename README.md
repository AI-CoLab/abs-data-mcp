# ABS Data — Australian Bureau of Statistics data for your AI assistant

Ask the question you actually have. Add one web address to Claude, ChatGPT or
Copilot, say what you care about, and your assistant finds the right ABS data,
fetches it live, and explains it — with its caveats. Free, anonymous and
read-only.

**Start here: <https://abs-data-front-door.aicolab.workers.dev>** — setup guides
for each AI tool, things to ask, and a feedback form.

An independent, unofficial connector — not an ABS product, and not endorsed by
the Australian Bureau of Statistics. Data: ABS, CC BY 4.0.

| | |
|---|---|
| Front door — setup guides for Claude, ChatGPT, Copilot and developer tools; feedback form | <https://abs-data-front-door.aicolab.workers.dev> |
| Add to claude.ai / any MCP client as a connector | `https://abs-data-front-door.aicolab.workers.dev/mcp` (registry name `io.github.SamJB123/abs-data`) |
| MCP (2026-07-28 stateless; 2025 revisions served too) — 4 fixed verbs, Code Mode `search`/`execute`, `feedback_form`/`submit_feedback`, MCP Apps views (chart, feedback form), resources, prompts, completion | `https://abs-data-front-door.aicolab.workers.dev/mcp` |
| Feedback from the web form (the same operation as `submit_feedback`) | `POST https://abs-data-front-door.aicolab.workers.dev/api/feedback` |
| RPC door (Cap'n Web; what `@abs/sdk` speaks — HTTP batch or WebSocket) | `https://abs-data-front-door.aicolab.workers.dev/rpc` |
| HTTP API | `https://abs-data-front-door.aicolab.workers.dev/api/tables` |
| Scalar reference | <https://abs-data-front-door.aicolab.workers.dev/api/docs> |
| OpenAPI | <https://abs-data-front-door.aicolab.workers.dev/api/openapi.json> |
| The menu as one document | <https://abs-data-front-door.aicolab.workers.dev/api/catalogue.json> |
| Live browsable catalogue | <https://abs-data-front-door.aicolab.workers.dev/catalogue> |
| Static snapshot (claude.ai artifact) | <https://claude.ai/code/artifact/d0635dee-5cce-40dd-bfa2-7ab7dd03e5bd> |

## How it was built

Before offering anything, this project measured what the ABS Data API actually
serves — every dataflow, by retrieval — so the connector only ever offers tables
and options that have data, and a selection that doesn't exist comes back with
the ones that do.

![The ABS Data API cartography: unmasking the 4.21% reality — a comic-style map of the findings and the front door](docs/cartography-comic.png)

- **621,536,714 series** exist across 1,227 dataflows. ABS's metadata implies
  14,761,557,818 — a density of **4.21%**, overstated **23.8×**.
- The per-dimension metadata is **exact**: every advertised option exists, and
  nothing real is unadvertised. The entire overstatement is combinatorial.
- **81.0%** of series sit in flows whose sparsity is principled and verified in
  the keys — almost entirely hierarchical geography encoded as separate
  dimensions (`STATE` is a function of `REGION` in 664 flows). The remaining
  19% is not reducible to a single-dimension dependency.
- `detail=serieskeysonly` — the endpoint that should answer "what exists" — is
  broken (HTTP 200, malformed JSON). Eight of fifteen documented behaviours do
  not conform. See `reports/`.

`DESIGN.md` is the full record: verified API findings, every decision and why,
and the corrections made along the way.

## Layout

```
packages/schema      Drizzle schema (declared vs observed, never joined), shared CSV/period parsing
packages/crawler     structural crawl, observed probe, conformance suite, sizing
packages/catalogue   delta report, sparsity analysis, contract generator, OpenAPI emitter, artifact
packages/contract    the corrected contract: stable Zod verbs + generated tables/options (per crawl)
packages/worker      the front door: MCP door (SDK v2) + HTTP door (oRPC + Scalar) + RPC door (Cap'n Web) on one Worker;
                     src/ops/ holds new operations in @aicolab/app-kit's shape (DESIGN.md decision 34)
packages/site        the pages (landing, /admin) and the MCP App views — Solid 2 + @aicolab/ui-solid, built by Vite
packages/ui-solid    git submodule: the AI CoLab component system (public); packages/solid is its Solid helpers
packages/sdk         @abs/sdk — typed TypeScript client over the RPC door (connect(), invalidSelectionFromError())
tooling/tsconfig     copy of the portal's shared tsconfigs, for the submodules (deleted at the move to app-kit)
reports/             delta.md/json, sparsity.md/json, openapi.json, abs-report-draft.md
data/                local SQLite catalogue (~400GB), raw archive, D1 import SQL — not committed
```

## Running it

```sh
git submodule update --init           # packages/ui-solid and packages/solid
pnpm install
pnpm db:migrate                       # local SQLite at data/abs-catalogue.sqlite

pnpm crawl:structural                 # 7 bulk requests, ~1 minute
pnpm crawl:probe -- '--key-values=*'  # every dataflow by retrieval; ~24h, 20GB heap for the giants
pnpm report:delta && pnpm report:sparsity
pnpm generate:contract                # -> packages/contract/src/generated, data/d1/*.sql
pnpm --filter @abs/catalogue emit:openapi

cd packages/worker
npx wrangler d1 execute abs-catalogue --local --file=../../data/d1/00-schema.sql   # then each data file
npx wrangler d1 execute abs-catalogue --local --file=../schema/migrations/0003_public_micromacro.sql  # feedback table
printf 'FEEDBACK_ADMIN_TOKEN=local-dev-token\nFEEDBACK_SALT=local-dev-salt\n' > .dev.vars  # gitignored
pnpm dev                                                                           # builds packages/site, then wrangler dev
ABS_MCP_URL=http://localhost:8787/mcp FEEDBACK_ADMIN_TOKEN=local-dev-token npx tsx test/protocol.ts  # ~80 checks, all doors
pnpm --filter @abs/sdk example                                                     # the SDK against production
ABS_URL=http://localhost:8787 npx tsx test/limits.ts                               # rate limits (spends a minute's budget)

# The in-chat views in a dev-only MCP Apps host, against the local Worker:
pnpm --filter @abs/site dev            # then http://localhost:5180/harness.html
```

Deploying (`pnpm run deploy` in `packages/worker` builds the site first — not
`pnpm deploy`, which is pnpm's own command) needs, once:
the feedback migration on the remote D1 (`wrangler d1 execute abs-catalogue --remote
--file=../schema/migrations/0003_public_micromacro.sql`) and two secrets
(`wrangler secret put FEEDBACK_ADMIN_TOKEN`, `wrangler secret put FEEDBACK_SALT`).

Rate limits, per client address: 600 requests/min overall; 120/min for data
pulls (each is a live ABS call); 20/min for Code Mode `execute`; 5/min for
feedback (and 20 per day, in D1). Over the limit,
HTTP doors answer 429 with `Retry-After`; an MCP tool call gets a tool error.

Using the SDK from TypeScript:

```ts
import { connect, invalidSelectionFromError } from "@abs/sdk";

const abs = connect(); // https://abs-data-front-door.aicolab.workers.dev/rpc
const [hits, cpi] = await Promise.all([          // one HTTP batch
  abs.searchTables({ query: "cpi rent", limit: 3 }),
  abs.describeTable("CPI"),
]);
try {
  const data = await abs.getData({ table: "CPI", select: { REGION: "Sydney", INDEX: "10001" }, lastN: 4 });
} catch (err) {
  const invalid = invalidSelectionFromError(err); // typed: reason, dimension, validOptions from observation
}
```

The probe is resumable: rerunning skips flows already recorded as complete. For
the largest census flows run with `NODE_OPTIONS=--max-old-space-size=20480`.

Gotcha: wrangler keys the *local* D1 state by `database_id`. Changing the id in
`wrangler.toml` (e.g. after `d1 create`) gives `wrangler dev` a fresh, empty
local database — re-run the local import.

## Principles

- **Observed-only.** Declared metadata steers the crawler and feeds the defect
  report; it never enters what a caller sees. Availability is empirical: observed
  options from the catalogue, exact combination checks live against ABS's
  `availableconstraint` (which agrees with the probe on every dimension of every
  flow).
- **One contract, derived doors.** Every crawl regenerates one contract; the MCP
  verbs, the HTTP routes, the OpenAPI document and the docs all read or render
  it. Nothing hardcodes the surface, so nothing drifts.
- **Only calls that return data.** A selection is verified before it is
  forwarded; an invalid one comes back with the observed valid options — as an
  MRTR `input_required` on MCP, a typed 422 on HTTP.
