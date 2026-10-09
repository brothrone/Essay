// Essay 백엔드: 앱의 의견 받기(계정 없이, 비공개), 개발자용 의견 보기, 상태 확인.
// 결제 확인 · 라이선스 키는 사업자 등록 · PG 가 정해지면 여기에 더한다 (CLAUDE.md 남은 일 2)

export interface Env {
  DB: D1Database
  ADMIN_TOKEN: string
  IP_SALT: string
  FEEDBACK_PER_HOUR: string
  FEEDBACK_PER_DAY: string
}

const KINDS = ['bug', 'idea', 'etc'] as const
const STATUSES = ['new', 'read', 'done'] as const
const MAX_BODY = 20_000
const MAX_MESSAGE = 5_000

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
}

const json = (data: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...extra } })
const fail = (status: number, error: string, extra: Record<string, string> = {}) => json({ ok: false, error }, status, extra)

const clip = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// 길이가 달라도 시간이 같게 걸리는 비교 (관리 열쇠 추측 방지)
async function sameSecret(a: string, b: string) {
  if (!a || !b) return false
  const [x, y] = await Promise.all([sha256(a), sha256(b)])
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i)
  return diff === 0
}

async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  const len = Number(req.headers.get('content-length') || 0)
  if (len > MAX_BODY) return null
  const text = await req.text()
  if (text.length > MAX_BODY) return null
  try {
    const v = JSON.parse(text)
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null
  } catch {
    return null
  }
}

async function postFeedback(req: Request, env: Env) {
  const body = await readJson(req)
  if (!body) return fail(400, '보낸 내용을 읽지 못했어요', CORS)
  // 사람 눈에 안 보이는 칸이 채워져 있으면 자동 스팸으로 보고 받은 척만 한다
  if (clip(body.website, 200)) return json({ ok: true }, 201, CORS)

  const kind = KINDS.includes(body.kind as (typeof KINDS)[number]) ? (body.kind as string) : ''
  const message = clip(body.message, MAX_MESSAGE)
  if (!kind) return fail(400, '의견 종류가 올바르지 않아요', CORS)
  if (message.length < 2) return fail(400, '내용을 적어 주세요', CORS)

  const app = (body.app && typeof body.app === 'object' ? body.app : {}) as Record<string, unknown>
  const ip = req.headers.get('cf-connecting-ip') || 'local'
  const ipHash = await sha256(`${env.IP_SALT || ''}:${ip}`)

  const perHour = Number(env.FEEDBACK_PER_HOUR) || 5
  const perDay = Number(env.FEEDBACK_PER_DAY) || 20
  const counts = await env.DB.prepare(
    `SELECT
       SUM(created_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 hour')) AS hour,
       COUNT(*) AS day
     FROM feedback WHERE ip_hash = ?1 AND created_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 day')`,
  )
    .bind(ipHash)
    .first<{ hour: number | null; day: number }>()
  if ((counts?.hour ?? 0) >= perHour || (counts?.day ?? 0) >= perDay) {
    return fail(429, '잠시 뒤에 다시 보내 주세요', { ...CORS, 'retry-after': '3600' })
  }

  const row = await env.DB.prepare(
    `INSERT INTO feedback (kind, message, contact, app_version, os, ai, ip_hash) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) RETURNING id`,
  )
    .bind(kind, message, clip(body.contact, 200) || null, clip(app.version, 40) || null, clip(app.os, 80) || null, clip(app.ai, 40) || null, ipHash)
    .first<{ id: number }>()
  return json({ ok: true, id: row?.id }, 201, CORS)
}

async function isAdmin(req: Request, env: Env) {
  const auth = req.headers.get('authorization') || ''
  return auth.startsWith('Bearer ') && (await sameSecret(auth.slice(7), env.ADMIN_TOKEN))
}

async function listFeedback(url: URL, env: Env) {
  const status = url.searchParams.get('status')
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 50))
  const before = Number(url.searchParams.get('before')) || 0
  const where: string[] = []
  const args: unknown[] = []
  if (status && STATUSES.includes(status as (typeof STATUSES)[number])) { where.push(`status = ?${args.length + 1}`); args.push(status) }
  if (before > 0) { where.push(`id < ?${args.length + 1}`); args.push(before) }
  const sql = `SELECT id, created_at, kind, message, contact, app_version, os, ai, status FROM feedback ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT ${limit}`
  const { results } = await env.DB.prepare(sql).bind(...args).all()
  return json({ ok: true, items: results })
}

async function setStatus(id: number, req: Request, env: Env) {
  const body = await readJson(req)
  const status = body?.status
  if (!STATUSES.includes(status as (typeof STATUSES)[number])) return fail(400, 'status 는 new · read · done 중 하나')
  const r = await env.DB.prepare(`UPDATE feedback SET status = ?1 WHERE id = ?2`).bind(status, id).run()
  return r.meta.changes ? json({ ok: true }) : fail(404, '없는 의견')
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    const path = url.pathname.replace(/\/+$/, '') || '/'
    try {
      if (path === '/' || path === '/health') return json({ ok: true, service: 'essay-api' })

      if (path === '/v1/feedback') {
        if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
        if (req.method === 'POST') return await postFeedback(req, env)
        return fail(405, 'POST 만 받아요', CORS)
      }

      if (path.startsWith('/v1/admin/')) {
        if (!(await isAdmin(req, env))) return fail(401, '관리 열쇠가 필요해요')
        if (path === '/v1/admin/feedback' && req.method === 'GET') return await listFeedback(url, env)
        const m = path.match(/^\/v1\/admin\/feedback\/(\d+)\/status$/)
        if (m && req.method === 'POST') return await setStatus(Number(m[1]), req, env)
      }
      return fail(404, '없는 주소')
    } catch (e) {
      console.error('요청 처리 실패', path, e)
      return fail(500, '서버 오류')
    }
  },
} satisfies ExportedHandler<Env>
