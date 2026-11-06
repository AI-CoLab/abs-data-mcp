/**
 * Dev-only MCP Apps host for the two views (not part of any build): asks the local
 * Worker for a real tool result and the view's ui:// document, frames it, and
 * answers the view over ext-apps' AppBridge — tool calls forwarded to /mcp.
 */
import { AppBridge, PostMessageTransport } from "@modelcontextprotocol/ext-apps/app-bridge";

const frame = document.getElementById("frame") as HTMLIFrameElement;
const log = document.getElementById("log") as HTMLDivElement;
const say = (line: string) => {
  log.textContent = `${line}\n${log.textContent ?? ""}`.slice(0, 4000);
};

let id = 1;
async function mcp(method: string, params: Record<string, unknown>): Promise<any> {
  const res = await fetch("/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-06-18",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: id++, method, params }),
  });
  const text = await res.text();
  const line = text
    .split("\n")
    .map((l) => l.replace(/^data: /, ""))
    .filter((l) => l.startsWith("{"))
    .pop();
  const json = JSON.parse(line ?? "{}");
  if (json.error) throw new Error(JSON.stringify(json.error));
  return json.result;
}

const RUNS: Record<string, { tool: string; args: Record<string, unknown> }> = {
  "data-one": { tool: "get_data", args: { table: "CPI", select: { MEASURE: "1", INDEX: "10001", TSEST: "10", REGION: "50", FREQ: "Q" }, lastN: 20 } },
  "data-many": { tool: "get_data", args: { table: "CPI", select: { MEASURE: "1", INDEX: "10001", TSEST: "10", REGION: ["1", "2", "3", "4"], FREQ: "Q" }, lastN: 16 } },
  feedback: {
    tool: "feedback_form",
    args: { kind: "data", about: "abs", summary: "Hobart CPI looks flat for 2024-Q3", details: "The quarterly change reads 0.0 where the media release says 0.2.", table: "CPI", tool: "get_data", selection: '{"REGION":"6"}' },
  },
};

let bridge: AppBridge | undefined;

async function run(name: string) {
  const spec = RUNS[name];
  if (!spec) return;
  say(`calling ${spec.tool}…`);
  const list = await mcp("tools/list", {});
  const tool = list.tools.find((t: any) => t.name === spec.tool);
  const uri: string = tool?._meta?.ui?.resourceUri;
  const [result, resource] = await Promise.all([
    mcp("tools/call", { name: spec.tool, arguments: spec.args }),
    mcp("resources/read", { uri }),
  ]);
  say(`${spec.tool} → ${result.isError ? "error" : "ok"}; view ${uri} (${resource.contents[0].text.length} chars)`);

  const dark = (document.getElementById("dark") as HTMLInputElement).checked;
  const noCalls = (document.getElementById("nocalls") as HTMLInputElement).checked;
  document.body.classList.toggle("dark", dark);

  // One bridge per frame load: an old one still listening would answer the new view too.
  await bridge?.close().catch(() => {});
  bridge = new AppBridge(null, { name: "harness", version: "0" }, noCalls ? { openLinks: {} } : { openLinks: {}, serverTools: {} }, {
    hostContext: { theme: dark ? "dark" : "light" },
  });
  bridge.oncalltool = async (params) => {
    say(`view called ${params.name} ${JSON.stringify(params.arguments).slice(0, 120)}`);
    return mcp("tools/call", params as Record<string, unknown>);
  };
  bridge.onopenlink = async (params) => {
    say(`view asked to open ${params.url}`);
    return {};
  };
  bridge.onsizechange = ({ height }) => {
    if (height) frame.style.height = `${Math.ceil(height) + 2}px`;
  };
  bridge.oninitialized = () => {
    say("view initialised; sending input and result");
    void bridge?.sendToolInput({ arguments: spec.args });
    void bridge?.sendToolResult(result);
  };

  // Listen before the view loads: it sends ui/initialize as soon as its script runs.
  // The frame's WindowProxy survives the navigation, so the transport stays valid.
  const win = frame.contentWindow;
  if (!win) throw new Error("no frame window");
  await bridge.connect(new PostMessageTransport(win, win));
  frame.srcdoc = resource.contents[0].text;
}

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-run]")) {
  button.addEventListener("click", () => {
    run(button.dataset["run"] ?? "").catch((e: unknown) => say(`error: ${e instanceof Error ? e.message : String(e)}`));
  });
}
