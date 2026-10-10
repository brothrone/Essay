// 서버 동작 확인: node test/smoke.mjs [주소=http://localhost:8787]
// 관리 열쇠는 환경 변수 ADMIN_TOKEN 또는 .dev.vars 에서 읽는다
import { readFileSync } from 'node:fs'
const BASE = (process.argv[2] || 'http://localhost:8787').replace(/\/$/, '')
let TOKEN = process.env.ADMIN_TOKEN
if (!TOKEN) { try { TOKEN = /ADMIN_TOKEN=(.+)/.exec(readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8'))[1].trim() } catch {} }
let failed = 0
const check = (name, cond, extra = '') => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); if (!cond) failed++ }
const post = (path, body, headers = {}) => fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) })

const h = await fetch(BASE + '/health'); check('상태 확인', h.ok && (await h.json()).ok)

const r1 = await post('/v1/feedback', { kind: 'idea', message: '맞춤 공고를 지역별로 걸러 주세요', app: { version: '1.7.0', os: 'macOS', ai: 'gemini' } })
const j1 = await r1.json(); check('의견 받기', r1.status === 201 && j1.id > 0, `id ${j1.id}`)
check('CORS 허용', r1.headers.get('access-control-allow-origin') === '*')

check('빈 내용 거절', (await post('/v1/feedback', { kind: 'bug', message: ' ' })).status === 400)
check('모르는 종류 거절', (await post('/v1/feedback', { kind: 'spam', message: '안녕하세요' })).status === 400)
check('깨진 JSON 거절', (await post('/v1/feedback', '{oops')).status === 400)
check('너무 큰 요청 거절', (await post('/v1/feedback', { kind: 'etc', message: 'x'.repeat(30000) })).status === 400)

const hp = await post('/v1/feedback', { kind: 'etc', message: '스팸입니다', website: 'http://spam' })
check('스팸 칸은 받은 척만', hp.status === 201 && !(await hp.json()).id)

check('관리 주소: 열쇠 없으면 막음', (await fetch(BASE + '/v1/admin/feedback')).status === 401)
check('관리 주소: 틀린 열쇠 막음', (await fetch(BASE + '/v1/admin/feedback', { headers: { authorization: 'Bearer wrong' } })).status === 401)
const auth = { authorization: `Bearer ${TOKEN}` }
const list = await (await fetch(BASE + '/v1/admin/feedback?status=new', { headers: auth })).json()
check('관리 주소: 의견 목록', list.ok && list.items.some((i) => i.id === j1.id && i.message.includes('지역별')), `${list.items?.length}개`)
check('목록에 IP 해시 안 나옴', list.items.every((i) => !('ip_hash' in i)))
check('상태 바꾸기', (await post(`/v1/admin/feedback/${j1.id}/status`, { status: 'done' }, auth)).status === 200)
const done = await (await fetch(BASE + '/v1/admin/feedback?status=done', { headers: auth })).json()
check('바뀐 상태 반영', done.items.some((i) => i.id === j1.id))

// 횟수 제한: 같은 연결에서 계속 보내면 막힌다 (한도: 시간당 FEEDBACK_PER_HOUR)
let blocked = 0
for (let i = 0; i < 8; i++) if ((await post('/v1/feedback', { kind: 'etc', message: `반복 ${i}` })).status === 429) blocked++
check('같은 곳에서 연달아 보내면 막음', blocked > 0, `8번 중 ${blocked}번 막힘`)


// ===== 익명 사용 통계
const rnd = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('')
const devA = rnd(), devB = rnd()
const today = new Date().toISOString().slice(0, 10)
const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10)
const stat = (install, events, day = today) => post('/v1/stats', { install, days: [{ day, version: '1.8.0', os: 'macOS', arch: 'arm64', ai: 'gemini', events }] })
check('통계 받기', (await stat(devA, { app_open: 1, ai_draft: 2 })).status === 200)
check('같은 날 다시 보내면 덮어씀', (await stat(devA, { app_open: 2, ai_draft: 3 })).status === 200)
await stat(devB, { app_open: 1, posting_read_ok: 1 })
await stat(devA, { app_open: 1 }, yesterday)
check('기기 번호 형식 아니면 거절', (await post('/v1/stats', { install: 'abc', days: [] })).status === 400)
const old = await (await post('/v1/stats', { install: devA, days: [{ day: '2020-01-01', events: { app_open: 1 } }] })).json()
check('너무 오래된 날짜는 안 받음', old.saved === 0)
const sum = await (await fetch(BASE + '/v1/admin/summary?days=7', { headers: auth })).json()
const todayRow = sum.daily.find((d) => d.day === today)
const draft = sum.events.find((e) => e.name === 'ai_draft')
check('요약: 오늘 사용자 수', todayRow && todayRow.users >= 2, `오늘 ${todayRow?.users}명`)
check('요약: 덮어쓴 횟수(중복 없음)', draft && draft.count >= 3 && draft.count % 3 === 0, `ai_draft ${draft?.count}`)
check('요약: 버전 분포', sum.versions.some((v) => v.version === '1.8.0'))

// ===== 오류 보고
const errItem = (n) => ({ source: 'renderer', message: `TypeError: Cannot read properties of undefined (reading 'x${n % 1}') at row 1${n}`, stack: `TypeError: boom\n    at render (file:///Users/kimchul/Essay.app/dist/assets/index-AbC12345.js:10:${n})\n    at x (index-AbC12345.js:2:3)` })
check('오류 받기', (await post('/v1/errors', { install: devA, version: '1.8.0', os: 'macOS', items: [errItem(1)] })).status === 200)
await post('/v1/errors', { install: devB, version: '1.8.0', os: 'Windows', items: [errItem(2)] })
const errs = await (await fetch(BASE + '/v1/admin/errors', { headers: auth })).json()
const e1 = errs.items.find((e) => e.message.includes('reading'))
check('같은 오류는 한 줄로 묶음', e1 && e1.count >= 2 && e1.installs >= 2, `${e1?.count}번 · ${e1?.installs}대`)
check('오류에서 사용자 경로 지움', e1 && !/kimchul/.test(e1.stack || ''))

// ===== 회사별 문항 모음
const qs = [{ prompt: '누리푸드에 지원한 이유와 입사 후 이루고 싶은 목표를 작성해 주세요.', limit: 700 }, { prompt: '데이터를 바탕으로 문제를 해결한 경험을 작성해 주세요.', limit: 800 }]
const share = (install, extra = {}) => post('/v1/questions', { install, company: '(주)누리푸드', position: '디지털 마케팅 인턴', deadline: '2026-10-19', sourceHost: 'www.saramin.co.kr', questions: qs, ...extra })
const s1 = await (await share(devA)).json()
check('문항 보태기', s1.ok && s1.id > 0)
const s2 = await (await share(devB)).json()
check('같은 문항이면 같은 묶음', s2.id === s1.id)
await share(devB) // 같은 기기가 또 보내도 사람 수는 그대로
await share(devA, { position: '영업관리', questions: [{ prompt: '영업 직무에서 이루고 싶은 목표를 작성해 주세요.', limit: 500 }] })
check('문항 없으면 거절', (await post('/v1/questions', { install: devA, company: '누리푸드', questions: [] })).status === 400)
const look = await (await fetch(BASE + '/v1/questions?company=' + encodeURIComponent('누리 푸드') + '&position=' + encodeURIComponent('디지털 마케팅'))).json()
check('회사 이름 표기가 달라도 찾음', look.ok && look.sets.length >= 2, `${look.sets?.length}묶음`)
check('직무가 맞는 묶음이 먼저', look.sets[0]?.position === '디지털 마케팅 인턴' && look.sets[0].questions.length === 2)
check('보탠 사람 수(중복 기기 제외)', look.sets[0]?.contributors === 2, `${look.sets[0]?.contributors}명`)
check('시기 표시', look.sets[0]?.period === '2026 하반기')
check('찾기 결과에 기기 정보 없음', !JSON.stringify(look).includes(devA))
const aq = await (await fetch(BASE + '/v1/admin/questions', { headers: auth })).json()
const hideId = aq.items.find((x) => x.position === '영업관리')?.id
check('관리: 묶음 숨기기', (await post(`/v1/admin/questions/${hideId}/hide`, { hidden: true }, auth)).status === 200)
const look2 = await (await fetch(BASE + '/v1/questions?company=' + encodeURIComponent('누리푸드'))).json()
check('숨긴 묶음은 안 보임', !look2.sets.some((x) => x.id === hideId))

// ---------- 유료 판매 (로컬은 BILLING_MOCK=1: mock- 결제는 바로 완료로 봄. localhost 에서만) ----------
const { createHmac } = await import('node:crypto')
let WH = process.env.PORTONE_WEBHOOK_SECRET
if (!WH) { try { WH = /PORTONE_WEBHOOK_SECRET=(.+)/.exec(readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8'))[1].trim() } catch {} }
const postFrom = (path, body, origin) => fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify(body) })
const prepare = (email, ref, method = 'kakaopay') => post('/v1/billing/prepare', { method, ref: ref || 'c'.repeat(32), email }).then((r) => r.json())
const prep = await prepare('Buyer@Example.com')
if (prep.ok && prep.paymentId.startsWith('mock-')) {
  check('결제 준비: 금액 · 주문 이름 (금액은 서버가 정함)', prep.amount === 3900 && prep.orderName === 'Essay 이용권' && prep.payMethod === 'EASY_PAY' && prep.channelKey === 'channel-kakaopay-test')
  const opt = await (await post('/v1/billing/options', {})).json()
  check('결제 수단: 카카오페이 · 네이버페이', JSON.stringify(opt.methods) === '["kakaopay","naverpay"]' && opt.price === 3900 && opt.listPrice === 4900)
  const np = await prepare('np@example.com', 'b'.repeat(32), 'naverpay')
  check('네이버페이: 채널 · 상품 정보', np.channelKey === 'channel-naverpay-test' && np.bypass?.naverpay?.productItems?.[0]?.name === 'Essay 이용권')
  check('결제 수단 없으면 거절', (await post('/v1/billing/prepare', { ref: 'c'.repeat(32) })).status === 400)
  check('모르는 결제 수단 거절', (await post('/v1/billing/prepare', { method: 'card', ref: 'c'.repeat(32) })).status === 400)
  const okOrigin = await postFrom('/v1/billing/options', {}, 'https://essay.win')
  check('CORS: essay.win 은 허용', okOrigin.headers.get('access-control-allow-origin') === 'https://essay.win')
  const evil = await postFrom('/v1/billing/options', {}, 'https://evil.example')
  check('CORS: 다른 사이트는 허용 안 함', !evil.headers.get('access-control-allow-origin'))
  const dev = 'e'.repeat(64)
  check('결제 전 claim 은 기다림', (await (await post('/v1/license/claim', { ref: 'd'.repeat(32), device: dev })).json()).pending === true)
  // 같은 결제를 동시에 여러 번 확인해도 이용권은 하나
  const many = await Promise.all([1, 2, 3, 4, 5].map(() => post('/v1/billing/complete', { paymentId: prep.paymentId }).then((r) => r.json())))
  const done = many.find((x) => x.key) || {}
  check('결제 확인 → 이용권 키', /^ESSAY(-[A-Z2-9]{4}){4}$/.test(done.key || ''), done.key)
  check('동시에 확인해도 같은 키 하나', many.every((x) => !x.key || x.key === done.key))
  const look = await (await fetch(BASE + '/v1/admin/lookup?q=' + encodeURIComponent('buyer@example.com'), { headers: auth })).json()
  check('관리: 메일로 찾기 → 주문 · 이용권 · 기록', look.ok && look.licenses.filter((l) => l.payment_id === prep.paymentId).length === 1 && look.logs.some((l) => l.event === 'paid'))
  const cl = await (await post('/v1/license/claim', { ref: 'c'.repeat(32), device: dev })).json()
  check('앱이 ref 로 이용권 받기', cl.key === done.key && typeof cl.token === 'string' && cl.token.includes('.'))
  for (const d of ['1', '2']) await post('/v1/license/activate', { key: done.key, device: d.repeat(64) })
  check('기기 4대째는 막음', (await post('/v1/license/activate', { key: done.key, device: '3'.repeat(64) })).status === 409)
  check('없는 키 거절', (await post('/v1/license/activate', { key: 'ESSAY-AAAA-BBBB-CCCC-DDDD', device: dev })).status === 404)
  check('이상한 결제 번호 거절', (await post('/v1/billing/complete', { paymentId: 'nope' })).status === 400)
  const chk = await (await post('/v1/license/check', { key: done.key, device: dev })).json()
  check('확인: 유효 · 등록됨 · 새 등록증', chk.valid === true && chk.active === true && chk.token?.includes('.'))
  check('관리: 기기 초기화', (await post(`/v1/admin/licenses/${done.key}/reset-devices`, { note: '시험' }, auth)).status === 200)
  check('초기화 뒤 확인: 이 기기 등록 안 됨', (await (await post('/v1/license/check', { key: done.key, device: dev })).json()).active === false)
  // 금액이 다른 결제(가짜: 메일 short@test.local → 100원 결제로 봄)는 이용권 없이 자동 취소
  const short = await prepare('short@test.local', 'f'.repeat(32))
  check('금액 불일치 → 이용권 안 줌', (await post('/v1/billing/complete', { paymentId: short.paymentId })).status === 409)
  const sl = await (await fetch(BASE + '/v1/admin/lookup?q=' + short.paymentId, { headers: auth })).json()
  check('금액 불일치 → 자동 취소 기록', sl.logs.some((l) => l.event === 'auto_cancel') && sl.orders[0]?.status === 'failed')
  // 웹훅: 서명이 없거나 틀리면 거절, 맞으면 받음
  const whBody = JSON.stringify({ type: 'Transaction.Paid', timestamp: new Date().toISOString(), data: { paymentId: prep.paymentId, storeId: 'store-local-test' } })
  const signWh = (id, ts, body) => 'v1,' + createHmac('sha256', Buffer.from(WH.replace(/^whsec_/, ''), 'base64')).update(`${id}.${ts}.${body}`).digest('base64')
  const ts = Math.floor(Date.now() / 1000)
  check('웹훅: 서명 없으면 거절', (await post('/v1/billing/webhook', whBody)).status === 401)
  check('웹훅: 틀린 서명 거절', (await fetch(BASE + '/v1/billing/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'webhook-id': 'm1', 'webhook-timestamp': String(ts), 'webhook-signature': 'v1,AAAA' }, body: whBody })).status === 401)
  check('웹훅: 오래된 시각 거절', (await fetch(BASE + '/v1/billing/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'webhook-id': 'm2', 'webhook-timestamp': String(ts - 3600), 'webhook-signature': signWh('m2', ts - 3600, whBody) }, body: whBody })).status === 401)
  check('웹훅: 맞는 서명은 받음', (await fetch(BASE + '/v1/billing/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'webhook-id': 'm3', 'webhook-timestamp': String(ts), 'webhook-signature': signWh('m3', ts, whBody) }, body: whBody })).status === 200)
  // 먼저 쓰던 사람 확인증 (결제 켜기 전: BILLING_LIVE 아님)
  const lg = await (await post('/v1/license/legacy', { device: 'a'.repeat(64) })).json()
  check('먼저 쓰던 사람 확인증', lg.ok && lg.token?.includes('.'))
  // 관리자 환불 → 이용권 막힘
  check('관리: 환불 이유 없으면 거절', (await post(`/v1/admin/orders/${prep.paymentId}/refund`, {}, auth)).status === 400)
  check('관리: 환불', (await post(`/v1/admin/orders/${prep.paymentId}/refund`, { reason: '시험 환불' }, auth)).status === 200)
  check('환불한 키는 확인에서 무효', (await (await post('/v1/license/check', { key: done.key, device: dev })).json()).valid === false)
  check('환불한 키는 새 기기 등록 막음', (await post('/v1/license/activate', { key: done.key, device: dev })).status === 403)
  const gift = await (await post('/v1/admin/licenses', { note: '시험 보상', email: 'gift@example.com' }, auth)).json()
  check('관리: 보상 이용권 만들기', /^ESSAY-/.test(gift.key || ''))
  const sum = await (await fetch(BASE + '/v1/admin/orders', { headers: auth })).json()
  check('관리: 매출 요약', sum.summary && sum.summary.cancelled >= 1 && sum.summary.failed >= 1)
} else check('결제 준비(운영): 포트원 설정 전이면 준비 중', !prep.ok)

console.log(failed ? `\n${failed}개 실패` : '\n모두 통과')
process.exit(failed ? 1 : 0)
