#!/usr/bin/env bash
# 고객 응대용 관리 명령 (guides/고객응대-매뉴얼.md). 관리 열쇠는 server/.prod.vars 에서 읽고 화면에 찍지 않는다.
# 쓰는 법: server/scripts/cs.sh <명령> [값…]
#   find <메일|키|결제번호>          주문 · 이용권 · 기기 수 · 처리 기록 한 번에
#   orders                            최근 주문과 매출 요약
#   log                               최근 처리 기록 (환불 · 자동취소 · 분쟁 · 관리자 조치)
#   recheck <결제번호>                포트원 상태로 주문 다시 맞추기 (결제했는데 키가 안 나왔을 때)
#   refund <결제번호> "<이유>"        포트원 결제 취소 + 이용권 막기
#   reset <키> "<메모>"               등록 기기 비우기 (새 PC · 포맷 · 4대째)
#   devices <키> <대수> "<메모>"      기기 수 한도 바꾸기 (1~10)
#   grant <메일|-> "<메모>"           새 이용권 만들기 (먼저 쓰던 사람 복구 · 보상)
#   revoke <키> "<메모>"              이용권 막기 (공유 · 재판매 · 도용)
#   restore <키> "<메모>"             막은 이용권 다시 풀기
#   forget <메일>                     메일 지우기 (개인정보 삭제 요청)
#   summary                           오늘 볼 것: 매출 · 새 의견 · 자동취소 실패 · 분쟁
set -euo pipefail
cd "$(dirname "$0")/.."
API="${ESSAY_API:-https://api.essay.win}"
VARS=.prod.vars; [[ "$API" == http://localhost* ]] && VARS=.dev.vars
TOKEN=$(sed -n "s/^ADMIN_TOKEN=//p" "$VARS" 2>/dev/null || true)
[[ -z "$TOKEN" ]] && { echo "server/.prod.vars 에 ADMIN_TOKEN 이 없어요" >&2; exit 1; }
pretty() { python3 -c "import json,sys; print(json.dumps(json.load(sys.stdin), ensure_ascii=False, indent=2))"; }
get() { curl -s -H "Authorization: Bearer $TOKEN" "$API$1" | pretty; }
post() { curl -s -X POST -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' -d "$2" "$API$1" | pretty; }
js() { python3 -c "import json,sys; print(json.dumps(dict(zip(sys.argv[1::2], sys.argv[2::2])), ensure_ascii=False))" "$@"; }
enc() { python3 -c "import sys,urllib.parse; print(urllib.parse.quote(sys.argv[1]))" "$1"; }
cmd="${1:-}"; shift || true
case "$cmd" in
  find) get "/v1/admin/lookup?q=$(enc "$1")" ;;
  orders) get "/v1/admin/orders?limit=50" ;;
  log) get "/v1/admin/billing-log?limit=50" ;;
  recheck) post "/v1/admin/orders/$1/recheck" '{}' ;;
  refund) post "/v1/admin/orders/$1/refund" "$(js reason "$2")" ;;
  reset) post "/v1/admin/licenses/$1/reset-devices" "$(js note "${2:-}")" ;;
  devices) post "/v1/admin/licenses/$1/max-devices" "$(python3 -c "import json,sys; print(json.dumps({'n': int(sys.argv[1]), 'note': sys.argv[2]}, ensure_ascii=False))" "$2" "${3:-}")" ;;
  grant) if [[ "$1" == "-" ]]; then post "/v1/admin/licenses" "$(js note "$2")"; else post "/v1/admin/licenses" "$(js email "$1" note "$2")"; fi ;;
  revoke) post "/v1/admin/licenses/$1/revoke" "$(js note "${2:-}")" ;;
  restore) post "/v1/admin/licenses/$1/restore" "$(js note "${2:-}")" ;;
  forget) post "/v1/admin/forget" "$(js email "$1")" ;;
  summary)
    echo "== 매출"; curl -s -H "Authorization: Bearer $TOKEN" "$API/v1/admin/orders?limit=1" | python3 -c "import json,sys; print(json.load(sys.stdin).get('summary'))"
    echo "== 새 의견 · 새 오류"; curl -s -H "Authorization: Bearer $TOKEN" "$API/v1/admin/summary?days=7" | python3 -c "import json,sys; c=json.load(sys.stdin).get('counts',{}); print('의견', c.get('feedback_new'), '· 오류', c.get('errors_new'))"
    echo "== 확인할 결제 기록 (자동취소 실패 · 분쟁 · 금액 불일치)"; curl -s -H "Authorization: Bearer $TOKEN" "$API/v1/admin/billing-log?limit=200" | python3 -c "
import json,sys
items=[i for i in json.load(sys.stdin).get('items',[]) if i['event'] in ('auto_cancel_failed','dispute','amount_mismatch')]
print('\n'.join(f\"{i['at']} {i['event']} {i['payment_id']} {i['detail'] or ''}\" for i in items) or '없음')" ;;
  *) sed -n '2,17p' "$0"; exit 1 ;;
esac
