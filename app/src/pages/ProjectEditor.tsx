import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  Download,
  ExternalLink,
  History,
  Lightbulb,
  LoaderCircle,
  PanelRight,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AiWorkbench, type AiMode } from '../components/AiWorkbench'
import { CHAT_ASK_EVENT } from '../components/ChatPanel'
import { QuestionImportDialog } from '../components/QuestionImportDialog'
import { toast } from '../toast'
import { PostingCheck } from '../components/PostingCheck'
import { isActive, taskFor, useElapsed, usePostingReader } from '../postingReader'
import { answerWarnings } from '../checks'
import { AutoTextarea, Dday, Empty, Modal, StatusSelect } from '../components/ui'
import { COUNT_MODE_LABEL, QUESTION_PRESETS, STAR_FIELDS } from '../constants'
import { desktop } from '../desktop'
import { experienceToText, isHttpUrl, projectToText } from '../format'
import { recordSnapshot } from '../history'
import { newQuestion, useStore } from '../store'
import type { CountMode, Experience, Project, Question } from '../types'
import { copyText, countChars, fmtDateTime, fmtPeriod, includesText, PLACEHOLDER_SOURCE, similarity } from '../utils'

type Panel = 'exp' | 'answers' | 'info'

// 오른쪽은 참고 자료만. AI 도구는 가운데 문항 바로 아래 (AiWorkbench)
const PANELS: { key: Panel; label: string }[] = [
  { key: 'exp', label: '경험' },
  { key: 'answers', label: '다른 답변' },
  { key: 'info', label: '공고 정보' },
]

export function ProjectEditor() {
  const { id = '' } = useParams()
  const { data, updateProject, touchProject, deleteProject } = useStore()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [panel, setPanel] = useState<Panel>('exp')
  const [panelOpen, setPanelOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  // 문항 아래 AI 카드에서 펼친 도구 (다른 문항으로 옮겨도 그대로)
  const [aiMode, setAiMode] = useState<AiMode>(null)
  const project = data.projects.find((p) => p.id === id)

  useEffect(() => {
    touchProject(id)
  }, [id, touchProject])

  if (!project) {
    return (
      <div className="page">
        <Empty
          title="자소서를 찾을 수 없어요"
          desc="삭제됐거나 없는 자소서예요"
          action={
            <Link className="btn" to="/projects">
              목록으로
            </Link>
          }
        />
      </div>
    )
  }

  const { questions } = project
  const index = Math.max(
    0,
    questions.findIndex((q) => q.id === params.get('q')),
  )
  const active: Question | undefined = questions[index]
  const select = (qid: string) => setParams({ q: qid }, { replace: true })

  const update = (fn: (p: Project) => Project) => updateProject(project.id, fn)
  const patch = (p: Partial<Project>) => update((x) => ({ ...x, ...p }))
  // 답변이 바뀌면 바뀌기 직전 상태를 편집 기록에 남긴다 (label: AI 적용 전 · 되돌리기 전 등)
  const patchQ = (qid: string, p: Partial<Question>, label?: string) =>
    update((x) => ({
      ...x,
      questions: x.questions.map((q) => {
        if (q.id !== qid) return q
        const history = p.answer !== undefined && p.answer !== q.answer ? recordSnapshot(q, label) : q.history
        return { ...q, ...p, history }
      }),
    }))
  const snapshotQ = (qid: string, label: string) =>
    update((x) => ({ ...x, questions: x.questions.map((q) => (q.id === qid ? { ...q, history: recordSnapshot(q, label) } : q)) }))

  const addQ = (preset?: Partial<Question>) => {
    const q = newQuestion(preset)
    update((x) => ({ ...x, questions: [...x.questions, q] }))
    select(q.id)
  }
  /** [문항 불러오기]에서 고른 문항: 비어 있는 '새 문항' 자리는 바꾸고, 이미 있는 문항은 건너뛴다 */
  const addQuestions = (qs: Pick<Question, 'prompt' | 'limit'>[]) => {
    const keep = questions.filter((q) => q.prompt.trim() || q.answer.trim())
    const have = new Set(keep.map((q) => q.prompt.trim()))
    const added = qs.filter((q) => q.prompt.trim() && !have.has(q.prompt.trim())).map((q) => newQuestion(q))
    if (!added.length) return
    update((x) => ({ ...x, questions: [...x.questions.filter((q) => q.prompt.trim() || q.answer.trim()), ...added] }))
    select(added[0].id)
    toast(`문항 ${added.length}개를 넣었어요`)
  }

  const removeQ = async (q: Question) => {
    if (
      (q.answer.trim() || q.prompt.trim()) &&
      !(await desktop.confirm('이 문항을 삭제할까요?', { detail: '작성한 답변도 함께 삭제돼요.', ok: '삭제', danger: true }))
    )
      return
    const i = questions.findIndex((x) => x.id === q.id)
    const next = questions[i + 1] ?? questions[i - 1]
    update((x) => ({ ...x, questions: x.questions.filter((y) => y.id !== q.id) }))
    if (next) select(next.id)
  }

  const moveQ = (qid: string, dir: -1 | 1) =>
    update((x) => {
      const qs = [...x.questions]
      const i = qs.findIndex((q) => q.id === qid)
      const j = i + dir
      if (i < 0 || j < 0 || j >= qs.length) return x
      ;[qs[i], qs[j]] = [qs[j], qs[i]]
      return { ...x, questions: qs }
    })

  const removeProject = async () => {
    const ok = await desktop.confirm(`'${project.company || '이름 없는 자소서'}' 자소서를 삭제할까요?`, {
      detail: `문항 ${questions.length}개와 답변이 모두 지워져요. 되돌릴 수 없어요.`,
      ok: '삭제',
      danger: true,
    })
    if (!ok) return
    navigate('/projects', { replace: true })
    deleteProject(project.id)
  }

  const doneCount = questions.filter((q) => q.done).length

  return (
    <div className="editor">
      <header className="editor-head">
        <Link to="/projects" className="icon-btn" aria-label="목록으로">
          <ChevronLeft size={20} />
        </Link>
        <div className="title-inputs">
          <input
            className="title-company"
            value={project.company}
            placeholder="회사명"
            aria-label="회사명"
            onChange={(e) => patch({ company: e.target.value })}
          />
          <input
            className="title-position"
            value={project.position}
            placeholder="지원 직무"
            aria-label="지원 직무"
            onChange={(e) => patch({ position: e.target.value })}
          />
        </div>
        <div className="head-actions">
          {project.deadline && <Dday date={project.deadline} muted={project.status !== 'writing'} />}
          <StatusSelect value={project.status} onChange={(status) => patch({ status })} />
          <button type="button" className="btn ghost panel-toggle" onClick={() => setPanelOpen(true)}>
            <PanelRight size={16} /> 참고
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => copyText(projectToText(project), '전체 문항과 답변을 복사했어요')}
          >
            <Copy size={16} /> 전체 복사
          </button>
          <button type="button" className="icon-btn danger" onClick={removeProject} aria-label="자소서 삭제" title="자소서 삭제">
            <Trash2 size={16} />
          </button>
        </div>
      </header>

      <PostingBanner
        projectId={project.id}
        onOpen={() => {
          setPanel('info')
          setPanelOpen(true)
        }}
      />

      <div className="editor-body">
        <aside className="q-list">
          <div className="q-list-head">
            문항 <span>{doneCount}/{questions.length} 완료</span>
          </div>
          <ol>
            {questions.map((q, i) => {
              const count = countChars(q.answer, q.countMode)
              return (
                <li key={q.id}>
                  <button
                    type="button"
                    className={'q-item' + (q.id === active?.id ? ' on' : '')}
                    onClick={() => select(q.id)}
                  >
                    <span className={'q-num' + (q.done ? ' done' : '')}>
                      {q.done ? <Check size={12} strokeWidth={3} /> : i + 1}
                    </span>
                    <span className="q-text">{q.prompt || '새 문항'}</span>
                    <span className={'q-count' + (q.limit && count > q.limit ? ' over' : '')}>
                      {count.toLocaleString()}
                      {q.limit ? `/${q.limit.toLocaleString()}` : '자'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
          <button type="button" className="add-q" onClick={() => addQ()}>
            <Plus size={16} /> 문항 추가
          </button>
          <button type="button" className="add-q import-q" onClick={() => setImportOpen(true)}>
            <Download size={16} /> 문항 불러오기
          </button>
          {importOpen && (
            <QuestionImportDialog project={project} onPatch={patch} onAdd={addQuestions} onClose={() => setImportOpen(false)} />
          )}
          <details className="preset-menu">
            <summary>자주 나오는 문항</summary>
            {QUESTION_PRESETS.map((p) => (
              <button type="button" key={p.prompt} onClick={() => addQ(p)}>
                {p.prompt}
              </button>
            ))}
          </details>
        </aside>

        <section className="q-main">
          {active ? (
            <QuestionEditor
              key={active.id}
              project={project}
              q={active}
              index={index}
              total={questions.length}
              onPatch={(p, label) => patchQ(active.id, p, label)}
              onSnapshot={(label) => snapshotQ(active.id, label)}
              onRemove={() => removeQ(active)}
              onMove={(dir) => moveQ(active.id, dir)}
              aiMode={aiMode}
              onAiMode={setAiMode}
            />
          ) : (
            <Empty
              title="문항이 없어요"
              desc="왼쪽에서 추가해요"
              action={
                <button type="button" className="btn primary" onClick={() => addQ()}>
                  <Plus size={16} /> 문항 추가
                </button>
              }
            />
          )}
        </section>

        {panelOpen && <div className="nav-scrim panel-scrim" onClick={() => setPanelOpen(false)} />}
        <aside className={'side-panel' + (panelOpen ? ' open' : '')}>
          <div className="panel-tabs" role="tablist">
            {PANELS.map((p) => (
              <button
                type="button"
                role="tab"
                key={p.key}
                aria-selected={panel === p.key}
                className={panel === p.key ? 'on' : ''}
                onClick={() => setPanel(p.key)}
              >
                {p.label}
              </button>
            ))}
            <button type="button" className="icon-btn panel-close" onClick={() => setPanelOpen(false)} aria-label="패널 닫기">
              <X size={18} />
            </button>
          </div>
          {/* 탭을 옮겨도 입력이 끊기지 않게 패널은 숨기기만 한다 */}
          <div className="panel-body">
            <div hidden={panel !== 'info'}>
              <InfoPanel project={project} onPatch={patch} />
            </div>
            {active ? (
              <>
                <div hidden={panel !== 'exp'}>
                  <ExperiencePanel project={project} q={active} onPatch={(p) => patchQ(active.id, p)} />
                </div>
                <div hidden={panel !== 'answers'}>
                  <AnswersPanel q={active} />
                </div>
              </>
            ) : (
              panel !== 'info' && <p className="muted small">문항을 먼저 추가해 주세요</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}


/** 편집 기록: 답변의 이전 상태를 보고 되돌린다 */
function HistoryModal({
  q,
  onClose,
  onSave,
  onRestore,
}: {
  q: Question
  onClose: () => void
  onSave: () => void
  onRestore: (answer: string) => void
}) {
  const items = [...q.history].reverse()
  const canSave = !!q.answer.trim() && q.history[q.history.length - 1]?.answer !== q.answer
  return (
    <Modal
      title="편집 기록"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost mr-auto" disabled={!canSave} onClick={onSave}>
            <History size={16} /> 지금 버전 저장
          </button>
          <button type="button" className="btn" onClick={onClose}>
            닫기
          </button>
        </>
      }
    >
      <p className="muted small">최근 30개까지 자동 저장돼요</p>
      {items.length ? (
        <ul className="history-list">
          {items.map((h) => (
            <li key={h.at} className="history-item">
              <div className="history-meta">
                <strong>{fmtDateTime(h.at)}</strong>
                {h.label && <span className="badge tone-blue">{h.label}</span>}
                <span className="muted small">{countChars(h.answer, 'with').toLocaleString()}자</span>
                <button type="button" className="btn small" disabled={h.answer === q.answer} onClick={() => onRestore(h.answer)}>
                  {h.answer === q.answer ? '지금과 같음' : '되돌리기'}
                </button>
              </div>
              <p className="history-preview">{h.answer}</p>
            </li>
          ))}
        </ul>
      ) : (
        <Empty title="아직 기록이 없어요" />
      )}
    </Modal>
  )
}

/* ---------- 가운데: 문항 · 답변 ---------- */

function QuestionEditor({
  project,
  q,
  index,
  total,
  onPatch,
  onSnapshot,
  onRemove,
  onMove,
  aiMode,
  onAiMode,
}: {
  project: Project
  q: Question
  index: number
  total: number
  onPatch: (p: Partial<Question>, label?: string) => void
  onSnapshot: (label: string) => void
  onRemove: () => void
  onMove: (dir: -1 | 1) => void
  aiMode: AiMode
  onAiMode: (m: AiMode) => void
}) {
  const [historyOpen, setHistoryOpen] = useState(false)
  const counts: Record<CountMode, number> = {
    with: countChars(q.answer, 'with'),
    without: countChars(q.answer, 'without'),
    byte: countChars(q.answer, 'byte'),
  }
  const current = counts[q.countMode]
  const over = q.limit !== null && current > q.limit
  const pct = q.limit ? Math.min(100, (current / q.limit) * 100) : 0
  const unit = q.countMode === 'byte' ? 'byte' : '자'
  const { data } = useStore()
  const warnings = useMemo(() => answerWarnings(data, project, q), [data, project, q])
  const box = useRef<HTMLDivElement>(null)

  /** 답변 칸에서 다음 '(확인 필요…)' 를 골라 보여 준다 (끝까지 가면 처음부터) */
  const findMark = () => {
    const el = box.current?.querySelector<HTMLTextAreaElement>('.answer-input')
    if (!el) return
    const re = new RegExp(PLACEHOLDER_SOURCE, 'g')
    re.lastIndex = el.selectionEnd
    const m = re.exec(el.value) ?? ((re.lastIndex = 0), re.exec(el.value))
    if (!m) return
    el.focus()
    el.setSelectionRange(m.index, m.index + m[0].length)
    // 고른 곳이 보이게: 같은 글꼴 · 폭의 숨은 복사본에서 그 위치의 높이를 재서 화면 가운데로
    const cs = getComputedStyle(el)
    const mirror = document.createElement('div')
    for (const k of ['font', 'letterSpacing', 'lineHeight', 'padding', 'border', 'boxSizing', 'wordBreak'] as const) mirror.style[k] = cs[k]
    Object.assign(mirror.style, { position: 'absolute', visibility: 'hidden', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', width: `${el.offsetWidth}px` })
    mirror.textContent = el.value.slice(0, m.index)
    const mark = mirror.appendChild(document.createElement('span'))
    mark.textContent = m[0]
    document.body.appendChild(mirror)
    const y = mark.offsetTop
    mirror.remove()
    let sc: HTMLElement | null = el.parentElement
    while (sc && !/(auto|scroll)/.test(getComputedStyle(sc).overflowY)) sc = sc.parentElement
    if (sc) sc.scrollBy({ top: el.getBoundingClientRect().top + y - sc.getBoundingClientRect().top - sc.clientHeight / 2, behavior: 'smooth' })
  }
  const fixMarks = () => {
    onAiMode('chat')
    window.dispatchEvent(
      new CustomEvent(CHAT_ASK_EVENT, {
        detail: {
          qid: q.id,
          message: "답변에 남은 '(확인 필요)', [N] 같은 빈칸을 모두 없애 줘. 모르는 수치나 사실은 지어내지 말고 빼서, 자연스러운 문장으로 고쳐 줘. 그래서 짧아져도 괜찮아.",
        },
      }),
    )
  }

  return (
    <div className="q-editor" ref={box}>
      <div className="q-toolbar">
        <span className="q-label">문항 {index + 1}</span>
        <div className="q-tools">
          <button type="button" className="icon-btn" disabled={index === 0} onClick={() => onMove(-1)} aria-label="위로 이동">
            <ChevronUp size={16} />
          </button>
          <button
            type="button"
            className="icon-btn"
            disabled={index === total - 1}
            onClick={() => onMove(1)}
            aria-label="아래로 이동"
          >
            <ChevronDown size={16} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setHistoryOpen(true)}
            aria-label="편집 기록"
            title={q.history.length ? `편집 기록 ${q.history.length}개` : '편집 기록'}
          >
            <History size={16} />
          </button>
          <button type="button" className="icon-btn danger" onClick={onRemove} aria-label="문항 삭제">
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      {historyOpen && (
        <HistoryModal
          q={q}
          onClose={() => setHistoryOpen(false)}
          onSave={() => onSnapshot('직접 저장')}
          onRestore={(answer) => {
            onPatch({ answer }, '되돌리기 전')
            setHistoryOpen(false)
          }}
        />
      )}

      <AutoTextarea
        className="prompt-input"
        minRows={1}
        value={q.prompt}
        placeholder="문항을 입력하세요"
        onChange={(e) => onPatch({ prompt: e.target.value })}
      />

      <div className="q-settings">
        <label className="inline-field">
          글자수 제한
          <input
            type="number"
            min={0}
            step={50}
            value={q.limit ?? ''}
            placeholder="없음"
            onChange={(e) => onPatch({ limit: Number(e.target.value) > 0 ? Math.round(Number(e.target.value)) : null })}
          />
        </label>
        <select
          value={q.countMode}
          onChange={(e) => onPatch({ countMode: e.target.value as CountMode })}
          aria-label="글자수 기준"
        >
          {(Object.keys(COUNT_MODE_LABEL) as CountMode[]).map((m) => (
            <option key={m} value={m}>
              {COUNT_MODE_LABEL[m]} 기준
            </option>
          ))}
        </select>
        <label className={'done-toggle' + (q.done ? ' on' : '')}>
          <input type="checkbox" checked={q.done} onChange={(e) => onPatch({ done: e.target.checked })} />
          <Check size={14} strokeWidth={3} /> 작성 완료
        </label>
      </div>

      {/* AI 도구는 모두 문항 바로 아래 한 곳에: 초안 쓰기 · 도우미 · 대화 */}
      <AiWorkbench project={project} q={q} onPatch={onPatch} mode={aiMode} onMode={onAiMode} />

      <AutoTextarea
        className="answer-input"
        minRows={16}
        value={q.answer}
        spellCheck={false}
        placeholder="여기에 답변을 작성하세요"
        onChange={(e) => onPatch({ answer: e.target.value })}
      />

      {warnings.length > 0 && (
        <ul className="answer-warnings">
          {warnings.map((w) => (
            <li key={w.kind} className={`${w.kind} ${w.level}`}>
              {w.level === 'tip' ? <Lightbulb size={14} /> : <AlertTriangle size={14} />}
              <span className="answer-warning-text">{w.text}</span>
              {w.kind === 'check' && (
                <span className="answer-warning-actions">
                  <button type="button" className="btn small" onClick={findMark}>
                    찾기
                  </button>
                  <button type="button" className="btn small primary" onClick={fixMarks}>
                    AI로 없애기
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <details className="memo" open={!!q.memo}>
        <summary>작성 메모</summary>
        <AutoTextarea
          minRows={3}
          value={q.memo}
          placeholder="키워드, 구성 아이디어"
          onChange={(e) => onPatch({ memo: e.target.value })}
        />
      </details>

      <div className={'counter-bar' + (over ? ' over' : '')}>
        <div className="counts">
          {(Object.keys(COUNT_MODE_LABEL) as CountMode[]).map((m) => (
            <span key={m} className={m === q.countMode ? 'on' : ''}>
              {COUNT_MODE_LABEL[m]} <b>{counts[m].toLocaleString()}</b>
            </span>
          ))}
        </div>
        {q.limit !== null && (
          <div className="limit">
            <div className="limit-bar">
              <i style={{ width: `${pct}%` }} />
            </div>
            <span>
              {current.toLocaleString()} / {q.limit.toLocaleString()}
              {unit}
              {over && ` (${(current - q.limit).toLocaleString()} 초과)`}
            </span>
          </div>
        )}
        <button
          type="button"
          className="btn small"
          disabled={!q.answer}
          onClick={() => copyText(q.answer, '답변을 복사했어요')}
        >
          <Copy size={14} /> 복사
        </button>
      </div>
    </div>
  )
}

/** 맞춤 공고 · 새 자소서 창 · 공고 다시 확인에서 시작한 공고 읽기가 이 자소서에 진행 중일 때 위에 띄운다 */
function PostingBanner({ projectId, onOpen }: { projectId: string; onOpen: () => void }) {
  const reader = usePostingReader()
  const task = taskFor(reader.tasks, projectId)
  const elapsed = useElapsed(task)
  if (!isActive(task)) return null
  return (
    <div className="posting-banner ai-running" role="status">
      <LoaderCircle size={16} className="spin" />
      <span>
        {task!.status === 'waiting'
          ? '공고 읽기 대기 중'
          : 'AI가 공고를 읽는 중'}{' '}
        · {elapsed}초{task!.status === 'running' && task!.steps.at(-1) && ` · ${task!.steps.at(-1)}`}
      </span>
      <button type="button" className="btn ghost small" onClick={onOpen}>
        공고 정보
      </button>
      <button type="button" className="btn ghost small" onClick={() => reader.cancel(task!.key)}>
        취소
      </button>
    </div>
  )
}

/* ---------- 오른쪽 패널 ---------- */

function InfoPanel({ project, onPatch }: { project: Project; onPatch: (p: Partial<Project>) => void }) {
  return (
    <div className="panel-stack">
      <div className="field">
        <label className="field-label" htmlFor="pi-url">
          공고 링크
        </label>
        <div className="url-row">
          <input
            id="pi-url"
            type="url"
            value={project.jobUrl}
            placeholder="https://"
            onChange={(e) => onPatch({ jobUrl: e.target.value })}
          />
          {isHttpUrl(project.jobUrl) && (
            <a className="icon-btn" href={project.jobUrl.trim()} target="_blank" rel="noreferrer" aria-label="공고 열기">
              <ExternalLink size={16} />
            </a>
          )}
        </div>
      </div>
      <PostingCheck project={project} onPatch={onPatch} />
      <div className="field-row">
        <div className="field">
          <label className="field-label" htmlFor="pi-deadline">
            마감일
          </label>
          <input
            id="pi-deadline"
            type="date"
            value={project.deadline}
            onChange={(e) => onPatch({ deadline: e.target.value })}
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="pi-time">
            시간
          </label>
          <input
            id="pi-time"
            type="time"
            value={project.deadlineTime}
            onChange={(e) => onPatch({ deadlineTime: e.target.value })}
          />
        </div>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="pi-notes">
          공고 메모
        </label>
        <AutoTextarea
          id="pi-notes"
          minRows={12}
          value={project.notes}
          placeholder="인재상, 자격요건, 우대사항 등"
          onChange={(e) => onPatch({ notes: e.target.value })}
        />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="pi-personal">
          나만의 상황 · 지원 동기 <span className="muted">(선택)</span>
        </label>
        <AutoTextarea
          id="pi-personal"
          minRows={4}
          maxLength={1500}
          value={project.personal}
          placeholder="전공을 바꾼 이유, 회사와의 인연 등 (AI가 참고해요)"
          onChange={(e) => onPatch({ personal: e.target.value })}
        />
      </div>
    </div>
  )
}

function ExperiencePanel({
  project,
  q,
  onPatch,
}: {
  project: Project
  q: Question
  onPatch: (p: Partial<Question>) => void
}) {
  const { data } = useStore()
  const [query, setQuery] = useState('')
  const [tag, setTag] = useState('')

  const linked = q.experienceIds
    .map((id) => data.experiences.find((e) => e.id === id))
    .filter((e): e is Experience => !!e)

  const tags = useMemo(() => [...new Set(data.experiences.flatMap((e) => e.tags))], [data.experiences])

  const candidates = data.experiences.filter(
    (e) =>
      !q.experienceIds.includes(e.id) &&
      (!tag || e.tags.includes(tag)) &&
      includesText([e.title, e.org, e.type, e.summary, ...e.tags], query),
  )

  const usedAt = (expId: string) => project.questions.findIndex((o) => o.id !== q.id && o.experienceIds.includes(expId))

  return (
    <div className="panel-stack">
      <section>
        <h4 className="panel-title">
          이 문항에 쓸 경험 <span className="count">{linked.length}</span>
        </h4>
        {linked.length ? (
          linked.map((e) => (
            <LinkedExperience
              key={e.id}
              exp={e}
              onUnlink={() => onPatch({ experienceIds: q.experienceIds.filter((x) => x !== e.id) })}
            />
          ))
        ) : (
          <p className="muted small">아래에서 연결해요</p>
        )}
      </section>

      <section>
        <h4 className="panel-title">내 경험에서 찾기</h4>
        {data.experiences.length === 0 ? (
          <div className="panel-empty">
            <p>아직 경험이 없어요</p>
            <Link className="btn small" to="/experiences?edit=new">
              <Plus size={14} /> 경험 추가하기
            </Link>
          </div>
        ) : (
          <>
            <label className="search small">
              <Search size={14} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="경험 검색" />
            </label>
            {tags.length > 0 && (
              <div className="chips small">
                {tags.map((t) => (
                  <button
                    type="button"
                    key={t}
                    className={'chip' + (tag === t ? ' on' : '')}
                    onClick={() => setTag(tag === t ? '' : t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
            <ul className="exp-pick-list">
              {candidates.map((e) => {
                const used = usedAt(e.id)
                return (
                  <li key={e.id}>
                    <div className="exp-pick-main">
                      <strong>{e.title || '제목 없는 경험'}</strong>
                      <span className="muted small">
                        {[e.type, fmtPeriod(e.start, e.end)].filter(Boolean).join(' · ')}
                      </span>
                      {e.summary && <p className="small">{e.summary}</p>}
                      <div className="tag-row">
                        {e.tags.map((t) => (
                          <span key={t} className="tag">
                            {t}
                          </span>
                        ))}
                        {used >= 0 && <span className="badge tone-amber">{used + 1}번 문항에서 사용 중</span>}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn small"
                      onClick={() => onPatch({ experienceIds: [...q.experienceIds, e.id] })}
                    >
                      <Plus size={14} /> 연결
                    </button>
                  </li>
                )
              })}
              {!candidates.length && <li className="muted small">조건에 맞는 경험이 없어요</li>}
            </ul>
          </>
        )}
      </section>
    </div>
  )
}

function LinkedExperience({ exp, onUnlink }: { exp: Experience; onUnlink: () => void }) {
  const [open, setOpen] = useState(true)
  return (
    <article className="exp-ref">
      <header>
        <button type="button" className="exp-ref-title" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          {exp.title || '제목 없는 경험'}
        </button>
        <div className="exp-ref-actions">
          <button
            type="button"
            className="icon-btn"
            title="STAR 복사"
            aria-label="STAR 복사"
            onClick={() => copyText(experienceToText(exp), '경험 내용을 복사했어요')}
          >
            <Copy size={14} />
          </button>
          <Link className="icon-btn" title="경험 수정" aria-label="경험 수정" to={`/experiences?edit=${exp.id}`}>
            <Pencil size={14} />
          </Link>
          <button type="button" className="icon-btn" title="연결 해제" aria-label="연결 해제" onClick={onUnlink}>
            <X size={14} />
          </button>
        </div>
      </header>
      {open && (
        <div className="exp-ref-body">
          {exp.summary && <p className="exp-summary">{exp.summary}</p>}
          {STAR_FIELDS.map(
            (f) =>
              exp[f.key] && (
                <div className="star-row" key={f.key}>
                  <span className="star-key" title={f.label}>
                    {f.short}
                  </span>
                  <p>{exp[f.key]}</p>
                </div>
              ),
          )}
          {exp.learned && (
            <div className="star-row">
              <span className="star-key" title="배운 점">
                +
              </span>
              <p>{exp.learned}</p>
            </div>
          )}
          {!exp.summary && !STAR_FIELDS.some((f) => exp[f.key]) && !exp.learned && (
            <p className="muted small">STAR 내용이 비어 있어요</p>
          )}
        </div>
      )}
    </article>
  )
}

function AnswersPanel({ q }: { q: Question }) {
  const { data } = useStore()
  const [query, setQuery] = useState('')

  const results = useMemo(() => {
    const all = data.projects.flatMap((p) =>
      p.questions
        .filter((o) => o.id !== q.id && o.answer.trim())
        .map((o) => ({ p, o, score: similarity(q.prompt, o.prompt) })),
    )
    const filtered = query.trim()
      ? all.filter(({ p, o }) => includesText([p.company, p.position, o.prompt, o.answer], query))
      : all
    return filtered.sort((a, b) => b.score - a.score || b.p.updatedAt - a.p.updatedAt).slice(0, 30)
  }, [data.projects, q.id, q.prompt, query])

  return (
    <div className="panel-stack">
      <label className="search small">
        <Search size={14} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="회사, 문항, 답변 검색" />
      </label>
      {query.trim() && <p className="muted small">검색 결과 {results.length}개</p>}
      {results.length ? (
        results.map(({ p, o, score }) => <AnswerCard key={o.id} project={p} q={o} similar={score >= 0.2} />)
      ) : (
        <div className="panel-empty">
          <p>{query.trim() ? '검색 결과가 없어요' : '다른 답변이 아직 없어요'}</p>
        </div>
      )}
    </div>
  )
}

function AnswerCard({ project, q, similar }: { project: Project; q: Question; similar: boolean }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <article className="answer-card">
      <div className="answer-meta">
        <strong>{project.company || '이름 없는 자소서'}</strong>
        <span className="muted">{project.position}</span>
        {similar && <span className="badge tone-blue">비슷한 문항</span>}
      </div>
      <p className="answer-prompt">{q.prompt}</p>
      <button
        type="button"
        className={'answer-snippet' + (expanded ? ' expanded' : '')}
        onClick={() => setExpanded(!expanded)}
        title={expanded ? '접기' : '펼치기'}
      >
        {q.answer}
      </button>
      <div className="answer-foot">
        <span className="muted small">{countChars(q.answer, 'with').toLocaleString()}자</span>
        <div>
          <button type="button" className="btn small ghost" onClick={() => copyText(q.answer, '답변을 복사했어요')}>
            <Copy size={14} /> 복사
          </button>
          <Link className="btn small ghost" to={`/projects/${project.id}?q=${q.id}`}>
            열기
          </Link>
        </div>
      </div>
    </article>
  )
}
