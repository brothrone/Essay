// 공고 모음 · 분석(기업 · 직무 · 문항).
// - 앱은 공고 주소를 정해진 방식으로 줄인 뒤 해시(postingUrlKey)만 보내 찾는다 → 서버는 모르는 공고 주소를 알 수 없다
// - 사용자가 AI 로 읽은 공고는 '문항 모음'에 동의한 사람만 보탠다(공고 요약 · 문항, 개인 정보 없음)
// - 개발자가 주요 기업 공식 채용 페이지에서 모은 것(curated)과 분석은 확인 뒤 공개(published)
import { companyKey } from './questions'
import { clip, fail, hashFor, ipOf, json, overLimit, readJson, sha256, validInstall, type Env } from './util'

const positionKey = (s: string) => s.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')

/** 공고 주소 → 같은 공고면 같은 문자열. 앱(community.cjs)과 똑같이 맞춰야 한다 */
export function normalizePostingUrl(raw: string): string {
  let u: URL
  try {
    u = new URL(raw.trim())
  } catch {
    return ''
  }
  if (!/^https?:$/.test(u.protocol)) return ''
  const host = u.hostname.toLowerCase().replace(/^(www|m)\./, '')
  const path = u.pathname
  const pick = (re: RegExp) => re.exec(path)?.[1]
  if (host.endsWith('saramin.co.kr')) {
    const r = u.searchParams.get('rec_idx')
    if (r && /^\d+$/.test(r)) return `saramin:${r}`
  }
  if (host.endsWith('jobkorea.co.kr')) {
    const r = pick(/GI_Read\/(\d+)/i)
    if (r) return `jobkorea:${r}`
  }
  if (host.endsWith('wanted.co.kr')) {
    const r = pick(/\/wd\/(\d+)/)
    if (r) return `wanted:${r}`
  }
  if (host.endsWith('catch.co.kr')) {
    const r = pick(/RecruitInfoDetails\/(\d+)/i)
    if (r) return `catch:${r}`
  }
  if (host.endsWith('jasoseol.com')) {
    const r = pick(/\/recruit\/(\d+)/)
    if (r) return `jasoseol:${r}`
  }
  const drop = /^(utm_|fbclid$|gclid$|ref$|referer$|src$|source$|from$)/i
  const params = [...u.searchParams.entries()].filter(([k]) => !drop.test(k)).sort(([a], [b]) => a.localeCompare(b))
  const q = params.map(([k, v]) => `${k}=${v}`).join('&')
  return `${host}${path.replace(/\/+$/, '') || '/'}${q ? '?' + q : ''}`
}
export const postingUrlKey = async (raw: string) => {
  const n = normalizePostingUrl(raw)
  return n ? sha256(`posting:${n}`) : ''
}

function periodOf(deadline: string) {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(deadline)
  const d = m ? { y: Number(m[1]), mo: Number(m[2]) } : { y: new Date().getUTCFullYear(), mo: new Date().getUTCMonth() + 1 }
  return `${d.y} ${d.mo <= 6 ? '상반기' : '하반기'}`
}

type Q = { prompt: string; limit: number | null }
export type PostingInfo = {
  company: string
  position: string
  deadline: string
  deadlineTime: string
  notes: string
  questions: Q[]
  questionsSource: string
  url: string
}

/** 앱 · 모으기 스크립트가 보낸 공고 정보를 정해진 모양 · 길이로 */
function cleanInfo(v: unknown, url: string): PostingInfo | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const company = clip(o.company, 60)
  if (companyKey(company).length < 2) return null
  const questions: Q[] = []
  for (const q of (Array.isArray(o.questions) ? o.questions : []).slice(0, 12) as Record<string, unknown>[]) {
    const prompt = clip(q?.prompt, 600).replace(/\s+/g, ' ')
    if (prompt.length < 5) continue
    const n = Math.floor(Number(q?.limit))
    questions.push({ prompt, limit: n >= 50 && n <= 5000 ? n : null })
  }
  const deadline = clip(o.deadline, 10)
  const time = clip(o.deadlineTime, 5)
  return {
    company,
    position: clip(o.position, 80),
    deadline: /^\d{4}-\d{2}-\d{2}$/.test(deadline) ? deadline : '',
    deadlineTime: /^\d{2}:\d{2}$/.test(time) ? time : '',
    notes: clip(o.notes, 4000),
    questions,
    questionsSource: clip(o.questionsSource, 80),
    url,
  }
}
const qHash = (info: PostingInfo) => sha256(info.questions.map((q) => `${q.prompt}|${q.limit ?? ''}`).join('\n'))

/** 분석 내용: { summary, sections: [{ title, text?, items?, table? }], sources: [{ title, url }], basis } — 모양 · 길이를 맞춘다 */
export function cleanInsight(v: unknown) {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const strs = (a: unknown, n: number, len: number) => (Array.isArray(a) ? a : []).slice(0, n).map((x) => clip(x, len)).filter(Boolean)
  const sections = (Array.isArray(o.sections) ? o.sections : []).slice(0, 14).flatMap((s) => {
    if (!s || typeof s !== 'object') return []
    const x = s as Record<string, unknown>
    const title = clip(x.title, 80)
    const out: Record<string, unknown> = { title }
    const text = clip(x.text, 2000)
    if (text) out.text = text
    const items = strs(x.items, 20, 500)
    if (items.length) out.items = items
    const t = x.table as Record<string, unknown> | undefined
    if (t && typeof t === 'object') {
      const head = strs(t.head, 5, 40)
      const rows = (Array.isArray(t.rows) ? t.rows : []).slice(0, 15).map((r) => strs(r, head.length || 5, 300))
      if (head.length && rows.length) out.table = { head, rows }
    }
    return title && (out.text || out.items || out.table) ? [out] : []
  })
  if (!sections.length) return null
  const sources = (Array.isArray(o.sources) ? o.sources : []).slice(0, 10).flatMap((s) => {
    const x = (s || {}) as Record<string, unknown>
    const url = clip(x.url, 400)
    return /^https?:\/\//.test(url) ? [{ title: clip(x.title, 100) || url, url }] : []
  })
  return { summary: clip(o.summary, 400), sections, sources, basis: clip(o.basis, 40) }
}

const VISIBLE = `(status = 'published' OR (source = 'user' AND status = 'pending' AND agree >= 2))`
type Row = { id: number; info: string; source: string; status: string; agree: number; contributors: number; updated_at: string }
const publicPosting = (r: Row) => ({
  id: r.id,
  ...(JSON.parse(r.info) as PostingInfo),
  verified: r.status === 'published',
  contributors: r.contributors,
  updatedAt: r.updated_at,
})

/** GET /v1/postings/lookup?k=<공고 주소 해시> — 누구나. 보여 줄 수 있는 공고만 */
export async function lookupPosting(url: URL, env: Env) {
  const k = url.searchParams.get('k') || ''
  if (!/^[0-9a-f]{64}$/.test(k)) return fail(400, '형식이 올바르지 않아요')
  const r = await env.DB.prepare(`SELECT id, info, source, status, agree, contributors, updated_at FROM postings WHERE url_key = ?1 AND ${VISIBLE}`)
    .bind(k)
    .first<Row>()
  return json({ ok: true, posting: r ? publicPosting(r) : null }, 200, { 'cache-control': 'public, max-age=120' })
}

/**
 * POST /v1/postings — 앱이 AI 로 읽은 공고 보태기 ('문항 모음' 동의한 사람만, 앱이 확인).
 * 본문: { install, url, info: { company, position, deadline, deadlineTime, notes, questions, questionsSource } }
 */
export async function postPosting(req: Request, env: Env) {
  const body = await readJson(req)
  const install = validInstall(body?.install)
  const rawUrl = clip(body?.url, 600)
  const key = await postingUrlKey(rawUrl)
  const info = cleanInfo(body?.info, rawUrl)
  if (!body || !install || !key || !info || (!info.questions.length && info.notes.length < 30)) return fail(400, '형식이 올바르지 않아요')
  const ip = await hashFor(env, 'rate-ip', ipOf(req))
  if ((await overLimit(env, `p:${await hashFor(env, 'rate', install)}`, 20, 60)) || (await overLimit(env, `p-ip:${ip}`, 60, 200)))
    return fail(429, '잠시 뒤에 다시 보내 주세요')

  const qh = await qHash(info)
  const who = await hashFor(env, 'postings', install)
  const row = await env.DB.prepare(
    `INSERT INTO postings (url_key, url, company_key, company, position, period, deadline, info, q_hash, source)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'user')
     ON CONFLICT (url_key) DO UPDATE SET updated_at = updated_at
     RETURNING id, source, q_hash`,
  )
    .bind(key, rawUrl, companyKey(info.company), info.company, info.position, periodOf(info.deadline), info.deadline, JSON.stringify(info), qh)
    .first<{ id: number; source: string; q_hash: string }>()
  if (!row) return fail(500, '저장하지 못했어요')
  await env.DB.prepare(`INSERT INTO posting_contrib (posting_id, install, q_hash, info) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (posting_id, install) DO UPDATE SET q_hash = ?3, info = ?4, at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`)
    .bind(row.id, who, qh, JSON.stringify(info))
    .run()
  // 사용자가 모은 공고는 가장 많은 기기가 똑같이 읽은 문항 묶음을 대표로 (개발자가 모은 것은 그대로 둔다)
  if (row.source === 'user') {
    const top = await env.DB.prepare(
      `SELECT q_hash, COUNT(*) AS n, MAX(at) AS last, (SELECT info FROM posting_contrib c2 WHERE c2.posting_id = ?1 AND c2.q_hash = c.q_hash ORDER BY at DESC LIMIT 1) AS info
       FROM posting_contrib c WHERE posting_id = ?1 GROUP BY q_hash ORDER BY n DESC, last DESC LIMIT 1`,
    )
      .bind(row.id)
      .first<{ q_hash: string; n: number; info: string }>()
    if (top)
      await env.DB.prepare(
        `UPDATE postings SET info = ?2, q_hash = ?3, agree = ?4, deadline = json_extract(?2, '$.deadline'),
           contributors = (SELECT COUNT(*) FROM posting_contrib WHERE posting_id = ?1), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?1`,
      )
        .bind(row.id, top.info, top.q_hash, top.n)
        .run()
  } else {
    await env.DB.prepare(`UPDATE postings SET contributors = (SELECT COUNT(*) FROM posting_contrib WHERE posting_id = ?1) WHERE id = ?1`).bind(row.id).run()
  }
  return json({ ok: true, id: row.id }, 201)
}

type InsightRow = { id: number; kind: string; company: string; position: string; period: string; content: string; updated_at: string }
const publicInsight = (r: InsightRow) => ({ id: r.id, kind: r.kind, company: r.company, position: r.position, period: r.period, updatedAt: r.updated_at, ...JSON.parse(r.content) })

/** GET /v1/insights?company=…&position=…&posting=<공고 id> — 누구나. 공개한 기업 · 직무 · 문항 분석 */
export async function getInsights(url: URL, env: Env) {
  const ckey = companyKey(clip(url.searchParams.get('company'), 60))
  if (ckey.length < 2) return fail(400, '회사 이름을 두 글자 이상 넣어 주세요')
  const pkey = positionKey(clip(url.searchParams.get('position'), 80))
  const postingId = Number(url.searchParams.get('posting')) || 0
  const { results } = await env.DB.prepare(
    `SELECT id, kind, company, position_key, position, posting_id, period, content, updated_at FROM insights
     WHERE company_key = ?1 AND status = 'published' ORDER BY period DESC, updated_at DESC LIMIT 40`,
  )
    .bind(ckey)
    .all<InsightRow & { position_key: string; posting_id: number }>()
  const near = (k: string) => !!pkey && !!k && (k === pkey || k.includes(pkey) || pkey.includes(k))
  const company = results.find((r) => r.kind === 'company')
  const job = results.find((r) => r.kind === 'job' && r.position_key === pkey) ?? results.find((r) => r.kind === 'job' && near(r.position_key))
  const questions = postingId ? results.find((r) => r.kind === 'questions' && r.posting_id === postingId) : undefined
  return json(
    {
      ok: true,
      company: company ? publicInsight(company) : null,
      job: job ? publicInsight(job) : null,
      questions: questions ? publicInsight(questions) : null,
    },
    200,
    { 'cache-control': 'public, max-age=300' },
  )
}

// ---------- 관리 (관리 열쇠 확인은 부르는 쪽에서)
const STATUS = ['pending', 'published', 'hidden']
const limitOf = (url: URL, def = 50) => Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || def))

async function importPostings(req: Request, env: Env) {
  const body = await readJson(req, 600_000)
  const items = Array.isArray(body?.items) ? (body!.items as Record<string, unknown>[]).slice(0, 100) : []
  const out: { url: string; id?: number; error?: string }[] = []
  for (const it of items) {
    const rawUrl = clip(it?.url, 600)
    const key = await postingUrlKey(rawUrl)
    const info = cleanInfo(it?.info, rawUrl)
    if (!key || !info) {
      out.push({ url: rawUrl, error: '주소 또는 회사가 올바르지 않아요' })
      continue
    }
    const status = STATUS.includes(String(it.status)) ? String(it.status) : 'pending'
    // 개발자가 모은 것이 사용자 것보다 우선: 같은 공고면 내용을 덮고 curated 로 바꾼다 (보탠 기기 기록은 그대로)
    const r = await env.DB.prepare(
      `INSERT INTO postings (url_key, url, company_key, company, position, period, deadline, info, q_hash, source, status)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'curated', ?10)
       ON CONFLICT (url_key) DO UPDATE SET url = ?2, company_key = ?3, company = ?4, position = ?5, period = ?6, deadline = ?7, info = ?8, q_hash = ?9,
         source = 'curated', status = ?10, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       RETURNING id`,
    )
      .bind(key, rawUrl, companyKey(info.company), info.company, info.position, periodOf(info.deadline), info.deadline, JSON.stringify(info), await qHash(info), status)
      .first<{ id: number }>()
    out.push({ url: rawUrl, id: r?.id })
  }
  return json({ ok: true, items: out })
}

async function listPostings(url: URL, env: Env) {
  const status = url.searchParams.get('status')
  const ok = STATUS.includes(String(status))
  const { results } = await env.DB.prepare(
    `SELECT id, url, company, position, period, deadline, info, source, status, agree, contributors, created_at, updated_at FROM postings
     ${ok ? 'WHERE status = ?1' : ''} ORDER BY updated_at DESC LIMIT ${limitOf(url)}`,
  )
    .bind(...(ok ? [status] : []))
    .all<Record<string, unknown> & { info: string }>()
  return json({ ok: true, items: results.map((r) => ({ ...r, info: JSON.parse(r.info) })) })
}

async function updatePosting(id: number, req: Request, env: Env) {
  const body = await readJson(req, 100_000)
  const sets: string[] = []
  const args: unknown[] = []
  if (body?.status !== undefined) {
    if (!STATUS.includes(String(body.status))) return fail(400, 'status 는 pending · published · hidden')
    sets.push(`status = ?${args.push(String(body.status))}`)
  }
  if (body?.info !== undefined) {
    const cur = await env.DB.prepare(`SELECT url FROM postings WHERE id = ?1`).bind(id).first<{ url: string }>()
    const info = cur && cleanInfo(body.info, cur.url)
    if (!info) return fail(400, 'info 가 올바르지 않아요')
    sets.push(`info = ?${args.push(JSON.stringify(info))}`, `company = ?${args.push(info.company)}`, `company_key = ?${args.push(companyKey(info.company))}`, `position = ?${args.push(info.position)}`, `deadline = ?${args.push(info.deadline)}`, `q_hash = ?${args.push(await qHash(info))}`)
  }
  if (!sets.length) return fail(400, '바꿀 것이 없어요')
  const r = await env.DB.prepare(`UPDATE postings SET ${sets.join(', ')}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?${args.push(id)}`)
    .bind(...args)
    .run()
  return r.meta.changes ? json({ ok: true }) : fail(404, '없는 항목')
}

async function importInsights(req: Request, env: Env) {
  const body = await readJson(req, 600_000)
  const items = Array.isArray(body?.items) ? (body!.items as Record<string, unknown>[]).slice(0, 100) : []
  const out: { kind: string; company: string; id?: number; error?: string }[] = []
  for (const it of items) {
    const kind = String(it?.kind)
    const company = clip(it?.company, 60)
    const content = cleanInsight(it?.content)
    if (!['company', 'job', 'questions'].includes(kind) || companyKey(company).length < 2 || !content) {
      out.push({ kind, company, error: '종류 · 회사 · 내용이 올바르지 않아요' })
      continue
    }
    const position = kind === 'company' ? '' : clip(it.position, 80)
    let postingId = 0
    if (kind === 'questions') {
      const k = await postingUrlKey(clip(it.postingUrl, 600))
      const p = k ? await env.DB.prepare(`SELECT id FROM postings WHERE url_key = ?1`).bind(k).first<{ id: number }>() : null
      if (!p) {
        out.push({ kind, company, error: '문항 분석은 먼저 올린 공고 주소(postingUrl)가 필요해요' })
        continue
      }
      postingId = p.id
    }
    const period = clip(it.period, 20) || periodOf('')
    const status = STATUS.includes(String(it.status)) ? String(it.status) : 'pending'
    const r = await env.DB.prepare(
      `INSERT INTO insights (kind, company_key, company, position_key, position, posting_id, period, content, status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
       ON CONFLICT (kind, company_key, position_key, posting_id, period) DO UPDATE SET company = ?3, position = ?5, content = ?8, status = ?9, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       RETURNING id`,
    )
      .bind(kind, companyKey(company), company, positionKey(position), position, postingId, period, JSON.stringify(content), status)
      .first<{ id: number }>()
    out.push({ kind, company, id: r?.id })
  }
  return json({ ok: true, items: out })
}

async function listInsights(url: URL, env: Env) {
  const status = url.searchParams.get('status')
  const ok = STATUS.includes(String(status))
  const { results } = await env.DB.prepare(
    `SELECT id, kind, company, position, posting_id, period, content, status, updated_at FROM insights ${ok ? 'WHERE status = ?1' : ''} ORDER BY updated_at DESC LIMIT ${limitOf(url)}`,
  )
    .bind(...(ok ? [status] : []))
    .all<Record<string, unknown> & { content: string }>()
  return json({ ok: true, items: results.map((r) => ({ ...r, content: JSON.parse(r.content) })) })
}

async function updateInsight(id: number, req: Request, env: Env) {
  const body = await readJson(req, 100_000)
  const sets: string[] = []
  const args: unknown[] = []
  if (body?.status !== undefined) {
    if (!STATUS.includes(String(body.status))) return fail(400, 'status 는 pending · published · hidden')
    sets.push(`status = ?${args.push(String(body.status))}`)
  }
  if (body?.content !== undefined) {
    const c = cleanInsight(body.content)
    if (!c) return fail(400, 'content 가 올바르지 않아요')
    sets.push(`content = ?${args.push(JSON.stringify(c))}`)
  }
  if (!sets.length) return fail(400, '바꿀 것이 없어요')
  const r = await env.DB.prepare(`UPDATE insights SET ${sets.join(', ')}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?${args.push(id)}`)
    .bind(...args)
    .run()
  return r.meta.changes ? json({ ok: true }) : fail(404, '없는 항목')
}

/** /v1/admin/postings · /v1/admin/insights */
export async function adminPostings(path: string, req: Request, url: URL, env: Env) {
  const get = req.method === 'GET'
  const post = req.method === 'POST'
  if (path === '/v1/admin/postings' && get) return listPostings(url, env)
  if (path === '/v1/admin/postings/import' && post) return importPostings(req, env)
  if (path === '/v1/admin/insights' && get) return listInsights(url, env)
  if (path === '/v1/admin/insights/import' && post) return importInsights(req, env)
  let m = path.match(/^\/v1\/admin\/postings\/(\d+)$/)
  if (m && post) return updatePosting(Number(m[1]), req, env)
  m = path.match(/^\/v1\/admin\/insights\/(\d+)$/)
  if (m && post) return updateInsight(Number(m[1]), req, env)
  return null
}
