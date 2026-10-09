import { clip, fail, hashFor, ipOf, json, overLimit, readJson, scrub, sha256, validInstall, type Env } from './util'

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const EVENT_RE = /^[a-z0-9_]{1,40}$/

/** 받아 줄 날짜: 8일 전 ~ 내일(시간대 차이) */
function dayOk(day: string) {
  if (!DAY_RE.test(day)) return false
  const t = Date.parse(day + 'T00:00:00Z')
  const now = Date.now()
  return t > now - 8 * 864e5 && t < now + 2 * 864e5
}

/**
 * 익명 사용 통계. 본문: { install, days: [{ day, version, os, arch, ai, events: { 이름: 횟수 } }] }
 * 기기 · 날짜마다 한 줄을 덮어써서, 앱이 같은 날을 여러 번 보내도 중복되지 않는다
 */
export async function postStats(req: Request, env: Env) {
  const body = await readJson(req)
  const install = validInstall(body?.install)
  if (!body || !install || !Array.isArray(body.days)) return fail(400, '형식이 올바르지 않아요')
  const ip = await hashFor(env, 'rate-ip', ipOf(req))
  if ((await overLimit(env, `stats:${await hashFor(env, 'rate', install)}`, 12, 60)) || (await overLimit(env, `stats-ip:${ip}`, 120, 600)))
    return fail(429, '잠시 뒤에 다시 보내 주세요')

  const who = await hashFor(env, 'stats', install)
  const rows = []
  for (const d of body.days.slice(0, 8) as Record<string, unknown>[]) {
    const day = clip(d?.day, 10)
    if (!dayOk(day)) continue
    const events: Record<string, number> = {}
    if (d.events && typeof d.events === 'object') {
      for (const [k, v] of Object.entries(d.events as Record<string, unknown>).slice(0, 40)) {
        const n = Math.floor(Number(v))
        if (EVENT_RE.test(k) && n > 0) events[k] = Math.min(n, 10_000)
      }
    }
    rows.push(
      env.DB.prepare(
        `INSERT INTO stats_daily (day, install, version, os, arch, ai, events) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT (day, install) DO UPDATE SET version = excluded.version, os = excluded.os, arch = excluded.arch, ai = excluded.ai, events = excluded.events`,
      ).bind(day, who, clip(d.version, 20) || null, clip(d.os, 20) || null, clip(d.arch, 10) || null, clip(d.ai, 10) || null, JSON.stringify(events)),
    )
  }
  if (rows.length) await env.DB.batch(rows)
  return json({ ok: true, saved: rows.length })
}

const SOURCES = ['main', 'renderer', 'crash'] as const

/** 같은 오류를 한 줄로 묶는 지문: 숫자 · 파일 이름의 빌드 해시 · 줄 번호를 지우고 앞부분만 본다 */
async function fingerprint(source: string, message: string, stack: string) {
  const msg = message.replace(/\d+/g, '#').slice(0, 200)
  const frames = stack
    .split('\n')
    .slice(1, 4)
    .map((l) => l.trim().replace(/-[A-Za-z0-9_]{6,}\.js/g, '.js').replace(/:\d+(:\d+)?\)?$/g, ''))
    .join('|')
  return sha256(`${source}|${msg}|${frames}`)
}

/** 오류 보고. 본문: { install, version, os, items: [{ source: main|renderer|crash, message, stack }] } */
export async function postErrors(req: Request, env: Env) {
  const body = await readJson(req, 60_000)
  const install = validInstall(body?.install)
  if (!body || !install || !Array.isArray(body.items)) return fail(400, '형식이 올바르지 않아요')
  const ip = await hashFor(env, 'rate-ip', ipOf(req))
  if ((await overLimit(env, `err:${await hashFor(env, 'rate', install)}`, 20, 100)) || (await overLimit(env, `err-ip:${ip}`, 100, 500)))
    return fail(429, '잠시 뒤에 다시 보내 주세요')

  const version = clip(body.version, 20)
  const os = clip(body.os, 40) || null
  const who = await hashFor(env, 'errors', install)
  let saved = 0
  for (const it of body.items.slice(0, 10) as Record<string, unknown>[]) {
    const source = SOURCES.includes(it?.source as (typeof SOURCES)[number]) ? (it.source as string) : ''
    const message = scrub(clip(it?.message, 500))
    const stack = scrub(clip(it?.stack, 4000))
    if (!source || !message) continue
    const fp = await fingerprint(source, message, stack)
    const row = await env.DB.prepare(
      `INSERT INTO errors (fingerprint, version, source, message, stack, os) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT (fingerprint, version) DO UPDATE SET count = count + 1, last_seen = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
         status = CASE WHEN status = 'done' THEN 'new' ELSE status END
       RETURNING id`,
    )
      .bind(fp, version, source, message, stack || null, os)
      .first<{ id: number }>()
    if (row) await env.DB.prepare(`INSERT OR IGNORE INTO error_installs (error_id, install) VALUES (?1, ?2)`).bind(row.id, who).run()
    saved++
  }
  return json({ ok: true, saved })
}
