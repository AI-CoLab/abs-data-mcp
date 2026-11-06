/**
 * How each AI tool adds the connector, as each vendor documents it (researched
 * 2026-11-06 from Anthropic's, OpenAI's and Microsoft's own pages). Where the
 * vendors' pages disagree, the guide says so instead of guessing.
 *
 * Each step may carry a screenshot; none exist yet, and a step without one
 * shows none — the field is there so adding one is a data change, not a layout one.
 */
import type { SegOption } from "@aicolab/ui-solid";
import { ButtonLink } from "@aicolab/ui-solid";
import type { JSX } from "@solidjs/web";
import {
  CONNECTOR_NAME,
  claudeCodeCommand,
  claudeInstallUrl,
  claudeOrgInstallUrl,
  connectorUrl,
  cursorInstallUrl,
  mcpJson,
  origin,
  REPOSITORY_URL,
  vscodeInstallUrl,
} from "../shared/connector.ts";

export type ToolId = "claude" | "claude-org" | "chatgpt" | "copilot" | "developers";

export const TOOLS: SegOption<ToolId>[] = [
  { id: "claude", label: "Claude" },
  { id: "claude-org", label: "Claude Team & Enterprise" },
  { id: "chatgpt", label: "ChatGPT" },
  { id: "copilot", label: "Microsoft Copilot" },
  { id: "developers", label: "Developer tools" },
];

export const isToolId = (value: string): value is ToolId => TOOLS.some((t) => t.id === value);

export interface GuideStep {
  title: string;
  body: JSX.Element;
  /** A screenshot of this step, when one exists. */
  screenshot?: { src: string; alt: string };
}

export interface GuideRoute {
  heading?: string;
  intro?: JSX.Element;
  actions?: () => JSX.Element;
  steps: GuideStep[];
}

export interface Guide {
  id: ToolId;
  title: string;
  who: JSX.Element;
  plans: string[];
  notice?: () => JSX.Element;
  routes: GuideRoute[];
  check: string;
  ask?: { label: string; message: string };
  snippets?: { label: string; value: string }[];
  troubleshooting: { q: string; a: JSX.Element }[];
}

const ext = (href: string, text: JSX.Element) => (
  <a href={href} target="_blank" rel="noreferrer">
    {text}
  </a>
);

const Url = () => <code class="lp-inline-url">{connectorUrl()}</code>;

const CHECK = "Using ABS Data, what was the latest quarterly change in the consumer price index for Sydney?";

const claude = (): Guide => ({
  id: "claude",
  title: "Claude — personal accounts",
  who: <>For Claude Free, Pro and Max. Works in Claude on the web, the desktop app and mobile once added.</>,
  plans: ["Free (one custom connector)", "Pro", "Max"],
  routes: [
    {
      intro: (
        <p>
          The button opens Claude's <strong>Add custom connector</strong> dialog with the name and URL filled in. Claude
          tells you the details came from a link; check them and confirm.
        </p>
      ),
      actions: () => (
        <ButtonLink href={claudeInstallUrl()} target="_blank" rel="noreferrer" class="lp-cta">
          Add to Claude
        </ButtonLink>
      ),
      steps: [
        {
          title: "Open the dialog",
          body: (
            <p>
              Use the button above, or go to{" "}
              {ext("https://claude.ai/customize/connectors", <strong>Customize → Connectors</strong>)} and choose{" "}
              <strong>Add</strong> → <strong>Custom</strong> → <strong>Web</strong> (on some accounts it is{" "}
              <strong>+ Add</strong> → <strong>Add custom connector</strong>). Sign in to Claude first if asked.
            </p>
          ),
        },
        {
          title: "Name it and paste the URL",
          body: (
            <p>
              Name: <strong>{CONNECTOR_NAME}</strong>. URL: <Url />. Then <strong>Continue</strong>.
            </p>
          ),
        },
        {
          title: "Choose no sign-in",
          body: (
            <p>
              Claude detects that this connector needs no account. If it asks how to authenticate, choose{" "}
              <strong>No sign-in</strong>, then <strong>Add</strong>. It shows <strong>Connected</strong> straight away.
            </p>
          ),
        },
        {
          title: "Switch it on in a chat",
          body: (
            <p>
              In a conversation, select <strong>+</strong> at the lower left of the message box (or type{" "}
              <strong>/</strong>), open <strong>Connectors</strong> and turn on <strong>{CONNECTOR_NAME}</strong>.
            </p>
          ),
        },
      ],
    },
  ],
  check: CHECK,
  troubleshooting: [
    {
      q: "I don't see Add custom connector",
      a: (
        <p>
          On a Team or Enterprise plan only an Owner can add one. Use the <a href="#claude-org">Team &amp; Enterprise</a>{" "}
          guide and send your Owner the message there.
        </p>
      ),
    },
    {
      q: "Claude says I've reached my limit",
      a: <p>The Free plan allows one custom connector. Remove another one in Customize → Connectors, or use a paid plan.</p>,
    },
    {
      q: "Claude asks before using a tool",
      a: (
        <p>
          The data tools only read. Choose <strong>Always allow</strong> to stop the prompt, or set each tool on the
          connector's page (Customize → Connectors → {CONNECTOR_NAME}). <code>submit_feedback</code> sends a message to
          the maintainers, so it is worth leaving on <strong>Needs approval</strong>.
        </p>
      ),
    },
    {
      q: "Claude doesn't seem to use it",
      a: (
        <p>
          Check it is switched on for this conversation (<strong>+</strong> → <strong>Connectors</strong>). Naming it in
          your question — “using ABS Data…” — also helps.
        </p>
      ),
    },
  ],
});

const claudeOrg = (): Guide => ({
  id: "claude-org",
  title: "Claude — Team and Enterprise",
  who: (
    <>
      On Team and Enterprise plans only Owners (and, on Enterprise, roles allowed to manage connectors) can add a custom
      connector. Members connect it once an Owner has added it.
    </>
  ),
  plans: ["Team", "Enterprise"],
  notice: () => (
    <p class="lp-note">
      Not an Owner? Skip to <strong>For members</strong>, and send your Owner the message on this page.
    </p>
  ),
  routes: [
    {
      heading: "For Owners",
      intro: (
        <p>The button opens your organisation's connector settings with the details filled in. Check them and confirm.</p>
      ),
      actions: () => (
        <ButtonLink href={claudeOrgInstallUrl()} target="_blank" rel="noreferrer" class="lp-cta">
          Add for my organisation
        </ButtonLink>
      ),
      steps: [
        {
          title: "Open organisation connectors",
          body: (
            <p>
              Use the button above, or go to{" "}
              {ext("https://claude.ai/admin-settings/connectors", <strong>Organization settings → Connectors</strong>)}{" "}
              and choose <strong>Add</strong> → <strong>Custom</strong> → <strong>Web</strong>.
            </p>
          ),
        },
        {
          title: "Name it and paste the URL",
          body: (
            <p>
              Name: <strong>{CONNECTOR_NAME}</strong>. URL: <Url />. Then <strong>Continue</strong>, choose{" "}
              <strong>No sign-in</strong> if asked, and <strong>Add</strong>.
            </p>
          ),
        },
        {
          title: "Set tool permissions (optional)",
          body: (
            <p>
              On the connector's page you can set each tool to <strong>Always allow</strong>,{" "}
              <strong>Needs approval</strong> or <strong>Blocked</strong> for everyone. The data tools only read; members
              can't override what you set.
            </p>
          ),
        },
      ],
    },
    {
      heading: "For members",
      steps: [
        {
          title: "Connect it",
          body: (
            <p>
              Open{" "}
              {ext("https://claude.ai/customize/connectors", <strong>Customize → Connectors</strong>)}, find{" "}
              <strong>{CONNECTOR_NAME}</strong> (marked <strong>Custom</strong>) and select <strong>Connect</strong>.
            </p>
          ),
        },
        {
          title: "Switch it on in a chat",
          body: (
            <p>
              Select <strong>+</strong> in the message box (or type <strong>/</strong>), open{" "}
              <strong>Connectors</strong> and turn on <strong>{CONNECTOR_NAME}</strong>.
            </p>
          ),
        },
      ],
    },
  ],
  check: CHECK,
  ask: {
    label: "Message for your Owner",
    message: `Hi,

Could you add the ABS Data connector to our Claude organisation? It lets us ask Claude questions in plain language and get answers from the Australian Bureau of Statistics' data, fetched live with the source for each number. It's anonymous, read-only access to data that's already public, and needs no sign-in.

One-click (opens Organization settings → Connectors, prefilled):
${claudeOrgInstallUrl()}

Or add it by hand: Organization settings → Connectors → Add → Custom → Web, with the URL
${connectorUrl()}
and "No sign-in".

Tool permissions can be set for the whole organisation on the connector's page. More detail: ${origin()}

Thanks!`,
  },
  troubleshooting: [
    {
      q: "There's no Request button for it",
      a: (
        <p>
          Claude's in-product requests cover listed directory connectors only. For a custom connector, ask your Owner
          directly — the message on this page has everything they need.
        </p>
      ),
    },
    {
      q: "It doesn't work inside a project",
      a: <p>On Team and Enterprise plans, connectors are available in private projects only.</p>,
    },
  ],
});

const chatgpt = (): Guide => ({
  id: "chatgpt",
  title: "ChatGPT",
  who: (
    <>
      ChatGPT adds connectors as plugins, on the web. There is no one-click link for ChatGPT; it takes about a minute by
      hand.
    </>
  ),
  plans: ["Depends on your plan or workspace"],
  notice: () => (
    <p class="lp-note">
      OpenAI's own pages disagree on which personal plans can add a custom MCP server. If you don't see{" "}
      <strong>Add custom MCP server</strong>, your plan or workspace doesn't offer it yet. In Business workspaces only
      admins and owners can add one.
    </p>
  ),
  routes: [
    {
      steps: [
        {
          title: "Open Plugins",
          body: (
            <p>
              Go to {ext("https://chatgpt.com/plugins", <strong>chatgpt.com/plugins</strong>)} (or{" "}
              <strong>Plugins</strong> in the sidebar), select the <strong>+</strong> button, then{" "}
              <strong>Add custom MCP server</strong>.
            </p>
          ),
        },
        {
          title: "Name it and paste the URL",
          body: (
            <p>
              Name: <strong>{CONNECTOR_NAME}</strong>. Under <strong>Connection</strong>, paste <Url /> into{" "}
              <strong>Server URL</strong>.
            </p>
          ),
        },
        {
          title: "Choose No authentication",
          body: (
            <p>
              Under <strong>Authentication</strong>, choose <strong>No authentication</strong>. Read the risk warning
              and tick <strong>I understand and want to continue</strong>.
            </p>
          ),
        },
        {
          title: "Create and install it",
          body: (
            <p>
              Select <strong>Create as a plugin</strong> and review the tools it found. Then open the{" "}
              {ext("https://chatgpt.com/plugins?view=personal", <strong>Personal</strong>)} tab, open the plugin and
              select <strong>+</strong> to install it.
            </p>
          ),
        },
        {
          title: "Use it in a chat",
          body: (
            <p>
              Start a new chat, type <strong>@</strong> and pick <strong>{CONNECTOR_NAME}</strong>. The pick applies to
              that message, so mention it again when a follow-up needs fresh data.
            </p>
          ),
        },
      ],
    },
    {
      heading: "In a Business, Enterprise or Edu workspace",
      steps: [
        {
          title: "Admins add and publish it",
          body: (
            <p>
              In Business, only admins and owners can create and publish a plugin for a custom MCP server. In
              Enterprise and Edu, admins can also give a role <strong>Create plugins with MCPs</strong> (Workspace
              settings → Permissions &amp; roles), or publish the plugin to the workspace.
            </p>
          ),
        },
        {
          title: "Members install it",
          body: (
            <p>
              Once published, find it in <strong>Plugins</strong> on the workspace tab, install it, and pick it with{" "}
              <strong>@</strong> in a chat.
            </p>
          ),
        },
      ],
    },
  ],
  check: CHECK,
  ask: {
    label: "Message for your workspace admin",
    message: `Hi,

Could you add the ABS Data connector to our ChatGPT workspace? It lets us ask ChatGPT questions in plain language and get answers from the Australian Bureau of Statistics' data, fetched live with the source for each number. It's anonymous, read-only access to data that's already public, and needs no sign-in.

Plugins → + → Add custom MCP server
Server URL: ${connectorUrl()}
Authentication: No authentication

Then publish it to the workspace so members can install it. More detail: ${origin()}

Thanks!`,
  },
  troubleshooting: [
    {
      q: "There's no Add custom MCP server option",
      a: (
        <p>
          It depends on your plan or workspace, and Lockdown Mode or a workspace policy can block it. In a workspace, ask
          an admin — the message on this page has the details.
        </p>
      ),
    },
    {
      q: "Can I do this on my phone?",
      a: <p>No — adding a custom MCP server is web only.</p>,
    },
    {
      q: "ChatGPT asks before sending feedback",
      a: (
        <p>
          ChatGPT confirms any tool that writes. The data tools are marked read-only; <code>submit_feedback</code> is the
          one that sends something, so the confirmation is expected.
        </p>
      ),
    },
    {
      q: "New tools don't show up",
      a: (
        <p>
          Open the plugin's details page and select <strong>Refresh</strong>. A published workspace plugin keeps the
          tools it was approved with until an admin refreshes or republishes it.
        </p>
      ),
    },
  ],
});

const copilot = (): Guide => ({
  id: "copilot",
  title: "Microsoft Copilot",
  who: (
    <>
      Microsoft 365 Copilot and Copilot Chat don't let an individual add a connector. It takes your IT admin, someone
      who builds agents in Copilot Studio, or GitHub Copilot in VS Code. The consumer Copilot app (copilot.microsoft.com)
      doesn't support custom connectors.
    </>
  ),
  plans: ["Needs your IT admin", "Copilot Studio maker", "GitHub Copilot in VS Code"],
  notice: () => (
    <p class="lp-note">
      Not an admin? Send your IT team the message on this page — the first route below is the simplest for them.
    </p>
  ),
  routes: [
    {
      heading: "Route 1 — your admin adds a federated connector",
      intro: (
        <p>
          A Global Administrator or AI Administrator adds it once in the Microsoft 365 admin center; people then switch
          it on in Copilot Chat. Microsoft's current docs list a Microsoft 365 Copilot licence for each user, so check
          with your IT team.
        </p>
      ),
      steps: [
        {
          title: "Create the connector",
          body: (
            <p>
              Microsoft 365 admin center → <strong>Copilot</strong> → <strong>Connectors</strong> →{" "}
              <strong>Gallery</strong>. Under <strong>Created by your org</strong>, select{" "}
              <strong>Create a new connector</strong> → <strong>Add</strong>, then under{" "}
              <strong>Connect to MCP server</strong> select <strong>Add</strong>.
            </p>
          ),
        },
        {
          title: "Fill it in",
          body: (
            <p>
              Display name: <strong>{CONNECTOR_NAME}</strong>. Description: Australian Bureau of Statistics data.
              Base URL: <Url />. Authentication: <strong>No Auth</strong>. Then <strong>Save</strong>.
            </p>
          ),
        },
        {
          title: "Roll it out",
          body: (
            <p>
              Under <strong>Your Connections</strong>, use <strong>Staged rollout</strong> or{" "}
              <strong>Deploy to all users</strong>. Agent settings must allow agents built by your organisation.
            </p>
          ),
        },
        {
          title: "People switch it on",
          body: (
            <p>
              In Copilot Chat, select <strong>…</strong> → <strong>Settings</strong> → <strong>Sources</strong>, find{" "}
              <strong>{CONNECTOR_NAME}</strong> and select <strong>Connect</strong>.
            </p>
          ),
        },
      ],
    },
    {
      heading: "Route 2 — an agent in Copilot Studio",
      intro: (
        <p>
          For someone who builds agents. These are the classic experience's steps (… → Open classic experience); the
          newer one has the same option under <strong>Build</strong> → <strong>Tools</strong> →{" "}
          <strong>Add a tool</strong> → <strong>Model Context Protocol (MCP)</strong>.
        </p>
      ),
      steps: [
        {
          title: "Add the MCP tool",
          body: (
            <p>
              In the agent, open <strong>Tools</strong> → <strong>Add a tool</strong> → <strong>New tool</strong> →{" "}
              <strong>Model Context Protocol</strong>. Server name: <strong>{CONNECTOR_NAME}</strong>; a short
              description; Server URL: <Url />; Authentication: <strong>None</strong>. Select <strong>Create</strong>.
            </p>
          ),
        },
        {
          title: "Connect and add it",
          body: (
            <p>
              Choose <strong>Create a new connection</strong>, then <strong>Add to agent</strong>. Generative
              orchestration must be on.
            </p>
          ),
        },
        {
          title: "Publish",
          body: (
            <p>
              Publish the agent, then add the <strong>Microsoft 365 and Microsoft Teams</strong> channel with{" "}
              <strong>Make agent available in Microsoft Copilot</strong> ticked. An admin approves it for the
              organisation in the Microsoft 365 admin center (Agents → All agents → Requests).
            </p>
          ),
        },
      ],
    },
    {
      heading: "Route 3 — GitHub Copilot in VS Code",
      intro: <p>For anyone with GitHub Copilot. No admin needed on personal plans.</p>,
      actions: () => (
        <ButtonLink href={vscodeInstallUrl()} class="lp-cta" variant="soft">
          Install in VS Code
        </ButtonLink>
      ),
      steps: [
        {
          title: "Install it",
          body: (
            <p>
              Use the button, or add the JSON on this page to <code>.mcp.json</code> in your workspace (or{" "}
              <code>~/.copilot/mcp-config.json</code> for every workspace).
            </p>
          ),
        },
        {
          title: "Ask in agent mode",
          body: (
            <p>
              Open Copilot Chat in agent mode and ask. In a GitHub Copilot Business or Enterprise organisation, an admin
              must turn on the <strong>MCP servers in Copilot</strong> policy first.
            </p>
          ),
        },
      ],
    },
  ],
  check: CHECK,
  ask: {
    label: "Message for your IT team",
    message: `Hi,

Could we make the ABS Data connector available in Microsoft 365 Copilot? It lets staff ask Copilot questions in plain language and get answers from the Australian Bureau of Statistics' data, fetched live with the source for each number. It's anonymous, read-only access to data that's already public, needs no authentication, and is a web address rather than new software to install.

The simplest route is a custom federated connector:
Microsoft 365 admin center → Copilot → Connectors → Gallery → Create a new connector → Connect to MCP server → Add
Display name: ABS Data
Base URL: ${connectorUrl()}
Authentication: No Auth
Then Save, and roll it out to the people who need it (Staged rollout or Deploy to all users).

Users then connect it in Copilot Chat under Settings → Sources. If our Power Platform data policies block new connectors, the endpoint above may need to be allowed.

More detail: ${origin()}

Thanks!`,
  },
  snippets: [{ label: "VS Code / GitHub Copilot — .mcp.json", value: mcpJson() }],
  troubleshooting: [
    {
      q: "Copilot Studio won't let me add or publish it",
      a: (
        <p>
          Power Platform data policies (DLP) often block new connectors, which also blocks their MCP tools. Your Power
          Platform admin can allow it. Trial licences can test an agent but can't publish one.
        </p>
      ),
    },
    {
      q: "Agent Builder in Copilot has no option for it",
      a: <p>Agent Builder can't add external tools. Copy the agent to Copilot Studio and use Route 2.</p>,
    },
    {
      q: "Who pays for it?",
      a: (
        <p>
          The connector is free. In Copilot Studio, agent actions can draw on your organisation's Copilot Credits;
          your IT team will know how yours is set up.
        </p>
      ),
    },
  ],
});

const developers = (): Guide => ({
  id: "developers",
  title: "Developer tools",
  who: (
    <>
      Streamable HTTP at <Url />, stateless; MCP 2026-07-28, and 2025-03-26, 2025-06-18 and 2025-11-25 for older
      clients. No authentication.
    </>
  ),
  plans: ["Claude Code", "VS Code", "Cursor", "Any MCP client"],
  routes: [
    {
      heading: "Claude Code",
      steps: [
        {
          title: "Add it",
          body: (
            <p>
              Run the command on this page, then check with <code>/mcp</code>. If you added it at claude.ai and Claude
              Code is signed in with that account, it is already there.
            </p>
          ),
        },
      ],
    },
    {
      heading: "VS Code and Cursor",
      actions: () => (
        <div class="lp-actions">
          <ButtonLink href={vscodeInstallUrl()} class="lp-cta" variant="soft">
            Install in VS Code
          </ButtonLink>
          <ButtonLink href={cursorInstallUrl()} class="lp-cta" variant="soft">
            Install in Cursor
          </ButtonLink>
        </div>
      ),
      steps: [
        {
          title: "Install, or paste the JSON",
          body: (
            <p>
              The buttons open the editor's install prompt. By hand: <code>.mcp.json</code> in the workspace,{" "}
              <code>~/.copilot/mcp-config.json</code> (GitHub Copilot) or <code>~/.cursor/mcp.json</code> (Cursor).
              Visual Studio: Chat → Agent → Tools → <strong>+</strong> → <strong>Add custom MCP server</strong>.
            </p>
          ),
        },
      ],
    },
    {
      heading: "Without MCP",
      steps: [
        {
          title: "HTTP, OpenAPI and the TypeScript SDK",
          body: (
            <p>
              The same four verbs as REST — <a href="/api/docs">reference</a>, <a href="/api/openapi.json">OpenAPI</a>{" "}
              — and <code>@abs/sdk</code>, a typed client over Cap'n Web ({ext(REPOSITORY_URL, "source and examples")}
              ). The whole catalogue is one document at <a href="/api/catalogue.json">/api/catalogue.json</a>.
            </p>
          ),
        },
      ],
    },
  ],
  check: CHECK,
  snippets: [
    { label: "Claude Code", value: claudeCodeCommand() },
    { label: "MCP client config (JSON)", value: mcpJson() },
  ],
  troubleshooting: [
    {
      q: "Rate limits",
      a: (
        <p>
          Per client address: 600 requests a minute overall, 120 a minute for data pulls (each is a live ABS call), 20 a
          minute for Code Mode <code>execute</code>. Over the limit, HTTP answers 429 with Retry-After and MCP returns a
          tool error.
        </p>
      ),
    },
    {
      q: "Bulk pulls",
      a: (
        <p>
          <code>get_data</code> caps rows and returns <code>fullDataUrl</code>, the exact working ABS URL for the
          complete pull — use that for bulk downloads.
        </p>
      ),
    },
  ],
});

export const guideFor = (id: ToolId): Guide => {
  switch (id) {
    case "claude":
      return claude();
    case "claude-org":
      return claudeOrg();
    case "chatgpt":
      return chatgpt();
    case "copilot":
      return copilot();
    case "developers":
      return developers();
  }
};
