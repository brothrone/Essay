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

console.log(failed ? `\n${failed}개 실패` : '\n모두 통과')
process.exit(failed ? 1 : 0)
