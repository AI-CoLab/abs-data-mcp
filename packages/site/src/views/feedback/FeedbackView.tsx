/**
 * The in-chat feedback form (DESIGN.md decision 35): the model drafts it with
 * feedback_form, the person reviews, edits and sends it. Nothing leaves until
 * they press Send. Sends through the host to submit_feedback; a host that cannot
 * relay calls gets a direct POST to the web endpoint instead (the view's one
 * connect domain), marked as coming from the view.
 */
import {
  FEEDBACK_ABOUT,
  FEEDBACK_ABOUT_LABELS,
  FEEDBACK_KIND_LABELS,
  FEEDBACK_KINDS,
  type FeedbackAbout,
  type FeedbackDraft,
  type FeedbackFormOutput,
  type FeedbackKind,
  type FeedbackOutput,
  SUMMARY_MAX,
  DETAILS_MAX,
} from "@abs/contract/feedback";
import { Button, Checkbox, Field, SelectControl, TextArea, TextInput } from "@aicolab/ui-solid";
import { createEffect, createSignal, For, Show } from "solid-js";
import type { ViewHost } from "../view-host.ts";

const ENDPOINT = "https://abs-data-front-door.aicolab.workers.dev/api/feedback";

const draftOf = (result: unknown, input: Record<string, unknown> | undefined): FeedbackDraft | undefined => {
  const fromResult = (result as FeedbackFormOutput | undefined)?.draft;
  if (fromResult && typeof fromResult === "object") return fromResult;
  return input as FeedbackDraft | undefined;
};

export function FeedbackView(props: { host: ViewHost; result: unknown; input: Record<string, unknown> | undefined }) {
  const [kind, setKind] = createSignal<FeedbackKind>("bug");
  const [about, setAbout] = createSignal<FeedbackAbout>("connector");
  const [summary, setSummary] = createSignal("");
  const [details, setDetails] = createSignal("");
  const [contact, setContact] = createSignal("");
  const [shareWithAbs, setShareWithAbs] = createSignal(false);
  const [context, setContext] = createSignal<Pick<FeedbackDraft, "tool" | "table" | "selection" | "error" | "assistant">>({});
  const [sending, setSending] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [sent, setSent] = createSignal<FeedbackOutput | null>(null);
  let seeded = false;

  // Seed the form once from the model's draft, when it arrives.
  createEffect(
    () => draftOf(props.result, props.input),
    (draft) => {
      if (!draft || seeded) return;
      seeded = true;
      if (draft.kind) setKind(draft.kind);
      if (draft.about) setAbout(draft.about);
      if (draft.summary) setSummary(draft.summary);
      if (draft.details) setDetails(draft.details);
      if (draft.contact) setContact(draft.contact);
      if (draft.shareWithAbs) setShareWithAbs(true);
      setContext({ tool: draft.tool, table: draft.table, selection: draft.selection, error: draft.error, assistant: draft.assistant });
    },
  );

  const contextLines = () =>
    Object.entries(context()).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1] !== "");

  const send = async (event: SubmitEvent) => {
    event.preventDefault();
    setError(null);
    if (summary().trim().length < 3) {
      setError("Add a one-line summary first.");
      return;
    }
    const body = {
      kind: kind(),
      about: about(),
      summary: summary().trim(),
      ...(details().trim() ? { details: details().trim() } : {}),
      ...Object.fromEntries(contextLines()),
      ...(contact().trim() ? { contact: contact().trim() } : {}),
      shareWithAbs: about() === "abs" && shareWithAbs(),
    };
    setSending(true);
    try {
      if (props.host.canCall()) {
        setSent((await props.host.call("submit_feedback", body)) as FeedbackOutput);
      } else {
        const res = await fetch(ENDPOINT, {
          method: "POST",
          headers: { "content-type": "application/json", "x-abs-channel": "mcp-view" },
          body: JSON.stringify(body),
        });
        const out = (await res.json().catch(() => ({}))) as Partial<FeedbackOutput> & { message?: string; issues?: { path: string; message: string }[] };
        if (!res.ok) throw new Error(out.issues?.map((i) => `${i.path}: ${i.message}`).join("; ") || out.message || `HTTP ${res.status}`);
        setSent(out as FeedbackOutput);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <div class="v-root">
      <header class="v-head">
        <span class="v-eyebrow">ABS Data · feedback</span>
        <h1 class="v-title">Send feedback to the connector's maintainers</h1>
        <p class="v-sub">Your assistant drafted this. Check it, change anything, then send — nothing is sent until you do.</p>
      </header>

      <Show
        when={sent()}
        fallback={
          <form class="fb-form" onSubmit={send} novalidate>
            <fieldset class="fb-about">
              <legend>It's about</legend>
              <For each={FEEDBACK_ABOUT}>
                {(value) => (
                  <label class="fb-radio">
                    <input
                      type="radio"
                      name="about"
                      value={value}
                      checked={about() === value}
                      onChange={() => setAbout(value)}
                    />
                    <span>{FEEDBACK_ABOUT_LABELS[value]}</span>
                  </label>
                )}
              </For>
            </fieldset>

            <Field label="Kind">
              <SelectControl value={kind()} onChange={(e) => setKind(e.currentTarget.value as FeedbackKind)}>
                <For each={FEEDBACK_KINDS}>{(value) => <option value={value}>{FEEDBACK_KIND_LABELS[value]}</option>}</For>
              </SelectControl>
            </Field>

            <Field label={`Summary (${summary().length}/${SUMMARY_MAX})`}>
              <TextInput
                value={summary()}
                maxlength={SUMMARY_MAX}
                required
                onInput={(e) => setSummary(e.currentTarget.value)}
              />
            </Field>

            <Field label="Details">
              <TextArea
                value={details()}
                maxlength={DETAILS_MAX}
                rows={5}
                onInput={(e) => setDetails(e.currentTarget.value)}
              />
            </Field>

            <Show when={contextLines().length}>
              <div class="fb-context">
                <span class="v-eyebrow">Also sent — what you were doing</span>
                <dl>
                  <For each={contextLines()}>
                    {([key, value]) => (
                      <>
                        <dt>{key}</dt>
                        <dd class="v-mono">{value}</dd>
                      </>
                    )}
                  </For>
                </dl>
                <Button type="button" variant="ghost" colorBase="neutral" onClick={() => setContext({})}>
                  Don't send these
                </Button>
              </div>
            </Show>

            <Field label="Email for a reply (optional)">
              <TextInput type="email" value={contact()} autocomplete="email" onInput={(e) => setContact(e.currentTarget.value)} />
            </Field>

            <Show when={about() === "abs"}>
              <Checkbox checked={shareWithAbs()} onChange={(e) => setShareWithAbs(e.currentTarget.checked)}>
                The maintainers may pass this on to ABS, including my email if I gave one
              </Checkbox>
            </Show>

            <Show when={error()}>{(message) => <p class="v-error" role="alert">{message()}</p>}</Show>

            <div class="v-row">
              <Button type="submit" disabled={sending()}>
                {sending() ? "Sending…" : "Send feedback"}
              </Button>
              <span class="v-note">Stored for the maintainers. Your IP address is not kept.</span>
            </div>
          </form>
        }
      >
        {(out) => (
          <div class="v-ok" role="status">
            <span>
              Sent — reference <strong>{out().id}</strong>
            </span>
            <span class="v-note">{out().message}</span>
          </div>
        )}
      </Show>
    </div>
  );
}
