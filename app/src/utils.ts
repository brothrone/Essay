import type { CountMode } from './types'
import { desktop } from './desktop'
import { toast } from './toast'

export const uid = () => crypto.randomUUID()

/** 자소서 글자수. 바이트는 한글 2byte · 줄바꿈 2byte(CRLF) 기준 */
export function countChars(text: string, mode: CountMode): number {
  if (mode === 'without') return [...text.replace(/\s/g, '')].length
  if (mode === 'byte') {
    let n = 0
    for (const ch of text) n += ch === '\n' || ch.charCodeAt(0) > 127 ? 2 : 1
    return n
  }
  return [...text].length
}

const DAY = 86_400_000

export function parseDate(s: string): Date | null {
  const m = s?.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null
}

export function toDateInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 오늘 기준 남은 일수 (오늘 = 0, 지난 날짜는 음수) */
export function daysUntil(s: string): number | null {
  const d = parseDate(s)
  if (!d) return null
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((d.getTime() - today.getTime()) / DAY)
}

export const ddayLabel = (n: number) => (n === 0 ? 'D-Day' : n > 0 ? `D-${n}` : `D+${-n}`)

export function addYears(s: string, years: number): string {
  const d = parseDate(s)
  if (!d) return ''
  d.setFullYear(d.getFullYear() + years)
  d.setDate(d.getDate() - 1)
  return toDateInput(d)
}

/** 오늘 날짜 YYYY-MM-DD */
export const todayStr = () => toDateInput(new Date())

export const fmtYm = (s: string) => (s ? s.slice(0, 7).replace('-', '.') : '')
export const fmtDate = (s: string) => (s ? s.slice(0, 10).replaceAll('-', '.') : '')

export function fmtPeriod(start: string, end: string) {
  if (!start) return fmtYm(end)
  return `${fmtYm(start)} ~ ${end ? fmtYm(end) : '현재'}`
}

export function fmtRelative(ts: number) {
  const diff = Date.now() - ts
  if (diff < 60_000) return '방금 전'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`
  if (diff < DAY) return `${Math.floor(diff / 3_600_000)}시간 전`
  if (diff < DAY * 7) return `${Math.floor(diff / DAY)}일 전`
  return fmtDate(toDateInput(new Date(ts)))
}

export async function copyText(text: string, message = '클립보드에 복사했어요') {
  try {
    await desktop.copyText(text)
    toast(message)
  } catch {
    toast('복사에 실패했어요')
  }
}

function bigrams(s: string) {
  const t = s.replace(/[^\p{L}\p{N}]/gu, '')
  const set = new Set<string>()
  for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2))
  return set
}

/** 문항끼리 얼마나 비슷한지 (글자 bigram 자카드 유사도, 0~1) */
export function similarity(a: string, b: string) {
  const A = bigrams(a)
  const B = bigrams(b)
  if (!A.size || !B.size) return 0
  let inter = 0
  for (const x of A) if (B.has(x)) inter++
  return inter / (A.size + B.size - inter)
}

export const includesText = (haystack: (string | undefined)[], q: string) => {
  const k = q.trim().toLowerCase()
  return !k || haystack.some((s) => s?.toLowerCase().includes(k))
}
