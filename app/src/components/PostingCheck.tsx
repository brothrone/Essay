import { Check, ClipboardPaste, LoaderCircle, RefreshCw } from 'lucide-react'
import { kbd } from '../platform'
import { useState } from 'react'
import { postingRequest } from '../aiRun'
import { isHttpUrl } from '../format'
import { isActive, taskFor, useElapsed, usePostingReader } from '../postingReader'
import { postingConflicts } from '../PostingReaderProvider'
import type { Project } from '../types'
import { postingTextPrompt } from '../prompts'
import { fmtDate, toDateInput } from '../utils'
import { AutoTextarea } from './ui'

/**
 * 공고 링크를 AI가 읽어 자소서 문항 · 공고 메모 · 마감일을 채운다.
 * 새 문항과 비어 있던 칸은 바로 넣고, 이미 적어 둔 마감일 · 메모와 다를 때만 사용자가 고른다.
 * 읽는 동안 다른 화면으로 옮겨도 계속된다 (맞춤 공고 · 새 자소서 창에서 시작한 읽기도 여기 보인다).
 */
export function PostingCheck({ project, onPatch }: { project: Project; onPatch: (p: Partial<Project>) => void }) {
  const reader = usePostingReader()
  const task = taskFor(reader.tasks, project.id)
  const running = isActive(task)
  const elapsed = useElapsed(task)
  // 공고 한 건 주소가 있으면 그 페이지를, 없거나 사이트 첫 화면이면 회사명 · 직무로 찾아 읽는다
  const canRead = isHttpUrl(project.jobUrl) || project.company.trim().length >= 2
  // 링크로 못 읽는 공고(로그인 필요 등): 본문을 붙여넣어 정리
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasted, setPasted] = useState('')
  const readPasted = () => {
    if (pasted.trim().length < 40) return
    reader.start(project.id, {
      prompt: postingTextPrompt(pasted, toDateInput(new Date())),
      kind: 'text',
      mode: 'recheck',
      projectId: project.id,
      label: project.company,
    })
    setPasteOpen(false)
    setPasted('')
  }

  const check = async () => {
    const req = await postingRequest(project.jobUrl, project.company.trim(), project.position.trim())
    if (req.url && req.url !== project.jobUrl.trim()) onPatch({ jobUrl: req.url })
    reader.start(project.id, { prompt: req.prompt, kind: req.kind, mode: 'recheck', projectId: project.id, label: project.company })
  }

  const info = task?.status === 'done' ? task.info : null
  const applied = task?.applied
  const conflicts = info && task?.mode === 'recheck' ? postingConflicts(project, info) : null

  return (
    <div className="posting-check">
      {canRead && (
        <button type="button" className="btn small" disabled={running} onClick={check}>
          {running ? <LoaderCircle size={14} className="spin" /> : <RefreshCw size={14} />}{' '}
          {project.questions.some((q) => q.prompt.trim()) ? '공고 다시 확인' : 'AI로 공고 읽고 문항 채우기'}
        </button>
      )}
      {!running && (
        <button type="button" className="btn ghost small" aria-expanded={pasteOpen} onClick={() => setPasteOpen((v) => !v)}>
          <ClipboardPaste size={14} /> 본문 붙여넣기
        </button>
      )}
      {pasteOpen && !running && (
        <div className="posting-paste">
          <p className="muted small">링크로 못 읽을 때 본문을 붙여넣어요</p>
          <AutoTextarea
            minRows={4}
            maxLength={15000}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder={`채용 페이지에서 ${kbd('A')} → ${kbd('C')} 후 붙여넣기`}
            aria-label="공고 본문"
          />
          <button type="button" className="btn primary small" disabled={pasted.trim().length < 40} onClick={readPasted}>
            AI로 채우기
          </button>
        </div>
      )}
      {running && (
        <p className="muted small">
          {task!.status === 'waiting' ? '대기 중…' : 'AI가 공고 읽는 중…'} {elapsed}초
          {task!.status === 'running' && task!.steps.at(-1) && ` · ${task!.steps.at(-1)}`}{' '}
          <button type="button" className="link-btn" onClick={() => reader.cancel(task!.key)}>
            취소
          </button>
        </p>
      )}
      {task?.status === 'error' && (
        <p className="ai-error">
          {task.error}{' '}
          <button type="button" className="link-btn" onClick={() => reader.dismiss(task.key)}>
            닫기
          </button>
        </p>
      )}
      {info && (
        <div className="ai-result">
          <div className="ai-result-meta">
            <strong className={info.isOpen === false ? 'over' : ''}>
              {info.isOpen === false ? '마감된 공고예요' : info.isOpen ? '지금 접수 중이에요' : '접수 상태를 확인하지 못했어요'}
            </strong>
          </div>
          <ul className="check-list">
            <li>
              {applied?.questions ? (
                <>
                  <Check size={13} /> 자소서 문항 {applied.questions}개를 넣었어요
                </>
              ) : info.questions.length ? (
                '문항이 이미 다 들어 있어요'
              ) : (
                '공고에서 문항을 찾지 못했어요'
              )}
              {info.questions.length > 0 && info.questionsSource && info.questionsSource !== '공고 페이지' && (
                <span className="muted"> · 출처: {info.questionsSource} (확인해 주세요)</span>
              )}
            </li>
            <li>
              마감일: {info.deadline ? `${fmtDate(info.deadline)} ${info.deadlineTime}` : '공고에서 확인하지 못했어요'}
              {applied?.deadline && <span className="muted"> · 넣었어요</span>}
              {conflicts?.deadline && <span className="badge tone-amber">저장된 마감일과 달라요</span>}
            </li>
            {info.notes && <li>공고 정리 {applied?.notes ? '· 메모에 넣었어요' : ''}</li>}
          </ul>
          <div className="ai-result-actions">
            {conflicts?.deadline && (
              <button
                type="button"
                className="btn primary small"
                onClick={() => onPatch({ deadline: info.deadline, deadlineTime: info.deadlineTime || project.deadlineTime })}
              >
                마감일 바꾸기
              </button>
            )}
            {conflicts?.notes && !applied?.notes && (
              <button type="button" className="btn small" onClick={() => onPatch({ notes: conflicts.appendNotes() })}>
                공고 메모에 덧붙이기
              </button>
            )}
            <button type="button" className="btn ghost small" onClick={() => reader.dismiss(task!.key)}>
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
