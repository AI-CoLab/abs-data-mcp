/**
 * Copy text to the clipboard and say so. The async clipboard API first; a
 * hidden textarea and execCommand for a browser or frame that refuses it.
 */
import { toast } from "@aicolab/ui-solid";

export async function copyText(text: string, what = "Copied"): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    toast(what, { colorBase: "success", duration: 2500 });
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.append(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      if (ok) {
        toast(what, { colorBase: "success", duration: 2500 });
        return true;
      }
    } catch {
      /* fall through to the notice */
    }
    toast("Couldn't copy automatically — select the text and copy it.", { colorBase: "warning" });
    return false;
  }
}

/** localStorage, best-effort: private windows and blocked storage throw. */
export const stored = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* best-effort */
    }
  },
};

/** "9 September 2026" from an ISO timestamp; the input itself if it does not parse. */
export const longDate = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
};

/** "6 Nov 2026, 6:02 am" from an ISO timestamp. */
export const shortDateTime = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
};
