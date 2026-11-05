import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useApp, keyOf, selectHit, patchProbe, chatterOf, type AppState } from "@/store";
import { UNTAGGED, type Interaction, type Probe } from "@/lib/types";
import { dayOrTime, hmsms, isoMs, plural } from "@/lib/format";
import { groupHits } from "@/lib/raw";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Chip, NewDot, NilDot, TypeChip } from "./bits";
import { HitDetail } from "./HitDetail";
import { cn } from "@/lib/utils";

function EditDialog({ p, open, onOpenChange }: { p: Probe; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [target, setTarget] = useState(p.target);
  const [note, setNote] = useState(p.note);
  useEffect(() => { if (open) { setTarget(p.target); setNote(p.note); } }, [open, p.target, p.note]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[440px] border-rule bg-soot-1">
        <DialogHeader><DialogTitle>Edit {p.tag}</DialogTitle><DialogDescription>Where you planted it and anything worth remembering.</DialogDescription></DialogHeader>
        <label className="text-[12.5px] text-smoke">Target<Input className="mt-1.5" value={target} maxLength={300} onChange={(e) => setTarget(e.target.value)} /></label>
        <label className="text-[12.5px] text-smoke">Note<Textarea className="mt-1.5" rows={4} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} /></label>
        <DialogFooter>
          <Button variant="quiet" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="default" onClick={() => patchProbe(p.tag, { target, note }).then(() => onOpenChange(false), (e) => toast((e as Error).message, true))}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Head({ s }: { s: AppState }) {
  const [edit, setEdit] = useState(false);
  const [retire, setRetire] = useState(false);
  const cls = "flex min-w-0 items-center gap-3.5 border-b border-rule pr-5 pl-6 max-[820px]:flex-wrap max-[820px]:gap-2 max-[820px]:px-3.5 max-[820px]:py-2.5";
  if (s.sel === UNTAGGED) {
    return (
      <div className={cls}>
        <span className="text-[17px] font-semibold">Unregistered</span>
        <span className="text-[12.5px] text-smoke">Hits that carry no tag · <b className="font-semibold text-bone">{s.untagged?.hits ?? 0}</b> hits</span>
      </div>
    );
  }
  const p = s.probes.get(s.sel!)!;
  return (
    <div className={cls}>
      <span className="font-mono text-[17px] whitespace-nowrap">{p.tag}</span>
      {p.retiredAt && <Chip grey>retired</Chip>}
      <div className="flex min-w-0 gap-3.5 overflow-hidden text-[12.5px] whitespace-nowrap text-smoke">
        <span className="truncate" title={p.note || undefined}>{p.target || "No target noted"}</span>
        <span>Planted <b className="font-semibold text-bone">{dayOrTime(p.plantedAt)}</b></span>
        <span><b className="font-semibold text-bone">{p.hits}</b> {p.hits === 1 ? "hit" : "hits"}</span>
        {p.note && <span className="truncate text-ash" title={p.note}>Note: {p.note}</span>}
      </div>
      <div className="ml-auto flex gap-1.5">
        <Button variant="quiet" onClick={() => setEdit(true)}>Edit</Button>
        <Button variant="quiet" onClick={() => (p.retiredAt ? patchProbe(p.tag, { retired: false }).then(() => toast(`Restored ${p.tag}`), (e) => toast((e as Error).message, true)) : setRetire(true))}>{p.retiredAt ? "Restore" : "Retire…"}</Button>
      </div>
      <EditDialog p={p} open={edit} onOpenChange={setEdit} />
      <AlertDialog open={retire} onOpenChange={setRetire}>
        <AlertDialogContent className="max-w-[440px] border-rule bg-soot-1">
          <AlertDialogHeader>
            <AlertDialogTitle>Retire {p.tag}?</AlertDialogTitle>
            <AlertDialogDescription>It moves to Retired at the bottom of the list. Its hits stay, and new hits on this tag are still recorded.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild><Button variant="quiet">Cancel</Button></AlertDialogCancel>
            <AlertDialogAction asChild><Button variant="default" onClick={() => patchProbe(p.tag, { retired: true }).then(() => toast(`Retired ${p.tag}: hits kept, new ones still recorded`), (e) => toast((e as Error).message, true))}>Retire</Button></AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// DNS evidence is the name that was asked for: show the labels before the id, tag highlighted.
export function DnsName({ i }: { i: Interaction }) {
  const prefix = i.fullId.endsWith(i.uniqueId) ? i.fullId.slice(0, -i.uniqueId.length).replace(/\.$/, "") : "";
  const labels = prefix ? prefix.split(".") : [];
  const short = `${i.uniqueId.slice(0, 8)}…`;
  if (!labels.length) return <span className="font-mono text-[12.5px] text-smoke">{short} <span className="font-sans text-[11px] text-ash">(bare id)</span></span>;
  return (
    <span className="font-mono text-[12.5px]">
      {labels.map((l, n) => <span key={n}>{n > 0 && "."}{l === i.tag ? <em className="bg-[#3a2f22] px-px text-bone not-italic">{l}</em> : <span className="text-bone">{l}</span>}</span>)}
      <span className="text-smoke">.{short}</span>
    </span>
  );
}

function rowKeys(fn: () => void) {
  return (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } };
}

function HitRow({ i, open, sel, arrived, child, chatter, onClick }: { i: Interaction; open: number; sel: boolean; arrived: boolean; child?: boolean; chatter?: string; onClick: () => void }) {
  const isNew = i.id > open && !chatter;
  const web = i.protocol === "http" || i.protocol === "https";
  const ref = useRef<HTMLTableRowElement>(null);
  useEffect(() => { if (sel) ref.current?.scrollIntoView({ block: "nearest" }); }, [sel]);
  return (
    <tr ref={ref} tabIndex={0} aria-selected={sel} onClick={(e) => { e.stopPropagation(); onClick(); }} onKeyDown={rowKeys(onClick)}
      className={cn("group cursor-pointer", arrived && "[&>td]:animate-lit", child && "[&>td]:bg-[#191510] [&>td:first-child]:pl-11")}>
      <Td sel={sel} first><span className={cn("flex items-center gap-1.5 font-semibold", isNew ? "text-bone" : "text-smoke")}>{isNew ? <NewDot /> : <NilDot />}#{i.id}</span></Td>
      <Td sel={sel}>{hmsms(i.timestamp)}</Td>
      <Td sel={sel}><TypeChip proto={i.protocol}>{i.protocol === "dns" && i.qType ? `DNS ${i.qType}` : undefined}</TypeChip></Td>
      <Td sel={sel} className="font-mono text-[12.5px]">{i.remoteAddress}</Td>
      <Td sel={sel} last>{web || i.protocol === "smtp" ? <span className="font-mono text-[12.5px]">{i.summary}</span> : i.protocol === "dns" ? <><DnsName i={i} />{chatter && <span className="text-[11px] text-ash"> · resolver chatter around {chatter}</span>}</> : <span className="text-[11px] text-smoke">{i.summary}</span>}</Td>
    </tr>
  );
}
function Td({ children, sel, first, last, className }: { children: React.ReactNode; sel: boolean; first?: boolean; last?: boolean; className?: string }) {
  return (
    <td className={cn("overflow-hidden border-b border-rule-2 px-2.5 py-1.5 text-[12.5px] text-ellipsis whitespace-nowrap group-hover:bg-[#211b16]",
      first && "pl-6 max-[820px]:pl-3.5", last && "max-[820px]:hidden", sel && "border-rule bg-soot-2 text-bone group-hover:bg-soot-2", className)}>{children}</td>
  );
}

export function ProbePane() {
  const s = useApp((x) => x);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  useEffect(() => setExpanded(new Set()), [s.sel]);

  // keyboard: j / k move through hits
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement as HTMLElement)?.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector("[role=dialog],[role=alertdialog]")) return; // never move hits behind an open dialog
      if ((e.key !== "j" && e.key !== "k") || !s.sel) return;
      const hits = s.list.filter((i) => keyOf(i) === s.sel);
      const idx = hits.findIndex((i) => i.id === s.hit);
      const next = hits[Math.min(Math.max(idx + (e.key === "j" ? 1 : -1), 0), hits.length - 1)];
      if (!next) return;
      // stepping into a collapsed DNS burst opens it, so the selection is always a visible row
      const g = groupHits(hits).find((x) => x.kind === "burst" && x.items.some((i) => i.id === next.id));
      if (g) setExpanded((prev) => new Set(prev).add(g.items[g.items.length - 1].id));
      selectHit(next.id);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [s.sel, s.list, s.hit]);

  const hits = s.sel ? s.list.filter((i) => keyOf(i) === s.sel) : [];
  const hitId = s.hit && hits.some((i) => i.id === s.hit) ? s.hit : hits[0]?.id ?? null;
  useEffect(() => { if (hitId !== s.hit && hitId != null) selectHit(hitId); }, [hitId, s.hit]);

  const wrap = "grid min-h-0 min-w-0 grid-rows-[52px_minmax(0,auto)_minmax(0,1fr)] max-[820px]:grid-rows-[auto_auto_auto]";
  if (!s.sel) {
    return (
      <section className={wrap}>
        <div className="border-b border-rule" /><div />
        <div className="flex items-center justify-center border-t border-rule bg-soot-1 text-[12.5px] text-ash">
          {s.probes.size ? "Select a probe to see who called." : "Your probes and their callbacks will appear here."}
        </div>
      </section>
    );
  }
  const p = s.probes.get(s.sel);
  if (!hits.length) {
    const capturing = s.status?.engine?.state === "capturing";
    return (
      <section className={wrap} aria-label={`Probe ${s.sel}`}>
        <Head s={s} />
        <div className="max-w-[72ch] px-6 py-[18px] text-[12.5px] leading-[19px] text-smoke">
          <p>
            <b className="font-semibold text-bone">Armed since {dayOrTime(p?.plantedAt)} UTC · no callbacks yet.</b> Waiting for the target to reach any payload above.{" "}
            {capturing ? "The engine is capturing, so a callback will show up here within seconds."
              : <b className="font-semibold text-bone">The engine is not capturing right now (see the banner above), so callbacks are not being recorded until it is back.</b>}
          </p>
          <ul className="mt-2 ml-[18px] list-disc space-y-1">
            <li>Nothing at all? The fetcher may only accept certain schemes, or block unknown hosts. Try the DNS variant: many targets resolve names they never fetch.</li>
            <li>HTTPS needs the tag in the path (one-label certificate). A prefixed HTTPS host fails TLS and looks like silence.</li>
            <li>Hits arriving under Unregistered instead? The target stripped or rewrote the subdomain.</li>
            <li>Testing DNS yourself and nothing shows? A resolver may answer from its cache and never ask us. Use the DNS payload's fresh-label copy (a random label in front of the tag) to force a new lookup.</li>
          </ul>
        </div>
        <div />
      </section>
    );
  }

  const open = s.openSeen[s.sel] ?? s.seen[s.sel] ?? 0;
  const chatter = s.sel === UNTAGGED ? chatterOf(s.list) : new Map<number, string>();
  const rows: React.ReactNode[] = [];
  for (const g of groupHits(hits)) {
    if (g.kind === "one") { const i = g.items[0]; rows.push(<HitRow key={i.id} i={i} chatter={chatter.get(i.id)} open={open} sel={i.id === hitId} arrived={i.id === s.arrived} onClick={() => selectHit(i.id)} />); continue; }
    const items = g.items, first = items[items.length - 1], last = items[0];
    const exp = expanded.has(first.id);
    const srcs = new Map<string, number>();
    for (const i of items) srcs.set(i.remoteAddress, (srcs.get(i.remoteAddress) || 0) + 1);
    const qtypes = [...new Set(items.map((i) => i.qType).filter(Boolean))].join(", ");
    const anyNew = items.some((i) => i.id > open && !chatter.has(i.id));
    const chatterTags = [...new Set(items.map((i) => chatter.get(i.id)).filter(Boolean))];
    const allChatter = items.every((i) => chatter.has(i.id));
    const sel = !exp && items.some((i) => i.id === hitId);
    const toggle = () => { const n = new Set(expanded); if (exp) n.delete(first.id); else n.add(first.id); setExpanded(n); selectHit(last.id); };
    rows.push(
      <tr key={`g${first.id}`} tabIndex={0} aria-selected={sel} aria-expanded={exp} aria-label={`${items.length} DNS queries, ${exp ? "expanded" : "collapsed"}`} onClick={toggle} onKeyDown={rowKeys(toggle)} className={cn("group cursor-pointer", items.some((i) => i.id === s.arrived) && "[&>td]:animate-lit")}>
        <Td sel={sel} first>
          <span className={cn("flex items-center gap-1.5 font-semibold", anyNew ? "text-bone" : "text-smoke")}>
            {anyNew ? <NewDot /> : <NilDot />}
            <span aria-hidden="true" className="-mr-0.5 -ml-1 text-smoke">
              <ChevronRight className={cn("size-3 transition-transform duration-200", exp && "rotate-90")} />
            </span>
            #{first.id}–{last.id}
          </span>
        </Td>
        <Td sel={sel}>{hmsms(first.timestamp)}</Td>
        <Td sel={sel}><TypeChip proto="dns">DNS ×{items.length}</TypeChip></Td>
        <Td sel={sel}>{srcs.size === 1 ? <span className="font-mono text-[12.5px]">{first.remoteAddress}</span> : `${srcs.size} resolvers`}</Td>
        <Td sel={sel} last>
          {new Set(items.map((i) => i.fullId)).size === 1 && <><DnsName i={first} /><span className="text-[11px] text-smoke"> · </span></>}
          <span className="text-[11px] text-smoke">{qtypes || "DNS"} · {Math.max(...items.map((i) => isoMs(i.timestamp))) - Math.min(...items.map((i) => isoMs(i.timestamp)))} ms · </span>
          {allChatter && <span className="text-[11px] text-ash">resolver chatter around {chatterTags.join(", ")} · </span>}
          <span className="font-mono text-[11px] text-smoke">{[...srcs].sort((a, b) => b[1] - a[1]).map(([ip, n]) => `${ip} ×${n}`).join(" · ")}</span>
        </Td>
      </tr>,
    );
    if (exp) for (const i of items) rows.push(<HitRow key={i.id} child i={i} chatter={chatter.get(i.id)} open={open} sel={i.id === hitId} arrived={i.id === s.arrived} onClick={() => selectHit(i.id)} />);
  }
  const firstHit = hits[hits.length - 1];
  return (
    <section className={wrap} aria-label={`Probe ${s.sel === UNTAGGED ? "Unregistered" : s.sel}`}>
      <Head s={s} />
      <div className="max-h-[min(28vh,212px)] min-h-0 overflow-auto max-[820px]:max-h-none">
        <table className="w-full table-fixed border-collapse">
          <colgroup><col className="w-[112px] max-[820px]:w-[84px]" /><col className="w-[116px] max-[820px]:w-[96px]" /><col className="w-[92px] max-[820px]:w-[84px]" /><col className="w-[150px] max-[820px]:w-auto" /><col className="max-[820px]:w-0" /></colgroup>
          <thead>
            <tr>{["#", "Time (UTC)", "Type", "Source", "Request"].map((t, i) => (
              <th key={t} scope="col" className={cn("sticky top-0 z-[1] border-b border-rule bg-soot px-2.5 py-[5px] text-left text-[11px] font-semibold tracking-[.03em] text-smoke", i === 0 && "pl-6 max-[820px]:pl-3.5", i === 4 && "max-[820px]:hidden")}>{t}</th>
            ))}</tr>
          </thead>
          <tbody>{rows}</tbody>
        </table>
        <div className="flex items-center gap-2.5 px-6 py-1.5 text-[11px] text-ash">
          <hr className="flex-1 border-0 border-t border-rule-2" />
          {p ? `Planted ${dayOrTime(p.plantedAt)} UTC · first hit ${hmsms(firstHit.timestamp)}` : `First hit ${dayOrTime(firstHit.timestamp)} UTC · ${plural(hits.length, "hit")}`}
          <hr className="flex-1 border-0 border-t border-rule-2" />
        </div>
      </div>
      {hitId != null && <HitDetail id={hitId} />}
    </section>
  );
}
