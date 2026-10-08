import { FileText, Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useLayout } from '../layoutContext'
import { Dday, Empty, Progress, StatusSelect } from '../components/ui'
import { STATUS, STATUS_ORDER } from '../constants'
import { useStore } from '../store'
import type { ProjectStatus } from '../types'
import { fmtDate, fmtRelative, includesText } from '../utils'

type Sort = 'deadline' | 'updated' | 'created'

export function Projects() {
  const { data, updateProject } = useStore()
  const { openNew } = useLayout()
  const [params, setParams] = useSearchParams()
  const status = params.get('status') as ProjectStatus | null
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('deadline')

  const list = useMemo(() => {
    const filtered = data.projects.filter(
      (p) =>
        (!status || p.status === status) &&
        includesText([p.company, p.position, ...p.questions.map((q) => q.prompt)], query),
    )
    return filtered.sort((a, b) => {
      if (sort === 'updated') return b.updatedAt - a.updatedAt
      if (sort === 'created') return b.createdAt - a.createdAt
      return (a.deadline || '9999').localeCompare(b.deadline || '9999') || b.updatedAt - a.updatedAt
    })
  }, [data.projects, status, query, sort])

  const setStatus = (s: ProjectStatus | null) => setParams(s ? { status: s } : {}, { replace: true })

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>자소서 프로젝트</h1>
          <p className="muted">공고별로 문항과 답변, 진행 상태를 관리해요</p>
        </div>
        <button type="button" className="btn primary" onClick={openNew}>
          <Plus size={16} /> 새 자소서
        </button>
      </header>

      <div className="toolbar">
        <div className="chips">
          <button type="button" className={'chip' + (!status ? ' on' : '')} onClick={() => setStatus(null)}>
            전체 <b>{data.projects.length}</b>
          </button>
          {STATUS_ORDER.map((s) => (
            <button
              type="button"
              key={s}
              className={'chip' + (status === s ? ' on' : '')}
              onClick={() => setStatus(status === s ? null : s)}
            >
              {STATUS[s].label} <b>{data.projects.filter((p) => p.status === s).length}</b>
            </button>
          ))}
        </div>
        <div className="toolbar-right">
          <label className="search">
            <Search size={16} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="회사, 직무, 문항 검색" />
          </label>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="정렬">
            <option value="deadline">마감 임박순</option>
            <option value="updated">최근 수정순</option>
            <option value="created">최근 생성순</option>
          </select>
        </div>
      </div>

      {list.length ? (
        <div className="table-card">
          <table className="project-table">
            <thead>
              <tr>
                <th>회사 · 직무</th>
                <th>마감</th>
                <th>진행</th>
                <th>상태</th>
                <th>수정</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link to={`/projects/${p.id}`} className="row-link">
                      <strong>{p.company || '이름 없는 자소서'}</strong>
                      <span>{p.position || '직무 미정'}</span>
                    </Link>
                  </td>
                  <td>
                    <div className="deadline-cell">
                      {p.deadline ? (
                        <>
                          <Dday date={p.deadline} muted={p.status !== 'writing'} />
                          <span>{fmtDate(p.deadline)}</span>
                        </>
                      ) : (
                        <span className="muted">미정</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <Progress value={p.questions.filter((q) => q.done).length} max={p.questions.length} />
                  </td>
                  <td>
                    <StatusSelect
                      value={p.status}
                      onChange={(s) => updateProject(p.id, (x) => ({ ...x, status: s }))}
                    />
                  </td>
                  <td className="muted small">{fmtRelative(p.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          icon={<FileText size={28} />}
          title={data.projects.length ? '조건에 맞는 자소서가 없어요' : '아직 자소서가 없어요'}
          desc={data.projects.length ? '검색어나 필터를 바꿔 보세요' : '지원할 공고를 등록하고 문항별로 답변을 작성해 보세요'}
          action={
            !data.projects.length && (
              <button type="button" className="btn primary" onClick={openNew}>
                <Plus size={16} /> 새 자소서 시작하기
              </button>
            )
          }
        />
      )}
    </div>
  )
}
