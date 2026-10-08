import { STAR_FIELDS } from './constants'
import type { Experience, Project } from './types'
import { fmtPeriod } from './utils'

export function experienceToText(e: Experience) {
  const head = [e.title, [e.type, e.org, e.role, fmtPeriod(e.start, e.end)].filter(Boolean).join(' · ')]
  const body = [
    e.summary && `요약: ${e.summary}`,
    ...STAR_FIELDS.map((f) => e[f.key] && `[${f.short} ${f.label}] ${e[f.key]}`),
    e.learned && `[배운 점] ${e.learned}`,
  ]
  return [...head, ...body].filter(Boolean).join('\n')
}

export function projectToText(p: Project) {
  const title = [p.company, p.position].filter(Boolean).join(' - ')
  const qs = p.questions.map((q, i) => `${i + 1}. ${q.prompt}\n\n${q.answer}`)
  return [title, ...qs].join('\n\n\n')
}

export const isHttpUrl = (url: string) => /^https?:\/\/\S+$/i.test(url.trim())

/** Gemini 검색 결과에 붙는 구글 중간 주소 (며칠 뒤 사라진다) */
export const isGroundingUrl = (url: string) =>
  /^https:\/\/vertexaisearch\.cloud\.google\.com\/grounding-api-redirect\//i.test(url.trim())

/** 사이트 첫 화면(https://saramin.co.kr 등)이 아니라 공고 한 건을 가리키는 주소인지 */
export function isPostingUrl(url: string) {
  if (!isHttpUrl(url) || isGroundingUrl(url)) return false
  try {
    const u = new URL(url.trim())
    return u.pathname.replace(/\/+$/, '').length > 0 || u.search.length > 1
  } catch {
    return false
  }
}
