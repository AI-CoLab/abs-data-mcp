/**
 * How a view reaches the front door, whichever host shows it (DESIGN.md decision 35).
 *
 * The same seam as @aicolab/app-kit's `./solid/view-host` — same name, same four
 * members — so a view written against it moves into app-kit unchanged:
 *
 *   a model host   as an MCP App view (./shell): the host proxies the view's calls
 *                  to the server's tools and opens links on its behalf;
 *   our own pages  (not yet) a host over the HTTP door, so the landing page can
 *                  mount the same component: app-kit's "one view, two hosts".
 *
 * A view asks `canCall()` before offering anything that needs a call, because a
 * host may show a view without letting it call back.
 */
export interface ViewHost {
  /** How this host reaches the server, in words a view can show. */
  readonly name: string;
  canCall(): boolean;
  /** Run one of the server's operations by name; the result as the operation gave it. */
  call(name: string, input: Record<string, unknown>): Promise<unknown>;
  openLink(url: string): void;
}
