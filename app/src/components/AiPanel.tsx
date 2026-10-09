import {
  Check,
  Copy,
  ExternalLink,
  ListChecks,
  LoaderCircle,
  MessageSquareText,
  MessagesSquare,
  PenLine,
  Scissors,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { desktop, type AiProvider, type AiStatus } from '../desktop'
import { draftPrompt, feedbackPrompt, fitPrompt, interviewPrompt, parseAiAnswer, revisePrompt, specGapPrompt } from '../prompts'
import { useStore } from '../store'
import { toast } from '../toast'
import type { Experience, Project, Question } from '../types'
import { noteAiResult } from '../useAiStatus'
import { AI_MODELS, AI_PROVIDERS, saveAiModel, saveAiProvider, savedAiModel, savedAiProvider } from '../useAiTask'
import { copyText, countChars, fmtTokens } from '../utils'
import { track } from '../community'
import { fitToLimit, lengthMiss } from '../fitLength'

type Kind = 'draft' | 'feedback' | 'fit' | 'revise' | 'interview' | 'gap'
type Result = { kind: Kind; answer: string; note: string; seconds: number; model: string; tokens: number }

const RUNNING_LABEL: Record<Kind, string> = {
  draft: '초안을 쓰는',
  feedback: '피드백을 정리하는',
  fit: '글자수를 맞추는',
  revise: '피드백을 반영해 고쳐 쓰는',
  interview: '면접 꼬리질문을 뽑는',
  gap: '공고 요건과 내 스펙을 견주는',
}

/**
 * AI 도우미 (편집 화면 가운데, 문항 바로 아래 AI 카드 안).
 * request 가 바뀌면 [AI로 초안 쓰기] 를 누른 것으로 보고 초안을 바로 쓴다.
 */
export function AiPanel({
  project,
  q,
  onPatch,
  request = 0,
  onRunning,
  onClose,
}: {
  project: Project
  q: Question
  onPatch: (p: Partial<Question>, label?: string) => void
  request?: number
  onRunning?: (kind: string | null) => void
  onClose?: () => void
}) {
  const { data } = useStore()
  const exps = q.experienceIds
    .map((id) => data.experiences.find((e) => e.id === id))
    .filter((e): e is Experience => !!e)
  const hasAnswer = !!q.answer.trim()
  const ai = desktop.ai

  const [status, setStatus] = useState<AiStatus | null>(null)
  const [provider, setProvider] = useState<AiProvider>(savedAiProvider)
  const [model, setModel] = useState(() => savedAiModel(savedAiProvider()))
  const available = status ? status[provider].available : null
  const providerInfo = AI_PROVIDERS.find((x) => x.value === provider)!
  const [running, setRunning] = useState<Kind | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const [undo, setUndo] = useState<string | null>(null)
  const [live, setLive] = useState<{ text: string; retry?: boolean } | null>(null)
  const [fixing, setFixing] = useState(false)
  const runningRef = useRef(false)

  // 생성 중인 글을 실시간으로 받는다
  useEffect(() => ai.onProgress((p) => runningRef.current && setLive(p)), [ai])

  useEffect(() => {
    let alive = true
    ai.status().then((s) => alive && setStatus(s))
    return () => {
      alive = false
    }
  }, [ai])

  useEffect(() => {
    if (!running) return
    const t0 = Date.now()
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 500)
    return () => clearInterval(id)
  }, [running])

  // 다른 문항으로 옮기면 진행 중인 작성은 멈춘다
  useEffect(
    () => () => {
      if (runningRef.current) ai.cancel()
    },
    [ai],
  )

  const run = async (kind: Kind, prompt: string) => {
    if (runningRef.current) return
    runningRef.current = true
    onRunning?.(kind)
    setRunning(kind)
    setElapsed(0)
    setError('')
    setResult(null)
    setLive(null)
    track(`ai_${kind}`)
    const r = await ai.run(prompt, model || undefined, { provider })
    noteAiResult(provider, r)
    let next: Result | null = null
    if (r.ok) {
      const parsed = kind === 'feedback' || kind === 'interview' || kind === 'gap' ? { answer: r.text.trim(), note: '' } : parseAiAnswer(r.text)
      let answer = parsed.answer
      let seconds = r.seconds
      let tokens = r.usage ? r.usage.input + r.usage.output : 0
      // 쓴 답변은 앱이 직접 세어, 글자수 범위를 벗어나면 맞출 때까지 최대 2번 더 고친다
      if ((kind === 'draft' || kind === 'revise' || kind === 'fit') && lengthMiss(answer, q) > 0) {
        setFixing(true)
        setLive(null)
        const fixed = await fitToLimit(answer, q, { provider, model })
        answer = fixed.text
        seconds += fixed.extraSeconds
        tokens += fixed.extraTokens
        setFixing(false)
      }
      next = { kind, ...parsed, answer, seconds, model: r.model, tokens }
    }
    runningRef.current = false
    onRunning?.(null)
    setRunning(null)
    setLive(null)
    if (!r.ok) {
      if (!r.cancelled) setError(r.error)
      return
    }
    setResult(next)
  }

  // 문항 바로 아래 [AI로 초안 쓰기] 를 누르면 초안을 바로 쓴다
  const lastRequest = useRef(request)
  useEffect(() => {
    if (!request || request === lastRequest.current) return
    lastRequest.current = request
    if (available === false) return
    void run('draft', draftPrompt(data, project, q, exps, true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request])

  const apply = () => {
    if (!result) return
    setUndo(q.answer)
    onPatch({ answer: result.answer }, 'AI 적용 전')
    setResult(null)
    toast('답변에 적용했어요')
  }

  const unit = q.countMode === 'byte' ? 'byte' : '자'
  const copyActions = [
    {
      key: 'draft',
      icon: <PenLine size={18} />,
      title: '초안 쓰기',
      desc: '문항 · 공고 메모 · 연결한 경험 · 스펙으로 초안을 요청해요',
      disabled: false,
      make: () => draftPrompt(data, project, q, exps),
    },
    {
      key: 'feedback',
      icon: <MessageSquareText size={18} />,
      title: '피드백 받기',
      desc: '인사 담당자 관점으로 지금 답변의 고칠 점을 물어봐요',
      disabled: !hasAnswer,
      make: () => feedbackPrompt(data, project, q, exps),
    },
    {
      key: 'fit',
      icon: <Scissors size={18} />,
      title: '글자수 맞추기',
      desc: q.limit ? `내용은 두고 ${q.limit.toLocaleString()}${unit} 안으로 다듬어요` : '내용은 두고 문장을 다듬어요',
      disabled: !hasAnswer,
      make: () => fitPrompt(q),
    },
    {
      key: 'interview',
      icon: <MessagesSquare size={18} />,
      title: '면접 꼬리질문',
      desc: '이 답변에서 면접관이 파고들 질문 5개와 답변 방향을 물어봐요',
      disabled: !hasAnswer,
      make: () => interviewPrompt(data, project, q, exps),
    },
    {
      key: 'gap',
      icon: <ListChecks size={18} />,
      title: '스펙 비교',
      desc: '공고 요건과 내 스펙 · 경험을 견줘 부족한 점과 강조할 강점을 물어봐요',
      disabled: false,
      make: () => specGapPrompt(data, project),
    },
  ]

  return (
    <div className="ai-helper">
      <section className="ai-direct">
          <header className="ai-bench-head">
            <strong>
              <Sparkles size={16} /> AI 도우미
            </strong>
            {onClose && (
              <button type="button" className="icon-btn" onClick={onClose} aria-label="AI 도우미 닫기" title="닫기">
                <X size={16} />
              </button>
            )}
          </header>

          <div className="ai-selects">
            <select
              value={provider}
              aria-label="AI 종류"
              disabled={!!running}
              onChange={(e) => {
                const p = e.target.value as AiProvider
                setProvider(p)
                saveAiProvider(p)
                setModel(savedAiModel(p))
              }}
            >
              {AI_PROVIDERS.map((x) => (
                <option key={x.value} value={x.value}>
                  {x.label}
                  {status && !status[x.value].available ? ' — 설치 안 됨' : ''}
                </option>
              ))}
            </select>
            <select
              value={model}
              aria-label="AI 모델"
              disabled={!!running}
              onChange={(e) => {
                setModel(e.target.value)
                saveAiModel(provider, e.target.value)
              }}
            >
              {AI_MODELS[provider].map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          {available === false ? (
            <p className="ai-hint">
              이 컴퓨터에서 {providerInfo.cli} 명령어를 찾지 못했어요. 설정 → AI 설정에서 설치 방법을 확인하거나, 아래
              &lsquo;요청문 복사&rsquo;로 AI 채팅에 붙여넣어 쓰세요.
            </p>
          ) : (
            <>
              {exps.length === 0 && !hasAnswer && (
                <p className="ai-hint">오른쪽 [경험] 탭에서 이 문항에 쓸 경험을 연결하면 내 경험으로 초안을 써요.</p>
              )}

              <div className="ai-direct-buttons">
                <button
                  type="button"
                  className="btn small"
                  disabled={!!running || available === null}
                  onClick={() => run('draft', draftPrompt(data, project, q, exps, true))}
                >
                  <PenLine size={14} /> {hasAnswer ? '초안 다시 쓰기' : '초안 쓰기'}
                </button>
                <button
                  type="button"
                  className="btn small"
                  disabled={!!running || !hasAnswer}
                  onClick={() => run('feedback', feedbackPrompt(data, project, q, exps))}
                >
                  <MessageSquareText size={14} /> 피드백
                </button>
                <button
                  type="button"
                  className="btn small"
                  disabled={!!running || !hasAnswer}
                  onClick={() => run('fit', fitPrompt(q, q.answer, true))}
                >
                  <Scissors size={14} /> 글자수 맞추기
                </button>
                <button
                  type="button"
                  className="btn small"
                  disabled={!!running || !hasAnswer}
                  title="이 답변으로 면접에서 나올 꼬리질문 5개와 답변 방향"
                  onClick={() => run('interview', interviewPrompt(data, project, q, exps))}
                >
                  <MessagesSquare size={14} /> 면접 질문
                </button>
                <button
                  type="button"
                  className="btn small"
                  disabled={!!running}
                  title="공고의 자격 요건 · 우대 사항과 내 스펙 · 경험을 견줘 부족한 점과 강조할 강점을 짚어요"
                  onClick={() => run('gap', specGapPrompt(data, project))}
                >
                  <ListChecks size={14} /> 스펙 비교
                </button>
              </div>
              {running && (
                <div className="ai-running">
                  <LoaderCircle size={16} className="spin" />
                  <span>
                    {fixing ? '글자수를 맞추는' : RUNNING_LABEL[running]} 중… {elapsed}초
                  </span>
                  <button type="button" className="btn ghost small" onClick={() => ai.cancel()}>
                    취소
                  </button>
                </div>
              )}
              {running && live?.retry && !live.text && (
                <p className="muted small">AI 서버가 바빠서 다시 시도하고 있어요…</p>
              )}
              {running && live?.text && (
                <div className="ai-live">{live.text.replace(/<\/?(answer|note)>/g, '').trim()}</div>
              )}

              {error && <p className="ai-error">{error}</p>}

              {result && result.kind === 'gap' && (
                <div className="ai-result">
                  <div className="ai-result-meta">
                    <strong>스펙 비교</strong>
                    <span className="muted small">{result.seconds}초</span>
                  </div>
                  <div className="ai-result-text">{result.answer}</div>
                  <div className="ai-result-actions">
                    <button
                      type="button"
                      className="btn small"
                      onClick={() => {
                        onPatch({ memo: q.memo.trim() ? `${q.memo.trimEnd()}\n\n[스펙 비교]\n${result.answer}` : `[스펙 비교]\n${result.answer}` })
                        toast('이 문항의 작성 메모에 저장했어요')
                      }}
                    >
                      <Check size={14} /> 작성 메모에 저장
                    </button>
                    <button type="button" className="btn ghost small" onClick={() => copyText(result.answer)}>
                      <Copy size={14} /> 복사
                    </button>
                    <button type="button" className="btn ghost small" onClick={() => setResult(null)}>
                      <X size={14} /> 닫기
                    </button>
                  </div>
                </div>
              )}
              {result && result.kind === 'interview' && (
                <div className="ai-result">
                  <div className="ai-result-meta">
                    <strong>면접 꼬리질문</strong>
                    <span className="muted small">{result.seconds}초</span>
                  </div>
                  <div className="ai-result-text">{result.answer}</div>
                  <div className="ai-result-actions">
                    <button
                      type="button"
                      className="btn small"
                      onClick={() => onPatch({ memo: q.memo.trim() ? `${q.memo.trimEnd()}\n\n[면접 꼬리질문]\n${result.answer}` : `[면접 꼬리질문]\n${result.answer}` })}
                    >
                      <Check size={14} /> 작성 메모에 저장
                    </button>
                    <button type="button" className="btn ghost small" onClick={() => copyText(result.answer)}>
                      <Copy size={14} /> 복사
                    </button>
                    <button type="button" className="btn ghost small" onClick={() => setResult(null)}>
                      <X size={14} /> 닫기
                    </button>
                  </div>
                </div>
              )}

              {result && result.kind === 'feedback' && (
                <div className="ai-result">
                  <div className="ai-result-meta">
                    <strong>피드백</strong>
                    <span className="muted small">{result.seconds}초</span>
                  </div>
                  <div className="ai-result-text">{result.answer}</div>
                  <div className="ai-result-actions">
                    <button
                      type="button"
                      className="btn primary small"
                      onClick={() => run('revise', revisePrompt(data, project, q, exps, result.answer))}
                    >
                      <Wand2 size={14} /> 이 피드백으로 고쳐 쓰기
                    </button>
                    <button type="button" className="btn ghost small" onClick={() => copyText(result.answer)}>
                      <Copy size={14} /> 복사
                    </button>
                    <button type="button" className="btn ghost small" onClick={() => setResult(null)}>
                      <X size={14} /> 닫기
                    </button>
                  </div>
                </div>
              )}

              {result && result.kind !== 'feedback' && (
                <AnswerResult
                  result={result}
                  q={q}
                  unit={unit}
                  onApply={apply}
                  onFit={() => run('fit', fitPrompt(q, result.answer, true))}
                  onClose={() => setResult(null)}
                />
              )}

              {undo !== null && !result && !running && (
                <div className="ai-undo">
                  <Check size={14} /> 답변에 적용했어요
                  <button
                    type="button"
                    className="btn ghost small"
                    onClick={() => {
                      onPatch({ answer: undo }, '되돌리기 전')
                      setUndo(null)
                      toast('적용 전 답변으로 되돌렸어요')
                    }}
                  >
                    되돌리기
                  </button>
                </div>
              )}
            </>
          )}
      </section>

      <details className="ai-copy">
        <summary>다른 AI 채팅에 붙여넣어 쓰기 (요청문 복사)</summary>
        <ol className="ai-steps">
          <li>아래 버튼으로 요청문을 복사해요</li>
          <li>쓰고 있는 AI 채팅(Claude · Gemini · ChatGPT)에 붙여넣어요</li>
          <li>나온 글을 답변 칸에 붙여넣고 내 말투로 다듬어요</li>
        </ol>
        <div className="ai-actions">
          {copyActions.map((a) => (
            <button
              type="button"
              key={a.key}
              className="ai-action"
              disabled={a.disabled}
              onClick={() => copyText(a.make(), `${a.title} 요청문을 복사했어요. AI 채팅에 붙여넣으세요`)}
            >
              <span className="ai-action-icon">{a.icon}</span>
              <span className="ai-action-text">
                <strong>{a.title}</strong>
                <span>{a.disabled ? '답변을 먼저 써야 쓸 수 있어요' : a.desc}</span>
              </span>
              <Copy size={16} />
            </button>
          ))}
        </div>
        <div className="ai-links">
          <a className="btn small ghost" href="https://claude.ai/new" target="_blank" rel="noreferrer">
            <ExternalLink size={14} /> Claude 열기
          </a>
          <a className="btn small ghost" href="https://gemini.google.com/" target="_blank" rel="noreferrer">
            <ExternalLink size={14} /> Gemini 열기
          </a>
        </div>
        <p className="muted small">
          연결한 경험 {exps.length}개와 공고 메모가 들어가요. 이름 · 연락처 · 주소 같은 개인정보는 넣지 않아요.
        </p>
      </details>
    </div>
  )
}

function AnswerResult({
  result,
  q,
  unit,
  onApply,
  onFit,
  onClose,
}: {
  result: Result
  q: Question
  unit: string
  onApply: () => void
  onFit: () => void
  onClose: () => void
}) {
  const count = countChars(result.answer, q.countMode)
  const over = q.limit !== null && count > q.limit
  return (
    <div className="ai-result">
      <div className="ai-result-meta">
        <strong className={over ? 'over' : ''}>
          {count.toLocaleString()}
          {q.limit ? ` / ${q.limit.toLocaleString()}` : ''}
          {unit}
          {over && q.limit ? ` · ${(count - q.limit).toLocaleString()} 초과` : ''}
        </strong>
        <span className="muted small">
          {result.seconds}초{result.model ? ` · ${result.model}` : ''}
          {result.tokens ? ` · ${fmtTokens(result.tokens)} 토큰` : ''}
        </span>
      </div>
      <div className="ai-result-text">{result.answer}</div>
      {result.note && <p className="ai-note">{result.note}</p>}
      <div className="ai-result-actions">
        <button type="button" className="btn primary small" onClick={onApply}>
          <Check size={14} /> 답변에 적용
        </button>
        {over && (
          <button type="button" className="btn small" onClick={onFit}>
            <Scissors size={14} /> 글자수 맞추기
          </button>
        )}
        <button type="button" className="btn ghost small" onClick={() => copyText(result.answer)}>
          <Copy size={14} /> 복사
        </button>
        <button type="button" className="btn ghost small" onClick={onClose}>
          <X size={14} /> 닫기
        </button>
      </div>
      <p className="muted small">적용하면 지금 답변이 바뀌어요. 바로 아래에서 되돌릴 수 있어요.</p>
    </div>
  )
}
