import { AlertTriangle, ArrowRight, ArrowUp, CalendarClock, FileUp, Radar, Sparkles } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { HomeAi } from '../components/AiSetup'
import { openImportDialog } from '../components/ImportModal'
import { Dday, Empty, Progress, StatusBadge } from '../components/ui'
import { useLayout } from '../layoutContext'
import { COMPETENCY_TAGS, STATUS, STATUS_ORDER } from '../constants'
import { languageExpiry } from '../specConfig'
import { isEmptyData, isLiveJob, newProject, useStore } from '../store'
import { daysUntil, fmtDate } from '../utils'

export function Home() {
  const { data, addProject } = useStore()
  const { openNew } = useLayout()
  const navigate = useNavigate()
  const [company, setCompany] = useState('')
  const [position, setPosition] = useState('')

  const start = (e: FormEvent) => {
    e.preventDefault()
    if (!company.trim()) return openNew()
    const p = newProject({ company: company.trim(), position: position.trim() })
    addProject(p)
    navigate(`/projects/${p.id}`)
  }

  const upcoming = useMemo(
    () =>
      data.projects
        .filter((p) => p.status === 'writing')
        .sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999') || b.updatedAt - a.updatedAt)
        .slice(0, 6),
    [data.projects],
  )

  const alerts = useMemo(() => {
    const list: { key: string; text: string; to: string }[] = []
    for (const s of data.specs.filter((s) => s.category === 'language')) {
      const n = daysUntil(languageExpiry(s.data))
      if (n !== null && n <= 90)
        list.push({
          key: s.id,
          text: `${s.data.test} ${s.data.score} 성적이 ${n < 0 ? '만료됐어요' : `${n}일 뒤 만료돼요`}`,
          to: '/specs',
        })
    }
    for (const p of data.projects) {
      const n = daysUntil(p.deadline)
      if (p.status === 'writing' && n !== null && n < 0)
        list.push({ key: p.id, text: `${p.company} 마감이 지났어요. 진행 상태를 바꿔 주세요`, to: `/projects/${p.id}` })
    }
    const incomplete = data.experiences.filter((e) => !e.situation || !e.action || !e.result).length
    if (incomplete) list.push({ key: 'star', text: `STAR가 비어 있는 경험이 ${incomplete}개 있어요`, to: '/experiences' })
    return list
  }, [data])

  const tagCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of data.experiences) for (const t of e.tags) m.set(t, (m.get(t) ?? 0) + 1)
    return m
  }, [data.experiences])

  const topJobs = data.jobs
    .filter((j) => j.status === 'new' && isLiveJob(j))
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 6)

  const totalQ = data.projects.reduce((n, p) => n + p.questions.length, 0)
  const doneQ = data.projects.reduce((n, p) => n + p.questions.filter((q) => q.done).length, 0)

  return (
    <div className="page home">
      <section className="hero">
        <h1>
          오늘은 어떤 <span className="accent">자소서</span>를 준비해 볼까요?
        </h1>
        <form className="quick-start" onSubmit={start}>
          <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="지원할 회사" aria-label="회사명" />
          <span className="divider" />
          <input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="직무" aria-label="직무" />
          <button type="submit" className="send-btn" aria-label="시작하기" disabled={!company.trim()}>
            <ArrowUp size={18} />
          </button>
        </form>
        <div className="hero-actions">
          <button type="button" className="chip-btn" onClick={openNew}>
            공고 링크 · 마감일과 함께 시작하기
          </button>
          <button type="button" className="chip-btn accent-chip" onClick={openImportDialog} title="예전 자소서를 넣으면 경험·스펙·맞춤 공고 조건이 자동으로 채워져요">
            <FileUp size={14} /> 예전 자소서로 한 번에 채우기
          </button>
          {isEmptyData(data) && (
            <Link to="/data" className="chip-btn">
              <Sparkles size={14} /> 예시 데이터로 둘러보기
            </Link>
          )}
        </div>
      </section>

      <HomeAi />

      <div className="dash-grid">
        <section className="card span-2">
          <header className="card-head">
            <h3>
              <CalendarClock size={18} /> 다가오는 마감
            </h3>
            <span className="link-group">
              <Link to="/calendar" className="link-more">
                달력 <ArrowRight size={14} />
              </Link>
              <Link to="/projects" className="link-more">
                전체 보기 <ArrowRight size={14} />
              </Link>
            </span>
          </header>
          {upcoming.length ? (
            <ul className="deadline-list">
              {upcoming.map((p) => (
                <li key={p.id}>
                  <Link to={`/projects/${p.id}`}>
                    <Dday date={p.deadline} />
                    <div className="dl-main">
                      <strong>{p.company || '이름 없는 자소서'}</strong>
                      <span>{p.position}</span>
                    </div>
                    <span className="dl-date">
                      {p.deadline ? `${fmtDate(p.deadline)} ${p.deadlineTime}` : '마감일 미정'}
                    </span>
                    <Progress value={p.questions.filter((q) => q.done).length} max={p.questions.length} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="작성 중인 자소서가 없어요" desc="위에 회사명을 입력하고 바로 시작해 보세요" />
          )}
        </section>

        <section className="card">
          <header className="card-head">
            <h3>지원 현황</h3>
          </header>
          <div className="status-grid">
            {STATUS_ORDER.map((s) => (
              <Link key={s} to={`/projects?status=${s}`} className="status-cell">
                <span className={`dot tone-${STATUS[s].tone}`} />
                <span>{STATUS[s].label}</span>
                <b>{data.projects.filter((p) => p.status === s).length}</b>
              </Link>
            ))}
          </div>
          <div className="mini-stats">
            <div>
              <b>{data.experiences.length}</b>
              <span>정리한 경험</span>
            </div>
            <div>
              <b>{data.specs.length}</b>
              <span>등록한 스펙</span>
            </div>
            <div>
              <b>
                {doneQ}/{totalQ}
              </b>
              <span>완료 문항</span>
            </div>
          </div>
        </section>

        <section className="card">
          <header className="card-head">
            <h3>
              <AlertTriangle size={18} /> 확인할 것
            </h3>
          </header>
          {alerts.length ? (
            <ul className="alert-list">
              {alerts.map((a) => (
                <li key={a.key}>
                  <Link to={a.to}>{a.text}</Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">지금은 챙길 게 없어요 👍</p>
          )}
        </section>

        <section className="card span-2">
          <header className="card-head">
            <h3>
              <Radar size={18} /> 맞춤 공고
            </h3>
            <Link to="/jobs" className="link-more">
              전체 <ArrowRight size={14} />
            </Link>
          </header>
          {topJobs.length ? (
            <ul className="mini-jobs two-col">
              {topJobs.map((j) => (
                <li key={j.id}>
                  <Link to="/jobs">
                    <span className="job-score-mini">{j.matchScore}</span>
                    <span className="mini-job-text">
                      <strong>{j.company}</strong>
                      <span>{j.title}</span>
                    </span>
                    {j.deadline && <Dday date={j.deadline} />}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mini-jobs-empty">
              <p className="muted small">내 스펙에 맞는, 지금 접수 중인 공고를 AI가 찾아 줘요.</p>
              <Link to="/jobs" className="btn small">
                <Sparkles size={14} /> 맞춤 공고 찾기
              </Link>
            </div>
          )}
        </section>

        <section className="card span-2">
          <header className="card-head">
            <h3>역량별 경험</h3>
            <Link to="/experiences" className="link-more">
              경험 관리 <ArrowRight size={14} />
            </Link>
          </header>
          <p className="muted small">자주 나오는 역량 문항에 쓸 경험이 있는지 확인해 보세요. 회색은 아직 경험이 없는 역량이에요.</p>
          <div className="tag-cloud">
            {COMPETENCY_TAGS.map((t) => {
              const n = tagCounts.get(t) ?? 0
              return (
                <Link key={t} to={`/experiences?tag=${encodeURIComponent(t)}`} className={'tag-stat' + (n ? '' : ' zero')}>
                  {t} <b>{n}</b>
                </Link>
              )
            })}
          </div>
        </section>

        <section className="card">
          <header className="card-head">
            <h3>최근 결과</h3>
          </header>
          {data.projects.some((p) => p.status !== 'writing') ? (
            <ul className="result-list">
              {data.projects
                .filter((p) => p.status !== 'writing')
                .sort((a, b) => b.updatedAt - a.updatedAt)
                .slice(0, 5)
                .map((p) => (
                  <li key={p.id}>
                    <Link to={`/projects/${p.id}`}>
                      <StatusBadge status={p.status} />
                      <strong>{p.company}</strong>
                      <span className="muted">{p.position}</span>
                    </Link>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="muted small">제출한 자소서의 결과(서류 · 면접 · 최종)를 자소서 프로젝트에서 바꾸면 여기에 모여요.</p>
          )}
        </section>
      </div>
    </div>
  )
}
