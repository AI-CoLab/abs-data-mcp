/**
 * The feedback inbox: a token gate, then every submission newest first, with
 * filters, status and notes, a plain-text "Copy for ABS" for data reports, and
 * a JSON export of what the filters show. It reads and writes only through
 * /api/admin/feedback, which checks the token on every request.
 */
import {
  FEEDBACK_ABOUT,
  FEEDBACK_ABOUT_LABELS,
  FEEDBACK_CHANNELS,
  FEEDBACK_KIND_LABELS,
  FEEDBACK_STATUSES,
  type FeedbackRecord,
  type FeedbackStatus,
  type FeedbackUpdate,
} from "@abs/contract/feedback";
import { Button, Field, SelectControl, TextArea, TextInput, ThemeToggle, ToastHost, toast } from "@aicolab/ui-solid";
import { createSignal, For, onSettled, Show } from "solid-js";
import { copyText, shortDateTime } from "../shared/copy.ts";

const TOKEN_KEY = "abs-data:admin-token";
const PAGE = 50;

const session = {
  get: (): string | null => {
    try {
      return sessionStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (token: string | null): void => {
    try {
      if (token) sessionStorage.setItem(TOKEN_KEY, token);
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      /* best-effort */
    }
  },
};

class Unauthorised extends Error {}

async function api<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${token}`,
      ...(init.body ? { "content-type": "application/json" } : {}),
    },
  });
  if (response.status === 401) throw new Unauthorised("That token was not accepted.");
  if (!response.ok) {
    const json: unknown = await response.json().catch(() => null);
    const message = json && typeof json === "object" && "error" in json ? String((json as { error: unknown }).error) : "";
    throw new Error(message || `The server answered ${response.status}.`);
  }
  return (await response.json()) as T;
}

interface Filters {
  status: string;
  about: string;
  channel: string;
}

export function Admin() {
  const [token, setToken] = createSignal<string | null>(session.get());
  const signOut = () => {
    session.set(null);
    setToken(null);
  };
  return (
    <>
      <header class="ad-top">
        <div class="ad-top-inner">
          <a class="ad-brand" href="/">
            ABS Data <span>· feedback inbox</span>
          </a>
          <Show when={token()}>
            <Button variant="ghost" colorBase="neutral" onClick={signOut}>
              Sign out
            </Button>
          </Show>
          <ThemeToggle size="sm" variant="ghost" colorBase="neutral" />
        </div>
      </header>
      <main class="ad-main">
        <Show when={token()} keyed fallback={<Gate onToken={(t) => setToken(t)} />}>
          {(t) => <Inbox token={t} onUnauthorised={signOut} />}
        </Show>
      </main>
      <ToastHost />
    </>
  );
}

function Gate(props: { onToken: (token: string) => void }) {
  const [value, setValue] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);
  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    const candidate = value().trim();
    if (!candidate) return;
    setBusy(true);
    setError(null);
    try {
      await api(candidate, "/api/admin/feedback?limit=1");
      session.set(candidate);
      props.onToken(candidate);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form class="ad-gate" onSubmit={(e) => void submit(e)}>
      <h1>Feedback inbox</h1>
      <p>For the connector's maintainers. The token stays in this tab only and is forgotten when you close it.</p>
      <Field label="Admin token">
        <TextInput
          type="password"
          autocomplete="current-password"
          value={value()}
          onInput={(e) => setValue(e.currentTarget.value)}
          aria-invalid={error() ? "true" : undefined}
          aria-describedby={error() ? "gate-error" : undefined}
        />
      </Field>
      <Show when={error()}>
        {(message) => (
          <p class="ad-error" id="gate-error" role="alert">
            {message()}
          </p>
        )}
      </Show>
      <Button type="submit" disabled={busy() || !value().trim()}>
        {busy() ? "Checking…" : "Open inbox"}
      </Button>
    </form>
  );
}

const forAbs = (r: FeedbackRecord): string =>
  [
    `Feedback ${r.id} — received ${r.createdAt}`,
    `Kind: ${FEEDBACK_KIND_LABELS[r.kind]}`,
    `Summary: ${r.summary}`,
    r.details ? `\nDetails:\n${r.details}\n` : null,
    r.table ? `Table: ${r.table}` : null,
    r.selection ? `Selection: ${r.selection}` : null,
    r.tool ? `Tool: ${r.tool}` : null,
    r.error ? `Error returned: ${r.error}` : null,
    `Catalogue run: ${r.runId}`,
    r.shareWithAbs && r.contact ? `Contact (consented to share): ${r.contact}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

function Inbox(props: { token: string; onUnauthorised: () => void }) {
  const [filters, setFilters] = createSignal<Filters>({ status: "", about: "", channel: "" });
  const [items, setItems] = createSignal<FeedbackRecord[]>([]);
  const [total, setTotal] = createSignal(0);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const query = (f: Filters, offset: number) => {
    const params = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
    if (f.status) params.set("status", f.status);
    if (f.about) params.set("about", f.about);
    if (f.channel) params.set("channel", f.channel);
    return `/api/admin/feedback?${params}`;
  };

  const load = async (f: Filters, append = false) => {
    setLoading(true);
    setError(null);
    try {
      const offset = append ? items().length : 0;
      const page = await api<{ total: number; items: FeedbackRecord[] }>(props.token, query(f, offset));
      setTotal(page.total);
      setItems(append ? [...items(), ...page.items] : page.items);
    } catch (e) {
      if (e instanceof Unauthorised) props.onUnauthorised();
      else setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const setFilter = (key: keyof Filters, value: string) => {
    const next = { ...filters(), [key]: value };
    setFilters(next);
    void load(next);
  };

  const replace = (record: FeedbackRecord) => setItems(items().map((r) => (r.id === record.id ? record : r)));

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(items(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `abs-feedback-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  onSettled(() => {
    void load(filters());
  });

  return (
    <section class="ad-inbox" aria-labelledby="inbox-title">
      <div class="ad-inbox-head">
        <h1 id="inbox-title">Feedback</h1>
        <p class="ad-count" aria-live="polite">
          {loading() ? "Loading…" : `${items().length} of ${total()} shown`}
        </p>
      </div>
      <div class="ad-filters">
        <Field label="Status">
          <SelectControl value={filters().status} onChange={(e) => setFilter("status", e.currentTarget.value)}>
            <option value="">All</option>
            <For each={FEEDBACK_STATUSES}>{(s) => <option value={s}>{s}</option>}</For>
          </SelectControl>
        </Field>
        <Field label="About">
          <SelectControl value={filters().about} onChange={(e) => setFilter("about", e.currentTarget.value)}>
            <option value="">All</option>
            <For each={FEEDBACK_ABOUT}>{(a) => <option value={a}>{a === "abs" ? "ABS's data or API" : "The connector"}</option>}</For>
          </SelectControl>
        </Field>
        <Field label="Channel">
          <SelectControl value={filters().channel} onChange={(e) => setFilter("channel", e.currentTarget.value)}>
            <option value="">All</option>
            <For each={FEEDBACK_CHANNELS}>{(c) => <option value={c}>{c}</option>}</For>
          </SelectControl>
        </Field>
        <div class="ad-filter-actions">
          <Button variant="soft" onClick={() => void load(filters())} disabled={loading()}>
            Refresh
          </Button>
          <Button variant="outline" onClick={exportJson} disabled={!items().length}>
            Export JSON
          </Button>
        </div>
      </div>
      <Show when={error()}>
        {(message) => (
          <p class="ad-error" role="alert">
            {message()}
          </p>
        )}
      </Show>
      <Show when={items().length || loading()} fallback={<p class="ad-empty">Nothing here with these filters.</p>}>
        <ol class="ad-list">
          <For each={items()}>
            {(record) => <Row record={record} token={props.token} onSaved={replace} onUnauthorised={props.onUnauthorised} />}
          </For>
        </ol>
      </Show>
      <Show when={items().length < total()}>
        <Button variant="soft" onClick={() => void load(filters(), true)} disabled={loading()}>
          Load more
        </Button>
      </Show>
    </section>
  );
}

function Row(props: {
  record: FeedbackRecord;
  token: string;
  onSaved: (record: FeedbackRecord) => void;
  onUnauthorised: () => void;
}) {
  const r = () => props.record;
  const [status, setStatus] = createSignal<FeedbackStatus>(props.record.status);
  const [note, setNote] = createSignal(props.record.adminNote ?? "");
  const [saving, setSaving] = createSignal(false);
  const dirty = () => status() !== r().status || note() !== (r().adminNote ?? "");

  const save = async () => {
    setSaving(true);
    try {
      const update: FeedbackUpdate = { status: status(), adminNote: note().trim() ? note().trim() : null };
      const saved = await api<FeedbackRecord>(props.token, `/api/admin/feedback/${encodeURIComponent(r().id)}`, {
        method: "PATCH",
        body: JSON.stringify(update),
      });
      props.onSaved(saved);
      toast(`Saved ${saved.id}`, { colorBase: "success", duration: 2000 });
    } catch (e) {
      if (e instanceof Unauthorised) props.onUnauthorised();
      else toast(e instanceof Error ? e.message : String(e), { colorBase: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <li class="ad-row" data-about={r().about} data-status={r().status}>
      <details>
        <summary>
          <span class="ad-row-when">{shortDateTime(r().createdAt)}</span>
          <span class="ad-tags">
            <span class="ad-tag" data-kind="about" data-value={r().about}>
              {r().about === "abs" ? "ABS data" : "connector"}
            </span>
            <span class="ad-tag">{r().kind}</span>
            <span class="ad-tag">{r().channel}</span>
            <span class="ad-tag" data-kind="status" data-value={r().status}>
              {r().status}
            </span>
          </span>
          <span class="ad-row-summary">{r().summary}</span>
        </summary>
        <div class="ad-row-body">
          <Show when={r().details}>{(details) => <p class="ad-details">{details()}</p>}</Show>
          <dl class="ad-meta">
            <dt>Reference</dt>
            <dd>
              <code>{r().id}</code>
            </dd>
            <dt>About</dt>
            <dd>{FEEDBACK_ABOUT_LABELS[r().about]}</dd>
            <dt>Kind</dt>
            <dd>{FEEDBACK_KIND_LABELS[r().kind]}</dd>
            <Show when={r().tool}>
              {(v) => (
                <>
                  <dt>Tool</dt>
                  <dd>
                    <code>{v()}</code>
                  </dd>
                </>
              )}
            </Show>
            <Show when={r().table}>
              {(v) => (
                <>
                  <dt>Table</dt>
                  <dd>
                    <code>{v()}</code>
                  </dd>
                </>
              )}
            </Show>
            <Show when={r().selection}>
              {(v) => (
                <>
                  <dt>Selection</dt>
                  <dd>
                    <code>{v()}</code>
                  </dd>
                </>
              )}
            </Show>
            <Show when={r().error}>
              {(v) => (
                <>
                  <dt>Error</dt>
                  <dd>{v()}</dd>
                </>
              )}
            </Show>
            <dt>AI tool</dt>
            <dd>
              {r().assistant ?? "—"}
              <Show when={r().clientName}>
                {(name) => (
                  <span class="ad-faint">
                    {" "}
                    (client {name()}
                    {r().clientVersion ? ` ${r().clientVersion}` : ""})
                  </span>
                )}
              </Show>
            </dd>
            <dt>Contact</dt>
            <dd>
              <Show when={r().contact} fallback="—">
                {(contact) => (
                  <>
                    <a href={`mailto:${contact()}`}>{contact()}</a>
                    {r().shareWithAbs ? " · may be shared with ABS" : " · not to be shared"}
                  </>
                )}
              </Show>
            </dd>
            <dt>Catalogue run</dt>
            <dd>
              <code>{r().runId}</code>
            </dd>
          </dl>
          <div class="ad-edit">
            <Field label="Status">
              <SelectControl value={status()} onChange={(e) => setStatus(e.currentTarget.value as FeedbackStatus)}>
                <For each={FEEDBACK_STATUSES}>{(s) => <option value={s}>{s}</option>}</For>
              </SelectControl>
            </Field>
            <Field label="Note (maintainers only)">
              <TextArea rows={2} maxlength={2000} value={note()} onInput={(e) => setNote(e.currentTarget.value)} />
            </Field>
            <div class="ad-edit-actions">
              <Button onClick={() => void save()} disabled={saving() || !dirty()}>
                {saving() ? "Saving…" : "Save"}
              </Button>
              <Show when={r().about === "abs"}>
                <Button variant="outline" onClick={() => void copyText(forAbs(r()), "Copied for ABS")}>
                  Copy for ABS
                </Button>
              </Show>
            </div>
          </div>
        </div>
      </details>
    </li>
  );
}
