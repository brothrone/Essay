import { Briefcase, Building2, ExternalLink, ListChecks, LoaderCircle, RotateCcw, ShieldCheck, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { runWebTask } from '../aiRun'
import { track } from '../community'
import { desktop, type Insight } from '../desktop'
import { isHttpUrl } from '../format'
import { insightPrompt, parseInsight } from '../prompts'
import { useStore } from '../store'
import type { InsightKind, Project, SavedInsight } from '../types'
import { fmtDate, toDateInput } from '../utils'

const KINDS: { key: InsightKind; label: string; icon: typeof Briefcase }[] = [
  { key: 'job', label: '직무', icon: Briefcase },
  { key: 'company', label: '기업', icon: Building2 },
  { key: 'questions', label: '문항', icon: ListChecks },
]

type ServerInsights = Partial<Record<InsightKind, Insight | null>>

/**
 * 분석 탭: 직무 · 기업 · 문항 분석.
 * 서버에 공개된 분석(개발자가 공식 자료로 만들고 확인한 것)이 있으면 그걸, 없으면 내 AI 로 만든 것을 보여 준다
 */
export function InsightPanel({ project, onPatch }: { project: Project; onPatch: (p: Partial<Project>) => void }) {
  const { data } = useStore()
  const [kind, setKind] = useState<InsightKind>('job')
  const [server, setServer] = useState<ServerInsights>({})
  const [running, setRunning] = useState<InsightKind | null>(null)
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState('')

  // 서버의 공개 분석: 공고 주소로 공고 모음 번호를 찾아(문항 분석용) 회사 · 직무와 함께 묻는다
  const company = project.company.trim()
  const position = project.position.trim()
  const jobUrl = project.jobUrl.trim()
  useEffect(() => {
    let alive = true
    setServer({})
    if (company.length < 2) return
    ;(async () => {
      const hit = isHttpUrl(jobUrl) ? await desktop.community.lookupPosting(jobUrl).catch(() => null) : null
      const r = await desktop.community.insights({ company, position, postingId: hit?.posting?.id }).catch(() => null)
      if (alive && r?.ok) setServer({ job: r.job, company: r.company, questions: r.questions })
    })()
    return () => {
      alive = false
    }
  }, [company, position, jobUrl])

  useEffect(() => {
    if (!running) return
    const t0 = Date.now()
    setSeconds(0)
    const id = setInterval(() => setSeconds(Math.round((Date.now() - t0) / 1000)), 1000)
    return () => clearInterval(id)
  }, [running])

  const run = async (k: InsightKind) => {
    if (running) return
    setError('')
    setRunning(k)
    const r = await runWebTask(insightPrompt(k, data, project), { web: k !== 'questions' })
    setRunning(null)
    if (!r.ok) {
      if (!r.cancelled) setError(r.error)
      return
    }
    const ins = parseInsight(r.text)
    if (!ins) {
      setError('분석 결과를 읽지 못했어요. 다시 시도해 주세요.')
      return
    }
    track(`insight_${k}`)
    onPatch({ insights: { ...project.insights, [k]: { ...ins, at: Date.now() } } })
  }

  const fromServer = server[kind]
  const mine = project.insights?.[kind]
  const shown: Insight | SavedInsight | null | undefined = fromServer || mine
  const needs = kind === 'questions' ? project.questions.some((q) => q.prompt.trim()) : company.length >= 2

  return (
    <div className="insight">
      <div className="insight-tabs segmented" role="tablist" aria-label="분석 종류">
        {KINDS.map(({ key, label, icon: Icon }) => (
          <button key={key} type="button" role="tab" aria-selected={kind === key} className={kind === key ? 'on' : ''} onClick={() => setKind(key)}>
            <Icon size={14} /> {label}
            {(server[key] || project.insights?.[key]) && <i className="insight-dot" aria-label="분석 있음" />}
          </button>
        ))}
      </div>

      {shown ? (
        <>
          <InsightView insight={shown} />
          <footer className="insight-foot">
            {fromServer ? (
              <span title="Essay 가 공식 자료로 만들고 확인한 분석">
                <ShieldCheck size={13} /> Essay 확인{shown.basis ? ` · ${shown.basis}` : ''}
              </span>
            ) : (
              <span>
                <Sparkles size={13} /> 내 AI · {fmtDate(toDateInput(new Date((mine as SavedInsight).at)))}
              </span>
            )}
            {!fromServer && (
              <button type="button" className="icon-btn" onClick={() => run(kind)} disabled={!!running} aria-label="다시 분석" title="다시 분석">
                {running === kind ? <LoaderCircle size={15} className="spin" /> : <RotateCcw size={15} />}
              </button>
            )}
          </footer>
        </>
      ) : running === kind ? (
        <div className="insight-empty">
          <LoaderCircle size={22} className="spin" />
          <p>분석하는 중 · {seconds}초</p>
        </div>
      ) : (
        <div className="insight-empty">
          <button type="button" className="btn primary" disabled={!needs || !!running} onClick={() => run(kind)}>
            <Sparkles size={15} /> 내 AI로 {KINDS.find((x) => x.key === kind)!.label} 분석
          </button>
          {!needs && <p className="muted small">{kind === 'questions' ? '문항을 먼저 넣어 주세요' : '회사 이름을 먼저 넣어 주세요'}</p>}
        </div>
      )}
      {error && <p className="ai-error">{error}</p>}
    </div>
  )
}

/** 분석 내용: 한 줄 요약 · 묶음(문장 · 목록 · 표) · 출처 */
export function InsightView({ insight }: { insight: Insight | SavedInsight }) {
  return (
    <div className="insight-view">
      {insight.summary && <p className="insight-summary">{insight.summary}</p>}
      {insight.sections.map((s, i) => (
        <section key={i} className="insight-sec">
          <h4>{s.title}</h4>
          {s.text && <p>{s.text}</p>}
          {s.items && (
            <ul>
              {s.items.map((x, j) => (
                <li key={j}>{x}</li>
              ))}
            </ul>
          )}
          {s.table && (
            <div className="insight-table">
              <table>
                <thead>
                  <tr>
                    {s.table.head.map((h, j) => (
                      <th key={j}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {s.table.rows.map((r, j) => (
                    <tr key={j}>
                      {r.map((c, k) => (
                        <td key={k}>{c}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
      {insight.sources.length > 0 && (
        <p className="insight-sources">
          {insight.sources.map((s, i) => (
            <a key={i} href={s.url} target="_blank" rel="noreferrer" title={s.url}>
              <ExternalLink size={11} /> {s.title}
            </a>
          ))}
        </p>
      )}
    </div>
  )
}
