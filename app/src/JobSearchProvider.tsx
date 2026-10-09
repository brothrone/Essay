import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { desktop } from './desktop'
import { isGroundingUrl, isPostingUrl } from './format'
import { JobSearchContext, toJob, type FoundJob, type JobSearchApi, type JobSearchState } from './jobSearch'
import { jobSearchPrompt, parseAiJson } from './prompts'
import { jobKey, useStore } from './store'
import { toast } from './toast'
import type { JobPosting, JobQuery } from './types'
import { runWebTask } from './aiRun'
import { toDateInput } from './utils'

const IDLE: JobSearchState = { running: false, startedAt: 0, steps: [], error: '', lastAdded: null, lastDropped: 0 }

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
      // 확실한 공고만 남긴다: 공고 한 건을 가리키는 주소가 있고, 공고 페이지를 직접 열어 봤을 때 마감 표시 · 지난 마감일이 없는 것
      const today = toDateInput(new Date())
      let verified = found.filter((j) => isPostingUrl(j.url) && !(j.deadline && j.deadline < today))
      if (verified.length) {
        setState((s) => ({ ...s, steps: [...s.steps, `공고 ${verified.length}개를 직접 열어 접수 중인지 확인하는 중`].slice(-12) }))
        try {
          const checks = await ai.checkPostings(
            verified.map((j) => j.url),
            today,
          )
          // 남기는 것: 공고 페이지에서 접수 중으로 확인됐거나, 마감일이 오늘 이후이고 페이지에 마감 표시가 없는 것
          verified = verified.filter((j, i) => {
            const c = checks[i]
            if (c?.deadline) j.deadline = c.deadline // 페이지의 마감일이 AI 가 적은 것보다 정확하다
            if (!c || c.status === 'closed') return false
            if (j.deadline && j.deadline < today) return false
            return c.status === 'open' || !!j.deadline
          })
        } catch {
          // 확인을 못 하면 마감일이 오늘 이후로 적힌 것만 남긴다
          verified = verified.filter((j) => !!j.deadline && j.deadline >= today)
        }
      }
      // 같은 공고가 여러 번 나오면(한 공고의 여러 직무 등) 점수가 높은 하나만 남긴다
      const seen = new Set<string>()
      verified = verified
        .sort((a, b) => b.matchScore - a.matchScore)
        .filter((j) => {
          const k = jobKey(j)
          if (seen.has(k)) return false
          seen.add(k)
          return true
        })
        .slice(0, query.count)
      const dropped = found.length - verified.length
      const known = new Set(latest.current.jobs.map(jobKey))
      const added = verified.filter((j) => !known.has(jobKey(j))).length
      mergeJobs(verified, query)
      setState((s) => ({ ...s, running: false, lastAdded: added, lastDropped: dropped }))
      const droppedNote = dropped ? ` · 마감됐거나 공고를 확인할 수 없는 ${dropped}개는 뺐어요` : ''
      toast(added ? `확인된 맞춤 공고 ${added}개를 새로 찾았어요${droppedNote}` : `새로 찾은 확실한 공고가 없어요${droppedNote}. 키워드나 지역을 넓혀 보세요`)
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
