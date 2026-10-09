import { Check, FileText, FolderOpen, LoaderCircle, Sparkles, Trash2, Wand2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { desktop } from '../desktop'
import { extractPrompt, parseExtracted, planMerge, splitForAi, suggestJobQuery, type Extracted, type MergePlan } from '../importPrompt'
import { useJobSearch } from '../jobSearch'
import { useStore } from '../store'
import { toast } from '../toast'
import { aiReady, useAiStatus } from '../useAiStatus'
import { savedAiModel, savedAiProvider } from '../useAiTask'
import { Modal } from './ui'
import { track } from '../community'

type Listener = () => void
const listeners = new Set<Listener>()
/** 어디서든 '예전 자소서 불러오기' 창을 연다 */
export function openImportDialog() {
  listeners.forEach((l) => l())
}

type Doc = { id: string; name: string; text: string }
type Phase = 'input' | 'running' | 'preview'

export function ImportDialogHost() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const l = () => setOpen(true)
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])
  if (!open) return null
  return <ImportModal onClose={() => setOpen(false)} />
}

function ImportModal({ onClose }: { onClose: () => void }) {
  const { data, saveSpec, saveExperience, addProject, setProfile, setJobQuery } = useStore()
  const jobSearch = useJobSearch()
  const navigate = useNavigate()
  const { status } = useAiStatus()
  const provider = savedAiProvider()
  const ready = aiReady(status, provider)

  const [docs, setDocs] = useState<Doc[]>([])
  const [paste, setPaste] = useState('')
  const [phase, setPhase] = useState<Phase>('input')
  const [progress, setProgress] = useState({ done: 0, total: 0, name: '', seconds: 0 })
  const [plan, setPlan] = useState<MergePlan | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [include, setInclude] = useState({ experiences: true, specs: true, projects: true, profile: true })
  const [autoJobs, setAutoJobs] = useState(true)
  const cancelled = useRef(false)

  useEffect(() => {
    if (phase !== 'running') return
    const t0 = Date.now()
    const id = setInterval(() => setProgress((p) => ({ ...p, seconds: Math.floor((Date.now() - t0) / 1000) })), 500)
    return () => clearInterval(id)
  }, [phase])
  useEffect(
    () => () => {
      cancelled.current = true
      desktop.ai.cancel()
    },
    [],
  )

  const pickFiles = async () => {
    const files = await desktop.pickImportFiles()
    const bad = files.filter((f) => f.error || !f.text.trim())
    if (bad.length) toast(bad.map((f) => `${f.name}: ${f.error || '내용이 비어 있어요'}`).join('\n'))
    setDocs((d) => [...d, ...files.filter((f) => f.text.trim()).map((f) => ({ id: crypto.randomUUID(), name: f.name, text: f.text }))])
  }
  const addPaste = () => {
    if (!paste.trim()) return
    setDocs((d) => [...d, { id: crypto.randomUUID(), name: `붙여넣은 글 ${d.length + 1}`, text: paste.trim() }])
    setPaste('')
  }

  const run = async () => {
    const all = paste.trim() ? [...docs, { id: 'paste', name: '붙여넣은 글', text: paste.trim() }] : docs
    if (!all.length) return
    const jobs = all.flatMap((d) => splitForAi(d.text).map((text, i, arr) => ({ doc: d, text, index: i, total: arr.length })))
    setPhase('running')
    setErrors([])
    track('import_run')
    setProgress({ done: 0, total: jobs.length, name: jobs[0]?.doc.name ?? '', seconds: 0 })
    cancelled.current = false
    const parts: Extracted[] = []
    const errs: string[] = []
    for (const j of jobs) {
      if (cancelled.current) break
      setProgress((p) => ({ ...p, name: j.doc.name + (j.total > 1 ? ` (${j.index + 1}/${j.total})` : '') }))
      const r = await desktop.ai.run(extractPrompt(j.doc.name, j.text, j), savedAiModel(provider) || undefined, { provider })
      if (!r.ok) {
        if (r.cancelled) break
        errs.push(`${j.doc.name}: ${r.error}`)
      } else {
        const parsed = parseExtracted(r.text)
        if (parsed) parts.push(parsed)
        else errs.push(`${j.doc.name}: AI 응답을 읽지 못했어요`)
      }
      setProgress((p) => ({ ...p, done: p.done + 1 }))
    }
    if (cancelled.current) return
    setErrors(errs)
    setPlan(planMerge(data, parts))
    setPhase('preview')
  }

  const apply = () => {
    if (!plan) return
    let n = 0
    if (include.profile && Object.keys(plan.profile).length) setProfile(plan.profile)
    if (include.specs) {
      plan.specs.forEach(saveSpec)
      n += plan.specs.length
    }
    if (include.experiences) {
      plan.experiences.forEach(saveExperience)
      n += plan.experiences.length
    }
    if (include.projects) {
      plan.projects.forEach(addProject)
      n += plan.projects.length
    }
    const q = suggestJobQuery(data, plan)
    if (q.keywords) setJobQuery(q)
    toast(`${n}개 항목을 채웠어요${q.keywords ? ` · 맞춤 공고 조건: ${q.keywords}` : ''}`)
    onClose()
    if (autoJobs && q.keywords) {
      navigate('/jobs')
      if (ready) setTimeout(() => jobSearch.start({ ...data.jobQuery, ...q }), 300)
    }
  }

  const total = docs.length + (paste.trim() ? 1 : 0)
  const chars = docs.reduce((n, d) => n + d.text.length, 0) + paste.trim().length

  return (
    <Modal
      wide
      title="예전 자소서로 한 번에 채우기"
      onClose={onClose}
      footer={
        phase === 'input' ? (
          <>
            <span className="muted small mr-auto">
              {total ? `${total}개 · ${chars.toLocaleString()}자` : '파일을 고르거나 글을 붙여넣으세요'}
              {!ready && status && ' · AI 연결이 먼저 필요해요 (홈 → AI 연결하기)'}
            </span>
            <button type="button" className="btn ghost" onClick={onClose}>
              취소
            </button>
            <button type="button" className="btn primary" disabled={!total || !ready} onClick={run}>
              <Sparkles size={16} /> AI로 분석하기
            </button>
          </>
        ) : phase === 'running' ? (
          <>
            <span className="muted small mr-auto">
              <LoaderCircle size={12} className="spin" /> {progress.done}/{progress.total} · {progress.name} · {progress.seconds}초
            </span>
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                cancelled.current = true
                desktop.ai.cancel()
                setPhase('input')
              }}
            >
              중단
            </button>
          </>
        ) : (
          <>
            <label className="check-inline mr-auto">
              <input type="checkbox" checked={autoJobs} onChange={(e) => setAutoJobs(e.target.checked)} /> 채운 뒤 맞춤 공고 바로 찾기
            </label>
            <button type="button" className="btn ghost" onClick={() => setPhase('input')}>
              뒤로
            </button>
            <button type="button" className="btn primary" onClick={apply}>
              <Check size={16} /> 이대로 채우기
            </button>
          </>
        )
      }
    >
      {phase === 'input' && (
        <div className="import-body">
          <p className="muted small">
            지금까지 쓴 자기소개서·이력서를 넣으면 AI가 <b>경험(STAR) · 스펙 · 희망 직무 · 과거 자소서 답변</b>을 뽑아 채워요. 뽑은 학력·직무로{' '}
            <b>맞춤 공고 조건</b>도 자동으로 잡혀요. 파일은 txt · md · docx. 한글(hwp)·PDF는 내용을 복사해서 붙여넣어 주세요.
          </p>
          <div className="btn-row">
            <button type="button" className="btn" onClick={pickFiles}>
              <FolderOpen size={16} /> 파일 선택 (여러 개 가능)
            </button>
          </div>
          {docs.length > 0 && (
            <ul className="import-docs">
              {docs.map((d) => (
                <li key={d.id}>
                  <FileText size={14} /> <span className="import-doc-name">{d.name}</span>
                  <span className="muted small">{d.text.length.toLocaleString()}자</span>
                  <button type="button" className="icon-btn" aria-label="빼기" onClick={() => setDocs((x) => x.filter((y) => y.id !== d.id))}>
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="field">
            <label className="field-label" htmlFor="import-paste">
              또는 여기에 붙여넣기
            </label>
            <textarea
              id="import-paste"
              rows={8}
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder={'자소서 전체를 그대로 붙여넣으세요. 문항과 답변이 섞여 있어도 돼요.\n여러 편이면 [목록에 추가]를 누르고 다음 글을 붙여넣으세요.'}
            />
            {paste.trim() && (
              <div className="btn-row">
                <button type="button" className="btn small" onClick={addPaste}>
                  목록에 추가
                </button>
              </div>
            )}
          </div>
          <p className="muted small">
            이름·연락처·주소는 저장하지 않아요. 글은 이 컴퓨터의 {provider === 'claude' ? 'Claude Code' : provider === 'gpt' ? 'Codex CLI' : 'Antigravity CLI'}로만 보내고 인터넷 서버에 따로 올리지
            않아요. 긴 글은 조각으로 나눠 여러 번 보내서 시간이 좀 걸려요(한 편당 30초~1분).
          </p>
        </div>
      )}

      {phase === 'running' && (
        <div className="import-body">
          <div className="ai-running">
            <LoaderCircle size={16} className="spin" />
            <span>
              AI가 읽는 중… {progress.name} ({progress.done}/{progress.total})
            </span>
          </div>
          <p className="muted small">창을 닫지 마세요. 다른 화면으로 가도 되지만 이 창을 닫으면 중단돼요.</p>
        </div>
      )}

      {phase === 'preview' && plan && (
        <div className="import-body">
          <p>
            <Wand2 size={16} /> 이렇게 채울게요. 필요 없는 묶음은 체크를 끄세요.
          </p>
          <ul className="import-plan">
            <PlanRow
              on={include.experiences}
              onToggle={(v) => setInclude({ ...include, experiences: v })}
              title={`경험 ${plan.experiences.length}개`}
              sub={plan.experiences.map((e) => e.title).join(' · ')}
              skipped={plan.skipped.experiences}
            />
            <PlanRow
              on={include.specs}
              onToggle={(v) => setInclude({ ...include, specs: v })}
              title={`스펙 ${plan.specs.length}개`}
              sub={plan.specs.map((s) => Object.values(s.data)[0]).join(' · ')}
              skipped={plan.skipped.specs}
            />
            <PlanRow
              on={include.projects}
              onToggle={(v) => setInclude({ ...include, projects: v })}
              title={`과거 자소서 ${plan.projects.length}편 (제출완료로 보관 → '다른 답변'에서 재활용)`}
              sub={plan.projects.map((p) => `${p.company} ${p.position}`.trim()).join(' · ')}
              skipped={plan.skipped.projects}
            />
            <PlanRow
              on={include.profile}
              onToggle={(v) => setInclude({ ...include, profile: v })}
              title="기본 정보"
              sub={
                Object.keys(plan.profile).length
                  ? [plan.profile.name && `이름: ${plan.profile.name}`, plan.profile.targetJob && `희망 직무: ${plan.profile.targetJob}`, plan.profile.skills && `스킬: ${plan.profile.skills}`]
                      .filter(Boolean)
                      .join(' · ')
                  : '이미 채워져 있어 바꾸지 않아요'
              }
            />
          </ul>
          {(() => {
            const q = suggestJobQuery(data, plan)
            return q.keywords ? (
              <p className="import-jobs">
                맞춤 공고 조건 → 키워드 <b>{q.keywords}</b> · {q.career}
              </p>
            ) : (
              <p className="muted small">맞춤 공고 조건을 잡을 학력·직무 정보를 못 찾았어요. 맞춤 공고 화면에서 직접 입력하세요.</p>
            )
          })()}
          {errors.length > 0 && <p className="ai-error">{errors.join('\n')}</p>}
        </div>
      )}
    </Modal>
  )
}

function PlanRow({ on, onToggle, title, sub, skipped }: { on: boolean; onToggle: (v: boolean) => void; title: string; sub: string; skipped?: number }) {
  return (
    <li className={on ? '' : 'off'}>
      <label>
        <input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)} />
        <span>
          <strong>{title}</strong>
          {skipped ? <span className="muted small"> · 이미 있는 {skipped}개는 건너뜀</span> : null}
          <span className="import-sub">{sub || '없음'}</span>
        </span>
      </label>
    </li>
  )
}
