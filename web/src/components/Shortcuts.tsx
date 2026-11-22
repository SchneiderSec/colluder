// The ? sheet: the shortcuts for the view you're in, then the ones that work anywhere.
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SHORTCUTS, typingOrModal, type ShortcutGroup } from "@/lib/shortcuts";

export const Kbd = ({ k }: { k: string }) => <kbd className="rounded-[3px] border border-rule bg-soot-2 px-1.5 font-mono text-label text-bone">{k}</kbd>;
export const Keys = ({ keys }: { keys: string[] }) => (
  <span className="flex items-center gap-1.5">{keys.map((k, i) => <span key={k} className="contents">{i > 0 && <span className="text-ash">or</span>}<Kbd k={k} /></span>)}</span>
);

export function ShortcutRows({ group }: { group: ShortcutGroup }) {
  return (
    <ul className="divide-y divide-rule-2">
      {group.keys.map(([keys, what]) => (
        <li key={what} className="grid grid-cols-[150px_minmax(0,1fr)] items-center gap-x-4 py-1.5 text-body"><Keys keys={keys} /><span className="text-bone">{what}</span></li>
      ))}
    </ul>
  );
}

export function ShortcutSheet({ view }: { view: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "?" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (!open && typingOrModal(e)) return; // open, ? closes it again
      e.preventDefault();
      setOpen((o) => !o);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [open]);
  const groups = [...SHORTCUTS.filter((g) => g.title !== "Anywhere" && g.views.includes(view)), ...SHORTCUTS.filter((g) => g.title === "Anywhere")];
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[85vh] max-w-[620px] overflow-auto border-rule bg-soot-1">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Here, then anywhere. All of them are in Settings › Keyboard.</DialogDescription>
        </DialogHeader>
        {groups.map((g) => (
          <section key={g.title}>
            <h3 className="mb-1 text-label font-semibold tracking-[.03em] text-smoke">{g.title}</h3>
            <ShortcutRows group={g} />
          </section>
        ))}
      </DialogContent>
    </Dialog>
  );
}
