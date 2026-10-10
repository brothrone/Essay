import { Copy, FileUp, LayoutGrid, Lightbulb, Network, Plus, Search, Trash2 } from 'lucide-react'
import { useMemo, useState, type KeyboardEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ExperienceMap } from '../components/ExperienceMap'
import { openImportDialog } from '../components/ImportModal'
import { AutoTextarea, Empty, Modal } from '../components/ui'
import { COMPETENCY_TAGS, EXPERIENCE_TYPES, STAR_FIELDS } from '../constants'
import { desktop } from '../desktop'
import { experienceToText } from '../format'
import { newExperience, useStore } from '../store'
import type { Experience, Project, Question } from '../types'
import { copyText, fmtPeriod, includesText } from '../utils'

type Usage = { project: Project; question: Question; index: number }

export function Experiences() {
  const { data } = useStore()
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [type, setType] = useState('')
  const tag = params.get('tag') ?? ''
  const editId = params.get('edit')
  const view = params.get('view') === 'map' ? 'map' : 'cards'

  const usage = useMemo(() => {
    const m = new Map<string, Usage[]>()
    for (const project of data.projects)
      project.questions.forEach((question, index) => {
        for (const id of question.experienceIds) m.set(id, [...(m.get(id) ?? []), { project, question, index }])
      })
    return m
  }, [data.projects])

  const allTags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const e of data.experiences) for (const t of e.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [data.experiences])

  const list = data.experiences
    .filter(
      (e) =>
        (!type || e.type === type) &&
        (!tag || e.tags.includes(tag)) &&
        includesText(
          [e.title, e.org, e.role, e.summary, e.situation, e.task, e.action, e.result, e.learned, ...e.tags],
          query,
        ),
    )
    .sort((a, b) => (b.start || '').localeCompare(a.start || '') || b.updatedAt - a.updatedAt)

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: key !== 'edit' })
  }

  const usageCount = useMemo(() => new Map([...usage].map(([id, u]) => [id, u.length])), [usage])

  const editing = editId === 'new' ? null : data.experiences.find((e) => e.id === editId)

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>경험 관리</h1>
        </div>
        <div className="btn-row">
          <button type="button" className="btn" onClick={openImportDialog} title="예전 자소서에서 경험을 자동으로 뽑아요">
            <FileUp size={16} /> 자소서에서 가져오기
          </button>
          <button type="button" className="btn primary" onClick={() => setParam('edit', 'new')}>
            <Plus size={16} /> 경험 추가
          </button>
        </div>
      </header>

      <div className="toolbar">
        <div className="chips">
          <button type="button" className={'chip' + (!tag ? ' on' : '')} onClick={() => setParam('tag', null)}>
            전체 <b>{data.experiences.length}</b>
          </button>
          {allTags.map(([t, n]) => (
            <button
              type="button"
              key={t}
              className={'chip' + (tag === t ? ' on' : '')}
              onClick={() => setParam('tag', tag === t ? null : t)}
            >
              {t} <b>{n}</b>
            </button>
          ))}
          {tag && !allTags.some(([t]) => t === tag) && (
            <button type="button" className="chip on" onClick={() => setParam('tag', null)}>
              {tag} <b>0</b>
            </button>
          )}
        </div>
        <div className="toolbar-right">
          <label className="search">
            <Search size={16} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="경험 내용 검색" />
          </label>
          <div className="segmented icons" role="tablist" aria-label="보기 방식">
            <button type="button" role="tab" aria-selected={view === 'cards'} aria-label="카드" title="카드" className={view === 'cards' ? 'on' : ''} onClick={() => setParam('view', null)}>
              <LayoutGrid size={17} />
            </button>
            <button type="button" role="tab" aria-selected={view === 'map'} aria-label="마인드맵" title="마인드맵" className={view === 'map' ? 'on' : ''} onClick={() => setParam('view', 'map')}>
              <Network size={17} />
            </button>
          </div>
          <select value={type} onChange={(e) => setType(e.target.value)} aria-label="경험 유형">
            <option value="">모든 유형</option>
            {EXPERIENCE_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      {list.length && view === 'map' ? (
        <ExperienceMap experiences={list} usage={usageCount} onOpen={(id) => setParam('edit', id)} />
      ) : list.length ? (
        <div className="exp-grid">
          {list.map((e) => {
            const used = usage.get(e.id)?.length ?? 0
            return (
              <button type="button" key={e.id} className="exp-card" onClick={() => setParam('edit', e.id)}>
                <div className="exp-card-top">
                  <span className="badge tone-gray">{e.type}</span>
                  <span className="star-dots" title="STAR 작성 정도">
                    {STAR_FIELDS.map((f) => (
                      <i key={f.key} className={e[f.key] ? 'on' : ''}>
                        {f.short}
                      </i>
                    ))}
                  </span>
                </div>
                <strong className="exp-card-title">{e.title || '제목 없는 경험'}</strong>
                <span className="muted small">
                  {[e.org, e.role, fmtPeriod(e.start, e.end)].filter(Boolean).join(' · ')}
                </span>
                {e.summary && <p className="exp-card-summary">{e.summary}</p>}
                <div className="tag-row">
                  {e.tags.map((t) => (
                    <span key={t} className="tag">
                      {t}
                    </span>
                  ))}
                </div>
                <span className="exp-card-foot">{used ? `문항 ${used}개에 사용` : '사용 안 함'}</span>
              </button>
            )
          })}
        </div>
      ) : (
        <Empty
          icon={<Lightbulb size={28} />}
          title={data.experiences.length ? '조건에 맞는 경험이 없어요' : '아직 정리한 경험이 없어요'}
          desc={
            data.experiences.length
              ? '검색어나 필터를 바꿔 보세요'
              : '동아리, 아르바이트 같은 작은 경험도 좋아요'
          }
          action={
            !data.experiences.length && (
              <div className="btn-row">
                <button type="button" className="btn primary" onClick={() => setParam('edit', 'new')}>
                  <Plus size={16} /> 첫 경험 정리하기
                </button>
                <button type="button" className="btn" onClick={openImportDialog}>
                  <FileUp size={16} /> 예전 자소서에서 가져오기
                </button>
              </div>
            )
          }
        />
      )}

      {(editId === 'new' || editing) && (
        <ExperienceModal
          key={editId}
          initial={editing ?? null}
          usage={editing ? usage.get(editing.id) ?? [] : []}
          onClose={() => setParam('edit', null)}
        />
      )}
    </div>
  )
}

function ExperienceModal({
  initial,
  usage,
  onClose,
}: {
  initial: Experience | null
  usage: Usage[]
  onClose: () => void
}) {
  const { saveExperience, deleteExperience } = useStore()
  const [base] = useState(() => initial ?? newExperience())
  const [draft, setDraft] = useState(base)
  const [tagInput, setTagInput] = useState('')
  const dirty = JSON.stringify(draft) !== JSON.stringify(base)

  const set = <K extends keyof Experience>(k: K, v: Experience[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const toggleTag = (t: string) =>
    set('tags', draft.tags.includes(t) ? draft.tags.filter((x) => x !== t) : [...draft.tags, t])

  const addCustomTag = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
    e.preventDefault()
    const t = tagInput.trim()
    if (t && !draft.tags.includes(t)) set('tags', [...draft.tags, t])
    setTagInput('')
  }

  const close = async () => {
    if (dirty && !(await desktop.confirm('저장하지 않은 내용이 있어요. 닫을까요?', { ok: '닫기', cancel: '계속 쓰기' }))) return
    onClose()
  }

  const save = () => {
    saveExperience({ ...draft, title: draft.title.trim() || '제목 없는 경험' })
    onClose()
  }

  const remove = async () => {
    const detail = usage.length ? `문항 ${usage.length}개에 연결돼 있어요. 연결도 함께 풀려요.` : undefined
    if (!(await desktop.confirm('이 경험을 삭제할까요?', { detail, ok: '삭제', danger: true }))) return
    deleteExperience(draft.id)
    onClose()
  }

  const customTags = draft.tags.filter((t) => !COMPETENCY_TAGS.includes(t))

  return (
    <Modal
      wide
      title={initial ? '경험 수정' : '새 경험 정리하기'}
      onClose={close}
      footer={
        <>
          {initial && (
            <button type="button" className="btn ghost danger mr-auto" onClick={remove}>
              <Trash2 size={16} /> 삭제
            </button>
          )}
          {initial && (
            <button
              type="button"
              className="btn ghost"
              onClick={() => copyText(experienceToText(draft), '경험 내용을 복사했어요')}
            >
              <Copy size={16} /> 텍스트 복사
            </button>
          )}
          <button type="button" className="btn ghost" onClick={close}>
            취소
          </button>
          <button type="button" className="btn primary" onClick={save}>
            저장
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="field full">
          <label className="field-label" htmlFor="ex-title">
            경험 제목<em>*</em>
          </label>
          <input
            id="ex-title"
            autoFocus={!initial}
            value={draft.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="예: 교내 창업동아리 앱 출시 프로젝트"
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="ex-type">
            유형
          </label>
          <select id="ex-type" value={draft.type} onChange={(e) => set('type', e.target.value)}>
            {EXPERIENCE_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="ex-org">
            소속·기관
          </label>
          <input id="ex-org" value={draft.org} onChange={(e) => set('org', e.target.value)} placeholder="○○동아리" />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="ex-role">
            나의 역할
          </label>
          <input id="ex-role" value={draft.role} onChange={(e) => set('role', e.target.value)} placeholder="팀장, 개발 담당" />
        </div>
        <div className="field-row">
          <div className="field">
            <label className="field-label" htmlFor="ex-start">
              시작
            </label>
            <input
              id="ex-start"
              type="month"
              value={draft.start}
              placeholder="2024-03"
              onChange={(e) => set('start', e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="ex-end">
              종료
            </label>
            <input
              id="ex-end"
              type="month"
              value={draft.end}
              placeholder="2024-08"
              onChange={(e) => set('end', e.target.value)}
            />
          </div>
        </div>
        <div className="field full">
          <label className="field-label" htmlFor="ex-summary">
            한 줄 요약
          </label>
          <input
            id="ex-summary"
            value={draft.summary}
            onChange={(e) => set('summary', e.target.value)}
            placeholder="예: 사용자 인터뷰로 문제를 재정의해 앱 리텐션을 2배로 높임"
          />
        </div>

        <div className="star-block full">
          {STAR_FIELDS.map((f) => (
            <div className="star-field" key={f.key}>
              <label className="star-label" htmlFor={`ex-${f.key}`}>
                <span className="star-key">{f.short}</span>
                {f.label}
              </label>
              <AutoTextarea
                id={`ex-${f.key}`}
                minRows={3}
                value={draft[f.key]}
                placeholder={f.hint}
                onChange={(e) => set(f.key, e.target.value)}
              />
            </div>
          ))}
          <div className="star-field">
            <label className="star-label" htmlFor="ex-learned">
              <span className="star-key">+</span>
              배운 점 · 직무 연결
            </label>
            <AutoTextarea
              id="ex-learned"
              minRows={2}
              value={draft.learned}
              placeholder="얻은 역량, 직무와의 연결"
              onChange={(e) => set('learned', e.target.value)}
            />
          </div>
        </div>

        <div className="field full">
          <span className="field-label">역량 태그</span>
          <div className="chips">
            {COMPETENCY_TAGS.map((t) => (
              <button
                type="button"
                key={t}
                className={'chip' + (draft.tags.includes(t) ? ' on' : '')}
                onClick={() => toggleTag(t)}
                aria-pressed={draft.tags.includes(t)}
              >
                {t}
              </button>
            ))}
            {customTags.map((t) => (
              <button type="button" key={t} className="chip on" onClick={() => toggleTag(t)} title="눌러서 제거">
                {t} ×
              </button>
            ))}
            <input
              className="tag-input"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={addCustomTag}
              placeholder="+ 직접 입력 후 Enter"
            />
          </div>
        </div>

        {usage.length > 0 && (
          <div className="field full">
            <span className="field-label">이 경험을 쓴 문항</span>
            <ul className="usage-list">
              {usage.map(({ project, question, index }) => (
                <li key={question.id}>
                  <Link to={`/projects/${project.id}?q=${question.id}`}>
                    <strong>{project.company || '이름 없는 자소서'}</strong> {index + 1}번 ·{' '}
                    {question.prompt || '새 문항'}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  )
}
