import type { AnswerSnapshot, Question } from './types'

const MAX_SNAPSHOTS = 30
/** 자동 스냅샷 간격: 계속 고치는 동안에는 10분에 한 번만 남긴다 */
const AUTO_GAP_MS = 10 * 60 * 1000

/**
 * 답변이 바뀌기 직전 상태를 편집 기록에 남긴다.
 * label이 있으면(AI 적용 전 · 되돌리기 전 · 직접 저장) 항상, 없으면 10분에 한 번만.
 */
export function recordSnapshot(q: Question, label?: string): AnswerSnapshot[] {
  const prev = q.answer
  if (!prev.trim()) return q.history
  const last = q.history[q.history.length - 1]
  if (last && last.answer === prev) {
    return label && !last.label ? [...q.history.slice(0, -1), { ...last, label }] : q.history
  }
  if (!label && last && Date.now() - last.at < AUTO_GAP_MS) return q.history
  return [...q.history, { at: Date.now(), answer: prev, label }].slice(-MAX_SNAPSHOTS)
}
