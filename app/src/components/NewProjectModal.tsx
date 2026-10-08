import { Check, Link2, LoaderCircle, Search, Sparkles } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { QUESTION_PRESETS } from '../constants'
import { isHttpUrl } from '../format'
import { companyLookupPrompt, parsePosting, postingPrompt } from '../prompts'
import { newProject, newQuestion, useStore } from '../store'
import type { Question } from '../types'
import { useAiTask } from '../useAiTask'
import { toDateInput } from '../utils'
import { Modal } from './ui'

/** "saramin.co.kr/..." 처럼 프로토콜만 빠진 주소는 https:// 를 붙여 준다 */
function normalizeUrl(raw: string) {
  const s = raw.trim()
  if (!s) return ''
  if (isHttpUrl(s)) return s
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(s)) return `https://${s}`
  return s
}

export function NewProjectModal({ onClose }: { onClose: () => void }) {
  const { addProject } = useStore()
  const navigate = useNavigate()
  const [form, setForm] = useState({ company: '', position: '', jobUrl: '', deadline: '', deadlineTime: '' })
  const [presets, setPresets] = useState<number[]>([])
  const [imported, setImported] = useState<{ notes: string; questions: Question[]; source: string } | null>(null)
  const [importError, setImportError] = useState('')
  const task = useAiTask()

  // 공고 정보를 어떻게 가져올지: 링크를 읽거나, 회사명·직무로 웹에서 찾거나
  const [source, setSourceState] = useState<'link' | 'search'>('link')
  const setSource = (s: 'link' | 'search') => {
    setSourceState(s)
    setImportError('')
  }
  const [mode, setMode] = useState<'link' | 'company' | null>(null)
  const importWith = async (prompt: string, kind: 'link' | 'company') => {
    setImportError('')
    setImported(null)
    setMode(kind)
    const r = await task.run(prompt, { web: true })
    setMode(null)
    if (!r.ok) {
      if (!r.cancelled) setImportError(r.error)
      return
    }
    const info = parsePosting(r.text)
    if (!info) {
      setImportError('공고 내용을 읽지 못했어요. 아래 칸에 직접 적어 주세요.')
      return
    }
    setForm((f) => ({
      ...f,
      company: info.company || f.company,
      position: info.position || f.position,
      deadline: info.deadline || f.deadline,
      deadlineTime: info.deadlineTime || f.deadlineTime,
      jobUrl: f.jobUrl.trim() || info.url,
    }))
    setImported({ notes: info.notes, questions: info.questions.map((q) => newQuestion(q)), source: info.questionsSource })
    if (info.isOpen === false) setImportError('이 공고는 마감된 것으로 보여요. 마감일을 확인해 주세요.')
    else if (info.isOpen === null && kind === 'company') setImportError('지금 접수 중인 공고는 찾지 못했어요. 찾은 내용은 참고용이에요.')
  }

  const importFromLink = () => {
    const url = normalizeUrl(form.jobUrl)
    if (!isHttpUrl(url)) {
      setImportError(
        form.jobUrl.trim()
          ? '공고 페이지 주소가 아니에요. 브라우저 주소창의 https:// 로 시작하는 주소를 그대로 붙여넣어 주세요. 링크가 없으면 [회사명으로 찾기]를 써 보세요.'
          : '공고 페이지 주소를 먼저 붙여넣어 주세요.',
      )
      return
    }
    setForm((f) => ({ ...f, jobUrl: url }))
    importWith(postingPrompt(url, toDateInput(new Date())), 'link')
  }
  const importFromCompany = () => {
    if (form.company.trim().length < 2) {
      setImportError('회사명을 먼저 적어 주세요. 직무까지 적으면 더 정확해요.')
      return
    }
    importWith(companyLookupPrompt(form.company.trim(), form.position.trim(), toDateInput(new Date())), 'company')
  }
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const presetQs = [...presets].sort((a, b) => a - b).map((i) => newQuestion(QUESTION_PRESETS[i]))
    const fromPosting = imported?.questions ?? []
    const questions = fromPosting.length || presetQs.length ? [...fromPosting, ...presetQs] : [newQuestion()]
    const project = newProject({
      ...form,
      notes: imported?.notes ?? '',
      company: form.company.trim(),
      position: form.position.trim(),
      jobUrl: normalizeUrl(form.jobUrl),
      questions,
    })
    addProject(project)
    onClose()
    navigate(`/projects/${project.id}`)
  }

  const togglePreset = (i: number) =>
    setPresets((ps) => (ps.includes(i) ? ps.filter((x) => x !== i) : [...ps, i]))

  const busy = task.running

  return (
    <Modal
      title="새 자소서 시작하기"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            취소
          </button>
          <button type="submit" form="new-project" className="btn primary" disabled={busy}>
            시작하기
          </button>
        </>
      }
    >
      <form id="new-project" className="form-grid" onSubmit={submit}>
        <div className="field">
          <label className="field-label" htmlFor="np-company">
            회사명
          </label>
          <input
            id="np-company"
            autoFocus
            value={form.company}
            onChange={(e) => {
              set('company')(e)
              if (importError) setImportError('')
            }}
            placeholder="예: 삼성전자"
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="np-position">
            지원 직무
          </label>
          <input id="np-position" value={form.position} onChange={set('position')} placeholder="예: 마케팅" />
        </div>

        <section className="field full np-ai" aria-label="공고 정보 자동으로 채우기">
          <header className="np-ai-head">
            <span className="field-label">
              <Sparkles size={14} /> 공고 정보 AI로 채우기 <span className="muted">(선택)</span>
            </span>
            <div className="segmented small" role="tablist" aria-label="공고를 가져올 방법">
              <button type="button" role="tab" aria-selected={source === 'link'} className={source === 'link' ? 'on' : ''} onClick={() => setSource('link')} disabled={busy}>
                <Link2 size={13} /> 공고 링크 붙여넣기
              </button>
              <button type="button" role="tab" aria-selected={source === 'search'} className={source === 'search' ? 'on' : ''} onClick={() => setSource('search')} disabled={busy}>
                <Search size={13} /> 회사명으로 찾기
              </button>
            </div>
          </header>

          {source === 'link' ? (
            <>
              <p className="muted small np-ai-desc">
                사람인 · 잡코리아 · 원티드 · 회사 채용 페이지 주소를 넣으면 AI가 그 페이지를 읽어 회사 · 직무 · 마감일 · 자소서 문항 · 공고 분석을 채워요.
              </p>
              <div className="url-row">
                <input
                  id="np-url"
                  type="text"
                  inputMode="url"
                  value={form.jobUrl}
                  onChange={(e) => {
                    set('jobUrl')(e)
                    if (importError) setImportError('')
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      if (!busy) importFromLink()
                    }
                  }}
                  placeholder="https://www.saramin.co.kr/... (공고 페이지 주소)"
                  aria-label="공고 링크"
                />
                <button type="button" className="btn primary small" disabled={busy} onClick={importFromLink}>
                  {busy && mode === 'link' ? <LoaderCircle size={14} className="spin" /> : <Sparkles size={14} />} AI로 불러오기
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="muted small np-ai-desc">
                링크가 없을 때 써요. 위에 적은 회사명 · 직무로 지금 접수 중인 공고를 웹에서 찾아 마감일 · 자소서 문항 · 공고 분석(핵심 역량 · 키워드)을 채워요.
              </p>
              <div className="url-row">
                <span className="np-search-target muted small">
                  {form.company.trim() ? (
                    <>
                      <b>{form.company.trim()}</b>
                      {form.position.trim() && <> · {form.position.trim()}</>} 공고를 찾아요
                    </>
                  ) : (
                    '위 회사명 칸을 먼저 채워 주세요'
                  )}
                </span>
                <button type="button" className="btn primary small" disabled={busy} onClick={importFromCompany}>
                  {busy && mode === 'company' ? <LoaderCircle size={14} className="spin" /> : <Search size={14} />} AI로 공고 찾기
                </button>
              </div>
            </>
          )}

          {busy && (
            <p className="muted small np-ai-status">
              <LoaderCircle size={14} className="spin" /> AI가 {mode === 'company' ? '공고를 찾는' : '공고 페이지를 읽는'} 중… {task.elapsed}초
              {task.steps.at(-1) && ` · ${task.steps.at(-1)}`}{' '}
              <button type="button" className="link-btn" onClick={task.cancel}>
                취소
              </button>
            </p>
          )}
          {imported && !busy && (
            <p className="import-ok">
              <Check size={14} />{' '}
              {imported.questions.length ? `공고 내용과 자소서 문항 ${imported.questions.length}개를` : '공고 내용을'} 채웠어요. 아래 칸을 확인하고
              [시작하기]를 누르면 [공고 정보]에 정리돼요.
              {imported.questions.length > 0 && imported.source && imported.source !== '공고 페이지' && (
                <span className="muted"> 문항 출처: {imported.source} — 이번 공고 문항과 같은지 확인하세요.</span>
              )}
            </p>
          )}
          {importError && <p className="ai-error">{importError}</p>}
        </section>

        <div className="field">
          <label className="field-label" htmlFor="np-deadline">
            마감일
          </label>
          <input id="np-deadline" type="date" value={form.deadline} onChange={set('deadline')} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="np-time">
            마감 시간
          </label>
          <input id="np-time" type="time" value={form.deadlineTime} onChange={set('deadlineTime')} />
        </div>
        <div className="field full">
          <span className="field-label">
            자주 나오는 문항 미리 넣기 (선택){imported?.questions.length ? <span className="muted"> · 불러온 문항 뒤에 추가돼요</span> : null}
          </span>
          <div className="preset-list">
            {QUESTION_PRESETS.map((p, i) => (
              <button
                type="button"
                key={p.prompt}
                className={'preset' + (presets.includes(i) ? ' on' : '')}
                onClick={() => togglePreset(i)}
                aria-pressed={presets.includes(i)}
              >
                <span className="preset-check">{presets.includes(i) && <Check size={12} strokeWidth={3} />}</span>
                {p.prompt}
              </button>
            ))}
          </div>
        </div>
      </form>
    </Modal>
  )
}
