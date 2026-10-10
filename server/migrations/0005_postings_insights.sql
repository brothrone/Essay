-- 공고 모음: 공고 한 건(주소 열쇠)마다 회사 · 직무 · 마감 · 공고 요약(업무 · 자격 · 우대) · 자소서 문항.
-- source: user = 사용자 앱이 AI 로 읽은 것(동의한 사람만), curated = 개발자가 주요 기업 공식 채용 페이지에서 모은 것.
-- 사용자에게 보이는 것: status = published, 또는 서로 다른 두 기기가 같은 문항을 읽은 user 공고(agree >= 2)
CREATE TABLE postings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  url_key       TEXT NOT NULL UNIQUE,
  url           TEXT NOT NULL,
  company_key   TEXT NOT NULL,
  company       TEXT NOT NULL,
  position      TEXT NOT NULL DEFAULT '',
  period        TEXT NOT NULL DEFAULT '',
  deadline      TEXT NOT NULL DEFAULT '',
  info          TEXT NOT NULL,
  q_hash        TEXT NOT NULL DEFAULT '',
  source        TEXT NOT NULL CHECK (source IN ('user', 'curated')),
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'hidden')),
  agree         INTEGER NOT NULL DEFAULT 1,
  contributors  INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX postings_status ON postings (status, updated_at);
CREATE INDEX postings_company ON postings (company_key, updated_at);
-- 누가(기기 해시) 어떤 문항 묶음(q_hash)을 보탰는지 — 같은 기기는 한 번만 센다
CREATE TABLE posting_contrib (
  posting_id INTEGER NOT NULL,
  install    TEXT NOT NULL,
  q_hash     TEXT NOT NULL,
  info       TEXT NOT NULL,
  at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (posting_id, install)
);

-- 분석: 기업 분석(company) · 직무 분석(job) · 문항 분석(questions, 공고 한 건). 개발자가 만들고 확인한 뒤 공개(published)한다
CREATE TABLE insights (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  kind         TEXT NOT NULL CHECK (kind IN ('company', 'job', 'questions')),
  company_key  TEXT NOT NULL,
  company      TEXT NOT NULL,
  position_key TEXT NOT NULL DEFAULT '',
  position     TEXT NOT NULL DEFAULT '',
  posting_id   INTEGER NOT NULL DEFAULT 0,
  period       TEXT NOT NULL DEFAULT '',
  content      TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'hidden')),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (kind, company_key, position_key, posting_id, period)
);
CREATE INDEX insights_lookup ON insights (company_key, kind, status, updated_at);
