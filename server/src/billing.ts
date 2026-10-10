// 유료 판매: 결제 준비 → (사이트 구매 페이지에서 포트원 결제) → 포트원에서 결제 완료를 직접 확인 → 이용권(라이선스 키) 발급 → 앱이 기기 등록.
// 앱은 서버가 서명한 등록증(token)을 받아 두고, 인터넷이 없어도 공개 키로 확인한다. 환불되면 다음 확인 때 풀린다.
// 결제 금액 · 상태는 브라우저가 알려 주는 값을 믿지 않고 항상 포트원 API 로 다시 확인한다.
import { clip, fail, hashFor, ipOf, json, overLimit, readJson, type Env } from './util'

export const BILLING_CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
}
const ok = (data: Record<string, unknown>, status = 200) => json({ ok: true, ...data }, status, BILLING_CORS)
const no = (status: number, error: string) => fail(status, error, BILLING_CORS)

const price = (env: Env) => Number(env.PRICE) || 3900
const ready = (env: Env) => !!(env.PORTONE_STORE_ID && env.PORTONE_CHANNEL_KEY && (env.PORTONE_API_SECRET || env.BILLING_MOCK === '1'))
const randomHex = (bytes: number) => [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('')

// 헷갈리는 글자(0 O 1 I)를 뺀 키: ESSAY-XXXX-XXXX-XXXX-XXXX
const KEY_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function newKey() {
  const r = crypto.getRandomValues(new Uint8Array(16))
  const s = [...r].map((b) => KEY_CHARS[b % KEY_CHARS.length]).join('')
  return `ESSAY-${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}`
}
const validKey = (v: unknown) => (typeof v === 'string' && /^ESSAY(-[A-HJ-NP-Z2-9]{4}){4}$/.test(v.trim().toUpperCase()) ? v.trim().toUpperCase() : '')
// 앱이 보내는 기기 번호(64자 16진수 해시). 서버에는 한 번 더 섞어서 저장한다
const validDevice = (v: unknown) => (typeof v === 'string' && /^[0-9a-f]{64}$/.test(v) ? v : '')
const validRef = (v: unknown) => (typeof v === 'string' && /^[0-9a-f]{32}$/.test(v) ? v : '')
const validEmail = (v: unknown) => {
  const s = clip(v, 120).toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : ''
}

// ---------- 등록증 서명 (Ed25519) ----------
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

// ---------- 포트원 ----------
type PortonePayment = { status?: string; currency?: string; amount?: { total?: number } }
async function fetchPayment(env: Env, paymentId: string): Promise<PortonePayment | null> {
  if (env.BILLING_MOCK === '1' && paymentId.startsWith('mock-')) {
    // 로컬 시험용: mock- 결제는 바로 완료로 본다. 메일을 cancel@test 로 주문하면 취소로 본다
    const c = await env.DB.prepare(`SELECT 1 FROM orders WHERE payment_id = ?1 AND email = 'cancel@test'`).bind(paymentId).first()
    return { status: c ? 'CANCELLED' : 'PAID', currency: 'KRW', amount: { total: price(env) } }
  }
  const r = await fetch(`https://api.portone.io/payments/${encodeURIComponent(paymentId)}`, {
    headers: { authorization: `PortOne ${env.PORTONE_API_SECRET}` },
  })
  if (r.status === 404) return null
  if (!r.ok) throw new Error(`포트원 조회 실패 ${r.status}`)
  return (await r.json()) as PortonePayment
}

type Order = { payment_id: string; ref: string | null; email: string | null; amount: number; status: string; license_key: string | null }

/** 포트원 결과로 주문 상태를 맞춘다. 결제 완료면 이용권을 만들고(한 번만), 취소면 이용권을 막는다 */
async function settle(env: Env, order: Order): Promise<Order> {
  // 취소된 주문은 다시 볼 것이 없다. 결제된 주문도 다시 조회해 환불됐는지 확인한다
  if (order.status === 'cancelled') return order
  const p = await fetchPayment(env, order.payment_id)
  if (!p) return order
  if (p.status === 'PAID') {
    if (p.currency !== 'KRW' || p.amount?.total !== order.amount) {
      await env.DB.prepare(`UPDATE orders SET status = 'failed' WHERE payment_id = ?1`).bind(order.payment_id).run()
      console.error('결제 금액이 주문과 달라요', order.payment_id, p.amount?.total, order.amount)
      return { ...order, status: 'failed' }
    }
    if (order.license_key) return { ...order, status: 'paid' }
    const key = newKey()
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO licenses (key, payment_id, email) VALUES (?1, ?2, ?3)`).bind(key, order.payment_id, order.email),
      env.DB.prepare(`UPDATE orders SET status = 'paid', license_key = ?1, paid_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE payment_id = ?2 AND license_key IS NULL`).bind(key, order.payment_id),
    ])
    const fresh = await env.DB.prepare(`SELECT * FROM orders WHERE payment_id = ?1`).bind(order.payment_id).first<Order>()
    return fresh || order
  }
  if (p.status === 'CANCELLED' || p.status === 'PARTIAL_CANCELLED') {
    await env.DB.batch([
      env.DB.prepare(`UPDATE orders SET status = 'cancelled' WHERE payment_id = ?1`).bind(order.payment_id),
      env.DB.prepare(`UPDATE licenses SET revoked = 1 WHERE payment_id = ?1`).bind(order.payment_id),
    ])
    return { ...order, status: 'cancelled' }
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
    if (n >= lic.max_devices) return { error: `이 이용권은 기기 ${lic.max_devices}대까지 쓸 수 있어요. 문의해 주시면 기기를 바꿔 드려요.`, status: 409 }
    await env.DB.prepare(`INSERT INTO activations (license_key, device) VALUES (?1, ?2)`).bind(key, device).run()
  } else {
    await env.DB.prepare(`UPDATE activations SET last_seen = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE license_key = ?1 AND device = ?2`).bind(key, device).run()
  }
  // 앱은 기기 번호(원래 값)와 키가 맞는지만 본다
  const token = await sign(env, { v: 1, k: key, d: deviceRaw, t: Date.now() })
  return { token }
}

/** POST /v1/billing/prepare {ref?, email?} → 결제 창에 넘길 값 */
async function prepare(req: Request, env: Env) {
  if (!ready(env)) return no(503, '결제를 준비하고 있어요. 조금만 기다려 주세요.')
  const body = await readJson(req)
  if (await overLimit(env, await hashFor(env, 'billing', ipOf(req)), 20, 60)) return no(429, '잠시 뒤에 다시 시도해 주세요.')
  const paymentId = `${env.BILLING_MOCK === '1' ? 'mock-' : ''}essay-${Date.now().toString(36)}-${randomHex(6)}`
  const amount = price(env)
  await env.DB.prepare(`INSERT INTO orders (payment_id, ref, email, amount) VALUES (?1, ?2, ?3, ?4)`)
    .bind(paymentId, validRef(body?.ref) || null, validEmail(body?.email) || null, amount)
    .run()
  return ok({ paymentId, amount, orderName: 'Essay 이용권', storeId: env.PORTONE_STORE_ID, channelKey: env.PORTONE_CHANNEL_KEY })
}

/** POST /v1/billing/complete {paymentId} → 결제 확인 뒤 이용권 키 */
async function complete(req: Request, env: Env) {
  const body = await readJson(req)
  const paymentId = clip(body?.paymentId, 80)
  if (!paymentId) return no(400, '결제 번호가 없어요')
  const order = await env.DB.prepare(`SELECT * FROM orders WHERE payment_id = ?1`).bind(paymentId).first<Order>()
  if (!order) return no(404, '주문을 찾지 못했어요')
  const o = await settle(env, order)
  if (o.status === 'paid' && o.license_key) return ok({ key: o.license_key })
  if (o.status === 'cancelled') return no(409, '취소된 결제예요')
  if (o.status === 'failed') return no(409, '결제 금액이 맞지 않아요. 문의해 주세요.')
  return no(402, '아직 결제가 끝나지 않았어요')
}

/** POST /v1/billing/webhook — 포트원이 결제 · 취소 때 부른다. 내용은 믿지 않고 결제 번호로 다시 조회한다 */
async function webhook(req: Request, env: Env) {
  const body = await readJson(req)
  const data = (body?.data && typeof body.data === 'object' ? body.data : {}) as Record<string, unknown>
  const paymentId = clip(data.paymentId ?? body?.payment_id, 80)
  if (!paymentId) return json({ ok: true })
  const order = await env.DB.prepare(`SELECT * FROM orders WHERE payment_id = ?1`).bind(paymentId).first<Order>()
  if (order) await settle(env, order)
  return json({ ok: true })
}

/** POST /v1/license/claim {ref, device} — 앱이 [구매하기] 뒤 기다리며 부른다. 결제가 끝났으면 키와 등록증을 준다 */
async function claim(req: Request, env: Env) {
  const body = await readJson(req)
  const ref = validRef(body?.ref)
  const device = validDevice(body?.device)
  if (!ref || !device) return no(400, '잘못된 요청')
  if (await overLimit(env, await hashFor(env, 'claim', ipOf(req)), 400, 2000)) return no(429, '잠시 뒤에 다시 시도해 주세요.')
  const order = await env.DB.prepare(`SELECT * FROM orders WHERE ref = ?1 AND status = 'paid' AND license_key IS NOT NULL ORDER BY paid_at DESC LIMIT 1`).bind(ref).first<Order>()
  if (!order?.license_key) return ok({ pending: true })
  const r = await activate(env, order.license_key, device)
  if ('error' in r) return no(r.status ?? 400, r.error ?? '등록하지 못했어요')
  return ok({ key: order.license_key, token: r.token })
}

/** POST /v1/license/activate {key, device} — 키를 직접 넣었을 때 */
async function activateRoute(req: Request, env: Env) {
  const body = await readJson(req)
  const key = validKey(body?.key)
  const device = validDevice(body?.device)
  if (!key || !device) return no(400, '키 모양이 맞지 않아요 (ESSAY-XXXX-XXXX-XXXX-XXXX)')
  if (await overLimit(env, await hashFor(env, 'activate', ipOf(req)), 20, 60)) return no(429, '잠시 뒤에 다시 시도해 주세요.')
  const r = await activate(env, key, device)
  if ('error' in r) return no(r.status ?? 400, r.error ?? '등록하지 못했어요')
  return ok({ key, token: r.token })
}

/** POST /v1/license/check {key, device} — 앱이 며칠에 한 번 부른다. 환불 · 취소됐는지만 알려 준다 */
async function check(req: Request, env: Env) {
  const body = await readJson(req)
  const key = validKey(body?.key)
  if (!key) return no(400, '잘못된 요청')
  const lic = await env.DB.prepare(`SELECT revoked FROM licenses WHERE key = ?1`).bind(key).first<{ revoked: number }>()
  return ok({ valid: !!lic && !lic.revoked })
}

export async function billing(path: string, req: Request, env: Env): Promise<Response | null> {
  if (!path.startsWith('/v1/billing/') && !path.startsWith('/v1/license/')) return null
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: BILLING_CORS })
  if (req.method !== 'POST') return no(405, 'POST 만 받아요')
  if (path === '/v1/billing/prepare') return prepare(req, env)
  if (path === '/v1/billing/complete') return complete(req, env)
  if (path === '/v1/billing/webhook') return webhook(req, env)
  if (path === '/v1/license/claim') return claim(req, env)
  if (path === '/v1/license/activate') return activateRoute(req, env)
  if (path === '/v1/license/check') return check(req, env)
  return no(404, '없는 주소')
}

// ---------- 관리 ----------
export async function adminBilling(path: string, req: Request, url: URL, env: Env): Promise<Response | null> {
  const get = req.method === 'GET'
  if (path === '/v1/admin/orders' && get) {
    const { results } = await env.DB.prepare(
      `SELECT payment_id, email, amount, status, license_key, created_at, paid_at FROM orders WHERE status != 'ready' OR created_at >= datetime('now', '-1 day') ORDER BY created_at DESC LIMIT ${Math.min(200, Number(url.searchParams.get('limit')) || 50)}`,
    ).all()
    const sum = await env.DB.prepare(`SELECT COUNT(*) AS paid, COALESCE(SUM(amount), 0) AS revenue FROM orders WHERE status = 'paid'`).first()
    return json({ ok: true, summary: sum, items: results })
  }
  if (path === '/v1/admin/licenses' && get) {
    const q = clip(url.searchParams.get('q'), 120).toLowerCase()
    const { results } = await env.DB.prepare(
      `SELECT l.key, l.email, l.note, l.revoked, l.max_devices, l.created_at, (SELECT COUNT(*) FROM activations a WHERE a.license_key = l.key) AS devices
       FROM licenses l ${q ? 'WHERE l.email = ?1 OR l.key = upper(?1)' : ''} ORDER BY l.created_at DESC LIMIT 100`,
    )
      .bind(...(q ? [q] : []))
      .all()
    return json({ ok: true, items: results })
  }
  // 이용권 직접 만들기 (선물 · 문제 해결용) {email?, note?}
  if (path === '/v1/admin/licenses' && req.method === 'POST') {
    const body = await readJson(req)
    const key = newKey()
    await env.DB.prepare(`INSERT INTO licenses (key, email, note) VALUES (?1, ?2, ?3)`).bind(key, validEmail(body?.email) || null, clip(body?.note, 200) || null).run()
    return json({ ok: true, key })
  }
  const m = path.match(/^\/v1\/admin\/licenses\/(ESSAY[-A-Z0-9]+)\/(revoke|restore|reset-devices)$/)
  if (m && req.method === 'POST') {
    const key = validKey(m[1])
    if (!key) return fail(400, '키 모양이 맞지 않아요')
    if (m[2] === 'reset-devices') await env.DB.prepare(`DELETE FROM activations WHERE license_key = ?1`).bind(key).run()
    else await env.DB.prepare(`UPDATE licenses SET revoked = ?1 WHERE key = ?2`).bind(m[2] === 'revoke' ? 1 : 0, key).run()
    return json({ ok: true })
  }
  return null
}

