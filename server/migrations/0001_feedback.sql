-- 앱에서 보낸 의견. IP 는 저장하지 않고 IP_SALT 로 섞은 해시만(보낸 횟수 제한용)
CREATE TABLE feedback (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  kind        TEXT NOT NULL CHECK (kind IN ('bug', 'idea', 'etc')),
  message     TEXT NOT NULL,
  contact     TEXT,
  app_version TEXT,
  os          TEXT,
  ai          TEXT,
  ip_hash     TEXT,
  status      TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'done'))
);
CREATE INDEX feedback_ip_time ON feedback (ip_hash, created_at);
CREATE INDEX feedback_status ON feedback (status, id);
