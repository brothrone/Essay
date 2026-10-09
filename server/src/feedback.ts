import { clip, CORS, fail, ipOf, json, readJson, sha256, type Env } from './util'

const KINDS = ['bug', 'idea', 'etc'] as const
const MAX_MESSAGE = 5_000

/** 앱의 의견 보내기. 계정 없이, 공개되지 않게 쌓는다 */
export async function postFeedback(req: Request, env: Env) {
  const body = await readJson(req)
  if (!body) return fail(400, '보낸 내용을 읽지 못했어요', CORS)
  // 사람 눈에 안 보이는 칸이 채워져 있으면 자동 스팸으로 보고 받은 척만 한다
  if (clip(body.website, 200)) return json({ ok: true }, 201, CORS)

  const kind = KINDS.includes(body.kind as (typeof KINDS)[number]) ? (body.kind as string) : ''
  const message = clip(body.message, MAX_MESSAGE)
  if (!kind) return fail(400, '의견 종류가 올바르지 않아요', CORS)
  if (message.length < 2) return fail(400, '내용을 적어 주세요', CORS)

  const app = (body.app && typeof body.app === 'object' ? body.app : {}) as Record<string, unknown>
  const ipHash = await sha256(`${env.IP_SALT || ''}:${ipOf(req)}`)

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
