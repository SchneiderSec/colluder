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
-- each clear: when, what it covered ('*' everything, '-' the hits with no tag, else one probe's tag)
-- and how many hits it hid. A restore brings back exactly one clear's hits.
CREATE TABLE IF NOT EXISTS clears (at TEXT NOT NULL, scope TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY (at, scope));
-- sources you marked as yours (your browser, Caido): their hits are self-tests, like the OOB box's
CREATE TABLE IF NOT EXISTS mine (ip TEXT PRIMARY KEY, added_at TEXT NOT NULL);
-- phase 2: versioned HTTP answer rules (never edited in place; the latest version is active)
CREATE TABLE IF NOT EXISTS http_rules (
  tag         TEXT NOT NULL,
  version     INTEGER NOT NULL,
  created_at  TEXT NOT NULL,
  rule        TEXT NOT NULL,
  PRIMARY KEY (tag, version)
);
-- the mailbox: mail to <local>@mailbox-<short>.<domain>. Not hits: no alerts, not in
-- the probe views, kept MAIL_DAYS days. local_part is lower-cased (the address as sent is in rcpt).
CREATE TABLE IF NOT EXISTS mail (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  line_hash     TEXT NOT NULL UNIQUE,
  received_at   TEXT NOT NULL,
  stored_at     TEXT NOT NULL,
  rcpt          TEXT NOT NULL,
  local_part    TEXT NOT NULL,
  domain        TEXT NOT NULL,
  mail_from     TEXT,
  helo          TEXT,
  remote_address TEXT NOT NULL,
  tls           TEXT,
  subject       TEXT,
  from_hdr      TEXT,
  to_hdr        TEXT,
  date_hdr      TEXT,
  message_id    TEXT,
  headers       TEXT NOT NULL,
  text          TEXT,
  html          TEXT,
  attachments   TEXT NOT NULL,
  code          TEXT,
  codes         TEXT NOT NULL,
  link          TEXT,
  links         TEXT NOT NULL,
  size          INTEGER NOT NULL,
  sha256        TEXT NOT NULL,
  raw           BLOB NOT NULL
);
CREATE INDEX IF NOT EXISTS mail_local ON mail(local_part, received_at);
CREATE INDEX IF NOT EXISTS mail_received ON mail(received_at);
`;
// columns added after the first release (ALTER TABLE has no IF NOT EXISTS)
const COLUMNS = [["interactions", "answer", "TEXT"], ["probes", "trigger_req", "TEXT"], ["probes", "muted", "INTEGER NOT NULL DEFAULT 0"],
  // the exact request bytes, only when they aren't UTF-8 (raw_request is then a lossy text view)
  ["interactions", "raw_bytes", "BLOB"],
  // who planted a probe and who saved a rule version: "you" or "claude" (the MCP)
  ["probes", "planted_by", "TEXT NOT NULL DEFAULT 'you'"], ["http_rules", "saved_by", "TEXT NOT NULL DEFAULT 'you'"]];

const LIST_COLS = `id, protocol, unique_id AS uniqueId, full_id AS fullId, q_type AS qType,
  remote_address AS remoteAddress, ts AS timestamp, received_at AS receivedAt, tag,
  tag_source AS tagSource, summary, json_extract(answer, '$.hop') AS hop,
  json_extract(answer, '$.decoy') AS decoy, json_extract(answer, '$.code') AS answerCode,
  json_extract(answer, '$.to') AS answerTo, json_extract(answer, '$.status') AS hopCode,
  json_extract(answer, '$.part') AS answerPart, json_extract(answer, '$.mode') AS answerMode,
  json_extract(answer, '$.malformed') AS malformed`;

export class Store {
  constructor(path) {
    this.db = new DatabaseSync(path);
    this.db.exec(SCHEMA);
    for (const [t, c, type] of COLUMNS) {
      const have = this.db.prepare(`PRAGMA table_info(${t})`).all().some((r) => r.name === c);
      if (!have) this.db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${type}`);
    }
    // clears made before the clears table were all of everything
    if (!this.db.prepare("SELECT v FROM meta WHERE k = 'clears_seeded'").get()) {
      this.db.exec(`INSERT OR IGNORE INTO clears (at, scope, count)
        SELECT cleared_at, '*', COUNT(*) FROM interactions WHERE cleared_at IS NOT NULL GROUP BY cleared_at`);
      this.db.prepare("INSERT INTO meta (k, v) VALUES ('clears_seeded', '1')").run();
    }
    this.q = {
      insert: this.db.prepare(`INSERT OR IGNORE INTO interactions
        (line_hash, protocol, unique_id, full_id, q_type, remote_address, ts, received_at, tag, tag_source,
         extra_labels, summary, smtp_from, raw_request, raw_response, req_sha256, answer, raw_bytes)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`),
      byId: this.db.prepare(`SELECT ${LIST_COLS}, extra_labels AS extraLabels, smtp_from AS smtpFrom,
        raw_request AS rawRequest, raw_response AS rawResponse, req_sha256 AS reqSha256, cleared_at AS clearedAt,
        answer, raw_bytes IS NOT NULL AS binary,
        COALESCE(length(raw_bytes), length(CAST(raw_request AS BLOB))) AS rawLength FROM interactions WHERE id = ?`),
      rawBytes: this.db.prepare(`SELECT raw_bytes AS bytes, raw_request AS text FROM interactions WHERE id = ?`),
      recent: this.db.prepare(`SELECT ${LIST_COLS} FROM interactions WHERE cleared_at IS NULL ORDER BY id DESC LIMIT ?`),
      probe: this.db.prepare(`SELECT * FROM probes WHERE tag = ?`),
      probes: this.db.prepare(`SELECT p.tag, p.target, p.note, p.technique, p.planted_at AS plantedAt,
          p.registered, p.retired_at AS retiredAt, COALESCE(length(p.trigger_req), 0) AS triggerBytes, p.muted, p.planted_by AS plantedBy,
          COUNT(i.id) AS hits, MAX(i.ts) AS lastHitAt, MAX(i.id) AS lastId,
          SUM(i.protocol='dns') AS dns, SUM(i.protocol='http') AS http, SUM(i.protocol='https') AS https,
          SUM(i.protocol='smtp') AS smtp, SUM(i.protocol NOT IN ('dns','http','https','smtp')) AS other
        FROM probes p LEFT JOIN interactions i ON i.tag = p.tag AND i.cleared_at IS NULL
        GROUP BY p.tag`),
      untagged: this.db.prepare(`SELECT COUNT(*) AS hits, MAX(ts) AS lastHitAt, MAX(id) AS lastId,
          SUM(protocol='dns') AS dns, SUM(protocol='http') AS http, SUM(protocol='https') AS https,
          SUM(protocol='smtp') AS smtp, SUM(protocol NOT IN ('dns','http','https','smtp')) AS other
        FROM interactions WHERE tag IS NULL AND cleared_at IS NULL`),
      upsertProbe: this.db.prepare(`INSERT INTO probes (tag, target, note, technique, planted_at, registered, planted_by)
        VALUES (?,?,?,?,?,?,?)
        ON CONFLICT(tag) DO UPDATE SET target=excluded.target, technique=excluded.technique,
          registered=1, retired_at=NULL, planted_by=excluded.planted_by`),
      autoProbe: this.db.prepare(`INSERT OR IGNORE INTO probes (tag, planted_at, registered) VALUES (?,?,0)`),
      editProbe: this.db.prepare(`UPDATE probes SET target = COALESCE(?, target), note = COALESCE(?, note) WHERE tag = ?`),
      retire: this.db.prepare(`UPDATE probes SET retired_at = ? WHERE tag = ?`),
      getTrigger: this.db.prepare(`SELECT trigger_req AS req FROM probes WHERE tag = ?`),
      setTrigger: this.db.prepare(`UPDATE probes SET trigger_req = ? WHERE tag = ?`),
      setMuted: this.db.prepare(`UPDATE probes SET muted = ? WHERE tag = ?`),
      unretire: this.db.prepare(`UPDATE probes SET retired_at = NULL WHERE tag = ?`),
      // deleting a probe takes its hits (cleared ones too, so a restore can't bring a ghost back) and rules
      delHits: this.db.prepare(`DELETE FROM interactions WHERE tag = ?`),
      delRules: this.db.prepare(`DELETE FROM http_rules WHERE tag = ?`),
      delProbe: this.db.prepare(`DELETE FROM probes WHERE tag = ?`),
      clear: this.db.prepare(`UPDATE interactions SET cleared_at = ? WHERE cleared_at IS NULL`),
      clearTag: this.db.prepare(`UPDATE interactions SET cleared_at = ? WHERE tag IS ? AND cleared_at IS NULL`),
      logClear: this.db.prepare(`INSERT OR REPLACE INTO clears (at, scope, count) VALUES (?,?,?)`),
      lastClearOf: this.db.prepare(`SELECT at, count FROM clears WHERE scope = ? ORDER BY at DESC LIMIT 1`),
      clearsByScope: this.db.prepare(`SELECT scope, MAX(at) AS at, count FROM clears GROUP BY scope`),
      dropClear: this.db.prepare(`DELETE FROM clears WHERE at = ? AND scope = ?`),
      dropClears: this.db.prepare(`DELETE FROM clears WHERE scope = ?`),
      restore: this.db.prepare(`UPDATE interactions SET cleared_at = NULL WHERE cleared_at = ?`),
      restoreTag: this.db.prepare(`UPDATE interactions SET cleared_at = NULL WHERE cleared_at = ? AND tag IS ?`),
      lastHit: this.db.prepare(`SELECT MAX(ts) AS t FROM interactions`),
      priorForTag: this.db.prepare(`SELECT MAX(ts) AS t FROM interactions WHERE tag IS ? AND id < ?`),
      sourceSeen: this.db.prepare(`SELECT 1 AS x FROM interactions WHERE tag = ? AND remote_address = ? AND protocol <> 'dns' AND id < ? LIMIT 1`),
      // a probe's own hits, newest first, paged by id; optional search and type filter (B4)
      pageHits: this.db.prepare(`SELECT ${LIST_COLS} FROM interactions
        WHERE tag IS ? AND cleared_at IS NULL AND id < ?
          AND (? = '' OR instr(?, ',' || protocol || ',') > 0)
          AND (? = '' OR full_id LIKE ? ESCAPE '\\' OR summary LIKE ? ESCAPE '\\' OR remote_address LIKE ? ESCAPE '\\' OR raw_request LIKE ? ESCAPE '\\')
        ORDER BY id DESC LIMIT ?`),
      // the same, oldest first after a cursor: what arrived since (the MCP's wait_for_hits)
      pageHitsAfter: this.db.prepare(`SELECT ${LIST_COLS} FROM interactions
        WHERE tag IS ? AND cleared_at IS NULL AND id > ?
          AND (? = '' OR instr(?, ',' || protocol || ',') > 0)
          AND (? = '' OR full_id LIKE ? ESCAPE '\\' OR summary LIKE ? ESCAPE '\\' OR remote_address LIKE ? ESCAPE '\\' OR raw_request LIKE ? ESCAPE '\\')
        ORDER BY id ASC LIMIT ?`),
      exportRows: this.db.prepare(`SELECT id, protocol, unique_id AS uniqueId, full_id AS fullId, q_type AS qType,
        remote_address AS remoteAddress, ts AS timestamp, received_at AS receivedAt, tag, tag_source AS tagSource,
        raw_request AS rawRequest, raw_response AS rawResponse, req_sha256 AS reqSha256, answer, raw_bytes AS rawBytes
        FROM interactions WHERE tag IS ? AND cleared_at IS NULL ORDER BY id`),
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
      ruleInsert: this.db.prepare(`INSERT INTO http_rules (tag, version, created_at, rule, saved_by)
        VALUES (?, COALESCE((SELECT MAX(version) FROM http_rules WHERE tag = ?), 0) + 1, ?, ?, ?)`),
      ruleActive: this.db.prepare(`SELECT r.tag, r.version, r.created_at AS createdAt, r.rule FROM http_rules r
        JOIN (SELECT tag, MAX(version) AS v FROM http_rules GROUP BY tag) m ON m.tag = r.tag AND m.v = r.version`),
      ruleHistory: this.db.prepare(`SELECT version, created_at AS createdAt, rule, saved_by AS savedBy FROM http_rules WHERE tag = ? ORDER BY version DESC LIMIT 50`),
      ruleHits: this.db.prepare(`SELECT json_extract(answer, '$.version') AS version, COUNT(*) AS n,
          MAX(json_extract(answer, '$.hop')) AS maxHop, SUM(json_extract(answer, '$.decoy') IS NOT NULL) AS decoys FROM interactions
        WHERE tag = ? AND answer IS NOT NULL AND cleared_at IS NULL GROUP BY 1`),
      // per client (source and User-Agent): how deep into a redirect loop it got; decoy hits aren't the client following
      ruleClients: this.db.prepare(`SELECT json_extract(answer, '$.version') AS version, remote_address AS ip,
          CASE WHEN instr(summary, ' · ') > 0 THEN substr(summary, instr(summary, ' · ') + 3) ELSE '' END AS ua,
          MAX(json_extract(answer, '$.hop')) AS maxHop, MIN(json_extract(answer, '$.hop')) AS minHop, COUNT(*) AS n
        FROM interactions WHERE tag = ? AND answer IS NOT NULL AND cleared_at IS NULL
          AND json_extract(answer, '$.hop') IS NOT NULL AND json_extract(answer, '$.decoy') IS NULL
        GROUP BY 1, 2, 3 ORDER BY MAX(ts) DESC`),
      mineAll: this.db.prepare(`SELECT ip FROM mine ORDER BY added_at`),
      mineAdd: this.db.prepare(`INSERT OR IGNORE INTO mine (ip, added_at) VALUES (?, ?)`),
      mineDel: this.db.prepare(`DELETE FROM mine WHERE ip = ?`),
      seenHit: this.db.prepare(`SELECT 1 AS x FROM interactions WHERE line_hash = ?`),
      seenMail: this.db.prepare(`SELECT 1 AS x FROM mail WHERE line_hash = ?`),
      mailInsert: this.db.prepare(`INSERT OR IGNORE INTO mail (line_hash, received_at, stored_at, rcpt, local_part, domain,
        mail_from, helo, remote_address, tls, subject, from_hdr, to_hdr, date_hdr, message_id, headers, text, html,
        attachments, code, codes, link, links, size, sha256, raw) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`),
      mailRow: this.db.prepare(`SELECT ${MAIL_COLS} FROM mail WHERE id = ?`),
      mailFull: this.db.prepare(`SELECT ${MAIL_COLS}, headers, text, html, codes, links FROM mail WHERE id = ?`),
      mailRaw: this.db.prepare(`SELECT raw FROM mail WHERE id = ?`),
      mailBefore: this.db.prepare(`SELECT ${MAIL_COLS} FROM mail
        WHERE (? = '' OR local_part = ? OR local_part LIKE ? ESCAPE '\\') AND (? = '' OR received_at >= ?) AND id < ?
        ORDER BY id DESC LIMIT ?`),
      mailAfter: this.db.prepare(`SELECT ${MAIL_COLS} FROM mail
        WHERE (? = '' OR local_part = ? OR local_part LIKE ? ESCAPE '\\') AND (? = '' OR received_at >= ?) AND id > ?
        ORDER BY id ASC LIMIT ?`),
      mailStats: this.db.prepare(`SELECT COUNT(*) AS n, MAX(received_at) AS last FROM mail`),
      mailDelete: this.db.prepare(`DELETE FROM mail WHERE id = ?`),
      mailPrune: this.db.prepare(`DELETE FROM mail WHERE received_at < ?`),
      interactshHits: this.db.prepare(`SELECT COUNT(*) AS n FROM interactions
        WHERE tag = ? AND protocol IN ('http','https') AND answer IS NULL AND cleared_at IS NULL`),
    };
  }

  // ---------- the mailbox ----------
  seenLine(line) { return Boolean(this.q.seenHit.get(Store.lineHash(line)) || this.q.seenMail.get(Store.lineHash(line))); }

  // m: { receivedAt, rcpt, localPart, domain, mailFrom, helo, remoteAddress, tls, raw (Buffer), sha256, parsed: readMail() }
  insertMail(line, m, storedAt) {
    const p = m.parsed;
    const r = this.q.mailInsert.run(Store.lineHash(line), m.receivedAt, storedAt, m.rcpt, m.localPart.toLowerCase(), m.domain,
      m.mailFrom ?? null, m.helo ?? null, m.remoteAddress, m.tls ?? null, p.subject, p.from, p.to, p.date, p.messageId,
      JSON.stringify(p.headers), p.text, p.html, JSON.stringify(p.attachments), p.code, JSON.stringify(p.codes),
      p.link, JSON.stringify(p.links), m.raw.length, m.sha256, m.raw);
    return r.changes ? this.mailRow(Number(r.lastInsertRowid)) : null;
  }
  mailRow(id) { const r = this.q.mailRow.get(id); return r ? mailOut(r) : null; }
  mail(id) {
    const r = this.q.mailFull.get(id);
    if (!r) return null;
    return { ...mailOut(r), headers: JSON.parse(r.headers), text: r.text, html: r.html, codes: JSON.parse(r.codes), links: JSON.parse(r.links) };
  }
  mailRaw(id) { const r = this.q.mailRaw.get(id); return r ? Buffer.from(r.raw) : null; }
  // newest first (or oldest first after a cursor); local: one local part (and its +tags); since: ISO time
  mailList({ local = "", since = "", before = Number.MAX_SAFE_INTEGER, after, limit = 50 } = {}) {
    const l = String(local).toLowerCase();
    const plus = l ? l.replace(/[\\%_]/g, (c) => "\\" + c) + "+%" : "";
    const n = Math.min(Math.max(limit, 1), 200);
    const rows = after !== undefined ? this.q.mailAfter.all(l, l, plus, since, since, after, n) : this.q.mailBefore.all(l, l, plus, since, since, before, n);
    return rows.map(mailOut);
  }
  latestMail(local, since = "") { return this.mailList({ local, since, limit: 1 })[0] ?? null; }
  mailStats() { const r = this.q.mailStats.get(); return { count: Number(r.n || 0), lastAt: r.last || null }; }
  deleteMail(id) { return this.q.mailDelete.run(id).changes; }
  pruneMail(beforeIso) { return this.q.mailPrune.run(beforeIso).changes; }

  static lineHash(line) {
    return createHash("sha1").update(line).digest("hex");
  }

  // Returns the stored row (list shape) or null when the line was already ingested.
  insert(line, it, receivedAt) {
    // the hash is of the bytes that arrived, not of a text view of them
    const sha = (it.rawBytes ? createHash("sha256").update(it.rawBytes) : createHash("sha256").update(it.rawRequest, "utf8")).digest("hex");
    const r = this.q.insert.run(Store.lineHash(line), it.protocol, it.uniqueId, it.fullId, it.qType,
      it.remoteAddress, it.timestamp, receivedAt, it.tag, it.tagSource, JSON.stringify(it.extraLabels),
      it.summary, it.smtpFrom, it.rawRequest, it.rawResponse, sha, it.answer ? JSON.stringify(it.answer) : null, it.rawBytes ?? null);
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
    r.binary = !!r.binary;
    r.answer = r.answer ? JSON.parse(r.answer) : null;
    r.enrich = this.enrich(r.remoteAddress);
    return r;
  }

  // the request exactly as it arrived (the stored bytes, or the text when it was UTF-8)
  rawRequestBytes(id) {
    const r = this.q.rawBytes.get(id);
    return r ? (r.bytes ? Buffer.from(r.bytes) : Buffer.from(r.text, "utf8")) : null;
  }

  recent(limit = 2000) {
    return this.q.recent.all(limit);
  }

  probes() {
    const own = new Map(this.q.clearsByScope.all().map((c) => [c.scope, c]));
    const withClear = (r, scope) => {
      const c = own.get(scope);
      return { ...r, clearedAt: c?.at ?? null, clearedCount: c ? Number(c.count) : 0 };
    };
    const list = this.q.probes.all().map(normCounts).map((r) => withClear(r, r.tag));
    const u = withClear(normCounts(this.q.untagged.get()), "-");
    return { probes: list, untagged: u };
  }

  // C2: the request that made the target call back, pasted from the proxy (text, up to 32 KB)
  trigger(tag) { return this.q.getTrigger.get(tag)?.req ?? ""; }

  probe(tag) {
    return this.probes().probes.find((p) => p.tag === tag) || null;
  }

  plant(tag, target, technique, now, by = "you") {
    const existing = this.q.probe.get(tag);
    this.q.upsertProbe.run(tag, target || "", "", technique || "callback", existing ? existing.planted_at : now, 1, by);
    return this.probe(tag);
  }

  editProbe(tag, { target, note, trigger, muted }) {
    this.q.editProbe.run(target ?? null, note ?? null, tag);
    if (muted !== undefined) this.q.setMuted.run(muted ? 1 : 0, tag);
    if (trigger !== undefined) this.q.setTrigger.run(trigger || null, tag);
    return this.probe(tag);
  }

  mine() { return this.q.mineAll.all().map((r) => r.ip); }
  setMine(ip, on, at) { on ? this.q.mineAdd.run(ip, at) : this.q.mineDel.run(ip); return this.mine(); }

  retire(tag, at) { at ? this.q.retire.run(at, tag) : this.q.unretire.run(tag); return this.probe(tag); }

  clearAll(at) {
    const n = this.q.clear.run(at).changes;
    if (n) this.q.logClear.run(at, "*", n);
    return n;
  }

  // one probe's hits (tag null: the hits with no tag), hidden like a clear of everything
  clearProbe(tag, at) {
    const n = this.q.clearTag.run(at, tag).changes;
    if (n) this.q.logClear.run(at, tag ?? "-", n);
    return n;
  }
  restoreProbe(tag) {
    const scope = tag ?? "-", last = this.q.lastClearOf.get(scope);
    if (!last) return 0;
    this.db.exec("BEGIN");
    try {
      const n = this.q.restoreTag.run(last.at, tag).changes;
      this.q.dropClear.run(last.at, scope);
      this.db.exec("COMMIT");
      return n;
    } catch (e) { this.db.exec("ROLLBACK"); throw e; }
  }

  // permanent: the probe, every hit stored for it and its rule history. Returns the hits removed.
  deleteProbe(tag) {
    this.db.exec("BEGIN");
    try {
      const hits = this.q.delHits.run(tag).changes;
      this.q.delRules.run(tag);
      this.q.delProbe.run(tag);
      this.q.dropClears.run(tag);
      this.db.exec("COMMIT");
      return hits;
    } catch (e) { this.db.exec("ROLLBACK"); throw e; }
  }

  restoreLastClear() {
    const last = this.q.lastClearOf.get("*");
    if (!last) return 0;
    this.db.exec("BEGIN");
    try {
      const n = this.q.restore.run(last.at).changes;
      this.q.dropClear.run(last.at, "*");
      this.db.exec("COMMIT");
      return n;
    } catch (e) { this.db.exec("ROLLBACK"); throw e; }
  }

  // the last clear of everything (a probe's own clears are on the probe: clearedAt, clearedCount)
  lastClear() {
    const l = this.q.lastClearOf.get("*");
    return l ? { at: l.at, count: Number(l.count) } : null;
  }

  lastHitAt() { return this.q.lastHit.get().t || null; }

  priorHitForTag(tag, id) { return this.q.priorForTag.get(tag, id).t || null; }
  // B4: page through, search and filter one probe's hits (tag null = Unregistered)
  hits(tag, { before = Number.MAX_SAFE_INTEGER, after, limit = 200, q = "", types = [] } = {}) {
    const t = types.length ? "," + types.join(",") + "," : "";
    const like = q ? "%" + q.replace(/[\\%_]/g, (c) => "\\" + c) + "%" : "";
    const n = Math.min(Math.max(limit, 1), 500);
    if (after !== undefined) return this.q.pageHitsAfter.all(tag, after, t, t, like, like, like, like, like, n);
    return this.q.pageHits.all(tag, before, t, t, like, like, like, like, like, n);
  }
  *exportRows(tag) { for (const r of this.q.exportRows.iterate(tag)) yield r; }

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
  saveRule(tag, rule, at, by = "you") {
    this.q.ruleInsert.run(tag, tag, at, JSON.stringify(rule), by);
    return this.activeRules()[tag];
  }
  // { tag: { version, createdAt, rule } } for the latest version of every probe that has one
  activeRules() {
    const out = {};
    for (const r of this.q.ruleActive.all()) out[r.tag] = { version: Number(r.version), createdAt: r.createdAt, rule: JSON.parse(r.rule) };
    return out;
  }
  ruleHistory(tag, selfIps = []) {
    const rows = new Map(this.q.ruleHits.all(tag).map((r) => [r.version == null ? "default" : Number(r.version), r]));
    const n = (k) => Number(rows.get(k)?.n || 0);
    // self-tests (this box, sources marked as yours) say nothing about the target's HTTP client
    const self = new Set([...selfIps, ...this.mine()]);
    const clients = new Map();
    for (const c of this.q.ruleClients.all(tag)) {
      if (self.has(c.ip) || c.version == null) continue;
      const v = Number(c.version);
      if (!clients.has(v)) clients.set(v, []);
      const list = clients.get(v);
      if (list.length < 8) list.push({ ip: c.ip, ua: String(c.ua).slice(0, 80), maxHop: Number(c.maxHop), minHop: Number(c.minHop), hits: Number(c.n) });
    }
    return {
      // maxHop: the deepest hop a target client reached (self-tests and decoys left out); decoys: hits
      // that got the decoy reply; clients: the same per source and User-Agent
      history: this.q.ruleHistory.all(tag).map((r) => {
        const x = rows.get(Number(r.version));
        const cs = clients.get(Number(r.version)) ?? [];
        return { version: Number(r.version), createdAt: r.createdAt, savedBy: r.savedBy, rule: JSON.parse(r.rule), hits: n(Number(r.version)),
          maxHop: cs.length ? Math.max(...cs.map((c) => c.maxHop)) : null, decoys: Number(x?.decoys || 0), clients: cs };
      }),
      defaultHits: n("default"),
      interactshHits: Number(this.q.interactshHits.get(tag).n), // answered by interactsh, before the edge
    };
  }

  meta(k, v) {
    if (v === undefined) { const r = this.q.getMeta.get(k); return r ? r.v : null; }
    this.q.setMeta.run(k, String(v));
  }
}

const MAIL_COLS = `id, received_at AS receivedAt, stored_at AS storedAt, rcpt, local_part AS localPart, domain,
  mail_from AS mailFrom, helo, remote_address AS remoteAddress, tls, subject, from_hdr AS "from", to_hdr AS "to",
  date_hdr AS date, message_id AS messageId, attachments, code, link, size, sha256`;
function mailOut(r) {
  const { attachments, ...rest } = r;
  return { ...rest, size: Number(r.size), attachments: JSON.parse(attachments || "[]") };
}

function normCounts(r) {
  if (!r) return r;
  for (const k of ["hits", "dns", "http", "https", "smtp", "other", "registered", "triggerBytes", "muted"]) if (k in r) r[k] = Number(r[k] || 0);
  return r;
}
