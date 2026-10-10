-- 유료 판매: 주문(결제 시도) · 이용권(라이선스 키) · 이용권을 등록한 기기
-- 주문은 결제 창을 열 때 만들고, 포트원에서 결제 완료를 직접 확인한 뒤에만 이용권을 만든다
CREATE TABLE orders (
  payment_id  TEXT PRIMARY KEY,                 -- 포트원 결제 번호 (서버가 만든 무작위 값)
  ref         TEXT,                             -- 앱이 [구매하기] 때 만든 무작위 값 (결제가 끝나면 앱이 이 값으로 이용권을 받아 감)
  email       TEXT,                             -- 이용권 찾기 · 문의 응대용 (선택)
  amount      INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'ready',    -- ready · paid · cancelled · failed
  license_key TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  paid_at     TEXT
);
CREATE INDEX orders_ref ON orders (ref);
CREATE INDEX orders_email ON orders (email);

CREATE TABLE licenses (
  key         TEXT PRIMARY KEY,                 -- ESSAY-XXXX-XXXX-XXXX-XXXX
  payment_id  TEXT,                             -- 관리자가 직접 준 이용권은 비어 있음
  email       TEXT,
  note        TEXT,
  max_devices INTEGER NOT NULL DEFAULT 3,
  revoked     INTEGER NOT NULL DEFAULT 0,       -- 환불 · 취소되면 1
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE activations (
  license_key TEXT NOT NULL,
  device      TEXT NOT NULL,                    -- 기기 번호의 해시 (원래 값은 저장하지 않음)
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (license_key, device)
);
