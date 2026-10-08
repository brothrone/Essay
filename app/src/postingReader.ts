import { createContext, useContext, useEffect, useState } from 'react'
import type { PostingInfo } from './prompts'

/**
 * 공고 읽기(링크 → 회사 · 마감일 · 공고 내용 · 자소서 문항)는 화면을 옮겨도 계속되도록 앱 전체에서 들고 있다.
 * 끝나면 연결된 자소서에 문항 · 공고 메모 · 마감일을 바로 넣는다.
 */
export type PostingMode =
  /** 방금 만든 자소서: 비어 있는 칸을 모두 채우고 빈 문항 자리를 불러온 문항으로 바꾼다 */
  | 'new'
  /** 이미 쓰고 있는 자소서: 새 문항만 더하고, 마감일 · 메모가 다르면 사용자가 고르게 남겨 둔다 */
  | 'recheck'

export interface PostingTask {
  key: string
  projectId: string | null
  label: string
  kind: 'link' | 'company'
  mode: PostingMode
  status: 'waiting' | 'running' | 'done' | 'error' | 'cancelled'
  startedAt: number
  steps: string[]
  error: string
  info: PostingInfo | null
  /** 자소서에 실제로 넣은 것 */
  applied: { questions: number; notes: boolean; deadline: boolean } | null
}

export interface PostingReaderApi {
  tasks: Record<string, PostingTask>
  start: (key: string, opts: { prompt: string; kind: 'link' | 'company'; mode: PostingMode; projectId: string | null; label: string }) => void
  /** 새 자소서 창에서 읽던 작업을 방금 만든 자소서에 연결한다 (끝나면 그 자소서에 채움) */
  attach: (key: string, projectId: string) => void
  cancel: (key: string) => void
  dismiss: (key: string) => void
}

export const PostingReaderContext = createContext<PostingReaderApi | null>(null)

export function usePostingReader() {
  const ctx = useContext(PostingReaderContext)
  if (!ctx) throw new Error('PostingReaderProvider가 필요해요')
  return ctx
}

/** 이 자소서에 연결된 공고 읽기 작업 (자소서 id 로 시작했거나, 새 자소서 창에서 시작해 연결된 것) */
export function taskFor(tasks: Record<string, PostingTask>, projectId: string) {
  return tasks[projectId] ?? Object.values(tasks).find((t) => t.projectId === projectId)
}

export const isActive = (t: PostingTask | undefined) => !!t && (t.status === 'running' || t.status === 'waiting')

/** 진행 중인 작업의 경과 초를 0.5초마다 다시 그린다 */
export function useElapsed(t: PostingTask | undefined) {
  const [now, setNow] = useState(() => Date.now())
  const running = isActive(t)
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [running])
  return t ? Math.max(0, Math.floor((now - t.startedAt) / 1000)) : 0
}
