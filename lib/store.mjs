// SQLite persistence (node:sqlite, no deps). The engine's JSONL file stays the raw source of truth;
// this store adds probe metadata, dedupe, enrichment cache, and soft-clear ("nothing silently
// disappears": cleared interactions are hidden, not deleted, and can be restored).
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 3000;
CREATE TABLE IF NOT EXISTS interactions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  line_hash     TEXT NOT NULL UNIQUE,
  protocol      TEXT NOT NULL,
  unique_id     TEXT NOT NULL,
  full_id       TEXT NOT NULL,
  q_type        TEXT,
  remote_address TEXT NOT NULL,
  ts            TEXT NOT NULL,
  received_at   TEXT NOT NULL,
  tag           TEXT,
  tag_source    TEXT,
  extra_labels  TEXT,
  summary       TEXT NOT NULL,
  smtp_from     TEXT,
  raw_request   TEXT NOT NULL,
  raw_response  TEXT NOT NULL,
  req_sha256    TEXT NOT NULL,
  cleared_at    TEXT
);
CREATE INDEX IF NOT EXISTS interactions_tag ON interactions(tag, id);
CREATE INDEX IF NOT EXISTS interactions_cleared ON interactions(cleared_at, id);
CREATE TABLE IF NOT EXISTS probes (
  tag         TEXT PRIMARY KEY,
  target      TEXT NOT NULL DEFAULT '',
  note        TEXT NOT NULL DEFAULT '',
  technique   TEXT NOT NULL DEFAULT 'callback',
  planted_at  TEXT NOT NULL,
  registered  INTEGER NOT NULL DEFAULT 1,
  retired_at  TEXT
);
CREATE TABLE IF NOT EXISTS enrich (
  ip          TEXT PRIMARY KEY,
  rdns        TEXT,
  rdns_at     TEXT,
  asn         TEXT,
  asn_name    TEXT,
  asn_prefix  TEXT,
  asn_cc      TEXT,
  asn_at      TEXT
);
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
-- phase 2: versioned HTTP answer rules (never edited in place; the latest version is active)
CREATE TABLE IF NOT EXISTS http_rules (
  tag         TEXT NOT NULL,
  version     INTEGER NOT NULL,
  created_at  TEXT NOT NULL,
  rule        TEXT NOT NULL,
  PRIMARY KEY (tag, version)
);
`;
// columns added after the first release (ALTER TABLE has no IF NOT EXISTS)
const COLUMNS = [["interactions", "answer", "TEXT"]];

const LIST_COLS = `id, protocol, unique_id AS uniqueId, full_id AS fullId, q_type AS qType,
  remote_address AS remoteAddress, ts AS timestamp, received_at AS receivedAt, tag,
  tag_source AS tagSource, summary, json_extract(answer, '$.hop') AS hop`;

export class Store {
  constructor(path) {
    this.db = new DatabaseSync(path);
    this.db.exec(SCHEMA);
    for (const [t, c, type] of COLUMNS) {
      const have = this.db.prepare(`PRAGMA table_info(${t})`).all().some((r) => r.name === c);
      if (!have) this.db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${type}`);
    }
    this.q = {
      insert: this.db.prepare(`INSERT OR IGNORE INTO interactions
        (line_hash, protocol, unique_id, full_id, q_type, remote_address, ts, received_at, tag, tag_source,
         extra_labels, summary, smtp_from, raw_request, raw_response, req_sha256, answer)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`),
      byId: this.db.prepare(`SELECT ${LIST_COLS}, extra_labels AS extraLabels, smtp_from AS smtpFrom,
        raw_request AS rawRequest, raw_response AS rawResponse, req_sha256 AS reqSha256, cleared_at AS clearedAt,
        answer FROM interactions WHERE id = ?`),
      recent: this.db.prepare(`SELECT ${LIST_COLS} FROM interactions WHERE cleared_at IS NULL ORDER BY id DESC LIMIT ?`),
      probe: this.db.prepare(`SELECT * FROM probes WHERE tag = ?`),
      probes: this.db.prepare(`SELECT p.tag, p.target, p.note, p.technique, p.planted_at AS plantedAt,
          p.registered, p.retired_at AS retiredAt,
          COUNT(i.id) AS hits, MAX(i.ts) AS lastHitAt, MAX(i.id) AS lastId,
          SUM(i.protocol='dns') AS dns, SUM(i.protocol='http') AS http, SUM(i.protocol='https') AS https,
          SUM(i.protocol='smtp') AS smtp, SUM(i.protocol NOT IN ('dns','http','https','smtp')) AS other
        FROM probes p LEFT JOIN interactions i ON i.tag = p.tag AND i.cleared_at IS NULL
        GROUP BY p.tag`),
      untagged: this.db.prepare(`SELECT COUNT(*) AS hits, MAX(ts) AS lastHitAt, MAX(id) AS lastId,
          SUM(protocol='dns') AS dns, SUM(protocol='http') AS http, SUM(protocol='https') AS https,
          SUM(protocol='smtp') AS smtp, SUM(protocol NOT IN ('dns','http','https','smtp')) AS other
        FROM interactions WHERE tag IS NULL AND cleared_at IS NULL`),
      upsertProbe: this.db.prepare(`INSERT INTO probes (tag, target, note, technique, planted_at, registered)
        VALUES (?,?,?,?,?,?)
        ON CONFLICT(tag) DO UPDATE SET target=excluded.target, technique=excluded.technique,
          registered=1, retired_at=NULL`),
      autoProbe: this.db.prepare(`INSERT OR IGNORE INTO probes (tag, planted_at, registered) VALUES (?,?,0)`),
      editProbe: this.db.prepare(`UPDATE probes SET target = COALESCE(?, target), note = COALESCE(?, note) WHERE tag = ?`),
      retire: this.db.prepare(`UPDATE probes SET retired_at = ? WHERE tag = ?`),
      unretire: this.db.prepare(`UPDATE probes SET retired_at = NULL WHERE tag = ?`),
      clear: this.db.prepare(`UPDATE interactions SET cleared_at = ? WHERE cleared_at IS NULL`),
      lastClear: this.db.prepare(`SELECT MAX(cleared_at) AS at, COUNT(*) AS n FROM interactions
        WHERE cleared_at = (SELECT MAX(cleared_at) FROM interactions)`),
      restore: this.db.prepare(`UPDATE interactions SET cleared_at = NULL WHERE cleared_at = ?`),
      lastHit: this.db.prepare(`SELECT MAX(ts) AS t FROM interactions`),
      priorForTag: this.db.prepare(`SELECT MAX(ts) AS t FROM interactions WHERE tag IS ? AND id < ?`),
      sourceSeen: this.db.prepare(`SELECT 1 AS x FROM interactions WHERE tag = ? AND remote_address = ? AND protocol <> 'dns' AND id < ? LIMIT 1`),
      taggedNear: this.db.prepare(`SELECT 1 AS x FROM interactions WHERE tag IS NOT NULL AND ts BETWEEN ? AND ? LIMIT 1`),
      getEnrich: this.db.prepare(`SELECT ip, rdns, asn, asn_name AS asnName, asn_prefix AS asnPrefix,
        asn_cc AS asnCc, rdns_at AS rdnsAt, asn_at AS asnAt FROM enrich WHERE ip = ?`),
      setRdns: this.db.prepare(`INSERT INTO enrich (ip, rdns, rdns_at) VALUES (?,?,?)
        ON CONFLICT(ip) DO UPDATE SET rdns=excluded.rdns, rdns_at=excluded.rdns_at`),
      setAsn: this.db.prepare(`INSERT INTO enrich (ip, asn, asn_name, asn_prefix, asn_cc, asn_at) VALUES (?,?,?,?,?,?)
        ON CONFLICT(ip) DO UPDATE SET asn=excluded.asn, asn_name=excluded.asn_name, asn_prefix=excluded.asn_prefix,
          asn_cc=excluded.asn_cc, asn_at=excluded.asn_at`),
      getMeta: this.db.prepare(`SELECT v FROM meta WHERE k = ?`),
      setMeta: this.db.prepare(`INSERT INTO meta (k, v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v`),
      ruleInsert: this.db.prepare(`INSERT INTO http_rules (tag, version, created_at, rule)
        VALUES (?, COALESCE((SELECT MAX(version) FROM http_rules WHERE tag = ?), 0) + 1, ?, ?)`),
      ruleActive: this.db.prepare(`SELECT r.tag, r.version, r.created_at AS createdAt, r.rule FROM http_rules r
        JOIN (SELECT tag, MAX(version) AS v FROM http_rules GROUP BY tag) m ON m.tag = r.tag AND m.v = r.version`),
      ruleHistory: this.db.prepare(`SELECT version, created_at AS createdAt, rule FROM http_rules WHERE tag = ? ORDER BY version DESC LIMIT 50`),
      ruleHits: this.db.prepare(`SELECT json_extract(answer, '$.version') AS version, COUNT(*) AS n FROM interactions
        WHERE tag = ? AND answer IS NOT NULL AND cleared_at IS NULL GROUP BY 1`),
      interactshHits: this.db.prepare(`SELECT COUNT(*) AS n FROM interactions
        WHERE tag = ? AND protocol IN ('http','https') AND answer IS NULL AND cleared_at IS NULL`),
    };
  }

  static lineHash(line) {
    return createHash("sha1").update(line).digest("hex");
  }

  // Returns the stored row (list shape) or null when the line was already ingested.
  insert(line, it, receivedAt) {
    const sha = createHash("sha256").update(it.rawRequest, "utf8").digest("hex");
    const r = this.q.insert.run(Store.lineHash(line), it.protocol, it.uniqueId, it.fullId, it.qType,
      it.remoteAddress, it.timestamp, receivedAt, it.tag, it.tagSource, JSON.stringify(it.extraLabels),
      it.summary, it.smtpFrom, it.rawRequest, it.rawResponse, sha, it.answer ? JSON.stringify(it.answer) : null);
    if (!r.changes) return null;
    const id = Number(r.lastInsertRowid);
    let probeCreated = false;
    if (it.tag) probeCreated = this.q.autoProbe.run(it.tag, it.timestamp || receivedAt).changes > 0;
    return { row: this.listRow(id), probeCreated };
  }

  listRow(id) {
    const r = this.q.byId.get(id);
    if (!r) return null;
    const { rawRequest, rawResponse, reqSha256, extraLabels, smtpFrom, clearedAt, answer, ...list } = r;
    return list;
  }

  interaction(id) {
    const r = this.q.byId.get(id);
    if (!r) return null;
    r.extraLabels = JSON.parse(r.extraLabels || "[]");
    r.answer = r.answer ? JSON.parse(r.answer) : null;
    r.enrich = this.enrich(r.remoteAddress);
    return r;
  }

  recent(limit = 2000) {
    return this.q.recent.all(limit);
  }

  probes() {
    const list = this.q.probes.all().map(normCounts);
    const u = normCounts(this.q.untagged.get());
    return { probes: list, untagged: u };
  }

  probe(tag) {
    return this.probes().probes.find((p) => p.tag === tag) || null;
  }

  plant(tag, target, technique, now) {
    const existing = this.q.probe.get(tag);
    this.q.upsertProbe.run(tag, target || "", "", technique || "callback", existing ? existing.planted_at : now, 1);
    return this.probe(tag);
  }

  editProbe(tag, { target, note }) {
    this.q.editProbe.run(target ?? null, note ?? null, tag);
    return this.probe(tag);
  }

  retire(tag, at) { at ? this.q.retire.run(at, tag) : this.q.unretire.run(tag); return this.probe(tag); }

  clearAll(at) { return this.q.clear.run(at).changes; }

  restoreLastClear() {
    const last = this.q.lastClear.get();
    if (!last || !last.at) return 0;
    return this.q.restore.run(last.at).changes;
  }

  lastClear() {
    const l = this.q.lastClear.get();
    return l && l.at ? { at: l.at, count: l.n } : null;
  }

  lastHitAt() { return this.q.lastHit.get().t || null; }

  priorHitForTag(tag, id) { return this.q.priorForTag.get(tag, id).t || null; }
  // Discord's context: has this probe heard from this source before (web/SMTP), is a tagged hit near?
  sourceSeen(tag, ip, id) { return Boolean(tag && this.q.sourceSeen.get(tag, ip, id)); }
  taggedHitNear(ts, ms) {
    const t = Date.parse(ts.replace(/(\.\d{3})\d+/, "$1"));
    return Boolean(this.q.taggedNear.get(new Date(t - ms).toISOString(), new Date(t + ms).toISOString()));
  }

  enrich(ip) { return this.q.getEnrich.get(ip) || null; }
  setRdns(ip, rdns, at) { this.q.setRdns.run(ip, rdns, at); }
  setAsn(ip, a, at) { this.q.setAsn.run(ip, a.asn, a.name, a.prefix, a.cc, at); }

  // Re-derive stored summaries when the summary format changes (raw bytes are untouched).
  resummarize(version, fn) {
    if (this.meta("summary_v") === version) return 0;
    const rows = this.db.prepare(`SELECT id, protocol, full_id AS fullId, q_type AS qType, smtp_from AS smtpFrom, raw_request AS rawRequest FROM interactions`).all();
    const upd = this.db.prepare(`UPDATE interactions SET summary = ? WHERE id = ?`);
    let n = 0;
    this.db.exec("BEGIN");
    try {
      for (const r of rows) {
        const next = fn(r);
        if (next != null) { upd.run(next, r.id); n++; }
      }
      this.db.exec("COMMIT");
    } catch (e) { this.db.exec("ROLLBACK"); throw e; }
    this.meta("summary_v", version);
    return n;
  }

  // ---------- HTTP answer rules ----------
  saveRule(tag, rule, at) {
    this.q.ruleInsert.run(tag, tag, at, JSON.stringify(rule));
    return this.activeRules()[tag];
  }
  // { tag: { version, createdAt, rule } } for the latest version of every probe that has one
  activeRules() {
    const out = {};
    for (const r of this.q.ruleActive.all()) out[r.tag] = { version: Number(r.version), createdAt: r.createdAt, rule: JSON.parse(r.rule) };
    return out;
  }
  ruleHistory(tag) {
    const hits = new Map(this.q.ruleHits.all(tag).map((r) => [r.version == null ? "default" : Number(r.version), Number(r.n)]));
    return {
      history: this.q.ruleHistory.all(tag).map((r) => ({ version: Number(r.version), createdAt: r.createdAt, rule: JSON.parse(r.rule), hits: hits.get(Number(r.version)) || 0 })),
      defaultHits: hits.get("default") || 0,
      interactshHits: Number(this.q.interactshHits.get(tag).n), // answered by interactsh, before the edge
    };
  }

  meta(k, v) {
    if (v === undefined) { const r = this.q.getMeta.get(k); return r ? r.v : null; }
    this.q.setMeta.run(k, String(v));
  }
}

function normCounts(r) {
  if (!r) return r;
  for (const k of ["hits", "dns", "http", "https", "smtp", "other", "registered"]) if (k in r) r[k] = Number(r[k] || 0);
  return r;
}
