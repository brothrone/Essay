export interface Env {
  DB: D1Database
  ADMIN_TOKEN: string
  IP_SALT: string
  FEEDBACK_PER_HOUR: string
  FEEDBACK_PER_DAY: string
  // 유료 판매 (billing.ts). 상점 ID · 채널 키는 공개 값(wrangler.toml), API 비밀 값 · 서명 키는 wrangler secret
  PRICE?: string
  PORTONE_STORE_ID?: string
  PORTONE_CHANNEL_KEY?: string
  PORTONE_API_SECRET?: string
  LICENSE_PRIVATE_KEY: string
  BILLING_MOCK?: string
}

export const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
}

export const json = (data: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...extra } })
export const fail = (status: number, error: string, extra: Record<string, string> = {}) => json({ ok: false, error }, status, extra)

/** 문자열이면 앞뒤 공백을 지우고 max 글자로 자른다. 아니면 빈 문자열 */
export const clip = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

export async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** 기능마다 다른 섞는 값을 써서, 통계 · 문항 모음 · 오류에 남은 기기 해시를 서로 이어 붙일 수 없게 한다 */
export const hashFor = (env: Env, purpose: string, value: string) => sha256(`${purpose}:${env.IP_SALT || ''}:${value}`)

// 길이가 달라도 시간이 같게 걸리는 비교 (관리 열쇠 추측 방지)
export async function sameSecret(a: string, b: string) {
  if (!a || !b) return false
  const [x, y] = await Promise.all([sha256(a), sha256(b)])
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i)
  return diff === 0
}

export const MAX_BODY = 20_000

export async function readJson(req: Request, max = MAX_BODY): Promise<Record<string, unknown> | null> {
  const len = Number(req.headers.get('content-length') || 0)
  if (len > max) return null
  const text = await req.text()
  if (text.length > max) return null
  try {
    const v = JSON.parse(text)
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null
  } catch {
    return null
  }
}

/** 기기 번호: 앱이 처음 실행 때 만든 무작위 32자리 16진수. 형식이 아니면 받지 않는다 */
export const validInstall = (v: unknown) => (typeof v === 'string' && /^[0-9a-f]{32}$/.test(v) ? v : '')

export const ipOf = (req: Request) => req.headers.get('cf-connecting-ip') || 'local'

/**
 * 횟수 제한: key 마다 시간 묶음(hour) · 날짜 묶음(day) 수를 올리고, 한도를 넘었으면 true.
 * 한 요청에 쓰기 두 번. 오래된 묶음은 매일 정리(scheduled)
 */
export async function overLimit(env: Env, key: string, perHour: number, perDay: number) {
  const now = new Date().toISOString()
  const hour = `h:${now.slice(0, 13)}`
  const day = `d:${now.slice(0, 10)}`
  const up = `INSERT INTO rate (key, bucket, n) VALUES (?1, ?2, 1) ON CONFLICT (key, bucket) DO UPDATE SET n = n + 1 RETURNING n`
  const [h, d] = await env.DB.batch<{ n: number }>([env.DB.prepare(up).bind(key, hour), env.DB.prepare(up).bind(key, day)])
  return (h.results[0]?.n ?? 0) > perHour || (d.results[0]?.n ?? 0) > perDay
}

/** 사용자 경로 · 메일 주소처럼 사람을 알아볼 수 있는 것을 지운다 (앱도 지워서 보내지만 한 번 더) */
export function scrub(text: string) {
  return text
    .replace(/\/Users\/[^/\s'"]+/g, '~')
    .replace(/\/home\/[^/\s'"]+/g, '~')
    .replace(/[A-Za-z]:\\+Users\\+[^\\\s'"]+/gi, '~')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<메일>')
}
