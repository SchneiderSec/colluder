// Shapes of the collector's JSON API (server.mjs).
export type Protocol = "dns" | "http" | "https" | "smtp" | (string & {});

export interface Interaction {
  id: number;
  protocol: Protocol;
  uniqueId: string;
  fullId: string;
  qType: string | null;
  remoteAddress: string;
  timestamp: string;
  receivedAt: string;
  tag: string | null;
  tagSource: "subdomain" | "path" | null;
  summary: string;
  hop?: number | null; // which hop of a redirect loop Colluder's edge answered (phase 2)
  decoy?: "first" | "user-agent" | "source" | "method" | null; // got the decoy reply
  answerCode?: number | null; // exit redirect: the status sent…
  answerTo?: string | null; // …and the host it pointed at
  hopCode?: number | null; // a loop hop's own code, when it differs from the rule's
  answerPart?: string | null; // a preset part that answered (x.dtd…)
  answerMode?: string | null; // "tls": a handshake that never completed
  malformed?: string | null; // the strict parser refused it; the edge recorded it anyway
}

export interface Enrich {
  ip: string;
  rdns: string | null;
  rdnsAt: string | null;
  asn: string | null;
  asnName: string | null;
  asnPrefix: string | null;
  asnCc: string | null;
  asnAt: string | null;
}

export interface InteractionDetail extends Interaction {
  extraLabels: string[];
  smtpFrom: string | null;
  rawRequest: string;
  rawResponse: string;
  reqSha256: string;
  binary?: boolean; // the request wasn't UTF-8: rawRequest is a lossy view; /api/interactions/:id/raw has the bytes
  rawLength?: number;
  clearedAt: string | null;
  enrich: Enrich | null;
  answer: Answer | null; // set when Colluder's edge answered this hit
}

// Who answered a hit (phase 2). mode "error" = the edge refused a malformed request.
export interface Answer {
  by: "colluder";
  mode: "default" | "redirect" | "custom" | "file" | "preset" | "error" | "tls";
  malformed?: string; // the strict parser refused the request; the edge recorded and answered it anyway
  tls?: { sni: string; alpn: string[]; error: string | null }; // mode "tls": a handshake that never completed
  version: number | null;
  tag?: string | null;
  hop?: number;
  status?: number; // a loop hop's own redirect code, when it differs from the rule's
  decoy?: "first" | "user-agent" | "source" | "method"; // got the default reply as a decoy
  part?: string; // a preset's part that answered (x.dtd, feed.xml…)
  code?: number; // the exit redirect's status…
  to?: string; // …and the host it pointed at
  error?: string;
  droppedBytes?: number;
  delaySkipped?: boolean;
}

export type RuleMode = "default" | "redirect" | "custom" | "file" | "preset";
export interface HttpRule {
  mode: RuleMode;
  delayMs: number;
  schemes: { http: boolean; https: boolean };
  status?: number;
  location?: string;
  loop?: number;
  hopStatuses?: number[] | string; // a string while being typed; the server gets numbers
  decoy?: Decoy | null;
  headers?: [string, string][];
  body?: string;
  bodyEncoding?: "text" | "base64";
  contentType?: string;
  template?: string;
  kind?: "xxe"; // preset: answers by path (PLAN-PRESETS.md)
  params?: { host: string; file: string };
}
// who gets interactsh's harmless default reply instead of the rule (sources: a string while typed)
export interface Decoy { first?: number; ua?: string; sources?: string[] | string }
export interface RuleVersion { version: number; createdAt: string; savedBy?: "you" | "claude"; rule: HttpRule; hits?: number; maxHop?: number | null; decoys?: number; clients?: { ip: string; ua: string; maxHop: number; minHop: number; hits: number }[] }
export interface RuleState { active: RuleVersion | null; history: RuleVersion[]; defaultHits: number; interactshHits: number; edge: EdgeStatus }

export interface EdgeStatus {
  state: "running" | "stale" | "stopped" | "absent" | "unreadable";
  listen?: { http: string; https: string | null; dns?: string | null };
  cert?: { notAfter: string; all?: { names: string[]; notAfter: string }[] } | null;
  heartbeatAt?: string;
  startedAt?: string;
  own?: number;
  relayed?: number;
  errors?: number;
  detail?: string;
  codeStale?: boolean; // the edge runs older code than is on disk: it needs a restart
}

export interface Counts {
  hits: number;
  lastHitAt: string | null;
  lastId: number | null;
  dns: number;
  http: number;
  https: number;
  smtp: number;
  other: number;
  // this probe's own last clear (the No tag view's, on untagged): restorable while it's here
  clearedAt?: string | null;
  clearedCount?: number;
}

export interface Probe extends Counts {
  tag: string;
  target: string;
  note: string;
  technique: string;
  plantedAt: string;
  plantedBy?: "you" | "claude"; // "claude": planted through the MCP (PLAN-MCP.md)
  registered: number;
  retiredAt: string | null;
  triggerBytes?: number;
  muted?: number; // 1: no Discord posts for this probe (hits are still recorded) // C2: size of the saved triggering request (the text itself loads on demand)
  httpRule?: { version: number; mode: RuleMode; createdAt: string; short: string; line: string; scope: string } | null;
}

export type EngineState = "capturing" | "starting" | "degraded" | "down" | "missing" | "unknown";

export interface Status {
  engine: { state: EngineState; detail: string; fix?: string; since?: string | null; unit: string; restarts: number; version: string | null; check?: EngineCheck | null };
  // host: what payloads are built on (the short host once the edge records its DNS); longHost: the engine's
  payload: { host: string; longHost?: string; mailHost?: string; shortId?: string; shortHost?: string; short?: boolean; correlationId: string; domain: string; writtenAt: string } | null;
  correlationChangedAt: string | null;
  lastHitAt: string | null;
  serverTime: string;
  log: { path: string; exists: boolean; size: number; error: string | null };
  discord: { available: boolean; enabled: boolean; hint?: string | null; kinds?: Record<AlertKind, boolean> };
  // the served domains, the one payloads use, and nuclei's interactsh_server as user's config has it
  domains?: { payload: string; served: string[]; nuclei: string | null; switching: string | null };
  lastClear: { at: string; count: number } | null;
  edge?: EdgeStatus;
  selfIps?: string[];
  mineIps?: string[]; // sources you marked as yours
  check?: CheckStatus;
  mailbox?: Mailbox;
}

// the engine check (lib/enginecheck.mjs): a lookup of the engine's own id reached its log, or didn't
export interface EngineCheck { state: "ok" | "failing" | "restarted"; at: string; detail: string | null; tookMs?: number; failures?: number; restartedAt?: string; restartError?: string | null }

// the mailbox (PLAN-MAILBOX.md): mail to <local>@mailbox-<short>.<domain>, kept apart from hits
export interface Mailbox {
  tag: string; host: string; hosts: string[]; live: boolean; smtp: string[] | null; retentionDays: number;
  count: number; lastAt: string | null; lastLookup: { at: string; protocol: string; count: number } | null;
}
export interface MailCode { value: string; score: number; context: string }
export interface MailLink { url: string; label: string | null; score: number }
export interface MailRow {
  id: number; receivedAt: string; storedAt: string; rcpt: string; localPart: string; domain: string;
  mailFrom: string | null; helo: string | null; remoteAddress: string; tls: string | null;
  subject: string | null; from: string | null; to: string | null; date: string | null; messageId: string | null;
  attachments: { filename: string | null; contentType: string; size: number }[];
  code: string | null; link: string | null; size: number; sha256: string;
}
export interface MailDetail extends MailRow { headers: [string, string][]; text: string | null; html: string | null; codes: MailCode[]; links: MailLink[] }

// the outside check (lib/selfcheck.mjs): a callback sent the way a target would, confirmed recorded
export interface CheckStep { key: string; label: string; ok: boolean; detail: string; retried?: boolean }
export interface CheckResult {
  state: "ok" | "warn" | "failing";
  startedAt: string;
  finishedAt: string;
  host: string;
  steps: CheckStep[];
  cert: { validTo: string; days: number } | null;
  domain: { expiresAt?: string; registeredAt?: string | null; days?: number; error?: string; checkedAt: string } | null;
  warnings: string[];
}
export interface CheckStatus { active: boolean; running: boolean; everyMinutes: number; off?: boolean; last: CheckResult | null; domains?: { domain: string; primary: boolean; last: CheckResult | null }[] }

export interface StateResponse {
  status: Status;
  probes: Probe[];
  untagged: Counts;
  interactions: Interaction[];
}

export const UNTAGGED = "__untagged";
export const TAG_RE = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;
export const PROTOS = ["dns", "http", "https", "smtp"] as const;
export const protoKey = (p: string) => ((PROTOS as readonly string[]).includes(p) ? p : "other");

// Discord alert kinds (lib/settings.mjs ALERT_KINDS)
export type AlertKind = "first" | "escalation" | "source" | "late" | "rollup" | "check";
