import { fail, json, readJson, sameSecret, type Env } from './util'

const STATUSES = ['new', 'read', 'done'] as const
const isStatus = (s: unknown): s is (typeof STATUSES)[number] => STATUSES.includes(s as (typeof STATUSES)[number])
const limitOf = (url: URL, def = 50) => Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || def))

export async function isAdmin(req: Request, env: Env) {
  const auth = req.headers.get('authorization') || ''
  return auth.startsWith('Bearer ') && (await sameSecret(auth.slice(7), env.ADMIN_TOKEN))
}

async function listFeedback(url: URL, env: Env) {
  const status = url.searchParams.get('status')
  const before = Number(url.searchParams.get('before')) || 0
  const where: string[] = []
  const args: unknown[] = []
  if (isStatus(status)) { where.push(`status = ?${args.length + 1}`); args.push(status) }
  if (before > 0) { where.push(`id < ?${args.length + 1}`); args.push(before) }
  const sql = `SELECT id, created_at, kind, message, contact, app_version, os, ai, status FROM feedback ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT ${limitOf(url)}`
  const { results } = await env.DB.prepare(sql).bind(...args).all()
  return json({ ok: true, items: results })
}

async function setStatus(table: 'feedback' | 'errors', id: number, req: Request, env: Env) {
  const body = await readJson(req)
  if (!isStatus(body?.status)) return fail(400, 'status 는 new · read · done 중 하나')
  const r = await env.DB.prepare(`UPDATE ${table} SET status = ?1 WHERE id = ?2`).bind(body.status, id).run()
  return r.meta.changes ? json({ ok: true }) : fail(404, '없는 항목')
}

/** 한눈에 보기: 날짜별 사용자 수, 버전 · 운영체제 · AI 분포(최근 7일), 기능별 사용 횟수, 새 의견 · 새 오류 수 */
async function summary(url: URL, env: Env) {
  const days = Math.min(90, Math.max(1, Number(url.searchParams.get('days')) || 30))
  const since = `-${days} days`
  const q = (sql: string, ...args: unknown[]) => env.DB.prepare(sql).bind(...args)
  const [daily, versions, os, ai, events, counts] = await env.DB.batch([
    q(`SELECT day, COUNT(*) AS users FROM stats_daily WHERE day >= date('now', ?1) GROUP BY day ORDER BY day`, since),
    q(`SELECT version, COUNT(DISTINCT install) AS users FROM stats_daily WHERE day >= date('now', '-7 days') GROUP BY version ORDER BY users DESC`),
    q(`SELECT os, COUNT(DISTINCT install) AS users FROM stats_daily WHERE day >= date('now', '-7 days') GROUP BY os ORDER BY users DESC`),
    q(`SELECT ai, COUNT(DISTINCT install) AS users FROM stats_daily WHERE day >= date('now', '-7 days') GROUP BY ai ORDER BY users DESC`),
    q(`SELECT j.key AS name, SUM(j.value) AS count, COUNT(DISTINCT s.install) AS users FROM stats_daily s, json_each(s.events) j WHERE s.day >= date('now', ?1) GROUP BY j.key ORDER BY count DESC`, since),
    q(`SELECT
         (SELECT COUNT(*) FROM feedback WHERE status = 'new') AS feedback_new,
         (SELECT COUNT(*) FROM errors WHERE status = 'new') AS errors_new,
         (SELECT COUNT(*) FROM question_sets WHERE hidden = 0) AS question_sets,
         (SELECT COUNT(*) FROM postings WHERE status = 'pending') AS postings_pending,
         (SELECT COUNT(*) FROM postings WHERE status = 'published') AS postings_published,
         (SELECT COUNT(*) FROM insights WHERE status = 'pending') AS insights_pending,
         (SELECT COUNT(DISTINCT install) FROM stats_daily WHERE day >= date('now', '-7 days')) AS users_7d,
         (SELECT COUNT(DISTINCT install) FROM stats_daily WHERE day >= date('now', '-30 days')) AS users_30d`),
  ])
  return json({ ok: true, days, counts: counts.results[0], daily: daily.results, versions: versions.results, os: os.results, ai: ai.results, events: events.results })
}

async function listErrors(url: URL, env: Env) {
  const status = url.searchParams.get('status')
  const { results } = await env.DB.prepare(
    `SELECT e.id, e.version, e.source, e.message, e.stack, e.os, e.first_seen, e.last_seen, e.count, e.status,
       (SELECT COUNT(*) FROM error_installs i WHERE i.error_id = e.id) AS installs
     FROM errors e ${isStatus(status) ? 'WHERE e.status = ?1' : ''} ORDER BY e.last_seen DESC LIMIT ${limitOf(url)}`,
  )
    .bind(...(isStatus(status) ? [status] : []))
    .all()
  return json({ ok: true, items: results })
}

async function listQuestions(url: URL, env: Env) {
  const { results } = await env.DB.prepare(
    `SELECT id, company, position, period, questions, source_host, contributors, first_seen, last_seen, hidden FROM question_sets ORDER BY last_seen DESC LIMIT ${limitOf(url)}`,
  ).all<Record<string, unknown> & { questions: string }>()
  return json({ ok: true, items: results.map((r) => ({ ...r, questions: JSON.parse(r.questions) })) })
}

async function hideQuestions(id: number, req: Request, env: Env) {
  const body = await readJson(req)
  if (typeof body?.hidden !== 'boolean') return fail(400, 'hidden 은 true 또는 false')
  const r = await env.DB.prepare(`UPDATE question_sets SET hidden = ?1 WHERE id = ?2`).bind(body.hidden ? 1 : 0, id).run()
  return r.meta.changes ? json({ ok: true }) : fail(404, '없는 항목')
}

/** /v1/admin/... (관리 열쇠 확인은 부르는 쪽에서) */
export async function admin(path: string, req: Request, url: URL, env: Env) {
  const get = req.method === 'GET'
  const post = req.method === 'POST'
  if (path === '/v1/admin/summary' && get) return summary(url, env)
  if (path === '/v1/admin/feedback' && get) return listFeedback(url, env)
  if (path === '/v1/admin/errors' && get) return listErrors(url, env)
  if (path === '/v1/admin/questions' && get) return listQuestions(url, env)
  let m = path.match(/^\/v1\/admin\/(feedback|errors)\/(\d+)\/status$/)
  if (m && post) return setStatus(m[1] as 'feedback' | 'errors', Number(m[2]), req, env)
  m = path.match(/^\/v1\/admin\/questions\/(\d+)\/hide$/)
  if (m && post) return hideQuestions(Number(m[1]), req, env)
  return fail(404, '없는 주소')
}
