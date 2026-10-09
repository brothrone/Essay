import { createContext, useContext } from 'react'
import { isHttpUrl } from './format'
import type { JobPosting, JobQuery } from './types'
import { uid } from './utils'

/** 맞춤 공고 찾기는 화면을 옮겨도 계속되도록 앱 전체에서 상태를 들고 있다 */
export interface JobSearchState {
  running: boolean
  startedAt: number
  steps: string[]
  error: string
  lastAdded: number | null
  /** 마지막 찾기에서 마감 · 확인 불가로 뺀 공고 수 */
  lastDropped: number
}

export interface JobSearchApi extends JobSearchState {
  start: (query: JobQuery) => void
  cancel: () => void
}

export const JobSearchContext = createContext<JobSearchApi | null>(null)

export function useJobSearch() {
  const ctx = useContext(JobSearchContext)
  if (!ctx) throw new Error('JobSearchProvider가 필요해요')
  return ctx
}

export type FoundJob = Partial<Record<keyof JobPosting, unknown>>

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/** AI가 돌려준 공고 한 건을 앱 데이터 형태로 정리 */
export function toJob(raw: FoundJob): JobPosting | null {
  const company = text(raw.company)
  const title = text(raw.title)
  if (!company && !title) return null
  const deadline = /^\d{4}-\d{2}-\d{2}$/.test(text(raw.deadline)) ? text(raw.deadline) : ''
  const score = Number(raw.matchScore)
  return {
    id: uid(),
    company,
    title,
    kind: text(raw.kind),
    location: text(raw.location),
    deadline,
    url: isHttpUrl(text(raw.url)) ? text(raw.url) : '',
    source: text(raw.source),
    summary: text(raw.summary),
    matchScore: Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 0,
    matchReason: text(raw.matchReason),
    foundAt: Date.now(),
    status: 'new',
    projectId: '',
    saved: false,
  }
}
