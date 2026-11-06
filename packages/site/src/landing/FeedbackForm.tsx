/**
 * The web feedback form: the same shape the connector's submit_feedback tool
 * sends (@abs/contract/feedback), posted to /api/feedback. The Worker
 * validates; this form only helps people get it right first time.
 */
import {
  DETAILS_MAX,
  FEEDBACK_ABOUT,
  FEEDBACK_ABOUT_LABELS,
  FEEDBACK_HONEYPOT_FIELD,
  FEEDBACK_KIND_LABELS,
  FEEDBACK_KINDS,
  type FeedbackAbout,
  type FeedbackKind,
  type FeedbackOutput,
  SUMMARY_MAX,
  type WebFeedbackInput,
} from "@abs/contract/feedback";
import { Button, Callout, Checkbox, Field, SelectControl, TextArea, TextInput } from "@aicolab/ui-solid";
import { createSignal, For, Show } from "solid-js";

const ASSISTANTS = ["Claude", "ChatGPT", "Microsoft Copilot", "GitHub Copilot", "Other", "None"] as const;

type FieldName = "summary" | "details" | "contact" | "kind" | "about" | "assistant";

type Outcome =
  | { kind: "sent"; result: FeedbackOutput }
  | { kind: "limited"; message: string }
  | { kind: "failed"; message: string };

export function FeedbackForm() {
  const [about, setAbout] = createSignal<FeedbackAbout>("connector");
  const [kind, setKind] = createSignal<FeedbackKind>("bug");
  const [summary, setSummary] = createSignal("");
  const [details, setDetails] = createSignal("");
  const [assistant, setAssistant] = createSignal("");
  const [contact, setContact] = createSignal("");
  const [shareWithAbs, setShareWithAbs] = createSignal(false);
  const [honeypot, setHoneypot] = createSignal("");
  const [errors, setErrors] = createSignal<Partial<Record<FieldName, string>>>({});
  const [busy, setBusy] = createSignal(false);
  const [outcome, setOutcome] = createSignal<Outcome | null>(null);

  const errorOf = (name: FieldName) => errors()[name];
  const described = (name: FieldName) => (errorOf(name) ? `fb-${name}-error` : undefined);

  const localErrors = (): Partial<Record<FieldName, string>> => {
    const found: Partial<Record<FieldName, string>> = {};
    if (summary().trim().length < 3) found.summary = "Write at least a few words.";
    const email = contact().trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) found.contact = "That doesn't look like an email address.";
    return found;
  };

  const reset = () => {
    setSummary("");
    setDetails("");
    setContact("");
    setShareWithAbs(false);
    setErrors({});
    setOutcome(null);
  };

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    const found = localErrors();
    setErrors(found);
    if (Object.keys(found).length) {
      document.getElementById(`fb-${Object.keys(found)[0]}`)?.focus();
      return;
    }
    const body: WebFeedbackInput = {
      kind: kind(),
      about: about(),
      summary: summary().trim(),
      ...(details().trim() ? { details: details().trim() } : {}),
      ...(assistant() ? { assistant: assistant() } : {}),
      ...(contact().trim() ? { contact: contact().trim() } : {}),
      shareWithAbs: about() === "abs" && shareWithAbs(),
      [FEEDBACK_HONEYPOT_FIELD]: honeypot(),
    };
    setBusy(true);
    setOutcome(null);
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(body),
      });
      const json: unknown = await response.json().catch(() => null);
      if (response.status === 201 && json && typeof json === "object" && "id" in json) {
        setOutcome({ kind: "sent", result: json as FeedbackOutput });
        return;
      }
      if (response.status === 400 && json && typeof json === "object" && "issues" in json) {
        const issues = (json as { issues: { path: string; message: string }[] }).issues;
        const mapped: Partial<Record<FieldName, string>> = {};
        for (const issue of issues) {
          const name = issue.path.split(".")[0] as FieldName;
          mapped[name] ??= issue.message;
        }
        setErrors(mapped);
        setOutcome({ kind: "failed", message: "Some fields need another look." });
        return;
      }
      if (response.status === 429) {
        const message =
          json && typeof json === "object" && "message" in json ? String((json as { message: unknown }).message) : "";
        setOutcome({
          kind: "limited",
          message: message || "Too many submissions from this address just now. Please try again in a minute.",
        });
        return;
      }
      setOutcome({ kind: "failed", message: `The server answered ${response.status}. Please try again shortly.` });
    } catch {
      setOutcome({ kind: "failed", message: "Couldn't reach the server. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="lp-feedback">
      <Show
        when={outcome()?.kind === "sent" ? (outcome() as Extract<Outcome, { kind: "sent" }>).result : null}
        fallback={
          <form class="lp-form" novalidate onSubmit={(e) => void submit(e)}>
            <fieldset class="lp-radios">
              <legend>What is it about?</legend>
              <For each={FEEDBACK_ABOUT}>
                {(value) => (
                  <label class="lp-radio">
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

            <Field label="What kind of feedback?">
              <SelectControl id="fb-kind" value={kind()} onChange={(e) => setKind(e.currentTarget.value as FeedbackKind)}>
                <For each={FEEDBACK_KINDS}>{(value) => <option value={value}>{FEEDBACK_KIND_LABELS[value]}</option>}</For>
              </SelectControl>
            </Field>

            <div class="lp-field">
              <Field label="In a sentence">
                <TextInput
                  id="fb-summary"
                  required
                  maxlength={SUMMARY_MAX}
                  value={summary()}
                  onInput={(e) => setSummary(e.currentTarget.value)}
                  aria-invalid={errorOf("summary") ? "true" : undefined}
                  aria-describedby={described("summary") ?? "fb-summary-count"}
                  placeholder="e.g. It couldn't find rents for Darwin"
                />
              </Field>
              <div class="lp-field-meta">
                <Show when={errorOf("summary")}>
                  {(message) => (
                    <span class="lp-field-error" id="fb-summary-error">
                      {message()}
                    </span>
                  )}
                </Show>
                <span class="lp-count" id="fb-summary-count">
                  {summary().length}/{SUMMARY_MAX}
                </span>
              </div>
            </div>

            <div class="lp-field">
              <Field label="Details (optional)">
                <TextArea
                  id="fb-details"
                  rows={5}
                  maxlength={DETAILS_MAX}
                  value={details()}
                  onInput={(e) => setDetails(e.currentTarget.value)}
                  aria-invalid={errorOf("details") ? "true" : undefined}
                  aria-describedby={described("details")}
                  placeholder="What you asked, what happened, what you expected. The table or series helps. Please leave out personal information."
                />
              </Field>
              <div class="lp-field-meta">
                <Show when={errorOf("details")}>
                  {(message) => (
                    <span class="lp-field-error" id="fb-details-error">
                      {message()}
                    </span>
                  )}
                </Show>
                <span class="lp-count">
                  {details().length}/{DETAILS_MAX}
                </span>
              </div>
            </div>

            <div class="lp-form-row">
              <Field label="AI tool you were using (optional)">
                <SelectControl id="fb-assistant" value={assistant()} onChange={(e) => setAssistant(e.currentTarget.value)}>
                  <option value="">—</option>
                  <For each={ASSISTANTS}>{(name) => <option value={name}>{name}</option>}</For>
                </SelectControl>
              </Field>
              <div class="lp-field">
                <Field label="Email, if you'd like a reply (optional)">
                  <TextInput
                    id="fb-contact"
                    type="email"
                    autocomplete="email"
                    value={contact()}
                    onInput={(e) => setContact(e.currentTarget.value)}
                    aria-invalid={errorOf("contact") ? "true" : undefined}
                    aria-describedby={described("contact")}
                  />
                </Field>
                <Show when={errorOf("contact")}>
                  {(message) => (
                    <span class="lp-field-error" id="fb-contact-error">
                      {message()}
                    </span>
                  )}
                </Show>
              </div>
            </div>

            <Show when={about() === "abs"}>
              <Checkbox checked={shareWithAbs()} onChange={(e) => setShareWithAbs(e.currentTarget.checked)}>
                You may pass this on to ABS, including my email if I gave one.
              </Checkbox>
            </Show>

            {/* A trap for bots: hidden from people and assistive technology. */}
            <div class="lp-hp" aria-hidden="true">
              <label>
                Website
                <input
                  name={FEEDBACK_HONEYPOT_FIELD}
                  tabindex="-1"
                  autocomplete="off"
                  value={honeypot()}
                  onInput={(e) => setHoneypot(e.currentTarget.value)}
                />
              </label>
            </div>

            <Show when={outcome()}>
              {(o) => (
                <p class="lp-form-notice" role="alert" data-tone={o().kind}>
                  {o().kind === "sent" ? "" : (o() as Exclude<Outcome, { kind: "sent" }>).message}
                </p>
              )}
            </Show>

            <div class="lp-form-actions">
              <Button type="submit" disabled={busy()}>
                {busy() ? "Sending…" : "Send feedback"}
              </Button>
            </div>
          </form>
        }
      >
        {(result) => (
          <Callout
            class="lp-sent"
            colorBase="success"
            variant="soft"
            band={() => <strong>Thanks — it's in</strong>}
            role="status"
          >
            <p>
              Your reference is <code class="lp-ref">{result().id}</code>. Quote it if you want to follow up or have it
              removed.
            </p>
            <Show when={result().message}>
              <p class="lp-muted">{result().message}</p>
            </Show>
            <Button variant="soft" onClick={reset}>
              Send another
            </Button>
          </Callout>
        )}
      </Show>
    </div>
  );
}
