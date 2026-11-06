/**
 * The landing page's small parts: the mark, copy boxes, the declared-vs-observed
 * key, and the live status line.
 */
import { Button } from "@aicolab/ui-solid";
import { createSignal, onSettled, Show } from "solid-js";
import { copyText, longDate, shortDateTime } from "../shared/copy.ts";

/** The mark: a survey grid, a declared line in amber ending at an observed point in teal. */
export function Mark(props: { size?: number }) {
  const size = () => props.size ?? 28;
  return (
    <svg class="lp-mark" width={size()} height={size()} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" class="lp-mark-ground" />
      <path class="lp-mark-grid" d="M8 3v26M16 3v26M24 3v26M3 8h26M3 16h26M3 24h26" />
      <path class="lp-mark-line" d="M6 24.5 11.5 18l5 3 9-11" />
      <circle class="lp-mark-point" cx="25.5" cy="10" r="3.4" />
    </svg>
  );
}

/** One line to copy: a label, the value in mono, a copy button. */
export function CopyLine(props: { label: string; value: string; copied?: string }) {
  return (
    <div class="lp-copy">
      <span class="lp-copy-label">{props.label}</span>
      <div class="lp-copy-row">
        <code class="lp-copy-value">{props.value}</code>
        <Button
          variant="soft"
          class="lp-copy-btn"
          aria-label={`Copy ${props.label.toLowerCase()}`}
          onClick={() => void copyText(props.value, props.copied ?? `${props.label} copied`)}
        >
          Copy
        </Button>
      </div>
    </div>
  );
}

/** A block to copy — a command, a JSON snippet, a message — shown as written. */
export function CopyBlock(props: { label: string; value: string; copied?: string; prose?: boolean }) {
  return (
    <figure class="lp-block" data-prose={props.prose ? "" : undefined}>
      <figcaption>
        <span>{props.label}</span>
        <Button
          variant="ghost"
          class="lp-copy-btn"
          aria-label={`Copy ${props.label.toLowerCase()}`}
          onClick={() => void copyText(props.value, props.copied ?? `${props.label} copied`)}
        >
          Copy
        </Button>
      </figcaption>
      <pre tabindex="0">{props.value}</pre>
    </figure>
  );
}

const DECLARED = 14_761_557_818;
const OBSERVED = 621_536_714;
const fmt = (n: number) => n.toLocaleString("en-AU");

/** The thesis in one bar: what ABS's metadata implies against what exists. */
export function DensityKey() {
  const share = (OBSERVED / DECLARED) * 100;
  return (
    <figure class="lp-density">
      <div
        class="lp-density-bar"
        role="img"
        aria-label={`ABS's metadata implies ${fmt(DECLARED)} series; ${fmt(OBSERVED)} exist, ${share.toFixed(2)} per cent.`}
      >
        <span class="lp-density-observed" style={{ width: `${share}%` }} />
      </div>
      <figcaption class="lp-density-legend">
        <span class="lp-key lp-key-declared">
          <i aria-hidden="true" />
          <span>
            Implied by ABS's metadata <strong>{fmt(DECLARED)}</strong>
          </span>
        </span>
        <span class="lp-key lp-key-observed">
          <i aria-hidden="true" />
          <span>
            Exist, confirmed by retrieval <strong>{fmt(OBSERVED)}</strong> · {share.toFixed(2)}%
          </span>
        </span>
      </figcaption>
    </figure>
  );
}

interface Status {
  catalogue?: { runId?: string; observedAt?: string };
  refresh?: { lastCheckedAt?: string; status?: string } | null;
}

const REFRESH_WORDS: Record<string, string> = {
  clean: "no changes found",
  changes: "changes found, re-probe queued",
  errors: "some checks failed",
};

/** Catalogue date and the last freshness check, from /api/status. Silent when unreachable. */
export function StatusLine() {
  const [status, setStatus] = createSignal<Status | null>(null);
  onSettled(() => {
    const controller = new AbortController();
    fetch("/api/status", { signal: controller.signal, headers: { accept: "application/json" } })
      .then((r) => (r.ok ? (r.json() as Promise<Status>) : null))
      .then((s) => {
        if (s?.catalogue?.observedAt) setStatus(s);
      })
      .catch(() => undefined);
    return () => controller.abort();
  });
  return (
    <Show when={status()}>
      {(s) => (
        <p class="lp-status">
          <span class="lp-status-dot" aria-hidden="true" />
          <span>
            Catalogue observed <strong>{longDate(s().catalogue?.observedAt ?? "")}</strong>
          </span>
          <Show when={s().refresh?.lastCheckedAt}>
            {(checked) => (
              <span>
                Last freshness check {shortDateTime(checked())}
                <Show when={s().refresh?.status}>{(st) => <> — {REFRESH_WORDS[st()] ?? st()}</>}</Show>
              </span>
            )}
          </Show>
        </p>
      )}
    </Show>
  );
}
