// Tiny toast bus + clipboard with a fallback. Plain http on the tailnet is not a secure context,
// so navigator.clipboard is unavailable there; a selection copy still works.
// An action (Undo) keeps the toast up longer and makes it clickable.
export type ToastAction = { label: string; run: () => void };
export type Toast = { id: number; msg: string; bad: boolean; action?: ToastAction };
let listeners: ((t: Toast | null) => void)[] = [];
let n = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

export function onToast(fn: (t: Toast | null) => void) {
  listeners.push(fn);
  return () => { listeners = listeners.filter((l) => l !== fn); };
}
export function toast(msg: string, bad = false, action?: ToastAction) {
  const t = { id: ++n, msg, bad, action };
  listeners.forEach((l) => l(t));
  clearTimeout(timer);
  timer = setTimeout(dismiss, action ? 7000 : 1800);
}
export function dismiss() { clearTimeout(timer); listeners.forEach((l) => l(null)); }

export async function copy(text: string, what: string) {
  try {
    if (window.isSecureContext && navigator.clipboard) await navigator.clipboard.writeText(text);
    else {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.readOnly = true;
      Object.assign(ta.style, { position: "fixed", opacity: "0", top: "0" });
      document.body.append(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      if (!ok) throw new Error("copy refused");
    }
    toast(`Copied ${what}`);
  } catch {
    toast(`Could not copy ${what}: select it and copy manually`, true);
  }
}
