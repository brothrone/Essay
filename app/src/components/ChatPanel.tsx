import { ArrowUp, Check, ChevronDown, ChevronUp, Copy, LoaderCircle, MessagesSquare, RotateCcw, Square, Trash2, Undo2 } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { track } from '../community'
import { desktop, type AiProvider, type AiStatus } from '../desktop'
import { chatPrompt, parseChatReply } from '../prompts'
import { useStore } from '../store'
import { toast } from '../toast'
import type { ChatMessage, Experience, Project, Question } from '../types'
import { noteAiResult } from '../useAiStatus'
import { AI_PREFS_EVENT, AI_PROVIDERS, savedAiModel, savedAiProvider } from '../useAiTask'
import { copyText, countChars, fmtTokens } from '../utils'

/** 답변 아래 [AI와 대화하며 고치기] 를 누르면 대화 입력칸으로 커서를 옮긴다 */
export const CHAT_FOCUS_EVENT = 'essay:chat-focus'
const KEEP = 60

/**
 * AI 와 대화하며 이 문항의 답변을 고친다. 대화는 문항마다 저장되고,
 * AI 가 고친 답변을 내놓으면 [답변에 적용] 으로 바꾼다 (편집 기록에 이전 답변이 남는다).
 */
export function ChatPanel({
  project,
  q,
  onPatch,
}: {
  project: Project
  q: Question
  onPatch: (p: Partial<Question>, label?: string) => void
}) {
  const { data } = useStore()
  const exps = q.experienceIds.map((id) => data.experiences.find((e) => e.id === id)).filter((e): e is Experience => !!e)
  const chat = q.chat ?? []
  // 답을 기다리는 동안 [적용] 같은 변경이 생겨도 덮어쓰지 않게 최신 대화를 들고 있는다
  const chatRef = useRef(chat)
  chatRef.current = chat

  const [provider, setProvider] = useState<AiProvider>(savedAiProvider)
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [text, setText] = useState('')
  const [running, setRunning] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [live, setLive] = useState('')
  const [error, setError] = useState('')
  const [undo, setUndo] = useState<{ answer: string; at: number } | null>(null)
  const runningRef = useRef(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const ai = desktop.ai

  useEffect(() => {
    const f = () => setProvider(savedAiProvider())
    window.addEventListener(AI_PREFS_EVENT, f)
    return () => window.removeEventListener(AI_PREFS_EVENT, f)
  }, [])
  useEffect(() => {
    let alive = true
    ai.status().then((s) => alive && setStatus(s))
    return () => {
      alive = false
    }
  }, [ai])
  useEffect(() => ai.onProgress((p) => runningRef.current && setLive(p.text)), [ai])
  useEffect(() => {
    const f = () => setTimeout(() => inputRef.current?.focus(), 50)
    window.addEventListener(CHAT_FOCUS_EVENT, f)
    return () => window.removeEventListener(CHAT_FOCUS_EVENT, f)
  }, [])
  useEffect(() => {
    if (!running) return
    const t0 = Date.now()
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 500)
    return () => clearInterval(id)
  }, [running])
  // 다른 문항으로 옮기거나 화면을 떠나면 기다리던 답은 멈춘다 (보낸 말은 남아 있어 [다시 보내기] 할 수 있다)
  useEffect(
    () => () => {
      if (runningRef.current) ai.cancel()
    },
    [ai],
  )
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [chat.length, running, error])

  const available = status ? status[provider].available : null
  const providerName = AI_PROVIDERS.find((x) => x.value === provider)?.short ?? provider
  const unit = q.countMode === 'byte' ? 'byte' : '자'
  const last = chat[chat.length - 1]
  const unanswered = !running && last?.role === 'user'

  const ask = async (history: ChatMessage[], message: string) => {
    runningRef.current = true
    setRunning(true)
    setElapsed(0)
    setError('')
    setLive('')
    track('ai_chat')
    const p = savedAiProvider()
    const model = savedAiModel(p)
    const r = await ai.run(chatPrompt(data, project, q, exps, history, message), model || undefined, { provider: p })
    noteAiResult(p, r)
    runningRef.current = false
    setRunning(false)
    setLive('')
    if (!r.ok) {
      setError(r.cancelled ? '멈췄어요. 아래에서 다시 보낼 수 있어요.' : r.error)
      return
    }
    const parsed = parseChatReply(r.text)
    const reply: ChatMessage = {
      role: 'ai',
      text: parsed.reply,
      at: Date.now(),
      ...(parsed.answer ? { answer: parsed.answer } : {}),
      model: r.model,
      seconds: r.seconds,
      ...(r.usage ? { tokens: r.usage.input + r.usage.output } : {}),
    }
    onPatch({ chat: [...chatRef.current, reply].slice(-KEEP) })
  }

  const send = (raw: string) => {
    const message = raw.trim()
    if (!message || runningRef.current || available === false) return
    const history = chatRef.current
    onPatch({ chat: [...history, { role: 'user' as const, text: message, at: Date.now() }].slice(-KEEP) })
    setText('')
    void ask(history, message)
  }

  const resend = () => {
    if (!last || last.role !== 'user') return
    void ask(chat.slice(0, -1), last.text)
  }

  const apply = (i: number) => {
    const m = chat[i]
    if (!m?.answer) return
    setUndo({ answer: q.answer, at: m.at })
    onPatch({ answer: m.answer, chat: chat.map((c, j) => (j === i ? { ...c, applied: true } : c)) }, 'AI 대화 적용 전')
    toast('답변에 적용했어요. 이전 답변은 편집 기록에 남아요')
  }
  const revert = () => {
    if (!undo) return
    onPatch({ answer: undo.answer, chat: chat.map((c) => (c.at === undo.at ? { ...c, applied: false } : c)) }, '되돌리기 전')
    setUndo(null)
    toast('적용 전 답변으로 되돌렸어요')
  }
  const clear = async () => {
    if (!(await desktop.confirm('이 문항의 AI 대화를 지울까요?', { detail: '답변은 그대로 두고 대화만 지워요.', ok: '지우기' }))) return
    setUndo(null)
    setError('')
    onPatch({ chat: [] })
  }

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // 한글 입력 중(조합 중) Enter 는 글자 확정이라 보내지 않는다
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      send(text)
    }
  }

  const ideas = q.answer.trim()
    ? [
        '첫 문장을 더 강하게 바꿔 줘',
        '내 행동이 더 구체적으로 드러나게 고쳐 줘',
        q.limit ? `${q.limit.toLocaleString()}${unit}에 맞춰 줘` : '더 짧고 간결하게 줄여 줘',
        'AI가 쓴 티 나는 표현을 고쳐 줘',
        '면접관이 물어볼 만한 질문은 뭐야?',
      ]
    : ['연결한 경험으로 초안을 써 줘', '이 문항이 무엇을 묻는 건지 알려 줘', '어떤 경험을 쓰면 좋을까?']

  // 생성 중인 글: 태그를 걷어 내고 보여 준다
  const liveReply = live
    .replace(/<answer>[\s\S]*$/, '')
    .replace(/<\/?reply>/g, '')
    .trim()
  const writingAnswer = /<answer>/.test(live)

  return (
    <div className="chat-panel">
      <header className="chat-head">
        <strong>
          <MessagesSquare size={17} /> AI와 대화하며 고치기
        </strong>
        <span className="badge tone-blue">{providerName}</span>
        {chat.length > 0 && (
          <button type="button" className="icon-btn" onClick={clear} disabled={running} aria-label="대화 지우기" title="대화 지우기">
            <Trash2 size={15} />
          </button>
        )}
      </header>

      <div className="chat-log">
        {chat.length === 0 && !running && (
          <div className="chat-empty">
            <span className="chat-empty-icon">
              <MessagesSquare size={22} />
            </span>
            <strong>바꾸고 싶은 점을 말로 적어 보세요</strong>
            <p>
              문항 · 공고 메모 · 연결한 경험 · 지금 답변을 AI가 함께 보고 답해요. 고친 답변은 [답변에 적용]을 눌러야 바뀌어요.
            </p>
          </div>
        )}

        {chat.map((m, i) =>
          m.role === 'user' ? (
            <div key={`${m.at}-${i}`} className="chat-msg me">
              {m.text}
            </div>
          ) : (
            <div key={`${m.at}-${i}`} className="chat-msg ai">
              {m.text && <div className="chat-text">{m.text}</div>}
              {m.answer && (
                <Proposal
                  m={m}
                  q={q}
                  unit={unit}
                  canUndo={!!undo && undo.at === m.at}
                  onApply={() => apply(i)}
                  onUndo={revert}
                />
              )}
              <span className="chat-meta">
                {m.seconds ? `${m.seconds}초` : ''}
                {m.model ? ` · ${m.model}` : ''}
                {m.tokens ? ` · ${fmtTokens(m.tokens)} 토큰` : ''}
              </span>
            </div>
          ),
        )}

        {running && (
          <div className="chat-msg ai pending">
            <div className="chat-text">
              {liveReply || (writingAnswer ? '' : <span className="muted">생각하는 중…</span>)}
              {writingAnswer && <span className="muted">{liveReply ? '\n' : ''}고친 답변을 쓰는 중…</span>}
            </div>
            <span className="chat-meta">
              <LoaderCircle size={12} className="spin" /> {elapsed}초 · 보통 30초~1분 걸려요
            </span>
          </div>
        )}

        {error && !running && (
          <p className="ai-error">
            {error}{' '}
            {unanswered && (
              <button type="button" className="link-btn" onClick={resend}>
                다시 보내기
              </button>
            )}
          </p>
        )}
        {unanswered && !error && (
          <p className="muted small">
            이 말에 대한 답을 받지 못했어요.{' '}
            <button type="button" className="link-btn" onClick={resend}>
              다시 보내기
            </button>
          </p>
        )}
        <div ref={endRef} />
      </div>

      <div className="chat-compose">
        {available === false ? (
          <p className="ai-hint">이 컴퓨터에서 {providerName} AI를 찾지 못했어요. 설정 → AI 설정에서 연결하면 대화할 수 있어요.</p>
        ) : (
          <>
            {!running && (
              <div className="chat-ideas">
                {ideas.map((s) => (
                  <button type="button" key={s} onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}
            <div className="chat-input">
              <textarea
                ref={inputRef}
                rows={2}
                value={text}
                maxLength={4000}
                placeholder="예: 두 번째 문단을 수치가 드러나게 고쳐 줘 (Enter 보내기, Shift+Enter 줄바꿈)"
                aria-label="AI에게 보낼 말"
                onChange={(e) => setText(e.target.value)}
                onKeyDown={onKey}
              />
              {running ? (
                <button type="button" className="btn chat-send stop" onClick={() => ai.cancel()} aria-label="멈추기" title="멈추기">
                  <Square size={14} />
                </button>
              ) : (
                <button
                  type="button"
                  className="btn primary chat-send"
                  disabled={!text.trim() || available === null}
                  onClick={() => send(text)}
                  aria-label="보내기"
                  title="보내기"
                >
                  <ArrowUp size={18} />
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/** AI 가 내놓은 고친 답변: 글자수 · 적용 · 되돌리기 · 복사 */
function Proposal({
  m,
  q,
  unit,
  canUndo,
  onApply,
  onUndo,
}: {
  m: ChatMessage
  q: Question
  unit: string
  canUndo: boolean
  onApply: () => void
  onUndo: () => void
}) {
  const [open, setOpen] = useState(false)
  const answer = m.answer ?? ''
  const count = countChars(answer, q.countMode)
  const over = q.limit !== null && count > q.limit
  const long = answer.length > 360
  const same = answer === q.answer
  return (
    <div className={'chat-proposal' + (open || !long ? ' open' : '')}>
      <div className="chat-proposal-head">
        <span>고친 답변</span>
        <strong className={over ? 'over' : ''}>
          {count.toLocaleString()}
          {q.limit ? ` / ${q.limit.toLocaleString()}` : ''}
          {unit}
        </strong>
      </div>
      <div className="chat-proposal-text">{answer}</div>
      {long && (
        <button type="button" className="link-btn chat-more" onClick={() => setOpen((v) => !v)}>
          {open ? (
            <>
              <ChevronUp size={13} /> 접기
            </>
          ) : (
            <>
              <ChevronDown size={13} /> 전체 보기
            </>
          )}
        </button>
      )}
      <div className="chat-proposal-actions">
        {m.applied && same ? (
          <span className="chat-applied">
            <Check size={14} /> 적용함
          </span>
        ) : m.applied ? (
          <button type="button" className="btn small" onClick={onApply} title="이 답변으로 다시 바꾸기">
            <RotateCcw size={14} /> 다시 적용
          </button>
        ) : (
          <button type="button" className="btn primary small" onClick={onApply}>
            <Check size={14} /> 답변에 적용
          </button>
        )}
        {canUndo && (
          <button type="button" className="btn small" onClick={onUndo}>
            <Undo2 size={14} /> 되돌리기
          </button>
        )}
        <button type="button" className="btn ghost small" onClick={() => copyText(answer)}>
          <Copy size={14} /> 복사
        </button>
      </div>
    </div>
  )
}
