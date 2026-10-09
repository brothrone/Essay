import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { desktop } from './desktop'
import { isArticleUrl, isGroundingUrl, isPostingUrl } from './format'
import { JobSearchContext, toJob, type DroppedJob, type FoundJob, type JobSearchApi, type JobSearchState } from './jobSearch'
import { jobSearchPrompt, parseAiJson } from './prompts'
import { isLiveJob, jobKey, useStore } from './store'
import { toast } from './toast'
import type { JobPosting, JobQuery } from './types'
import { runWebTask } from './aiRun'
import { savedAiProvider } from './useAiTask'
import { toDateInput } from './utils'
import { track } from './community'

const IDLE: JobSearchState = { running: false, startedAt: 0, steps: [], error: '', lastAdded: null, lastDropped: 0, lastDroppedList: [] }
/** 찾아 둔 맞춤 공고를 다시 확인하는 간격 */
const RECHECK_MS = 3 * 60 * 60 * 1000

export function JobSearchProvider({ children }: { children: ReactNode }) {
  const { data, mergeJobs, setJobQuery, updateJob } = useStore()
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
      track('job_search')
      // 다른 AI 작업(공고 읽기 등)이 돌고 있으면 끝난 뒤 이어서 시작한다
      const r = await runWebTask(jobSearchPrompt(latest.current, query, toDateInput(new Date()), savedAiProvider()), {
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
            if (isGroundingUrl(j.url) && real[i]) j.url = real[i] // 못 바꾸면 중간 주소를 남겨 '직접 확인'에서 열 수 있게
          })
        } catch {
          /* 못 바꾸면 그대로 둔다: 자소서 시작 때 다시 시도하고, 안 되면 회사명으로 찾는다 */
        }
      }
      // 확실한 공고만 남긴다: 공고 한 건을 가리키는 주소가 있고, 공고 페이지를 직접 열어 봤을 때 마감 표시 · 지난 마감일이 없는 것.
      // 뺀 공고는 이유와 함께 남겨 화면에서 볼 수 있게 한다
      const today = toDateInput(new Date())
      const dropped: DroppedJob[] = []
      const drop = (j: JobPosting, reason: string, kind: DroppedJob['kind'] = 'out') =>
        dropped.push({ company: j.company, title: j.title, url: j.url, reason, kind })
      let verified = found.filter((j) => {
        if (isGroundingUrl(j.url)) return drop(j, '공고 주소를 확인하지 못했어요 (링크로 직접 확인해 보세요)', 'check'), false
        if (!isPostingUrl(j.url)) return drop(j, '공고 상세 주소를 찾지 못했어요 (회사 채용 페이지에서 확인해 보세요)', 'check'), false
        if (isArticleUrl(j.url)) return drop(j, '채용 공고가 아니라 기사 · 블로그 글이에요'), false
        if (!j.company || /미확인|확인\s*필요|알\s*수\s*없|비공개|unknown/i.test(j.company)) return drop(j, '회사명을 확인하지 못했어요'), false
        if (j.deadline && j.deadline < today) return drop(j, `마감일(${j.deadline})이 지났어요`), false
        return true
      })
      if (verified.length) {
        setState((st) => ({ ...st, steps: [...st.steps, `공고 ${verified.length}개를 직접 열어 접수 중인지 확인하는 중`].slice(-12) }))
        try {
          const checks = await ai.checkPostings(
            verified.map((j) => j.url),
            today,
          )
          // 남기는 것: 공고 페이지에서 접수 중으로 확인된 것만 (남은 마감일 · D-day · 상시 채용 표시).
          // AI 가 적은 마감일만으로는 남기지 않는다 — 마감된 공고가 섞이지 않게
          const checkedAt = Date.now()
          verified = verified.filter((j, i) => {
            const c = checks[i]
            if (c?.deadline) j.deadline = c.deadline // 페이지의 마감일이 AI 가 적은 것보다 정확하다
            if (!c) return drop(j, '공고 페이지를 열지 못했어요', 'check'), false
            if (c.status === 'closed') return drop(j, c.deadline && c.deadline < today ? `마감일(${c.deadline})이 지났어요` : '공고 페이지에 마감 표시가 있어요'), false
            if (j.deadline && j.deadline < today) return drop(j, `마감일(${j.deadline})이 지났어요`), false
            if (c.status === 'open') return (j.checkedAt = checkedAt), true
            return drop(j, '공고 페이지에서 접수 중인지 확인하지 못했어요', 'check'), false
          })
        } catch {
          // 공고 페이지를 확인하지 못하면 하나도 남기지 않는다
          verified = verified.filter((j) => (drop(j, '공고 페이지를 확인하지 못했어요', 'check'), false))
        }
      }
      // 같은 공고가 여러 번 나오면(한 공고의 여러 직무 등) 점수가 높은 하나만 남긴다
      const seen = new Set<string>()
      verified = verified
        .sort((x, y) => y.matchScore - x.matchScore)
        .filter((j) => {
          const k = jobKey(j)
          if (seen.has(k)) return drop(j, '같은 공고가 겹쳐 하나만 남겼어요'), false
          seen.add(k)
          return true
        })
      verified.slice(query.count).forEach((j) => drop(j, `최대 ${query.count}개를 넘어 점수가 낮은 것을 뺐어요`))
      verified = verified.slice(0, query.count)
      const known = new Set(latest.current.jobs.filter((j) => !j.closed).map(jobKey))
      const added = verified.filter((j) => !known.has(jobKey(j))).length
      mergeJobs(verified, query)
      setState((st) => ({ ...st, running: false, lastAdded: added, lastDropped: dropped.length, lastDroppedList: dropped }))
      const droppedNote = dropped.length ? ` · 마감됐거나 확인할 수 없는 ${dropped.length}개는 뺐어요` : ''
      toast(added ? `확인된 맞춤 공고 ${added}개를 새로 찾았어요${droppedNote}` : `새로 찾은 확실한 공고가 없어요${droppedNote}. 키워드나 지역을 넓혀 보세요`)
    },
    [ai, mergeJobs, setJobQuery],
  )

  // 이미 찾아 둔 맞춤 공고도 몇 시간마다 공고 페이지를 다시 열어, 마감됐거나 접수 중인지 확인되지 않으면 뺀다
  const rechecking = useRef(false)
  const recheck = useCallback(async () => {
    if (rechecking.current || running.current) return
    const today = toDateInput(new Date())
    const now = Date.now()
    // '(예시)' 회사는 화면 구경용 예시 데이터라 확인하지 않는다
    const live = latest.current.jobs.filter((j) => j.status !== 'hidden' && isLiveJob(j, today) && !/\(예시\)/.test(j.company))
    // 예전 버전에서 들어온, 공고 한 건이 아닌 주소(사이트 첫 화면 · 구글 중간 주소 · 기사)는 열어 보지 않고 바로 뺀다
    const notPosting = live.filter((j) => !/^https?:\/\//.test(j.url) || isGroundingUrl(j.url) || !isPostingUrl(j.url) || isArticleUrl(j.url))
    notPosting.forEach((j) => updateJob(j.id, { closed: true, checkedAt: now }))
    const due = live.filter((j) => !notPosting.includes(j) && (!j.checkedAt || now - j.checkedAt > RECHECK_MS))
    if (notPosting.length && !due.length) toast(`맞춤 공고 중 공고 주소가 확인되지 않는 ${notPosting.length}개를 뺐어요`)
    if (!due.length) return
    rechecking.current = true
    try {
      const batch = due.slice(0, 30)
      const checks = await ai.checkPostings(
        batch.map((j) => j.url),
        today,
      )
      // 전부 '확인 못 함'이면 인터넷이 안 되는 것 — 아무것도 바꾸지 않는다
      if (!checks.some((c) => c && c.status !== 'unknown')) return
      let removed = notPosting.length
      batch.forEach((j, i) => {
        const c = checks[i]
        if (!c) return
        const deadline = c.deadline ? { deadline: c.deadline } : {}
        if (c.status === 'open') return updateJob(j.id, { checkedAt: now, ...deadline })
        // 마감 표시가 있거나, 접수 중인지 확인되지 않으면 뺀다
        removed++
        updateJob(j.id, { closed: true, checkedAt: now, ...deadline })
      })
      if (removed) toast(`맞춤 공고 중 마감됐거나 접수 중인지 확인되지 않는 ${removed}개를 뺐어요`)
    } catch {
      /* 다음에 다시 */
    } finally {
      rechecking.current = false
    }
  }, [ai, updateJob])
  useEffect(() => {
    const first = setTimeout(recheck, 3000)
    const every = setInterval(recheck, RECHECK_MS)
    return () => {
      clearTimeout(first)
      clearInterval(every)
    }
  }, [recheck])

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
