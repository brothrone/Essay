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
          <ClipboardPaste size={14} /> 공고 내용 붙여넣기
        </button>
      )}
      {pasteOpen && !running && (
        <div className="posting-paste">
          <p className="muted small">로그인해야 보이는 공고처럼 링크로 못 읽을 때, 채용 페이지 본문을 복사해 붙여넣으면 문항 · 마감일 · 공고 메모를 채워요.</p>
          <AutoTextarea
            minRows={4}
            maxLength={15000}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder={`채용 페이지에서 ${kbd('A')} → ${kbd('C')} 로 복사한 내용을 그대로 붙여넣으세요`}
            aria-label="공고 본문"
          />
          <button type="button" className="btn primary small" disabled={pasted.trim().length < 40} onClick={readPasted}>
            AI로 정리해 채우기
          </button>
        </div>
      )}
      {running && (
        <p className="muted small">
          {task!.status === 'waiting' ? '다른 AI 작업이 끝나면 공고를 읽어요…' : 'AI가 공고를 읽어 문항을 채우는 중…'} {elapsed}초
          {task!.status === 'running' && task!.steps.at(-1) && ` · ${task!.steps.at(-1)}`}{' '}
          <button type="button" className="link-btn" onClick={() => reader.cancel(task!.key)}>
            취소
          </button>
          <br />
          다른 화면으로 가도 계속 읽고, 끝나면 이 자소서에 바로 넣어요.
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
              {info.isOpen === false ? '마감된 공고예요' : info.isOpen ? '지금 접수 중이에요' : '접수 상태는 확인하지 못했어요'}
            </strong>
            <span className="muted small">방금 확인</span>
          </div>
          <ul className="check-list">
            <li>
              {applied?.questions ? (
                <>
                  <Check size={13} /> 자소서 문항 {applied.questions}개를 넣었어요
                </>
              ) : info.questions.length ? (
                '자소서 문항은 이미 모두 들어 있어요'
              ) : (
                '공고에서 자소서 문항을 찾지 못했어요. 왼쪽 [문항 불러오기]에서 직접 골라 넣을 수 있어요'
              )}
              {info.questions.length > 0 && info.questionsSource && info.questionsSource !== '공고 페이지' && (
                <span className="muted"> · 출처: {info.questionsSource} (이번 공고 문항과 같은지 확인하세요)</span>
              )}
            </li>
            <li>
              마감일: {info.deadline ? `${fmtDate(info.deadline)} ${info.deadlineTime}` : '공고에서 확인하지 못했어요'}
              {applied?.deadline && <span className="muted"> · 넣었어요</span>}
              {conflicts?.deadline && <span className="badge tone-amber">저장된 마감일과 달라요</span>}
            </li>
            {info.notes && <li>공고 내용 정리 {applied?.notes ? '· 공고 메모에 넣었어요' : ''}</li>}
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
          {info.isOpen === false && project.status === 'writing' && (
            <p className="muted small">지원하지 않을 거라면 위쪽 상태 메뉴에서 바꿔 두세요.</p>
          )}
        </div>
      )}
    </div>
  )
}
