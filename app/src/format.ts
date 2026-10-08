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
