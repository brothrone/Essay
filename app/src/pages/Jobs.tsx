import { Bookmark, EyeOff, ExternalLink, LoaderCircle, PenLine, Radar, Search, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Dday, Empty } from '../components/ui'
import { useJobSearch, type DroppedJob } from '../jobSearch'
import { isActive, taskFor, useElapsed, usePostingReader, type PostingTask } from '../postingReader'
import { postingRequest } from '../aiRun'
import { newProject, newQuestion, useStore } from '../store'
import { toast } from '../toast'
import type { JobPosting, JobQuery, JobStatus } from '../types'
import { daysUntil, fmtDate, fmtRelative } from '../utils'

type Tab = 'new' | 'started' | 'hidden'
const TABS: { key: Tab; label: string }[] = [
  { key: 'new', label: '새 공고' },
  { key: 'started', label: '자소서 시작' },
  { key: 'hidden', label: '숨김' },
]

/** 사이드바 [저장된 공고] */
export function SavedJobs() {
  return <Jobs mode="saved" />
}

/**
 * 맞춤 공고 (mode='search'): AI로 찾기 + 새 공고 · 자소서 시작 · 숨김
 * 저장된 공고 (mode='saved'): 저장한 공고만 마감이 가까운 순으로
 */
export function Jobs({ mode = 'search' }: { mode?: 'search' | 'saved' }) {
  const { data, updateJob, addProject } = useStore()
  const navigate = useNavigate()
  const reader = usePostingReader()
  const [tab, setTab] = useState<Tab>('new')

  const lists = useMemo(() => {
    const by = (s: JobStatus) => data.jobs.filter((j) => j.status === s)
    const sortNew = (a: JobPosting, b: JobPosting) => b.matchScore - a.matchScore || b.foundAt - a.foundAt
    const byDeadline = (a: JobPosting, b: JobPosting) => (a.deadline || '9999').localeCompare(b.deadline || '9999')
    const saved = data.jobs.filter((j) => j.saved && j.status !== 'hidden')
    const isOver = (j: JobPosting) => (daysUntil(j.deadline) ?? 0) < 0
    return {
      new: by('new')
        .filter((j) => !isOver(j))
        .sort(sortNew),
      started: by('started').sort((a, b) => b.foundAt - a.foundAt),
      hidden: by('hidden').sort((a, b) => b.foundAt - a.foundAt),
      savedOpen: saved.filter((j) => !isOver(j)).sort(byDeadline),
      savedOver: saved.filter(isOver).sort(byDeadline).reverse(),
    }
  }, [data.jobs])

  // 자소서는 바로 만들고, AI가 뒤에서 공고를 읽어 문항 · 공고 내용 · 마감일을 채운다.
  // 공고 한 건을 가리키는 주소면 그 페이지를, 사이트 첫 화면뿐이면 회사명 · 공고 제목으로 찾아 읽는다.
  // 읽는 동안 다른 화면으로 옮겨도 끊기지 않는다 (앱 전체에서 관리)
  const start = async (job: JobPosting) => {
    const req = await postingRequest(job.url, job.company, job.title)
    const notes = [job.summary, job.matchReason && `내게 맞는 이유: ${job.matchReason}`, job.source && `출처: ${job.source}`]
      .filter(Boolean)
      .join('\n\n')
    const p = newProject({
      company: job.company,
      position: job.title,
      deadline: job.deadline,
      jobUrl: req.url,
      notes,
      questions: [newQuestion()],
    })
    addProject(p)
    updateJob(job.id, { status: 'started', projectId: p.id, deadline: p.deadline, ...(req.url ? { url: req.url } : {}) })
    if (job.company || req.url) {
      reader.start(p.id, { prompt: req.prompt, kind: req.kind, mode: 'new', projectId: p.id, label: job.company })
      toast('AI가 공고를 읽어 자소서 문항을 채우는 중이에요. 다른 화면으로 가도 계속돼요')
    }
    navigate(`/projects/${p.id}`)
  }

  // 저장해도 새 공고 목록에서 사라지지 않고 버튼만 '저장됨'으로 채워진다
  const toggleSave = (job: JobPosting) => {
    updateJob(job.id, { saved: !job.saved })
    toast(job.saved ? '저장을 풀었어요' : '저장했어요. 왼쪽 [저장된 공고]에서 모아 볼 수 있어요')
  }

  const card = (job: JobPosting) => (
    <JobCard
      key={job.id}
      job={job}
      reading={job.projectId ? taskFor(reader.tasks, job.projectId) : undefined}
      onStart={() => start(job)}
      onCancel={(key) => reader.cancel(key)}
      onToggleSave={() => toggleSave(job)}
      onStatus={(status) => updateJob(job.id, { status })}
    />
  )

  if (mode === 'saved') {
    const count = lists.savedOpen.length + lists.savedOver.length
    return (
      <div className="page">
        <header className="page-head">
          <div>
            <h1>저장된 공고</h1>
            <p className="muted">맞춤 공고에서 저장한 공고를 마감이 가까운 순으로 모았어요.</p>
          </div>
        </header>
        {count ? (
          <>
            {lists.savedOpen.length > 0 && <div className="job-grid">{lists.savedOpen.map(card)}</div>}
            {lists.savedOver.length > 0 && (
              <>
                <h3 className="section-title">마감된 공고 {lists.savedOver.length}</h3>
                <div className="job-grid dim">{lists.savedOver.map(card)}</div>
              </>
            )}
          </>
        ) : (
          <Empty
            icon={<Bookmark size={28} />}
            title="저장한 공고가 없어요"
            desc="맞춤 공고에서 마음에 드는 공고의 [저장]을 누르면 여기에 모여요"
            action={
              <Link className="btn" to="/jobs">
                <Radar size={16} /> 맞춤 공고로 가기
              </Link>
            }
          />
        )}
      </div>
    )
  }

  const shown = lists[tab]
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>맞춤 공고</h1>
          <p className="muted">내 스펙과 경험을 바탕으로 AI가 지금 접수 중인 공고를 웹에서 찾아 골라 줘요</p>
        </div>
      </header>

      <JobSearchForm onSearched={() => setTab('new')} />

      <div className="toolbar">
        <div className="chips">
          {TABS.map((t) => (
            <button
              type="button"
              key={t.key}
              className={'chip' + (tab === t.key ? ' on' : '')}
              onClick={() => setTab(t.key)}
            >
              {t.label} <b>{lists[t.key].length}</b>
            </button>
          ))}
        </div>
        {lists.savedOpen.length > 0 && (
          <Link className="link-more" to="/jobs/saved">
            <Bookmark size={14} /> 저장된 공고 {lists.savedOpen.length}
          </Link>
        )}
      </div>

      {shown.length ? (
        <div className="job-grid">{shown.map(card)}</div>
      ) : (
        <Empty
          icon={<Radar size={28} />}
          title={tab === 'new' ? '아직 찾은 공고가 없어요' : '여기에 표시할 공고가 없어요'}
          desc={tab === 'new' ? '조건을 확인하고 [AI로 찾기]를 눌러 보세요' : undefined}
        />
      )}
    </div>
  )
}

function JobSearchForm({ onSearched }: { onSearched: () => void }) {
  const { data } = useStore()
  const search = useJobSearch()
  const [elapsed, setElapsed] = useState(0)

  // 다른 화면에 다녀와도 시작 시각 기준으로 경과 시간을 이어서 보여 준다
  useEffect(() => {
    if (!search.running) return
    const tick = () => setElapsed(Math.floor((Date.now() - search.startedAt) / 1000))
    tick()
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  }, [search.running, search.startedAt])

  const defaults: JobQuery = {
    ...data.jobQuery,
    keywords:
      data.jobQuery.keywords ||
      [data.profile.targetJob, data.specs.find((s) => s.category === 'education')?.data.major].filter(Boolean).join(', '),
  }
  const [query, setQuery] = useState<JobQuery>(defaults)
  const lastFound = data.jobs.reduce((t, j) => Math.max(t, j.foundAt), 0)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    onSearched() // 결과는 '새 공고' 탭에 쌓인다
    search.start(query)
  }

  return (
    <form className="card job-search" onSubmit={submit}>
      <div className="job-search-fields">
        <div className="field grow">
          <label className="field-label" htmlFor="jq-k">
            키워드
          </label>
          <input
            id="jq-k"
            value={query.keywords}
            onChange={(e) => setQuery({ ...query, keywords: e.target.value })}
            placeholder="예: 항공우주, 기계 설계, 품질"
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="jq-c">
            경력 구분
          </label>
          <select id="jq-c" value={query.career} onChange={(e) => setQuery({ ...query, career: e.target.value })}>
            {['신입', '인턴', '신입·인턴', '경력 무관'].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="jq-r">
            지역
          </label>
          <input id="jq-r" value={query.region} onChange={(e) => setQuery({ ...query, region: e.target.value })} placeholder="무관" />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="jq-n">
            최대 개수
          </label>
          <select id="jq-n" value={query.count} onChange={(e) => setQuery({ ...query, count: Number(e.target.value) })}>
            {[5, 8, 12].map((n) => (
              <option key={n} value={n}>
                {n}개
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn primary" disabled={search.running}>
          <Sparkles size={16} /> AI로 찾기
        </button>
      </div>
      {!search.running && (
        <p className="muted small">
          AI가 사람인 · 잡코리아 · 원티드 · 잡알리오 등을 검색한 뒤, 찾은 공고 페이지를 직접 열어 지금 접수 중인 것만 남겨요. 조건에 맞는 확실한
          공고가 적으면 고른 개수보다 적게 나와요. 구독 사용량에서 차감되고, 이름 · 연락처는 보내지 않아요.
          {lastFound > 0 && ` · 마지막으로 찾은 때: ${fmtRelative(lastFound)}`}
        </p>
      )}
      {!search.running && search.lastAdded !== null && (
        <p className="import-ok">
          확인된 공고 {search.lastAdded}개를 새로 더했어요
        </p>
      )}
      {!search.running && <DroppedList list={search.lastDroppedList} added={search.lastAdded ?? 0} />}
      {search.running && (
        <div className="job-progress">
          <div className="ai-running">
            <LoaderCircle size={16} className="spin" />
            <span>공고를 찾는 중… {elapsed}초</span>
            <button type="button" className="btn ghost small" onClick={search.cancel}>
              취소
            </button>
          </div>
          <ul className="job-steps">
            {search.steps.length ? search.steps.map((s, i) => <li key={i}>{s}</li>) : <li>검색 계획을 세우는 중…</li>}
          </ul>
        </div>
      )}
      {search.error && !search.running && <p className="ai-error">{search.error}</p>}
    </form>
  )
}

/** 맞춤 공고 찾기에서 목록에 넣지 않은 공고: 직접 확인해 볼 만한 것과 뺀 이유가 분명한 것을 나눠 보여 준다 */
function DroppedList({ list, added }: { list: DroppedJob[]; added: number }) {
  const check = list.filter((d) => d.kind === 'check')
  const out = list.filter((d) => d.kind !== 'check')
  const row = (d: DroppedJob, i: number) => (
    <li key={i}>
      <span className="dropped-name">
        <b>{d.company || '회사 미확인'}</b> {d.title}
      </span>
      <span className="muted small">{d.reason}</span>
      {d.url && (
        <a className="link-btn" href={d.url} target="_blank" rel="noreferrer">
          공고 열기
        </a>
      )}
    </li>
  )
  return (
    <>
      {check.length > 0 && (
        <details className="dropped-list" open={added === 0}>
          <summary>마감 여부를 확인하지 못한 공고 {check.length}개 · 직접 확인해 보세요</summary>
          <ul>{check.map(row)}</ul>
        </details>
      )}
      {out.length > 0 && (
        <details className="dropped-list">
          <summary>마감 · 중복 등으로 뺀 공고 {out.length}개</summary>
          <ul>{out.map(row)}</ul>
        </details>
      )}
    </>
  )
}

function JobCard({
  job,
  reading,
  onStart,
  onCancel,
  onToggleSave,
  onStatus,
}: {
  job: JobPosting
  reading: PostingTask | undefined
  onStart: () => void
  onCancel: (key: string) => void
  onToggleSave: () => void
  onStatus: (s: JobStatus) => void
}) {
  const elapsed = useElapsed(reading)
  const tone = job.matchScore >= 80 ? 'green' : job.matchScore >= 60 ? 'blue' : 'gray'
  return (
    <article className={'job-card' + (job.saved ? ' is-saved' : '')}>
      <div className="job-card-top">
        <div className="job-titles">
          <span className="job-company">{job.company || '회사 미확인'}</span>
          <strong className="job-title">{job.title || '직무 미확인'}</strong>
        </div>
        <span className={`job-score tone-${tone}`} title="내 스펙·경험과 맞는 정도">
          {job.matchScore}
        </span>
      </div>
      <div className="tag-row">
        {job.deadline ? <Dday date={job.deadline} /> : <span className="badge tone-gray">상시 · 마감일 미정</span>}
        {job.deadline && <span className="muted small">{fmtDate(job.deadline)}</span>}
        {job.kind && <span className="badge tone-violet">{job.kind}</span>}
        {job.location && <span className="badge tone-gray">{job.location}</span>}
        {job.source && <span className="muted small">{job.source}</span>}
      </div>
      {job.summary && <p className="job-summary">{job.summary}</p>}
      {job.matchReason && (
        <p className="job-reason">
          <Search size={13} /> {job.matchReason}
        </p>
      )}
      {isActive(reading) && (
        <div className="ai-running">
          <LoaderCircle size={16} className="spin" />
          <span>
            {reading!.status === 'waiting' ? '다른 AI 작업이 끝나면 공고를 읽어요' : '공고를 읽어 문항을 채우는 중…'} {elapsed}초
            {reading!.status === 'running' && reading!.steps.at(-1) && ` · ${reading!.steps.at(-1)}`}
          </span>
          <button type="button" className="btn ghost small" onClick={() => onCancel(reading!.key)}>
            취소
          </button>
        </div>
      )}
      <div className="job-actions">
        {job.status === 'started' && job.projectId ? (
          <Link className="btn primary small" to={`/projects/${job.projectId}`}>
            <PenLine size={14} /> 자소서로 이동
          </Link>
        ) : (
          <button
            type="button"
            className="btn primary small"
            title={job.url ? '바로 자소서를 만들고, AI가 뒤에서 공고를 읽어 문항을 채워요' : undefined}
            onClick={onStart}
          >
            <PenLine size={14} /> 자소서 시작
          </button>
        )}
        {job.url && (
          <a className="btn small" href={job.url} target="_blank" rel="noreferrer">
            <ExternalLink size={14} /> 공고 열기
          </a>
        )}
        {job.status !== 'hidden' && (
          <button
            type="button"
            className={'btn small ' + (job.saved ? 'save-on' : 'ghost')}
            aria-pressed={job.saved}
            title={job.saved ? '저장을 풀어요' : '[저장된 공고]에 모아 둬요'}
            onClick={onToggleSave}
          >
            <Bookmark size={14} fill={job.saved ? 'currentColor' : 'none'} /> {job.saved ? '저장됨' : '저장'}
          </button>
        )}
        {job.status === 'new' && (
          <button type="button" className="btn ghost small" onClick={() => onStatus('hidden')}>
            <EyeOff size={14} /> 숨기기
          </button>
        )}
        {job.status === 'hidden' && (
          <button type="button" className="btn ghost small" onClick={() => onStatus('new')}>
            다시 보기
          </button>
        )}
      </div>
    </article>
  )
}
