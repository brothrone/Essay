import { Archive, Bookmark, CalendarDays, Database, FileText, GraduationCap, House, Lightbulb, LoaderCircle, Plus, Radar, Settings } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useJobSearch } from '../jobSearch'
import { kbd } from '../platform'
import { useStore } from '../store'

export function Sidebar({ onNew }: { onNew: () => void }) {
  const { data } = useStore()
  const newJobs = data.jobs.filter((j) => j.status === 'new' && !j.saved).length
  const savedJobs = data.jobs.filter((j) => j.saved && j.status !== 'hidden').length
  const jobSearch = useJobSearch()
  const recent = data.projects
    .filter((p) => p.openedAt)
    .sort((a, b) => b.openedAt - a.openedAt)
    .slice(0, 6)

  return (
    <aside className="sidebar">
      <button type="button" className="new-btn" onClick={onNew} title={`새 자소서 (${kbd('N')})`}>
        <span className="new-btn-icon">
          <Plus size={16} />
        </span>
        새로 시작하기
        <kbd>{kbd('N')}</kbd>
      </button>

      <nav className="nav">
        <NavLink to="/" end title={`홈 (${kbd('1')})`}>
          <House size={18} /> 홈
        </NavLink>
        <NavLink to="/projects" title={`자소서 프로젝트 (${kbd('2')})`}>
          <FileText size={18} /> 자소서 프로젝트
          {data.projects.length > 0 && <span className="nav-count">{data.projects.length}</span>}
        </NavLink>
        <NavLink to="/calendar" title={`마감 달력 (${kbd('8')})`}>
          <CalendarDays size={18} /> 마감 달력
        </NavLink>
        <NavLink to="/jobs" end title={`맞춤 공고 (${kbd('3')})`}>
          <Radar size={18} /> 맞춤 공고
          {jobSearch.running ? (
            <span className="nav-count" title="공고를 찾는 중">
              <LoaderCircle size={14} className="spin" />
            </span>
          ) : (
            newJobs > 0 && <span className="nav-count accent">{newJobs}</span>
          )}
        </NavLink>
        <NavLink to="/jobs/saved" className="nav-sub" title="저장한 맞춤 공고">
          <Bookmark size={16} /> 저장된 공고
          {savedJobs > 0 && <span className="nav-count">{savedJobs}</span>}
        </NavLink>
        <NavLink to="/experiences" title={`경험 관리 (${kbd('4')})`}>
          <Lightbulb size={18} /> 경험 관리
          {data.experiences.length > 0 && <span className="nav-count">{data.experiences.length}</span>}
        </NavLink>
        <NavLink to="/specs" title={`스펙 관리 (${kbd('5')})`}>
          <GraduationCap size={18} /> 스펙 관리
        </NavLink>
      </nav>

      <div className="recent">
        <div className="section-label">최근 자소서</div>
        {recent.length ? (
          recent.map((p) => (
            <NavLink key={p.id} to={`/projects/${p.id}`} className="recent-item">
              <span className="recent-company">{p.company || '이름 없는 자소서'}</span>
              {p.position && <span className="recent-position">{p.position}</span>}
            </NavLink>
          ))
        ) : (
          <p className="recent-empty">최근 연 자소서가 여기에 표시돼요</p>
        )}
      </div>

      <div className="sidebar-foot">
        <NavLink to="/backup" title={`백업 (${kbd('6')})`}>
          <Archive size={18} /> 백업
        </NavLink>
        <NavLink to="/data" title={`데이터 (${kbd('7')})`}>
          <Database size={18} /> 데이터
        </NavLink>
        <NavLink to="/settings" title={`설정 (${kbd(',')})`}>
          <Settings size={18} /> 설정
        </NavLink>
      </div>
    </aside>
  )
}
