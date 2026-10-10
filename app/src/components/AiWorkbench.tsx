import { LoaderCircle, MessagesSquare, PenLine, Sparkles } from 'lucide-react'
import { useState } from 'react'
import type { Project, Question } from '../types'
import { AiPanel } from './AiPanel'
import { CHAT_FOCUS_EVENT, ChatPanel } from './ChatPanel'

export type AiMode = 'helper' | 'chat' | null

/**
 * 문항 바로 아래 AI 카드: [AI로 초안 쓰기] · [AI 도우미] · [AI와 대화하며 고치기].
 * 고른 도구가 이 카드 안에서 펼쳐진다 (오른쪽 패널은 경험 · 다른 답변 · 공고 정보만).
 * 두 도구는 숨겨도 계속 살아 있어서, 대화하는 동안 초안이 써지고 있어도 끊기지 않는다.
 */
export function AiWorkbench({
  project,
  q,
  onPatch,
  mode,
  onMode,
}: {
  project: Project
  q: Question
  onPatch: (p: Partial<Question>, label?: string) => void
  mode: AiMode
  onMode: (m: AiMode) => void
}) {
  const [draftRequest, setDraftRequest] = useState(0)
  const [helperBusy, setHelperBusy] = useState<string | null>(null)
  const hasAnswer = !!q.answer.trim()

  const draft = () => {
    onMode('helper')
    setDraftRequest((n) => n + 1)
  }
  const openChat = () => {
    if (mode === 'chat') return onMode(null)
    onMode('chat')
    window.dispatchEvent(new Event(CHAT_FOCUS_EVENT))
  }

  return (
    <section className={'ai-bench' + (mode ? ' open' : '')} aria-label="AI 도구">
      <div className="ai-bench-bar">
        <button type="button" className="ai-tool main" onClick={draft} disabled={!!helperBusy}>
          <span className="ai-tool-icon">{helperBusy === 'draft' ? <LoaderCircle size={20} className="spin" /> : <PenLine size={20} />}</span>
          <span className="ai-tool-text">
            <strong>{helperBusy === 'draft' ? '초안 쓰는 중…' : hasAnswer ? 'AI로 초안 다시 쓰기' : 'AI로 초안 쓰기'}</strong>
          </span>
        </button>
        <button
          type="button"
          className={'ai-tool' + (mode === 'helper' ? ' on' : '')}
          aria-expanded={mode === 'helper'}
          onClick={() => onMode(mode === 'helper' ? null : 'helper')}
        >
          <span className="ai-tool-icon">{helperBusy && helperBusy !== 'draft' ? <LoaderCircle size={20} className="spin" /> : <Sparkles size={20} />}</span>
          <span className="ai-tool-text">
            <strong>AI 도우미</strong>
            <span>피드백 · 글자수 · 면접</span>
          </span>
        </button>
        <button type="button" className={'ai-tool' + (mode === 'chat' ? ' on' : '')} aria-expanded={mode === 'chat'} onClick={openChat}>
          <span className="ai-tool-icon">
            <MessagesSquare size={20} />
          </span>
          <span className="ai-tool-text">
            <strong>AI와 대화하며 고치기</strong>
          </span>
        </button>
      </div>

      <div className="ai-bench-body" hidden={mode !== 'helper'}>
        <AiPanel project={project} q={q} onPatch={onPatch} request={draftRequest} onRunning={setHelperBusy} onClose={() => onMode(null)} />
      </div>
      <div className="ai-bench-body" hidden={mode !== 'chat'}>
        <ChatPanel project={project} q={q} onPatch={onPatch} onClose={() => onMode(null)} />
      </div>
    </section>
  )
}
