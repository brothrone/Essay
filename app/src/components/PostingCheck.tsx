import { LoaderCircle, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { isHttpUrl } from '../format'
import { parsePosting, postingPrompt, type PostingInfo } from '../prompts'
import type { Project } from '../types'
import { useAiTask } from '../useAiTask'
import { fmtDate, toDateInput } from '../utils'

/** 저장해 둔 공고 링크를 다시 읽어 마감 여부 · 마감일 변경 · 공고 내용 · 문항을 확인한다 */
export function PostingCheck({
  project,
  onPatch,
  onAddQuestions,
}: {
  project: Project
  onPatch: (p: Partial<Project>) => void
  onAddQuestions: (qs: { prompt: string; limit: number | null }[]) => void
}) {
  const task = useAiTask()
  const [info, setInfo] = useState<PostingInfo | null>(null)
  const [error, setError] = useState('')

  if (!isHttpUrl(project.jobUrl)) return null

  const check = async () => {
    setError('')
    setInfo(null)
    const r = await task.run(postingPrompt(project.jobUrl.trim(), toDateInput(new Date())), { web: true })
    if (!r.ok) {
      if (!r.cancelled) setError(r.error)
      return
    }
    const parsed = parsePosting(r.text)
    if (!parsed) {
      setError('공고 내용을 읽지 못했어요. 잠시 뒤 다시 시도해 주세요.')
      return
    }
    setInfo(parsed)
  }

  const deadlineChanged = !!info?.deadline && info.deadline !== project.deadline
  const newQuestions =
    info?.questions.filter((q) => !project.questions.some((x) => x.prompt.trim() === q.prompt)) ?? []

  return (
    <div className="posting-check">
      <button type="button" className="btn small" disabled={task.running} onClick={check}>
        {task.running ? <LoaderCircle size={14} className="spin" /> : <RefreshCw size={14} />} 공고 다시 확인
      </button>
      {task.running && (
        <p className="muted small">
          AI가 공고를 읽는 중… {task.elapsed}초 {task.steps.at(-1) && `· ${task.steps.at(-1)}`}{' '}
          <button type="button" className="link-btn" onClick={task.cancel}>
            취소
          </button>
        </p>
      )}
      {error && <p className="ai-error">{error}</p>}
      {info && (
        <div className="ai-result">
          <div className="ai-result-meta">
            <strong className={info.isOpen === false ? 'over' : ''}>
              {info.isOpen === false ? '마감된 공고예요' : info.isOpen ? '지금 접수 중이에요' : '접수 상태는 확인하지 못했어요'}
            </strong>
            <span className="muted small">방금 확인</span>
          </div>
          <ul className="check-list">
            <li>
              마감일: {info.deadline ? `${fmtDate(info.deadline)} ${info.deadlineTime}` : '공고에서 확인하지 못했어요'}
              {deadlineChanged && <span className="badge tone-amber">저장된 마감일과 달라요</span>}
            </li>
            {info.notes && <li>공고 내용을 정리했어요 ({info.notes.length.toLocaleString()}자)</li>}
            {info.questions.length > 0 && (
              <li>
                자소서 문항 {info.questions.length}개
                {info.questionsSource && info.questionsSource !== '공고 페이지' && (
                  <span className="muted"> · 출처: {info.questionsSource}</span>
                )}
              </li>
            )}
          </ul>
          <div className="ai-result-actions">
            {deadlineChanged && (
              <button
                type="button"
                className="btn primary small"
                onClick={() => onPatch({ deadline: info.deadline, deadlineTime: info.deadlineTime || project.deadlineTime })}
              >
                마감일 바꾸기
              </button>
            )}
            {info.notes && (
              <button
                type="button"
                className="btn small"
                onClick={() =>
                  onPatch({
                    notes: project.notes.trim()
                      ? `${project.notes.trimEnd()}\n\n[공고 다시 확인 ${fmtDate(toDateInput(new Date()))}]\n${info.notes}`
                      : info.notes,
                  })
                }
              >
                {project.notes.trim() ? '공고 메모에 덧붙이기' : '공고 메모 채우기'}
              </button>
            )}
            {newQuestions.length > 0 && (
              <button type="button" className="btn small" onClick={() => onAddQuestions(newQuestions)}>
                문항 {newQuestions.length}개 추가
              </button>
            )}
            <button type="button" className="btn ghost small" onClick={() => setInfo(null)}>
              닫기
            </button>
          </div>
          {info.isOpen === false && project.status === 'writing' && (
            <p className="muted small">지원하지 않을 거라면 위쪽 상태 메뉴에서 바꿔 두세요.</p>
          )}
        </div>
      )}
    </div>
  )
}
