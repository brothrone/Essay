-- 횟수 제한 계산용 (key 는 해시, bucket 은 시간 · 날짜 묶음). 오래된 것은 매일 지운다
CREATE TABLE rate (
  key    TEXT NOT NULL,
  bucket TEXT NOT NULL,
  n      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, bucket)
);

-- 익명 사용 통계: 기기(무작위 번호의 해시)마다 하루 한 줄. 같은 날을 다시 보내면 덮어쓴다(중복 없음)
CREATE TABLE stats_daily (
  day     TEXT NOT NULL,
  install TEXT NOT NULL,
  version TEXT,
  os      TEXT,
  arch    TEXT,
  ai      TEXT,
  events  TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (day, install)
);

-- 오류 보고: 같은 오류(지문) · 같은 버전은 한 줄로 묶어 횟수만 늘린다
CREATE TABLE errors (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  fingerprint TEXT NOT NULL,
  version     TEXT NOT NULL DEFAULT '',
  source      TEXT NOT NULL,
  message     TEXT NOT NULL,
  stack       TEXT,
  os          TEXT,
  first_seen  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  count       INTEGER NOT NULL DEFAULT 1,
  status      TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'done')),
  UNIQUE (fingerprint, version)
);
CREATE TABLE error_installs (
  error_id INTEGER NOT NULL,
  install  TEXT NOT NULL,
  PRIMARY KEY (error_id, install)
);

-- 회사별 자소서 문항 모음: 공고 페이지에서 읽은 문항 묶음. 같은 회사 · 직무 · 문항이면 한 줄로 묶어 보탠 사람 수만 늘린다
CREATE TABLE question_sets (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  set_key      TEXT NOT NULL UNIQUE,
  company_key  TEXT NOT NULL,
  company      TEXT NOT NULL,
  position     TEXT NOT NULL DEFAULT '',
  period       TEXT NOT NULL DEFAULT '',
  questions    TEXT NOT NULL,
  source_host  TEXT,
  contributors INTEGER NOT NULL DEFAULT 1,
  first_seen   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  hidden       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX question_sets_company ON question_sets (company_key, hidden, last_seen);
CREATE TABLE question_contrib (
  set_id  INTEGER NOT NULL,
  install TEXT NOT NULL,
  PRIMARY KEY (set_id, install)
);
