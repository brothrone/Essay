-- 결제 보안 보강
-- 1) 결제 한 건에 이용권은 하나만 (동시에 두 번 확인돼도 키가 두 개 생기지 않게)
CREATE UNIQUE INDEX licenses_payment_once ON licenses (payment_id) WHERE payment_id IS NOT NULL;
-- 2) 결제를 켜기 전부터 쓰던 기기 (서버가 서명한 '먼저 쓰던 사람' 확인증을 다시 줄 때 확인)
CREATE TABLE legacy_devices (
  device     TEXT PRIMARY KEY,                  -- 기기 번호의 해시
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
-- 3) 주문 상태 찾기 · 정리용
CREATE INDEX orders_status ON orders (status, created_at);
-- 4) 처리 기록 (환불 · 금액 불일치 · 관리자 조치). 고객 응대 때 무슨 일이 있었는지 본다
CREATE TABLE billing_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  payment_id TEXT,
  license_key TEXT,
  event      TEXT NOT NULL,                     -- paid · cancelled · amount_mismatch · auto_cancel · dispute · admin_refund · admin_revoke · admin_restore · admin_reset · admin_grant
  detail     TEXT
);
CREATE INDEX billing_log_payment ON billing_log (payment_id);
CREATE INDEX billing_log_key ON billing_log (license_key);
