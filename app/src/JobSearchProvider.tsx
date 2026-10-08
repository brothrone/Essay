import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { desktop } from './desktop'
import { isGroundingUrl } from './format'
import { JobSearchContext, toJob, type FoundJob, type JobSearchApi, type JobSearchState } from './jobSearch'
import { jobSearchPrompt, parseAiJson } from './prompts'
import { jobKey, useStore } from './store'
import { toast } from './toast'
import type { JobPosting, JobQuery } from './types'
import { runWebTask } from './aiRun'
import { toDateInput } from './utils'

const IDLE: JobSearchState = { running: false, startedAt: 0, steps: [], error: '', lastAdded: null }

export function JobSearchProvider({ children }: { children: ReactNode }) {
  const { data, mergeJobs, setJobQuery } = useStore()
  const ai = desktop.ai
  const [state, setState] = useState<JobSearchState>(IDLE)
  const active = useRef(false) // 지금 실행 중인 AI 작업이 공고 찾기인지 (진행 단계를 모을지)
  const running = useRef(false)
  const latest = useRef(data)

  useEffect(() => {
    latest.current = data
  }, [data])

  // 어떤 검색어로 찾고 어떤 공고를 읽는지 단계로 모은다
  useEffect(
    () =>
      ai.onProgress((p) => {
        if (!active.current || !p.tool) return
        const label = p.tool === 'WebSearch' ? '검색' : p.tool === 'WebFetch' ? '공고 읽기' : p.tool
        setState((s) => ({ ...s, steps: [...s.steps, `${label} · ${p.detail || ''}`].slice(-12) }))
      }),
    [ai],
  )

  const stopRef = useRef(false)
  const start = useCallback(
    async (query: JobQuery) => {
      if (running.current) return
      running.current = true
      stopRef.current = false
      setJobQuery(query)
      setState({ ...IDLE, running: true, startedAt: Date.now() })
      // 다른 AI 작업(공고 읽기 등)이 돌고 있으면 끝난 뒤 이어서 시작한다
      const r = await runWebTask(jobSearchPrompt(latest.current, query, toDateInput(new Date())), {
        stopped: () => stopRef.current,
        onState: (s) => {
          active.current = s === 'running'
          setState((st) => ({ ...st, steps: s === 'waiting' ? ['다른 AI 작업이 끝나길 기다리는 중'] : st.steps }))
        },
      })
      active.current = false
      running.current = false
      if (!r.ok) {
        setState((s) => ({ ...s, running: false, error: r.cancelled ? '' : r.error }))
        return
      }
      const parsed = parseAiJson<FoundJob[]>(r.text)
      if (!Array.isArray(parsed)) {
        setState((s) => ({ ...s, running: false, error: '공고 목록을 읽지 못했어요. 다시 시도해 주세요.' }))
        return
      }
      const found = parsed.map(toJob).filter((j): j is JobPosting => !!j)
      // Gemini 검색 결과의 구글 중간 주소는 며칠 뒤 사라지므로 지금 실제 공고 주소로 바꿔 저장한다
      if (found.some((j) => isGroundingUrl(j.url))) {
        try {
          const real = await ai.resolveUrls(found.map((j) => j.url))
          found.forEach((j, i) => {
            if (isGroundingUrl(j.url)) j.url = real[i] || ''
          })
        } catch {
          /* 못 바꾸면 그대로 둔다: 자소서 시작 때 다시 시도하고, 안 되면 회사명으로 찾는다 */
        }
      }
      const known = new Set(latest.current.jobs.map(jobKey))
      const added = found.filter((j) => !known.has(jobKey(j))).length
      mergeJobs(found, query)
      setState((s) => ({ ...s, running: false, lastAdded: added }))
      toast(added ? `맞춤 공고 ${added}개를 새로 찾았어요` : '새로 찾은 공고가 없어요. 키워드를 바꿔 보세요')
    },
    [ai, mergeJobs, setJobQuery],
  )

  const api = useMemo<JobSearchApi>(
    () => ({
      ...state,
      start,
      cancel: () => {
        stopRef.current = true
        if (active.current) ai.cancel()
      },
    }),
    [state, ai, start],
  )

  return <JobSearchContext.Provider value={api}>{children}</JobSearchContext.Provider>
}
