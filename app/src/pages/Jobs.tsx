import { Bookmark, BookmarkCheck, EyeOff, ExternalLink, LoaderCircle, PenLine, Radar, Search, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Dday, Empty } from '../components/ui'
import { useJobSearch } from '../jobSearch'
import { parsePosting, postingPrompt, type PostingInfo } from '../prompts'
import { newProject, newQuestion, useStore } from '../store'
import { toast } from '../toast'
import type { JobPosting, JobQuery, JobStatus } from '../types'
import { useAiTask } from '../useAiTask'
import { daysUntil, fmtDate, fmtRelative, todayStr } from '../utils'

type Tab = 'new' | 'saved' | 'started' | 'hidden'
const TABS: { key: Tab; label: string }[] = [
  { key: 'new', label: '새 공고' },
  { key: 'saved', label: '저장' },
  { key: 'started', label: '자소서 시작' },
  { key: 'hidden', label: '숨김' },
]

export function Jobs() {
  const { data, updateJob, addProject } = useStore()
  const navigate = useNavigate()
  const search = useJobSearch()
  const [tab, setTab] = useState<Tab>('new')
  const [elapsed, setElapsed] = useState(0)
  const reader = useAiTask()
  const [readingId, setReadingId] = useState<string | null>(null)

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

  const lists = useMemo(() => {
    const by = (s: JobStatus) => data.jobs.filter((j) => j.status === s)
    const sortNew = (a: JobPosting, b: JobPosting) => b.matchScore - a.matchScore || b.foundAt - a.foundAt
    return {
      new: by('new')
        .filter((j) => (daysUntil(j.deadline) ?? 0) >= 0)
        .sort(sortNew),
      saved: by('saved').sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999')),
      started: by('started').sort((a, b) => b.foundAt - a.foundAt),
      hidden: by('hidden').sort((a, b) => b.foundAt - a.foundAt),
    }
  }, [data.jobs])

  const lastFound = data.jobs.reduce((t, j) => Math.max(t, j.foundAt), 0)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTab('new') // 결과는 '새 공고' 탭에 쌓인다
    search.start(query)
  }

  // 공고 링크가 있으면 AI가 공고를 읽어 문항 · 공고 내용 · 마감일까지 채운 뒤 자소서를 만든다
  const start = async (job: JobPosting) => {
    if (reader.running) return
    let info: PostingInfo | null = null
    if (job.url) {
      setReadingId(job.id)
      const r = await reader.run(postingPrompt(job.url, todayStr()), { web: true })
      setReadingId(null)
      if (!r.ok) {
        if (r.cancelled) return
        toast(`공고 내용은 못 불러왔어요 (${r.error.slice(0, 60)}). 자소서의 [공고 정보]에서 '공고 다시 확인'을 눌러 보세요`)
      } else {
        info = parsePosting(r.text)
        if (!info) toast('공고 내용을 읽지 못했어요. [공고 정보]에서 다시 확인할 수 있어요')
      }
    }
    const fromElsewhere = !!info?.questions.length && !!info.questionsSource && info.questionsSource !== '공고 페이지'
    const notes = [
      info?.notes || job.summary,
      fromElsewhere && `자소서 문항 출처: ${info?.questionsSource} — 이번 공고 문항과 같은지 확인하세요`,
      job.matchReason && `내게 맞는 이유: ${job.matchReason}`,
      job.source && `출처: ${job.source}`,
    ]
      .filter(Boolean)
      .join('\n\n')
    const questions = info?.questions.length ? info.questions.map((q) => newQuestion(q)) : [newQuestion()]
    const p = newProject({
      company: job.company || info?.company || '',
      position: job.title || info?.position || '',
      deadline: info?.deadline || job.deadline,
      deadlineTime: info?.deadlineTime || '',
      jobUrl: job.url,
      notes,
      questions,
    })
    addProject(p)
    updateJob(job.id, { status: 'started', projectId: p.id, deadline: p.deadline })
    if (info?.isOpen === false) toast('마감된 공고로 보여요. 마감일을 확인해 주세요')
    else if (info)
      toast(
        info.questions.length
          ? `공고 내용과 자소서 문항 ${info.questions.length}개를 불러왔어요${fromElsewhere ? ` (문항 출처: ${info.questionsSource})` : ''}`
          : '공고 내용을 불러왔어요. 자소서 문항은 찾지 못해서 직접 넣어 주세요',
      )
    navigate(`/projects/${p.id}`)
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
            <input
              id="jq-r"
              value={query.region}
              onChange={(e) => setQuery({ ...query, region: e.target.value })}
              placeholder="무관"
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="jq-n">
              개수
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
            AI 설정에서 고른 Claude 또는 Gemini가 사람인 · 잡코리아 · 원티드 · 잡알리오 등을 검색하고 공고를 직접 열어 마감일을
            확인해요. 1~3분 걸리고 구독 사용량에서 차감돼요. 이름 · 연락처는 보내지 않아요.
            {lastFound > 0 && ` · 마지막으로 찾은 때: ${fmtRelative(lastFound)}`}
          </p>
        )}
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
      </div>

      {shown.length ? (
        <div className="job-grid">
          {shown.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              busy={reader.running || search.running}
              reading={readingId === job.id ? { elapsed: reader.elapsed, step: reader.steps.at(-1) ?? '' } : null}
              onStart={() => start(job)}
              onCancel={reader.cancel}
              onStatus={(status) => updateJob(job.id, { status })}
            />
          ))}
        </div>
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

function JobCard({
  job,
  busy,
  reading,
  onStart,
  onCancel,
  onStatus,
}: {
  job: JobPosting
  busy: boolean
  reading: { elapsed: number; step: string } | null
  onStart: () => void
  onCancel: () => void
  onStatus: (s: JobStatus) => void
}) {
  const tone = job.matchScore >= 80 ? 'green' : job.matchScore >= 60 ? 'blue' : 'gray'
  return (
    <article className="job-card">
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
        {job.deadline ? <Dday date={job.deadline} /> : <span className="badge tone-gray">마감일 미확인</span>}
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
      {reading && (
        <div className="ai-running">
          <LoaderCircle size={16} className="spin" />
          <span>
            공고를 읽어 문항을 채우는 중… {reading.elapsed}초{reading.step && ` · ${reading.step}`}
          </span>
          <button type="button" className="btn ghost small" onClick={onCancel}>
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
            disabled={busy}
            title={job.url ? '공고를 읽어 문항과 내용을 채운 뒤 시작해요' : undefined}
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
        {job.status === 'new' && (
          <button type="button" className="btn ghost small" onClick={() => onStatus('saved')}>
            <Bookmark size={14} /> 저장
          </button>
        )}
        {job.status === 'saved' && (
          <button type="button" className="btn ghost small" onClick={() => onStatus('new')}>
            <BookmarkCheck size={14} /> 저장됨
          </button>
        )}
        {job.status !== 'hidden' && job.status !== 'started' && (
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
