/**
 * The connector as every page names it: its URL, the name assistants list it
 * under, and the install links each assistant offers. One place, so a guide,
 * a button and a copied snippet can never disagree.
 */

/** The production origin. A page served from the Worker uses its own origin instead. */
export const PRODUCTION_ORIGIN = "https://abs-data-front-door.aicolab.workers.dev";

const onWorker = (): boolean =>
  typeof window !== "undefined" &&
  (window.location.origin === PRODUCTION_ORIGIN || window.location.hostname === "localhost");

export const origin = (): string => (onWorker() ? window.location.origin : PRODUCTION_ORIGIN);

/** The MCP endpoint people paste into their assistant. */
export const connectorUrl = (): string => `${origin()}/mcp`;

/** What assistants list it as. */
export const CONNECTOR_NAME = "ABS Data";
/** The id used where an id is wanted (Claude Code, VS Code, Cursor). */
export const CONNECTOR_ID = "abs-data";
/** The official MCP Registry name. */
export const REGISTRY_NAME = "io.github.SamJB123/abs-data";
export const REPOSITORY_URL = "https://github.com/AI-CoLab/abs-data-mcp";

/**
 * Claude's install link: opens "Add custom connector" prefilled; the person
 * reviews and confirms (claude.com/docs/connectors/building/directory-vs-custom).
 */
export const claudeInstallUrl = (): string =>
  `https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=${encodeURIComponent(CONNECTOR_NAME)}&connectorUrl=${encodeURIComponent(connectorUrl())}`;

/** The same, for an organisation Owner adding it for everyone on Team or Enterprise. */
export const claudeOrgInstallUrl = (): string =>
  `https://claude.ai/admin-settings/connectors?modal=add-custom-connector&connectorName=${encodeURIComponent(CONNECTOR_NAME)}&connectorUrl=${encodeURIComponent(connectorUrl())}`;

/** VS Code's install link, wrapped for the web (code.visualstudio.com/api/extension-guides/ai/mcp). */
export const vscodeInstallUrl = (): string => {
  const config = { name: CONNECTOR_ID, type: "http", url: connectorUrl() };
  const inner = `vscode:mcp/install?${encodeURIComponent(JSON.stringify(config))}`;
  return `https://vscode.dev/redirect?url=${encodeURIComponent(inner)}`;
};

/** Cursor's install link: the server config, base64-encoded. */
export const cursorInstallUrl = (): string =>
  `cursor://anysphere.cursor-deeplink/mcp/install?name=${CONNECTOR_ID}&config=${btoa(JSON.stringify({ url: connectorUrl() }))}`;

export const claudeCodeCommand = (): string =>
  `claude mcp add --transport http --scope user ${CONNECTOR_ID} ${connectorUrl()}`;

/** For VS Code / GitHub Copilot (.mcp.json or ~/.copilot/mcp-config.json), Cursor and most other clients. */
export const mcpJson = (): string =>
  JSON.stringify({ mcpServers: { [CONNECTOR_ID]: { type: "http", url: connectorUrl() } } }, null, 2);
