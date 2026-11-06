/**
 * Protocol tests for the MCP door (decision 31), run against a live server:
 *
 *   ABS_MCP_URL=http://localhost:8787/mcp npx tsx packages/worker/test/protocol.ts
 *
 * Exercises the 2026-07-28 surface as a client would: server/discover,
 * tools/list (with cache fields), every tool via tools/call, the MRTR
 * input_required path for an invalid option and for an empty combination, and
 * the HTTP door's typed 422, and the RPC door through the SDK. Fails loudly on
 * the first broken expectation.
 */
import { connect, invalidSelectionFromError, type InvalidSelection } from "@abs/sdk";

const MCP_URL = process.env["ABS_MCP_URL"] ?? "http://localhost:8787/mcp";
const API_URL = MCP_URL.replace(/\/mcp$/, "/api");
const PROTOCOL_VERSION = "2026-07-28";

let nextId = 1;
const failures: string[] = [];

function check(condition: unknown, message: string): void {
  if (condition) {
    process.stdout.write(`  ok   ${message}\n`);
  } else {
    failures.push(message);
    process.stdout.write(`  FAIL ${message}\n`);
  }
}

async function rpc(method: string, params: Record<string, unknown> = {}): Promise<any> {
  const body = {
    jsonrpc: "2.0",
    id: nextId++,
    method,
    params: {
      ...params,
      _meta: {
        ...(params["_meta"] as Record<string, unknown> | undefined),
        "io.modelcontextprotocol/protocolVersion": PROTOCOL_VERSION,
        // Declare form elicitation so the server may answer with input_required
        // (MRTR). A client without it must get a typed error instead — tested below.
        // `_ui` also declares the MCP Apps extension, so tools point at their views.
        "io.modelcontextprotocol/clientCapabilities": {
          ...(params["_noElicitation"] ? {} : { elicitation: { form: {} } }),
          ...(params["_ui"] ? { extensions: { "io.modelcontextprotocol/ui": { mimeTypes: ["text/html;profile=mcp-app"] } } } : {}),
        },
        "io.modelcontextprotocol/clientInfo": { name: "abs-protocol-test", version: "0" },
      },
    },
  };
  delete (body.params as Record<string, unknown>)["_noElicitation"];
  delete (body.params as Record<string, unknown>)["_ui"];
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      // Required beside the body envelope in 2026-07-28; SDK 2.4 refuses a request without it.
      "MCP-Protocol-Version": PROTOCOL_VERSION,
      "Mcp-Method": method,
      // Header-based routing (2026-07-28): the named entity travels in Mcp-Name —
      // a tool or prompt name, or a resource URI — and must agree with the body.
      ...(typeof params["name"] === "string"
        ? { "Mcp-Name": params["name"] as string }
        : typeof params["uri"] === "string"
          ? { "Mcp-Name": params["uri"] as string }
          : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  // Streamable HTTP may answer as SSE; take the last data frame.
  const json = text.startsWith("event:") || text.startsWith("data:")
    ? JSON.parse(text.split("\n").filter((l) => l.startsWith("data:")).pop()!.slice(5))
    : JSON.parse(text);
  if (json.error) throw new Error(`${method}: ${JSON.stringify(json.error)}`);
  return json.result;
}

async function callTool(name: string, args: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  // `_noElicitation` is a harness flag, not a tool argument: hoist it to the
  // request level so the client capabilities are what change.
  const { _noElicitation, ...toolArgs } = args;
  return rpc("tools/call", { name, arguments: toolArgs, ...extra, ...(_noElicitation ? { _noElicitation: true } : {}) });
}

process.stdout.write(`MCP door at ${MCP_URL}\n\n`);

// ------------------------------------------------------------ discover/list
process.stdout.write("server/discover\n");
const discover = await rpc("server/discover");
check(Array.isArray(discover.protocolVersions ?? discover.supportedProtocolVersions ?? []) || discover.serverInfo, "returns discovery payload");
check(JSON.stringify(discover).includes("2026-07-28"), "advertises protocol 2026-07-28");

process.stdout.write("tools/list\n");
const list = await rpc("tools/list");
const names = (list.tools as Array<{ name: string }>).map((t) => t.name).sort();
check(["describe_table", "get_data", "search_options", "search_tables"].every((n) => names.includes(n)), `the four fixed verbs are present (${names.join(", ")})`);
check(names.includes("search") && names.includes("execute"), "plus the two Code Mode tools");
check(names.includes("feedback_form") && names.includes("submit_feedback"), "plus the two feedback tools");
check(names.length === 8, `and nothing else (${names.length} tools)`);
check(typeof list.ttlMs === "number" && list.ttlMs > 0, `cacheable: ttlMs=${list.ttlMs}`);
check(list.cacheScope === "public", `cacheable: cacheScope=${list.cacheScope}`);
check(list.tools.every((t: any) => t.inputSchema && t.outputSchema), "every tool has input and output schemas");
// The Claude and ChatGPT directories require both hints on every tool; hosts use them to decide what to confirm.
check(
  list.tools.every((t: any) => typeof t.annotations?.readOnlyHint === "boolean" && typeof t.annotations?.destructiveHint === "boolean" && t.title),
  "every tool has a title and explicit readOnlyHint and destructiveHint",
);
check(
  list.tools.filter((t: any) => t.annotations?.readOnlyHint === false).map((t: any) => t.name).join() === "submit_feedback",
  "submit_feedback is the only write, so it is the only tool a host asks about",
);
check(!list.tools.some((t: any) => t._meta?.ui), "no view pointers for a client that did not declare the UI extension");
check(typeof discover.instructions === "string" && discover.instructions.includes("feedback_form") || JSON.stringify(discover).includes("feedback_form"), "server instructions are advertised");

// -------------------------------------------------------------- search
process.stdout.write("search_tables\n");
const search = await callTool("search_tables", { query: "consumer price index", limit: 5 });
const searchOut = search.structuredContent;
check(searchOut.results.length > 0, `finds tables (${searchOut.total} total)`);
check(searchOut.results.some((r: any) => r.id === "CPI"), "CPI ranks in the top results");
check(typeof searchOut.provenance?.runId === "string", "carries provenance");
check(searchOut.results.every((r: any) => r.seriesCount > 0), "every result serves data");

process.stdout.write("search_tables (option labels)\n");
// Census tables titled "Rent (weekly) by …" legitimately outrank CPI, whose
// "Rents" is one option among 161 — so assert presence on a page, not the top.
const rent = (await callTool("search_tables", { query: "rent", limit: 40 })).structuredContent;
const cpiHit = rent.results.find((r: any) => r.id === "CPI");
check(cpiHit !== undefined, `search 'rent' reaches CPI through its INDEX options (${rent.total} results)`);
check(Array.isArray(cpiHit?.matchedOptions) && cpiHit.matchedOptions.some((m: any) => m.dimension === "INDEX" && /rent/i.test(m.label ?? "")), `matchedOptions names the option (${JSON.stringify(cpiHit?.matchedOptions?.slice(0, 2))})`);
const familyHit = rent.results.find((r: any) => r.family);
check(!familyHit || Array.isArray(familyHit.familyGeographies), "census families collapse with familyGeographies");
const familyIds = rent.results.filter((r: any) => r.family).map((r: any) => r.family);
check(new Set(familyIds).size === familyIds.length, "no family appears twice in one result page");

// ------------------------------------------------------------ describe
process.stdout.write("describe_table\n");
const describe = (await callTool("describe_table", { table: "CPI" })).structuredContent;
check(describe.keyFormat === "MEASURE.INDEX.TSEST.REGION.FREQ", `key format ${describe.keyFormat}`);
const region = describe.dimensions.find((d: any) => d.id === "REGION");
check(region?.options?.length === 9, `REGION lists its 9 observed options inline (${region?.options?.length})`);
const index = describe.dimensions.find((d: any) => d.id === "INDEX");
check(index?.optionCount === 161 && index?.options === undefined, "INDEX (161) is not inlined");

process.stdout.write("describe_table unknown\n");
const unknown = await callTool("describe_table", { table: "NOT_A_TABLE" });
check(unknown.isError === true && unknown.structuredContent?.reason === "unknown_table", "unknown table is a typed error");

// ------------------------------------------------------- search options
process.stdout.write("search_options\n");
const opts = (await callTool("search_options", { table: "CPI", dimension: "INDEX", query: "rent", limit: 10 })).structuredContent;
check(opts.options.length > 0 && opts.options.every((o: any) => typeof o.code === "string"), `finds options by label (${opts.total} matching)`);

// ---------------------------------------------------------------- data
process.stdout.write("get_data (valid, labels in)\n");
const data = (await callTool("get_data", {
  table: "CPI",
  select: { MEASURE: "1", INDEX: "All groups CPI", TSEST: "10", REGION: "50", FREQ: "Q" },
  lastN: 4,
})).structuredContent;
check(data.key === "1.10001.10.50.Q", `label resolved to key ${data.key}`);
check(data.rows.length === 4 && data.rows.every((r: any) => typeof r.value === "number"), "returns 4 numeric observations");
check(data.fullDataUrl.startsWith("https://data.api.abs.gov.au/rest/data/ABS,CPI/1.10001.10.50.Q"), "full-pull URL is the working ABS URL");
check(data.truncated === false, "not truncated");

process.stdout.write("get_data (cap)\n");
const capped = (await callTool("get_data", { table: "CPI", select: { REGION: "50", FREQ: "Q" }, lastN: 4, maxRows: 20 })).structuredContent;
check(capped.rowsReturned === 20 && capped.truncated === true, `caps at maxRows and says so (${capped.rowsReturned}, truncated=${capped.truncated})`);

process.stdout.write("get_data (unknown option -> input_required)\n");
const bad = await callTool("get_data", { table: "CPI", select: { REGION: "Atlantis" } });
check(bad.resultType === "input_required", `MRTR input_required (${bad.resultType})`);
const req = bad.inputRequests?.REGION;
check(req && /Atlantis/.test(req.message ?? JSON.stringify(req)), "asks for REGION with the observed valid options");

process.stdout.write("get_data (impossible combination -> input_required)\n");
const impossible = await callTool("get_data", { table: "CPI", select: { MEASURE: "1", INDEX: "10001", TSEST: "20", REGION: "1", FREQ: "M" } });
check(impossible.resultType === "input_required", `MRTR input_required for empty combination (${impossible.resultType})`);

process.stdout.write("get_data (client without elicitation -> typed error, not protocol error)\n");
const noCap = await callTool("get_data", { table: "CPI", select: { REGION: "Atlantis" }, _noElicitation: true } as Record<string, unknown>);
check(noCap.isError === true && noCap.structuredContent?.reason === "unknown_option", `degrades to typed error (${noCap.structuredContent?.reason})`);
check(Array.isArray(noCap.structuredContent?.validOptions) && noCap.structuredContent.validOptions.length > 0, "typed error still carries the observed valid options");

process.stdout.write("get_data (MRTR retry with correction)\n");
const retried = (await callTool(
  "get_data",
  { table: "CPI", select: { REGION: "Atlantis" }, lastN: 1, maxRows: 5 },
  { inputResponses: { REGION: { action: "accept", content: { value: "50" } } } },
)).structuredContent;
check(retried?.key?.endsWith(".50.") || retried?.key?.includes(".50."), `retry with inputResponses resolves (${retried?.key})`);

// ------------------------------------------------------------- Code Mode
process.stdout.write("code mode: search\n");
const listNow = await rpc("tools/list");
const hasCodeMode = (listNow.tools as Array<{ name: string }>).some((t) => t.name === "execute");
check(hasCodeMode, "search and execute tools are registered");
const cmSearch = await callTool("search", {
  code: "const t = catalogue.tables.CPI; return { dims: t.dimensions.map(d => d.id), tables: Object.keys(catalogue.tables).length, sa2Quarterly: Object.values(catalogue.tables).filter(x => x.geography === 'SA2' && x.frequencies.includes('Q')).length };",
});
const cmSearchOut = JSON.parse(cmSearch.content?.[0]?.text ?? "{}");
if (cmSearchOut.error && /unavailable/.test(cmSearchOut.error)) {
  process.stdout.write(`  skip Code Mode unavailable on this deployment: ${cmSearchOut.error}\n`);
} else {
  check(cmSearchOut.ok === true && cmSearchOut.result?.tables === 1227, `search runs model code over the catalogue (${JSON.stringify(cmSearchOut.result)})`);
  check(JSON.stringify(cmSearchOut.result?.dims) === JSON.stringify(["MEASURE", "INDEX", "TSEST", "REGION", "FREQ"]), "search sees CPI's key order");

  process.stdout.write("code mode: execute\n");
  const cmExec = await callTool("execute", {
    code: "const d = await abs.getData({ table: 'CPI', select: { MEASURE: '1', INDEX: '10001', TSEST: '10', REGION: '50', FREQ: 'Q' }, lastN: 5 }); const v = d.rows.map(r => r.value); console.log('rows', v.length); return { key: d.key, latest: v[v.length-1], change: v[v.length-1] - v[0] };",
  });
  const cmExecOut = JSON.parse(cmExec.content?.[0]?.text ?? "{}");
  check(cmExecOut.ok === true && cmExecOut.result?.key === "1.10001.10.50.Q" && typeof cmExecOut.result?.latest === "number", `execute fetches and computes inside the sandbox (${JSON.stringify(cmExecOut.result)})`);
  check(Array.isArray(cmExecOut.logs) && cmExecOut.logs[0] === "rows 5", "console.log is captured");

  const cmBad = await callTool("execute", { code: "try { await abs.getData({ table: 'CPI', select: { REGION: 'Atlantis' } }); return 'no error'; } catch (e) { return JSON.parse(e.message).reason; }" });
  const cmBadOut = JSON.parse(cmBad.content?.[0]?.text ?? "{}");
  check(cmBadOut.result === "unknown_option", `validation errors are catchable JSON in the sandbox (${cmBadOut.result})`);

  const cmNet = await callTool("execute", { code: "try { await fetch('https://example.com'); return 'network allowed'; } catch (e) { return 'blocked'; }" });
  const cmNetOut = JSON.parse(cmNet.content?.[0]?.text ?? "{}");
  check(cmNetOut.result === "blocked", `outbound network is blocked in the sandbox (${cmNetOut.result})`);
}

// -------------------------------------------------------- resources/prompts
process.stdout.write("resources\n");
const resources = await rpc("resources/list");
const resourceUris = (resources.resources as Array<{ uri: string }>).map((r) => r.uri).sort();
check(["abs://catalogue", "abs://findings", "abs://guide", "abs://openapi"].every((u) => resourceUris.includes(u)), `lists the four documents (${resourceUris.join(", ")})`);
check(resources.cacheScope === "public" && resources.ttlMs > 0, "resources/list is cacheable");
const guide = await rpc("resources/read", { uri: "abs://guide" });
check(/search_tables/.test(guide.contents?.[0]?.text ?? ""), "abs://guide reads as the usage guide");
const findingsDoc = await rpc("resources/read", { uri: "abs://findings" });
check(/density/i.test(findingsDoc.contents?.[0]?.text ?? ""), "abs://findings reads the measured gap");
const tableDoc = await rpc("resources/read", { uri: "abs://table/CPI" });
check(/MEASURE\.INDEX\.TSEST\.REGION\.FREQ/.test(tableDoc.contents?.[0]?.text ?? ""), "abs://table/CPI reads the description");

process.stdout.write("prompts\n");
const prompts = await rpc("prompts/list");
const promptNames = (prompts.prompts as Array<{ name: string }>).map((p) => p.name).sort();
check(JSON.stringify(promptNames) === JSON.stringify(["compare_capitals", "explain_metadata_gap", "report_issue", "suburb_dossier"]), `three packaged workflows plus report_issue (${promptNames.join(", ")})`);
const dossier = await rpc("prompts/get", { name: "suburb_dossier", arguments: { place: "Fitzroy" } });
check(/Fitzroy/.test(dossier.messages?.[0]?.content?.text ?? "") && /search_options/.test(dossier.messages?.[0]?.content?.text ?? ""), "suburb_dossier renders with the place and the tool plan");

// ------------------------------------------------------------ HTTP door
process.stdout.write("HTTP door\n");
const tables = await fetch(`${API_URL}/tables?query=labour%20force&limit=3`);
check(tables.ok && tables.headers.get("cache-control")?.includes("public"), `GET /api/tables ${tables.status}, ${tables.headers.get("cache-control")}`);
const spec = await fetch(`${API_URL}/openapi.json`);
const specJson: any = spec.ok ? await spec.json() : {};
check(spec.ok && specJson.paths?.["/data"] && specJson.paths?.["/tables/{table}"], "OpenAPI document lists the verbs");
const invalid = await fetch(`${API_URL}/data`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ table: "CPI", select: { REGION: "Atlantis" } }),
});
const invalidJson: any = await invalid.json();
check(invalid.status === 422 && invalidJson.data?.reason === "unknown_option", `POST /api/data invalid -> ${invalid.status} ${invalidJson.data?.reason}`);
const docs = await fetch(`${API_URL}/docs`);
check(docs.ok && (docs.headers.get("content-type") ?? "").includes("html"), "Scalar docs render");

// ------------------------------------------------------------- RPC door
// Through the SDK, as a developer would: typed stub, one HTTP batch for
// concurrent calls, typed rejection for a bad selection, WebSocket session.
process.stdout.write("RPC door (Cap'n Web, via @abs/sdk)\n");
const RPC_URL = MCP_URL.replace(/\/mcp$/, "/rpc");
{
  const abs = connect(RPC_URL);
  const t0 = Date.now();
  const [found, described] = await Promise.all([abs.searchTables({ query: "cpi rent", limit: 3 }), abs.describeTable("CPI")]);
  check(found.results[0]?.id === "CPI" && described.keyFormat === "MEASURE.INDEX.TSEST.REGION.FREQ", `batched searchTables + describeTable in one round trip (${Date.now() - t0}ms)`);
}
{
  const abs = connect(RPC_URL);
  const data = await abs.getData({ table: "CPI", select: { MEASURE: "1", INDEX: "10001", TSEST: "10", REGION: "Australia", FREQ: "Q" }, lastN: 4 });
  check(data.key === "1.10001.10.50.Q" && data.rows.length === 4, `getData resolves labels and fetches (${data.key}, ${data.rows.length} rows)`);
}
{
  // Labels that match several options are rejected as ambiguous, with the candidates.
  const abs = connect(RPC_URL);
  let ambiguous: InvalidSelection | undefined;
  try {
    await abs.getData({ table: "CPI", select: { INDEX: "Rents", REGION: "Australia" } });
  } catch (err) {
    ambiguous = invalidSelectionFromError(err);
  }
  check(ambiguous?.reason === "ambiguous_option" && ambiguous.validOptions?.length === 2, `ambiguous label rejects with the candidates (${ambiguous?.validOptions?.map((o) => o.code).join(", ")})`);
}
{
  const abs = connect(RPC_URL);
  let invalid: InvalidSelection | undefined;
  try {
    await abs.getData({ table: "CPI", select: { REGION: "Atlantis" } });
  } catch (err) {
    invalid = invalidSelectionFromError(err);
  }
  check(invalid?.reason === "unknown_option" && (invalid.validOptions?.length ?? 0) > 0, `invalid selection rejects with typed InvalidSelection (${invalid?.reason}, ${invalid?.validOptions?.length} valid options)`);
}
{
  const abs = connect(RPC_URL);
  let missing: InvalidSelection | undefined;
  try {
    await abs.describeTable("NOPE");
  } catch (err) {
    missing = invalidSelectionFromError(err);
  }
  check(missing?.reason === "unknown_table", `unknown table rejects typed (${missing?.reason})`);
}
{
  using abs = connect(RPC_URL, { transport: "websocket" });
  const first = await abs.searchTables({ query: "labour force", limit: 2 });
  const second = await abs.searchOptions({ table: "CPI", dimension: "REGION", query: "Sydney" });
  check(first.results.length > 0 && second.options.some((o) => o.code === "1"), `WebSocket session serves consecutive calls (${first.results[0]?.id}, REGION ${second.options[0]?.code})`);
}

// ------------------------------------------------- MCP Apps views (decision 35)
process.stdout.write("MCP Apps views\n");
{
  const uiList = await rpc("tools/list", { _ui: true });
  const byName = Object.fromEntries((uiList.tools as any[]).map((t) => [t.name, t]));
  const formUri: string | undefined = byName["feedback_form"]?._meta?.ui?.resourceUri;
  const dataUri: string | undefined = byName["get_data"]?._meta?.ui?.resourceUri;
  check(formUri?.startsWith("ui://abs-data-feedback/"), `feedback_form points at its view (${formUri})`);
  check(dataUri?.startsWith("ui://abs-data-chart/"), `get_data points at the chart view (${dataUri})`);
  if (formUri) {
    const read = await rpc("resources/read", { uri: formUri, _ui: true });
    const content = read.contents?.[0];
    check(content?.mimeType === "text/html;profile=mcp-app" && content.text.includes("<html"), `the view resource is an MCP App document (${content?.mimeType}, ${content?.text?.length} chars)`);
  }
}

// ------------------------------------------------------ feedback (decision 33)
process.stdout.write("feedback\n");
{
  const form = await callTool("feedback_form", { kind: "bug", summary: "Protocol test draft", table: "CPI" });
  check(form.structuredContent?.draft?.summary === "Protocol test draft" && typeof form.structuredContent?.next === "string", "feedback_form hands back the draft and what to do next, sending nothing");

  const sent = await callTool("submit_feedback", { kind: "idea", summary: "Protocol test submission", details: "Sent by test/protocol.ts", table: "CPI", tool: "get_data" });
  const id: string | undefined = sent.structuredContent?.id;
  check(/^FB-[0-9A-Z]{6}$/.test(id ?? ""), `submit_feedback stores it and answers a reference (${id})`);

  const invalid = await callTool("submit_feedback", { kind: "idea", summary: "x" }).catch((e: Error) => ({ protocolError: e.message }));
  check((invalid as any).isError === true || "protocolError" in (invalid as any), "a too-short summary is refused");

  const web = await fetch(`${API_URL}/feedback`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "docs", about: "connector", summary: "Protocol test via the web form" }),
  });
  const webOut = await web.json() as any;
  check(web.status === 201 && /^FB-/.test(webOut.id), `POST /api/feedback stores web feedback (${web.status} ${webOut.id})`);

  const bad = await fetch(`${API_URL}/feedback`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "nope" }) });
  const badOut = await bad.json() as any;
  check(bad.status === 400 && Array.isArray(badOut.issues) && badOut.issues.length > 0, `invalid web feedback is a 400 with the issues (${badOut.issues?.map((i: any) => i.path).join(", ")})`);

  const trap = await fetch(`${API_URL}/feedback`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "other", summary: "Spam spam spam", website: "https://spam.example" }),
  });
  check(trap.status === 201, `a filled spam trap looks accepted (${trap.status}) and is not stored`);

  const preflight = await fetch(`${API_URL}/feedback`, { method: "OPTIONS" });
  check(preflight.status === 204 && preflight.headers.get("access-control-allow-origin") === "*", "the feedback endpoint answers CORS preflight for the in-chat view");

  const admin = await fetch(`${API_URL}/admin/feedback`);
  check(admin.status === 401 || admin.status === 503, `the inbox API refuses without a token (${admin.status})`);
  const token = process.env["FEEDBACK_ADMIN_TOKEN"];
  if (token) {
    const inbox = await fetch(`${API_URL}/admin/feedback?limit=10`, { headers: { authorization: `Bearer ${token}` } });
    const inboxOut = await inbox.json() as any;
    check(inbox.status === 200 && inboxOut.items.some((r: any) => r.id === id), `the inbox lists the submission (${inboxOut.total} total)`);
    check(!inboxOut.items.some((r: any) => r.summary === "Spam spam spam"), "the spam-trap submission was not stored");
    const patched = await fetch(`${API_URL}/admin/feedback/${id}`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ status: "closed", adminNote: "protocol test" }),
    });
    const patchedOut = await patched.json() as any;
    check(patched.status === 200 && patchedOut.status === "closed", "the inbox updates a submission's status");
  }
}

// --------------------------------------------- completion, prompts, the page
process.stdout.write("completion and the landing page\n");
{
  const done = await rpc("completion/complete", { ref: { type: "ref/resource", uri: "abs://table/{id}" }, argument: { name: "id", value: "CP" } });
  check(done.completion?.values?.includes("CPI"), `table ids complete from a prefix (${done.completion?.values?.slice(0, 4).join(", ")})`);
  const prompts = await rpc("prompts/list");
  check(prompts.prompts.some((p: any) => p.name === "report_issue"), "the report_issue prompt is listed");

  const root = MCP_URL.replace(/\/mcp$/, "/");
  const page = await fetch(root, { headers: { accept: "text/html" } });
  const pageText = await page.text();
  check(page.status === 200 && (page.headers.get("content-type") ?? "").includes("text/html") && pageText.includes('id="app"'), `a browser at / gets the landing page (${page.status})`);
  const machine = await fetch(root, { headers: { accept: "application/json" } });
  const machineOut = await machine.json() as any;
  check(machineOut.service === "abs-data-front-door" && machineOut.doors?.feedback, "anything else at / still gets the JSON service description");
}

// ------------------------------------------------------------------ done
process.stdout.write(`\n${failures.length === 0 ? "ALL PASSED" : `${failures.length} FAILED`}\n`);
for (const f of failures) process.stdout.write(`  - ${f}\n`);
process.exit(failures.length === 0 ? 0 : 1);
