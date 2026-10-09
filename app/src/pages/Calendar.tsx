import { Bookmark, ChevronLeft, ChevronRight, FileText } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { STATUS } from '../constants'
import { useStore } from '../store'
import { toDateInput } from '../utils'

interface CalEntry {
  key: string
  date: string
  label: string
  sub: string
  to: string
  kind: 'writing' | 'done' | 'job'
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

/** 마감 달력: 자소서 마감일과 저장한 공고 마감일을 한 달 단위로 */
export function Calendar() {
  const { data } = useStore()
  const [today] = useState(() => toDateInput(new Date()))
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })

  const byDate = useMemo(() => {
    const list: CalEntry[] = []
    for (const p of data.projects) {
      if (!p.deadline) continue
      list.push({
        key: `p-${p.id}`,
        date: p.deadline,
        label: p.company || '이름 없는 자소서',
        sub: [p.deadlineTime, p.status === 'writing' ? '' : STATUS[p.status].label].filter(Boolean).join(' · '),
        to: `/projects/${p.id}`,
        kind: p.status === 'writing' ? 'writing' : 'done',
      })
    }
    // 자소서를 이미 시작한 공고는 자소서로 보이므로 빼고, 저장한 공고만 올린다
    for (const j of data.jobs) {
      if (!j.saved || !j.deadline || j.status === 'hidden' || j.status === 'started' || j.closed) continue
      list.push({ key: `j-${j.id}`, date: j.deadline, label: j.company || j.title, sub: '저장한 공고', to: '/jobs/saved', kind: 'job' })
    }
    const map = new Map<string, CalEntry[]>()
    for (const e of list) map.set(e.date, [...(map.get(e.date) ?? []), e])
    return map
  }, [data.projects, data.jobs])

  // 달의 첫 주 일요일부터 6주
  const start = new Date(month)
  start.setDate(1 - month.getDay())
  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
  const shift = (n: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1))
  const monthKey = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`
  const thisMonth = [...byDate.entries()].filter(([d]) => d.startsWith(monthKey)).flatMap(([, es]) => es)
  const upcoming = thisMonth.filter((e) => e.date >= today && e.kind !== 'done').length

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>마감 달력</h1>
          <p className="muted">자소서 마감일과 저장한 공고의 마감일을 한눈에 봐요. 날짜를 누르면 그 자소서 · 공고로 가요.</p>
        </div>
      </header>

      <div className="cal-bar">
        <div className="cal-nav">
          <button type="button" className="icon-btn" onClick={() => shift(-1)} aria-label="이전 달">
            <ChevronLeft size={18} />
          </button>
          <strong>
            {month.getFullYear()}년 {month.getMonth() + 1}월
          </strong>
          <button type="button" className="icon-btn" onClick={() => shift(1)} aria-label="다음 달">
            <ChevronRight size={18} />
          </button>
          <button
            type="button"
            className="btn small ghost"
            onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
          >
            오늘
          </button>
        </div>
        <div className="cal-legend muted small">
          <span>
            <i className="cal-dot writing" /> 작성 중 자소서
          </span>
          <span>
            <i className="cal-dot done" /> 제출 · 결과
          </span>
          <span>
            <i className="cal-dot job" /> 저장한 공고
          </span>
          <span>이번 달 남은 마감 {upcoming}개</span>
        </div>
      </div>

      <div className="cal-grid card" role="grid" aria-label={`${month.getFullYear()}년 ${month.getMonth() + 1}월 마감 달력`}>
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={'cal-weekday' + (i === 0 ? ' sun' : i === 6 ? ' sat' : '')}>
            {w}
          </div>
        ))}
        {days.map((d) => {
          const key = toDateInput(d)
          const entries = byDate.get(key) ?? []
          const other = d.getMonth() !== month.getMonth()
          const cls = ['cal-day', other && 'other', key === today && 'today', key < today && 'past', d.getDay() === 0 && 'sun']
            .filter(Boolean)
            .join(' ')
          return (
            <div key={key} className={cls} role="gridcell" aria-label={`${d.getMonth() + 1}월 ${d.getDate()}일 마감 ${entries.length}개`}>
              <span className="cal-date">{d.getDate()}</span>
              <div className="cal-entries">
                {entries.slice(0, 3).map((e) => (
                  <Link key={e.key} to={e.to} className={`cal-entry ${e.kind}`} title={[e.label, e.sub].filter(Boolean).join(' · ')}>
                    {e.kind === 'job' ? <Bookmark size={11} /> : <FileText size={11} />}
                    <span>{e.label}</span>
                  </Link>
                ))}
                {entries.length > 3 && <span className="cal-more">+{entries.length - 3}</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
