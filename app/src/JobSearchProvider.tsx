import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { desktop } from './desktop'
import { JobSearchContext, toJob, type FoundJob, type JobSearchApi, type JobSearchState } from './jobSearch'
import { jobSearchPrompt, parseAiJson } from './prompts'
import { jobKey, useStore } from './store'
import { toast } from './toast'
import type { JobPosting, JobQuery } from './types'
import { noteAiResult } from './useAiStatus'
import { savedAiModel, savedAiProvider } from './useAiTask'
import { toDateInput } from './utils'

const IDLE: JobSearchState = { running: false, startedAt: 0, steps: [], error: '', lastAdded: null }

export function JobSearchProvider({ children }: { children: ReactNode }) {
  const { data, mergeJobs, setJobQuery } = useStore()
  const ai = desktop.ai
  const [state, setState] = useState<JobSearchState>(IDLE)
  const active = useRef(false)
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

  const start = useCallback(
    async (query: JobQuery) => {
      if (active.current) return
      active.current = true
      setJobQuery(query)
      setState({ ...IDLE, running: true, startedAt: Date.now() })
      const provider = savedAiProvider()
      const r = await ai.run(jobSearchPrompt(latest.current, query, toDateInput(new Date())), savedAiModel(provider) || undefined, {
        web: true,
        provider,
      })
      active.current = false
      noteAiResult(provider, r)
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
      const known = new Set(latest.current.jobs.map(jobKey))
      const added = found.filter((j) => !known.has(jobKey(j))).length
      mergeJobs(found, query)
      setState((s) => ({ ...s, running: false, lastAdded: added }))
      toast(added ? `맞춤 공고 ${added}개를 새로 찾았어요` : '새로 찾은 공고가 없어요. 키워드를 바꿔 보세요')
    },
    [ai, mergeJobs, setJobQuery],
  )

  const api = useMemo<JobSearchApi>(
    () => ({ ...state, start, cancel: () => ai.cancel() }),
    [state, ai, start],
  )

  return <JobSearchContext.Provider value={api}>{children}</JobSearchContext.Provider>
}
