-- Dedicated private database. Never bind a public reporting database here.
CREATE TABLE IF NOT EXISTS intake_schema (version INTEGER PRIMARY KEY CHECK(version = 1));
INSERT OR IGNORE INTO intake_schema(version) VALUES(1);
CREATE TABLE IF NOT EXISTS requests (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  idempotency_hash TEXT NOT NULL UNIQUE,
  payload_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  service TEXT NOT NULL CHECK(service IN ('custom_search','site_review','site_submission')),
  status TEXT NOT NULL DEFAULT 'received' CHECK(status IN ('received','qualified','rejected')),
  revision INTEGER NOT NULL DEFAULT 1,
  queue_json TEXT NOT NULL DEFAULT '{"state":"not_queued"}',
  route_email TEXT NOT NULL CHECK(route_email = 'energy@protonminingco.com'),
  notification_state TEXT NOT NULL DEFAULT 'not_configured',
  received_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_action_id TEXT
);
CREATE INDEX IF NOT EXISTS requests_status ON requests(status, seq);
CREATE TABLE IF NOT EXISTS request_actions (
  action_id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests(id),
  payload_hash TEXT NOT NULL,
  revision INTEGER NOT NULL,
  event_json TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS request_actions_request ON request_actions(request_id, revision);
CREATE TABLE IF NOT EXISTS intake_rates (
  bucket TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
