// 유료 판매: 결제 준비 → (사이트 구매 페이지에서 포트원 결제) → 포트원에서 결제 완료를 직접 확인 → 이용권(라이선스 키) 발급 → 앱이 기기 등록.
// 앱은 서버가 서명한 등록증(token)을 받아 두고, 인터넷이 없어도 공개 키로 확인한다. 환불되면 다음 확인 때 풀린다.
//
// 보안 원칙 (guides/서버-안내.md "결제 · 이용권", 고객 응대는 guides/고객응대-매뉴얼.md)
// - 금액 · 상태는 브라우저 · 웹훅이 알려 주는 값을 믿지 않고 항상 포트원 API 로 다시 확인한다. 결제 전에 금액을 포트원에 사전 등록해 다른 금액으로는 결제 자체가 안 되게 한다
// - 금액이 다르면 이용권을 만들지 않고 자동으로 결제를 취소한다. 결제 한 건에 이용권은 하나(DB 고유 인덱스)
// - 웹훅은 서명(Standard Webhooks)을 확인하고, 그래도 내용은 결제 번호로 다시 조회한다
// - 가짜 결제(BILLING_MOCK)는 localhost 요청에서만 동작한다. 운영 주소에서는 설정이 켜져 있어도 무시
// - 구매 페이지 요청은 essay.win 에서 온 것만 받는다(CORS). 횟수 제한 · 관리 열쇠 실패 제한
// - 이용권 키 · 메일은 관리 주소에서만 보이고, 기기 번호는 섞어서(해시) 저장한다
import { clip, fail, hashFor, ipOf, json, overLimit, readJson, type Env } from './util'

const ALLOWED_ORIGINS = ['https://essay.win', 'https://www.essay.win']
// 로컬 개발(wrangler dev)인지: 운영(Cloudflare)에서는 접속 IP 가 늘 공인 IP 로 붙는다(손님이 바꿀 수 없음)
const isLocal = (req: Request) => {
  const ip = req.headers.get('cf-connecting-ip')
  return !ip || ip === '127.0.0.1' || ip === '::1'
}
function cors(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || ''
  const ok = ALLOWED_ORIGINS.includes(origin) || (isLocal(req) && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))
  return ok
    ? { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400', vary: 'origin' }
    : { vary: 'origin' }
}

const price = (env: Env) => Number(env.PRICE) || 3900
// 가짜 결제는 세 조건이 모두 맞을 때만: 로컬 설정(.dev.vars)의 BILLING_MOCK, 로컬 요청, 포트원 비밀 값 없음(운영에는 늘 있음)
const mock = (env: Env, req: Request) => env.BILLING_MOCK === '1' && !env.PORTONE_API_SECRET && isLocal(req)
const ready = (env: Env, req: Request) => !!(env.PORTONE_STORE_ID && env.PORTONE_CHANNEL_KEY && (env.PORTONE_API_SECRET || mock(env, req)))
const randomHex = (bytes: number) => [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('')
const now = () => new Date().toISOString()

// 헷갈리는 글자(0 O 1 I)를 뺀 키: ESSAY-XXXX-XXXX-XXXX-XXXX (32^16 ≈ 2^80 가지)
const KEY_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function newKey() {
  const r = crypto.getRandomValues(new Uint8Array(16))
  const s = [...r].map((b) => KEY_CHARS[b % KEY_CHARS.length]).join('')
  return `ESSAY-${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}`
}
export const validKey = (v: unknown) => {
  const s = typeof v === 'string' ? v.trim().toUpperCase().replace(/\s+/g, '') : ''
  return /^ESSAY(-[A-HJ-NP-Z2-9]{4}){4}$/.test(s) ? s : ''
}
const validDevice = (v: unknown) => (typeof v === 'string' && /^[0-9a-f]{64}$/.test(v) ? v : '')
const validRef = (v: unknown) => (typeof v === 'string' && /^[0-9a-f]{32}$/.test(v) ? v : '')
const validPaymentId = (v: unknown) => (typeof v === 'string' && /^(mock-)?essay-[0-9a-z]{6,12}-[0-9a-f]{12,16}$/.test(v) ? v : '')
export const validEmail = (v: unknown) => {
  const s = clip(v, 120).toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : ''
}

// ---------- 등록증 서명 (Ed25519). 앱은 공개 키로 확인한다 ----------
const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf instanceof Uint8Array ? buf : new Uint8Array(buf)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
let signKey: CryptoKey | null = null
async function sign(env: Env, payload: Record<string, unknown>) {
  if (!signKey) {
    const der = Uint8Array.from(atob(env.LICENSE_PRIVATE_KEY), (c) => c.charCodeAt(0))
    signKey = await crypto.subtle.importKey('pkcs8', der, { name: 'Ed25519' }, false, ['sign'])
  }
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)))
  const sig = await crypto.subtle.sign({ name: 'Ed25519' }, signKey, new TextEncoder().encode(body))
  return `${body}.${b64url(sig)}`
}
/** k: 이용권 키(또는 'LEGACY'), d: 기기 번호, t: 서버가 확인한 시각 — 앱은 t 가 오래되면 다시 확인을 요구한다 */
const tokenFor = (env: Env, k: string, d: string) => sign(env, { v: 1, k, d, t: Date.now() })

// ---------- 포트원 V2 ----------
const PORTONE = 'https://api.portone.io'
type PortonePayment = { id?: string; storeId?: string; status?: string; currency?: string; amount?: { total?: number } }
async function portone(env: Env, method: string, path: string, body?: unknown) {
  return fetch(PORTONE + path, {
    method,
    headers: { authorization: `PortOne ${env.PORTONE_API_SECRET}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
}
async function fetchPayment(env: Env, req: Request | null, paymentId: string): Promise<PortonePayment | null> {
  if (paymentId.startsWith('mock-')) {
    // 로컬 시험용 가짜 결제: localhost 에서만. 메일이 cancel@test.local 면 취소, short@test.local 면 금액이 모자란 결제로 본다
    if (!req || !mock(env, req)) return null
    const o = await env.DB.prepare(`SELECT email FROM orders WHERE payment_id = ?1`).bind(paymentId).first<{ email: string | null }>()
    const total = o?.email === 'short@test.local' ? 100 : price(env)
    return { id: paymentId, status: o?.email === 'cancel@test.local' ? 'CANCELLED' : 'PAID', currency: 'KRW', amount: { total } }
  }
  const r = await portone(env, 'GET', `/payments/${encodeURIComponent(paymentId)}`)
  if (r.status === 404) return null
  if (!r.ok) throw new Error(`포트원 조회 실패 ${r.status}`)
  return (await r.json()) as PortonePayment
}
async function cancelPayment(env: Env, paymentId: string, reason: string) {
  if (paymentId.startsWith('mock-')) return true
  const r = await portone(env, 'POST', `/payments/${encodeURIComponent(paymentId)}/cancel`, { storeId: env.PORTONE_STORE_ID, reason })
  if (!r.ok) console.error('포트원 취소 실패', paymentId, r.status, (await r.text()).slice(0, 300))
  return r.ok
}

const log = (env: Env, event: string, paymentId: string | null, key: string | null, detail = '') =>
  env.DB.prepare(`INSERT INTO billing_log (event, payment_id, license_key, detail) VALUES (?1, ?2, ?3, ?4)`).bind(event, paymentId, key, detail.slice(0, 500))

type Order = { payment_id: string; ref: string | null; email: string | null; amount: number; status: string; license_key: string | null }
const getOrder = (env: Env, paymentId: string) => env.DB.prepare(`SELECT * FROM orders WHERE payment_id = ?1`).bind(paymentId).first<Order>()

/** 포트원 결과로 주문 상태를 맞춘다. 결제 완료면 이용권을 만들고(한 번만), 취소면 이용권을 막는다 */
async function settle(env: Env, req: Request | null, order: Order): Promise<Order> {
  if (order.status === 'cancelled') return order
  const p = await fetchPayment(env, req, order.payment_id)
  if (!p) return order
  if ((p.id && p.id !== order.payment_id) || (p.storeId && env.PORTONE_STORE_ID && p.storeId !== env.PORTONE_STORE_ID)) {
    console.error('다른 결제 정보가 돌아옴', order.payment_id)
    return order
  }
  if (p.status === 'PAID') {
    if (p.currency !== 'KRW' || p.amount?.total !== order.amount) {
      // 금액이 다르면 이용권을 만들지 않고 결제를 되돌린다 (사전 등록으로 거의 생기지 않지만 대비)
      if (order.status !== 'failed') {
        await env.DB.batch([
          env.DB.prepare(`UPDATE orders SET status = 'failed' WHERE payment_id = ?1`).bind(order.payment_id),
          log(env, 'amount_mismatch', order.payment_id, null, `paid ${p.currency} ${p.amount?.total}, expected ${order.amount}`),
        ])
        const ok = await cancelPayment(env, order.payment_id, '결제 금액 불일치로 자동 취소')
        await log(env, ok ? 'auto_cancel' : 'auto_cancel_failed', order.payment_id, null).run()
      }
      return { ...order, status: 'failed' }
    }
    if (order.license_key) return order.status === 'paid' ? order : { ...order, status: 'paid' }
    const key = newKey()
    try {
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO licenses (key, payment_id, email) VALUES (?1, ?2, ?3)`).bind(key, order.payment_id, order.email),
        env.DB.prepare(`UPDATE orders SET status = 'paid', license_key = ?1, paid_at = ?2 WHERE payment_id = ?3 AND license_key IS NULL`).bind(key, now(), order.payment_id),
        log(env, 'paid', order.payment_id, key, `${order.amount}`),
      ])
    } catch {
      // 같은 결제를 동시에 확인한 다른 요청이 먼저 이용권을 만들었다 (결제 한 건 = 이용권 하나, 고유 인덱스)
    }
    return (await getOrder(env, order.payment_id)) || order
  }
  if (p.status === 'CANCELLED' || p.status === 'PARTIAL_CANCELLED') {
    await env.DB.batch([
      env.DB.prepare(`UPDATE orders SET status = 'cancelled' WHERE payment_id = ?1`).bind(order.payment_id),
      env.DB.prepare(`UPDATE licenses SET revoked = 1 WHERE payment_id = ?1`).bind(order.payment_id),
      log(env, 'cancelled', order.payment_id, order.license_key, p.status),
    ])
    return { ...order, status: 'cancelled' }
  }
  if (p.status === 'FAILED' && order.status === 'ready') {
    await env.DB.prepare(`UPDATE orders SET status = 'failed' WHERE payment_id = ?1`).bind(order.payment_id).run()
    return { ...order, status: 'failed' }
  }
  return order
}

async function activate(env: Env, key: string, deviceRaw: string) {
  const lic = await env.DB.prepare(`SELECT key, revoked, max_devices FROM licenses WHERE key = ?1`).bind(key).first<{ key: string; revoked: number; max_devices: number }>()
  if (!lic) return { error: '없는 이용권이에요. 키를 다시 확인해 주세요.', status: 404 }
  if (lic.revoked) return { error: '환불 · 취소된 이용권이에요.', status: 403 }
  const device = await hashFor(env, 'license', deviceRaw)
  const known = await env.DB.prepare(`SELECT 1 FROM activations WHERE license_key = ?1 AND device = ?2`).bind(key, device).first()
  if (!known) {
    const n = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM activations WHERE license_key = ?1`).bind(key).first<{ n: number }>())?.n ?? 0
    if (n >= lic.max_devices) return { error: `이 이용권은 기기 ${lic.max_devices}대까지 쓸 수 있어요. 기기를 바꾸셨다면 [의견 보내기]로 알려 주세요.`, status: 409 }
    await env.DB.prepare(`INSERT OR IGNORE INTO activations (license_key, device) VALUES (?1, ?2)`).bind(key, device).run()
  } else {
    await env.DB.prepare(`UPDATE activations SET last_seen = ?3 WHERE license_key = ?1 AND device = ?2`).bind(key, device, now()).run()
  }
  return { token: await tokenFor(env, key, deviceRaw) }
}

const limited = async (env: Env, req: Request, purpose: string, perHour: number, perDay: number) => overLimit(env, await hashFor(env, purpose, ipOf(req)), perHour, perDay)

/** POST /v1/billing/prepare {ref?, email?} → 결제 창에 넘길 값. 금액은 서버가 정하고 포트원에 미리 등록한다 */
async function prepare(req: Request, env: Env, h: Record<string, string>) {
  if (!ready(env, req)) return fail(503, '결제를 준비하고 있어요. 조금만 기다려 주세요.', h)
  if (await limited(env, req, 'billing', 20, 60)) return fail(429, '잠시 뒤에 다시 시도해 주세요.', h)
  const body = await readJson(req)
  const paymentId = `${mock(env, req) ? 'mock-' : ''}essay-${Date.now().toString(36)}-${randomHex(8)}`
  const amount = price(env)
  if (!mock(env, req) && env.PORTONE_PREREGISTER !== '0') {
    const r = await portone(env, 'POST', `/payments/${encodeURIComponent(paymentId)}/pre-register`, { storeId: env.PORTONE_STORE_ID, totalAmount: amount, currency: 'KRW' })
    if (!r.ok) {
      console.error('포트원 사전 등록 실패', r.status, (await r.text()).slice(0, 300))
      return fail(503, '결제를 시작하지 못했어요. 잠시 뒤에 다시 시도해 주세요.', h)
    }
  }
  await env.DB.prepare(`INSERT INTO orders (payment_id, ref, email, amount) VALUES (?1, ?2, ?3, ?4)`)
    .bind(paymentId, validRef(body?.ref) || null, validEmail(body?.email) || null, amount)
    .run()
  return json({ ok: true, paymentId, amount, orderName: 'Essay 이용권', storeId: env.PORTONE_STORE_ID, channelKey: env.PORTONE_CHANNEL_KEY }, 200, h)
}

/** POST /v1/billing/complete {paymentId} → 결제 확인 뒤 이용권 키 */
async function complete(req: Request, env: Env, h: Record<string, string>) {
  if (await limited(env, req, 'complete', 60, 200)) return fail(429, '잠시 뒤에 다시 시도해 주세요.', h)
  const body = await readJson(req)
  const paymentId = validPaymentId(body?.paymentId)
  if (!paymentId) return fail(400, '결제 번호가 없어요', h)
  const order = await getOrder(env, paymentId)
  if (!order) return fail(404, '주문을 찾지 못했어요', h)
  let o: Order
  try {
    o = await settle(env, req, order)
  } catch (e) {
    console.error('결제 확인 실패', paymentId, e)
    return fail(502, '결제를 확인하지 못했어요. 결제가 됐다면 몇 분 안에 Essay가 저절로 열려요. 안 되면 [의견 보내기]로 알려 주세요.', h)
  }
  if (o.status === 'paid' && o.license_key) return json({ ok: true, key: o.license_key }, 200, h)
  if (o.status === 'cancelled') return fail(409, '취소된 결제예요', h)
  if (o.status === 'failed') return fail(409, '결제가 정상적으로 끝나지 않았어요. 돈이 빠져나갔다면 자동으로 취소돼요.', h)
  return fail(402, '아직 결제가 끝나지 않았어요', h)
}

// Standard Webhooks 서명 확인: webhook-signature = "v1,<base64 HMAC-SHA256(id.timestamp.body)>", 비밀 값은 "whsec_<base64>"
async function webhookSignatureOk(env: Env, req: Request, raw: string) {
  const secret = env.PORTONE_WEBHOOK_SECRET
  if (!secret) return true
  const id = req.headers.get('webhook-id') || ''
  const ts = req.headers.get('webhook-timestamp') || ''
  const sigs = (req.headers.get('webhook-signature') || '').split(' ')
  if (!id || !/^\d+$/.test(ts) || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false
  const keyBytes = Uint8Array.from(atob(secret.replace(/^whsec_/, '')), (c) => c.charCodeAt(0))
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${raw}`)))
  const expected = btoa(String.fromCharCode(...mac))
  return sigs.some((s) => {
    const v = s.startsWith('v1,') ? s.slice(3) : ''
    if (v.length !== expected.length) return false
    let d = 0
    for (let i = 0; i < v.length; i++) d |= v.charCodeAt(i) ^ expected.charCodeAt(i)
    return d === 0
  })
}

/** POST /v1/billing/webhook — 포트원이 결제 · 취소 · 분쟁 때 부른다. 서명을 확인하고, 내용은 결제 번호로 다시 조회한다 */
async function webhook(req: Request, env: Env) {
  if (await limited(env, req, 'webhook', 600, 5000)) return fail(429, 'too many')
  const raw = (await req.text()).slice(0, 20000)
  if (!(await webhookSignatureOk(env, req, raw))) return fail(401, 'bad signature')
  let body: Record<string, unknown> = {}
  try {
    body = JSON.parse(raw)
  } catch {
    return json({ ok: true })
  }
  const data = (body?.data && typeof body.data === 'object' ? body.data : {}) as Record<string, unknown>
  if (data.storeId && env.PORTONE_STORE_ID && data.storeId !== env.PORTONE_STORE_ID) return json({ ok: true })
  const paymentId = validPaymentId(data.paymentId)
  if (!paymentId) return json({ ok: true })
  const order = await getOrder(env, paymentId)
  if (!order) return json({ ok: true })
  // 카드사 분쟁(차지백): 결과가 나올 때까지 이용권을 막는다. 고객 응대 매뉴얼 참고
  if (body.type === 'Transaction.DisputeCreated') {
    await env.DB.batch([env.DB.prepare(`UPDATE licenses SET revoked = 1 WHERE payment_id = ?1`).bind(paymentId), log(env, 'dispute', paymentId, order.license_key)])
    return json({ ok: true })
  }
  await settle(env, req, order)
  return json({ ok: true })
}

/** POST /v1/license/claim {ref, device} — 앱이 [구매하기] 뒤 기다리며 부른다. 결제가 끝났으면 키와 등록증을 준다 */
async function claim(req: Request, env: Env) {
  const body = await readJson(req)
  const ref = validRef(body?.ref)
  const device = validDevice(body?.device)
  if (!ref || !device) return fail(400, '잘못된 요청')
  if (await limited(env, req, 'claim', 900, 4000)) return fail(429, '잠시 뒤에 다시 시도해 주세요.')
  const order = await env.DB.prepare(`SELECT * FROM orders WHERE ref = ?1 AND status = 'paid' AND license_key IS NOT NULL ORDER BY paid_at DESC LIMIT 1`).bind(ref).first<Order>()
  if (!order?.license_key) return json({ ok: true, pending: true })
  const r = await activate(env, order.license_key, device)
  if ('error' in r) return fail(r.status ?? 400, r.error ?? '등록하지 못했어요')
  return json({ ok: true, key: order.license_key, token: r.token })
}

/** POST /v1/license/activate {key, device} — 키를 직접 넣었을 때 (키 추측을 막으려고 횟수 제한) */
async function activateRoute(req: Request, env: Env) {
  const body = await readJson(req)
  const key = validKey(body?.key)
  const device = validDevice(body?.device)
  if (!key || !device) return fail(400, '키 모양이 맞지 않아요 (ESSAY-XXXX-XXXX-XXXX-XXXX)')
  if (await limited(env, req, 'activate', 20, 60)) return fail(429, '잠시 뒤에 다시 시도해 주세요.')
  const r = await activate(env, key, device)
  if ('error' in r) return fail(r.status ?? 400, r.error ?? '등록하지 못했어요')
  return json({ ok: true, key, token: r.token })
}

/** POST /v1/license/check {key, device} — 앱이 며칠에 한 번. 환불 여부와 이 기기 등록 여부, 유효하면 새 등록증(확인 시각 갱신) */
async function check(req: Request, env: Env) {
  const body = await readJson(req)
  const key = validKey(body?.key)
  const deviceRaw = validDevice(body?.device)
  if (!key || !deviceRaw) return fail(400, '잘못된 요청')
  if (await limited(env, req, 'check', 60, 300)) return fail(429, '잠시 뒤에 다시 시도해 주세요.')
  const lic = await env.DB.prepare(`SELECT revoked FROM licenses WHERE key = ?1`).bind(key).first<{ revoked: number }>()
  if (!lic || lic.revoked) return json({ ok: true, valid: false })
  const device = await hashFor(env, 'license', deviceRaw)
  const active = await env.DB.prepare(`UPDATE activations SET last_seen = ?3 WHERE license_key = ?1 AND device = ?2 RETURNING 1 AS ok`).bind(key, device, now()).first()
  if (!active) return json({ ok: true, valid: true, active: false })
  return json({ ok: true, valid: true, active: true, token: await tokenFor(env, key, deviceRaw) })
}

/**
 * POST /v1/license/legacy {device} — '먼저 쓰던 사람' 확인증. 결제를 켜기 전(BILLING_LIVE 가 아닐 때) 앱을 켠 기기를 기록하고 서명해 준다.
 * 결제를 켠 뒤에는 기록된 기기에만 다시 준다 (파일을 만들어 결제를 피하는 것을 막는다)
 */
async function legacy(req: Request, env: Env) {
  const body = await readJson(req)
  const deviceRaw = validDevice(body?.device)
  if (!deviceRaw) return fail(400, '잘못된 요청')
  if (await limited(env, req, 'legacy', 20, 60)) return fail(429, '잠시 뒤에 다시 시도해 주세요.')
  const device = await hashFor(env, 'legacy', deviceRaw)
  if (env.BILLING_LIVE !== '1') await env.DB.prepare(`INSERT OR IGNORE INTO legacy_devices (device) VALUES (?1)`).bind(device).run()
  else if (!(await env.DB.prepare(`SELECT 1 FROM legacy_devices WHERE device = ?1`).bind(device).first())) return fail(403, '결제를 시작한 뒤 설치한 기기예요')
  return json({ ok: true, token: await tokenFor(env, 'LEGACY', deviceRaw) })
}

export async function billing(path: string, req: Request, env: Env): Promise<Response | null> {
  if (!path.startsWith('/v1/billing/') && !path.startsWith('/v1/license/')) return null
  const h = cors(req)
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h })
  if (req.method !== 'POST') return fail(405, 'POST 만 받아요', h)
  if (path === '/v1/billing/prepare') return prepare(req, env, h)
  if (path === '/v1/billing/complete') return complete(req, env, h)
  if (path === '/v1/billing/webhook') return webhook(req, env)
  if (path === '/v1/license/claim') return claim(req, env)
  if (path === '/v1/license/activate') return activateRoute(req, env)
  if (path === '/v1/license/check') return check(req, env)
  if (path === '/v1/license/legacy') return legacy(req, env)
  return fail(404, '없는 주소', h)
}

/** 매일: 창을 닫아 확인을 못 한 결제를 포트원에서 다시 확인하고(웹훅이 안 왔을 때 대비), 오래된 미결제 주문을 지운다 */
export async function reconcile(env: Env) {
  if (env.PORTONE_API_SECRET) {
    const { results } = await env.DB.prepare(
      `SELECT * FROM orders WHERE status = 'ready' AND payment_id NOT LIKE 'mock-%' AND created_at < datetime('now', '-5 minutes') AND created_at > datetime('now', '-3 days') ORDER BY created_at LIMIT 40`,
    ).all<Order>()
    for (const o of results) {
      try {
        await settle(env, null, o)
      } catch (e) {
        console.error('대사 실패', o.payment_id, e)
      }
    }
  }
  await env.DB.prepare(`DELETE FROM orders WHERE status IN ('ready', 'failed') AND license_key IS NULL AND created_at < datetime('now', '-30 days')`).run()
}

// ---------- 관리 (고객 응대) ----------
export async function adminBilling(path: string, req: Request, url: URL, env: Env): Promise<Response | null> {
  const get = req.method === 'GET'
  const lim = Math.min(200, Number(url.searchParams.get('limit')) || 50)
  if (path === '/v1/admin/orders' && get) {
    const { results } = await env.DB.prepare(
      `SELECT payment_id, email, amount, status, license_key, created_at, paid_at FROM orders WHERE status != 'ready' OR created_at >= datetime('now', '-1 day') ORDER BY created_at DESC LIMIT ${lim}`,
    ).all()
    const sum = await env.DB.prepare(
      `SELECT SUM(status = 'paid') AS paid, COALESCE(SUM(CASE WHEN status = 'paid' THEN amount END), 0) AS revenue, SUM(status = 'cancelled') AS cancelled, SUM(status = 'failed') AS failed FROM orders`,
    ).first()
    return json({ ok: true, summary: sum, items: results })
  }
  // 찾기: 메일 · 이용권 키 · 결제 번호 하나로 주문 · 이용권 · 등록 기기 수 · 처리 기록을 한 번에
  if (path === '/v1/admin/lookup' && get) {
    const q = clip(url.searchParams.get('q'), 120)
    if (!q) return fail(400, 'q 에 메일 · 키 · 결제 번호')
    const key = validKey(q) || '-'
    const email = validEmail(q) || '-'
    const orders = (
      await env.DB.prepare(`SELECT payment_id, email, amount, status, license_key, created_at, paid_at FROM orders WHERE payment_id = ?1 OR license_key = ?2 OR email = ?3 ORDER BY created_at DESC LIMIT 20`)
        .bind(q, key, email)
        .all<{ license_key: string | null; payment_id: string }>()
    ).results
    const keys = [...new Set([key, ...orders.map((o) => o.license_key || '-')])]
    const ph = (list: string[], start: number) => list.map((_, i) => `?${start + i}`).join(',')
    const licenses = (
      await env.DB.prepare(
        `SELECT l.key, l.payment_id, l.email, l.note, l.revoked, l.max_devices, l.created_at, (SELECT COUNT(*) FROM activations a WHERE a.license_key = l.key) AS devices
         FROM licenses l WHERE l.key IN (${ph(keys, 1)}) OR l.email = ?${keys.length + 1}`,
      )
        .bind(...keys, email)
        .all()
    ).results
    const pids = [...orders.map((o) => o.payment_id), '-']
    const logs = (
      await env.DB.prepare(`SELECT at, event, payment_id, license_key, detail FROM billing_log WHERE license_key IN (${ph(keys, 1)}) OR payment_id IN (${ph(pids, keys.length + 1)}) ORDER BY id DESC LIMIT 50`)
        .bind(...keys, ...pids)
        .all()
    ).results
    return json({ ok: true, orders, licenses, logs })
  }
  if (path === '/v1/admin/billing-log' && get) {
    const { results } = await env.DB.prepare(`SELECT * FROM billing_log ORDER BY id DESC LIMIT ${lim}`).all()
    return json({ ok: true, items: results })
  }
  // 메일 지우기 (개인정보 삭제 요청) {email}: 주문 · 이용권에서 메일만 지우고 결제 기록은 법정 기간 동안 남긴다
  if (path === '/v1/admin/forget' && req.method === 'POST') {
    const body = await readJson(req)
    const email = validEmail(body?.email)
    if (!email) return fail(400, 'email 이 필요해요')
    const r = await env.DB.batch([
      env.DB.prepare(`UPDATE orders SET email = NULL WHERE email = ?1`).bind(email),
      env.DB.prepare(`UPDATE licenses SET email = NULL WHERE email = ?1`).bind(email),
      log(env, 'admin_forget', null, null, '메일 삭제 요청 처리'),
    ])
    return json({ ok: true, orders: r[0].meta.changes, licenses: r[1].meta.changes })
  }
  // 이용권 직접 만들기 (먼저 쓰던 사람 복구 · 문제 보상 · 선물) {email?, note}
  if (path === '/v1/admin/licenses' && req.method === 'POST') {
    const body = await readJson(req)
    const note = clip(body?.note, 200)
    if (!note) return fail(400, 'note 에 이유를 적어 주세요')
    const key = newKey()
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO licenses (key, email, note) VALUES (?1, ?2, ?3)`).bind(key, validEmail(body?.email) || null, note),
      log(env, 'admin_grant', null, key, note),
    ])
    return json({ ok: true, key })
  }
  const m = path.match(/^\/v1\/admin\/licenses\/(ESSAY[-A-Z0-9]+)\/(revoke|restore|reset-devices|max-devices)$/)
  if (m && req.method === 'POST') {
    const key = validKey(m[1])
    if (!key) return fail(400, '키 모양이 맞지 않아요')
    if (!(await env.DB.prepare(`SELECT 1 FROM licenses WHERE key = ?1`).bind(key).first())) return fail(404, '없는 이용권')
    const body = await readJson(req)
    const note = clip(body?.note, 200)
    if (m[2] === 'reset-devices') await env.DB.prepare(`DELETE FROM activations WHERE license_key = ?1`).bind(key).run()
    else if (m[2] === 'max-devices') {
      const n = Math.min(10, Math.max(1, Number(body?.n) || 3))
      await env.DB.prepare(`UPDATE licenses SET max_devices = ?1 WHERE key = ?2`).bind(n, key).run()
    } else await env.DB.prepare(`UPDATE licenses SET revoked = ?1 WHERE key = ?2`).bind(m[2] === 'revoke' ? 1 : 0, key).run()
    await log(env, `admin_${m[2]}`, null, key, note).run()
    return json({ ok: true })
  }
  // 환불: 포트원에서 결제를 취소하고 이용권을 막는다 {reason} / 다시 확인: 포트원 상태로 주문을 맞춘다
  const r = path.match(/^\/v1\/admin\/orders\/((?:mock-)?essay-[0-9a-z]+-[0-9a-f]+)\/(refund|recheck)$/)
  if (r && req.method === 'POST') {
    const order = await getOrder(env, r[1])
    if (!order) return fail(404, '없는 주문')
    if (r[2] === 'recheck') return json({ ok: true, order: await settle(env, req, order) })
    const body = await readJson(req)
    const reason = clip(body?.reason, 200)
    if (!reason) return fail(400, 'reason 에 환불 이유를 적어 주세요')
    if (order.status !== 'paid') return fail(409, `결제 완료 상태가 아니에요 (${order.status})`)
    if (!(await cancelPayment(env, order.payment_id, reason))) return fail(502, '포트원 취소에 실패했어요. 포트원 콘솔에서 확인해 주세요.')
    await env.DB.batch([
      env.DB.prepare(`UPDATE orders SET status = 'cancelled' WHERE payment_id = ?1`).bind(order.payment_id),
      env.DB.prepare(`UPDATE licenses SET revoked = 1 WHERE payment_id = ?1`).bind(order.payment_id),
      log(env, 'admin_refund', order.payment_id, order.license_key, reason),
    ])
    return json({ ok: true })
  }
  return null
}
