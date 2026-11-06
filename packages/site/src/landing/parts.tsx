/**
 * The landing page's small parts: the mark and the copy boxes.
 */
import { Button } from "@aicolab/ui-solid";
import { copyText } from "../shared/copy.ts";

/** The mark: a question (the speech bubble) becoming a chart (the line rising inside it). Matches public/icon.svg. */
export function Mark(props: { size?: number }) {
  const size = () => props.size ?? 28;
  return (
    <svg class="lp-mark" width={size()} height={size()} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" class="lp-mark-ground" />
      <path
        class="lp-mark-bubble"
        d="M9 6H23A4 4 0 0 1 27 10V17A4 4 0 0 1 23 21H14L8.5 26V21H9A4 4 0 0 1 5 17V10A4 4 0 0 1 9 6Z"
      />
      <path class="lp-mark-line" d="M9 17.5 13 13.5 16.5 15.5 21.5 10" />
      <circle class="lp-mark-point" cx="21.8" cy="9.8" r="2.3" />
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
