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
  clearedAt: string | null;
  enrich: Enrich | null;
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
}

export interface Probe extends Counts {
  tag: string;
  target: string;
  note: string;
  technique: string;
  plantedAt: string;
  registered: number;
  retiredAt: string | null;
}

export type EngineState = "capturing" | "starting" | "degraded" | "down" | "missing" | "unknown";

export interface Status {
  engine: { state: EngineState; detail: string; fix?: string; since?: string | null; unit: string; restarts: number; version: string | null };
  payload: { host: string; correlationId: string; domain: string; writtenAt: string } | null;
  correlationChangedAt: string | null;
  lastHitAt: string | null;
  serverTime: string;
  log: { path: string; exists: boolean; size: number; error: string | null };
  discord: { available: boolean; enabled: boolean };
  lastClear: { at: string; count: number } | null;
}

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
