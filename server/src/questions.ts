import { clip, fail, hashFor, ipOf, json, overLimit, readJson, sha256, validInstall, type Env } from './util'

/** 회사 이름 비교용: (주) · 주식회사 · 공백 · 문장부호를 빼고 소문자로 */
export function companyKey(name: string) {
  return name
    .normalize('NFC')
    .toLowerCase()
    .replace(/\(주\)|㈜|주식회사|\(유\)|유한회사|\(예시\)/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
}
const positionKey = (s: string) => s.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')

/** 마감일(없으면 오늘) → "2026 하반기" */
function periodOf(deadline: string) {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(deadline)
  const d = m ? { y: Number(m[1]), mo: Number(m[2]) } : { y: new Date().getUTCFullYear(), mo: new Date().getUTCMonth() + 1 }
  return `${d.y} ${d.mo <= 6 ? '상반기' : '하반기'}`
}

type Q = { prompt: string; limit: number | null }

function cleanQuestions(v: unknown): Q[] {
  if (!Array.isArray(v)) return []
  const out: Q[] = []
  for (const q of v.slice(0, 10) as Record<string, unknown>[]) {
    const prompt = clip(q?.prompt, 600).replace(/\s+/g, ' ')
    if (prompt.length < 5) continue
    const n = Math.floor(Number(q?.limit))
    out.push({ prompt, limit: n >= 50 && n <= 5000 ? n : null })
  }
  return out
}

/**
 * 공고 페이지에서 읽은 문항 보태기. 본문: { install, company, position, deadline, sourceHost, questions: [{ prompt, limit }] }
 * 공고 본문 · 주소는 받지 않는다. 같은 회사 · 직무 · 시기 · 문항이면 한 줄로 묶고 보탠 기기 수만 센다
 */
export async function postQuestions(req: Request, env: Env) {
  const body = await readJson(req)
  const install = validInstall(body?.install)
  const company = clip(body?.company, 60)
  const ckey = companyKey(company)
  const questions = cleanQuestions(body?.questions)
  if (!body || !install || ckey.length < 2 || !questions.length) return fail(400, '형식이 올바르지 않아요')
  const ip = await hashFor(env, 'rate-ip', ipOf(req))
  if ((await overLimit(env, `q:${await hashFor(env, 'rate', install)}`, 20, 60)) || (await overLimit(env, `q-ip:${ip}`, 60, 200)))
    return fail(429, '잠시 뒤에 다시 보내 주세요')

  const position = clip(body.position, 60)
  const period = periodOf(clip(body.deadline, 10))
  const host = clip(body.sourceHost, 80).toLowerCase().replace(/^www\./, '')
  const sourceHost = /^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) ? host : null
  const setKey = await sha256([ckey, positionKey(position), period, ...questions.map((q) => q.prompt)].join('\n'))

  const row = await env.DB.prepare(
    `INSERT INTO question_sets (set_key, company_key, company, position, period, questions, source_host) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
     ON CONFLICT (set_key) DO UPDATE SET last_seen = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     RETURNING id`,
  )
    .bind(setKey, ckey, company, position, period, JSON.stringify(questions), sourceHost)
    .first<{ id: number }>()
  if (!row) return fail(500, '저장하지 못했어요')
  const who = await hashFor(env, 'questions', install)
  const added = await env.DB.prepare(`INSERT OR IGNORE INTO question_contrib (set_id, install) VALUES (?1, ?2)`).bind(row.id, who).run()
  if (added.meta.changes) {
    // 처음 만든 줄은 contributors 가 이미 1 이다. 기존 줄에 다른 기기가 보탰을 때만 올린다
    await env.DB.prepare(`UPDATE question_sets SET contributors = (SELECT COUNT(*) FROM question_contrib WHERE set_id = ?1) WHERE id = ?1`).bind(row.id).run()
  }
  return json({ ok: true, id: row.id }, 201)
}

/** 회사 이름으로 모인 문항 찾기 (누구나). GET /v1/questions?company=…&position=… */
export async function getQuestions(url: URL, env: Env) {
  const company = clip(url.searchParams.get('company'), 60)
  const ckey = companyKey(company)
  if (ckey.length < 2) return fail(400, '회사 이름을 두 글자 이상 넣어 주세요')
  const pkey = positionKey(clip(url.searchParams.get('position'), 60))
  const { results } = await env.DB.prepare(
    `SELECT id, company, position, period, questions, contributors, last_seen FROM question_sets
     WHERE company_key = ?1 AND hidden = 0 AND last_seen > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-18 months')
     ORDER BY last_seen DESC LIMIT 30`,
  )
    .bind(ckey)
    .all<{ id: number; company: string; position: string; period: string; questions: string; contributors: number; last_seen: string }>()
  const score = (p: string) => {
    const k = positionKey(p)
    if (!pkey || !k) return 0
    return k === pkey ? 2 : k.includes(pkey) || pkey.includes(k) ? 1 : 0
  }
  const sets = results
    .map((r) => ({ id: r.id, company: r.company, position: r.position, period: r.period, contributors: r.contributors, lastSeen: r.last_seen, questions: JSON.parse(r.questions) as Q[], match: score(r.position) }))
    .sort((a, b) => b.match - a.match || b.period.localeCompare(a.period) || b.contributors - a.contributors || b.lastSeen.localeCompare(a.lastSeen))
    .slice(0, 5)
  return json({ ok: true, sets }, 200, { 'cache-control': 'public, max-age=300' })
}
