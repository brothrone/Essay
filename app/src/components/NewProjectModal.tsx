import { Check, Download, LoaderCircle, Sparkles } from 'lucide-react'
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

export function NewProjectModal({ onClose }: { onClose: () => void }) {
  const { addProject } = useStore()
  const navigate = useNavigate()
  const [form, setForm] = useState({ company: '', position: '', jobUrl: '', deadline: '', deadlineTime: '' })
  const [presets, setPresets] = useState<number[]>([])
  const [imported, setImported] = useState<{ notes: string; questions: Question[]; source: string } | null>(null)
  const [importError, setImportError] = useState('')
  const task = useAiTask()

  // 공고 링크(또는 회사·직무)를 AI가 웹에서 읽어 회사 · 직무 · 마감일 · 공고 내용 · 공고 분석 · 자소서 문항을 채운다
  const [mode, setMode] = useState<'link' | 'company' | null>(null)
  const importWith = async (prompt: string, kind: 'link' | 'company') => {
    setImportError('')
    setMode(kind)
    const r = await task.run(prompt, { web: true })
    setMode(null)
    if (!r.ok) {
      if (!r.cancelled) setImportError(r.error)
      return
    }
    const info = parsePosting(r.text)
    if (!info) {
      setImportError('공고 내용을 읽지 못했어요. 직접 입력해 주세요.')
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
  const importFromLink = () => importWith(postingPrompt(form.jobUrl.trim(), toDateInput(new Date())), 'link')
  const importFromCompany = () => importWith(companyLookupPrompt(form.company.trim(), form.position.trim(), toDateInput(new Date())), 'company')
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
      jobUrl: form.jobUrl.trim(),
      questions,
    })
    addProject(project)
    onClose()
    navigate(`/projects/${project.id}`)
  }

  const togglePreset = (i: number) =>
    setPresets((ps) => (ps.includes(i) ? ps.filter((x) => x !== i) : [...ps, i]))

  return (
    <Modal
      title="새 자소서 시작하기"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            취소
          </button>
          <button type="submit" form="new-project" className="btn primary">
            시작하기
          </button>
        </>
      }
    >
      <form id="new-project" className="form-grid" onSubmit={submit}>
        <div className="field full">
          <label className="field-label" htmlFor="np-url">
            공고 링크
          </label>
          <div className="url-row">
            <input
              id="np-url"
              type="url"
              value={form.jobUrl}
              onChange={set('jobUrl')}
              placeholder="사람인, 잡코리아, 원티드 등 공고 URL"
            />
            <button
              type="button"
              className="btn small"
              disabled={!isHttpUrl(form.jobUrl) || task.running}
              onClick={importFromLink}
            >
              {task.running && mode === 'link' ? <LoaderCircle size={14} className="spin" /> : <Download size={14} />} 불러오기
            </button>
          </div>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="np-company">
            회사명
          </label>
          <input id="np-company" autoFocus value={form.company} onChange={set('company')} placeholder="예: 삼성전자" />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="np-position">
            지원 직무
          </label>
          <input id="np-position" value={form.position} onChange={set('position')} placeholder="예: 마케팅" />
        </div>
        <div className="field full np-ai-row">
          <button
            type="button"
            className="btn small"
            disabled={form.company.trim().length < 2 || task.running}
            onClick={importFromCompany}
            title="회사·직무만으로 지금 진행 중인 공고와 자소서 문항, 공고 분석을 웹에서 찾아요"
          >
            {task.running && mode === 'company' ? <LoaderCircle size={14} className="spin" /> : <Sparkles size={14} />} 링크 없이 AI로 공고 · 문항
            찾기
          </button>
          <span className="muted small">링크가 없을 때 회사명·직무로 접수 중인 공고, 마감일, 자소서 문항, 공고 분석(핵심 역량·키워드)을 찾아요</span>
          {task.running && (
            <p className="muted small full">
              AI가 {mode === 'company' ? '공고를 찾는' : '공고를 읽는'} 중… {task.elapsed}초 {task.steps.at(-1) && `· ${task.steps.at(-1)}`}{' '}
              <button type="button" className="link-btn" onClick={task.cancel}>
                취소
              </button>
            </p>
          )}
          {imported && !task.running && (
            <p className="import-ok full">
              <Check size={14} />{' '}
              {imported.questions.length ? `공고 내용과 자소서 문항 ${imported.questions.length}개를` : '공고 내용을'} 불러왔어요.
              시작하면 [공고 정보]에 정리돼요.
              {imported.questions.length > 0 && imported.source && imported.source !== '공고 페이지' && (
                <span className="muted"> 문항 출처: {imported.source} — 이번 공고 문항과 같은지 확인하세요.</span>
              )}
            </p>
          )}
          {importError && <p className="ai-error full">{importError}</p>}
        </div>
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
