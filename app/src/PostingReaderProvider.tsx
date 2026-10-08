import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { runWebTask } from './aiRun'
import { desktop } from './desktop'
import { PostingReaderContext, type PostingMode, type PostingReaderApi, type PostingTask } from './postingReader'
import { parsePosting, type PostingInfo } from './prompts'
import { newQuestion, useStore } from './store'
import { toast } from './toast'
import type { Project } from './types'
import { fmtDate, toDateInput } from './utils'

const isBlank = (q: Project['questions'][number]) => !q.prompt.trim() && !q.answer.trim()

/** 읽어 온 공고를 자소서에 넣는다. 무엇을 넣었는지도 돌려준다 */
export function applyPosting(p: Project, info: PostingInfo, mode: PostingMode) {
  const have = new Set(p.questions.map((q) => q.prompt.trim()))
  const fresh = info.questions.filter((q) => !have.has(q.prompt))
  const fromElsewhere = fresh.length > 0 && !!info.questionsSource && info.questionsSource !== '공고 페이지'
  const sourceNote = fromElsewhere ? `자소서 문항 출처: ${info.questionsSource} — 이번 공고 문항과 같은지 확인하세요` : ''

  let notes = p.notes
  let notesApplied = false
  if (info.notes) {
    if (!p.notes.trim()) {
      notes = [info.notes, sourceNote].filter(Boolean).join('\n\n')
      notesApplied = true
    } else if (mode === 'new') {
      // 맞춤 공고에서 시작한 자소서: 공고 원문 정리를 앞에, 처음 넣어 둔 요약 · 맞는 이유는 뒤에 둔다
      notes = [info.notes, sourceNote, p.notes.trim()].filter(Boolean).join('\n\n')
      notesApplied = true
    }
  }
  if (!notesApplied && sourceNote) notes = `${p.notes.trimEnd()}\n\n${sourceNote}`

  const fillDeadline = !!info.deadline && (!p.deadline || mode === 'new')
  const next: Project = {
    ...p,
    company: p.company.trim() || info.company,
    position: p.position.trim() || info.position,
    jobUrl: p.jobUrl.trim() || info.url,
    deadline: fillDeadline ? info.deadline : p.deadline,
    deadlineTime: fillDeadline ? info.deadlineTime || p.deadlineTime : p.deadlineTime,
    notes,
    questions: fresh.length ? [...p.questions.filter((q) => !isBlank(q)), ...fresh.map((q) => newQuestion(q))] : p.questions,
  }
  return { next, applied: { questions: fresh.length, notes: notesApplied, deadline: fillDeadline && info.deadline !== p.deadline } }
}

export function PostingReaderProvider({ children }: { children: ReactNode }) {
  const { data, updateProject } = useStore()
  // 작업 목록은 ref 하나에만 두고 화면용 state 는 그 복사본으로만 쓴다 (비동기 콜백이 늘 최신 값을 보게)
  const tasksRef = useRef<Record<string, PostingTask>>({})
  const [tasks, setTasks] = useState<Record<string, PostingTask>>({})
  const projectsRef = useRef(data.projects)
  const runningKey = useRef<string | null>(null)
  const stopped = useRef(new Set<string>())

  useEffect(() => {
    projectsRef.current = data.projects
  }, [data.projects])

  const commit = useCallback((key: string, fn: (t: PostingTask) => Partial<PostingTask>) => {
    const t = tasksRef.current[key]
    if (!t) return null
    const next = { ...t, ...fn(t) }
    tasksRef.current = { ...tasksRef.current, [key]: next }
    setTasks(tasksRef.current)
    return next
  }, [])

  // 어떤 검색어로 찾고 어떤 페이지를 읽는지 진행 단계로 모은다
  useEffect(
    () =>
      desktop.ai.onProgress((p) => {
        const key = runningKey.current
        if (!key || !p.tool) return
        const label = p.tool === 'WebSearch' ? '검색' : p.tool === 'WebFetch' ? '페이지 읽기' : p.tool
        commit(key, (t) => ({ steps: [...t.steps, `${label} · ${p.detail || ''}`].slice(-8) }))
      }),
    [commit],
  )

  /** 결과와 연결할 자소서가 모두 있으면 자소서에 넣는다. 방금 만든 자소서가 아직 목록에 없으면 잠깐 기다린다 */
  const applyIfReady = useCallback(
    (key: string) => {
      const apply = (t: PostingTask, info: PostingInfo, p: Project) => {
        const { applied } = applyPosting(p, info, t.mode)
        commit(key, () => ({ applied }))
        updateProject(p.id, (cur) => applyPosting(cur, info, t.mode).next)
        const name = p.company || info.company || t.label || '자소서'
        const what = applied.questions
          ? `${name} 자소서에 자소서 문항 ${applied.questions}개를 넣었어요`
          : info.questions.length
            ? `${name}: 공고를 다시 읽었어요. 새로 추가할 문항은 없어요`
            : `${name}: 공고는 정리했지만 지정된 자소서 문항은 찾지 못했어요. 왼쪽 [자주 나오는 문항으로 추가]에서 골라 넣을 수 있어요`
        toast(info.isOpen === false ? `${what}. 다만 마감된 공고로 보여요 — 마감일을 확인해 주세요` : what)
      }
      const attempt = (tries: number) => {
        const t = tasksRef.current[key]
        if (!t || t.status !== 'done' || !t.info || !t.projectId || t.applied) return
        const p = projectsRef.current.find((x) => x.id === t.projectId)
        if (p) apply(t, t.info, p)
        else if (tries < 20) setTimeout(() => attempt(tries + 1), 150)
      }
      attempt(0)
    },
    [commit, updateProject],
  )

  const start = useCallback<PostingReaderApi['start']>(
    async (key, { prompt, kind, mode, projectId, label }) => {
      const cur = tasksRef.current[key]
      if (cur && (cur.status === 'running' || cur.status === 'waiting')) return
      stopped.current.delete(key)
      tasksRef.current = {
        ...tasksRef.current,
        [key]: { key, projectId, label, kind, mode, status: 'running', startedAt: Date.now(), steps: [], error: '', info: null, applied: null },
      }
      setTasks(tasksRef.current)

      const r = await runWebTask(prompt, {
        stopped: () => stopped.current.has(key),
        onState: (s) => {
          if (s === 'running') runningKey.current = key
          else if (runningKey.current === key) runningKey.current = null
          commit(key, () => ({ status: s, steps: s === 'waiting' ? ['다른 AI 작업이 끝나길 기다리는 중'] : [] }))
        },
      })
      if (runningKey.current === key) runningKey.current = null
      if (!tasksRef.current[key]) return // 그사이 닫음

      if (!r.ok) {
        const t = commit(key, () => ({ status: r.cancelled ? 'cancelled' : 'error', error: r.cancelled ? '' : r.error }))
        if (!r.cancelled && t?.projectId) toast(`공고를 읽지 못했어요: ${r.error.slice(0, 80)}`)
        return
      }
      const info = parsePosting(r.text)
      if (!info) {
        const t = commit(key, () => ({ status: 'error', error: '공고 내용을 읽지 못했어요. 잠시 뒤 다시 시도하거나 직접 적어 주세요.' }))
        if (t?.projectId) toast('공고 내용을 읽지 못했어요. [공고 정보]에서 다시 확인할 수 있어요')
        return
      }
      commit(key, () => ({ status: 'done', info }))
      applyIfReady(key)
    },
    [commit, applyIfReady],
  )

  const attach = useCallback<PostingReaderApi['attach']>(
    (key, projectId) => {
      if (!commit(key, () => ({ projectId, mode: 'new' }))) return
      applyIfReady(key) // 이미 다 읽었다면 바로, 아니면 끝날 때 채운다
    },
    [commit, applyIfReady],
  )

  const cancel = useCallback((key: string) => {
    const t = tasksRef.current[key]
    if (!t) return
    stopped.current.add(key)
    if (t.status === 'running' && runningKey.current === key) desktop.ai.cancel()
  }, [])

  const dismiss = useCallback((key: string) => {
    if (!tasksRef.current[key]) return
    const rest = { ...tasksRef.current }
    delete rest[key]
    tasksRef.current = rest
    setTasks(rest)
  }, [])

  const api = useMemo<PostingReaderApi>(() => ({ tasks, start, attach, cancel, dismiss }), [tasks, start, attach, cancel, dismiss])
  return <PostingReaderContext.Provider value={api}>{children}</PostingReaderContext.Provider>
}

/** 공고 다시 확인 결과에서 사용자가 고를 것: 저장된 마감일과 다를 때 · 메모가 이미 있을 때 */
export function postingConflicts(p: Project, info: PostingInfo) {
  return {
    deadline: !!info.deadline && !!p.deadline && info.deadline !== p.deadline,
    notes: !!info.notes && !!p.notes.trim() && !p.notes.includes(info.notes.slice(0, 40)),
    appendNotes: () => `${p.notes.trimEnd()}\n\n[공고 다시 확인 ${fmtDate(toDateInput(new Date()))}]\n${info.notes}`,
  }
}
