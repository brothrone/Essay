import { FileText, KanbanSquare, List, Plus, Search } from 'lucide-react'
import { useMemo, useState, type DragEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useLayout } from '../layoutContext'
import { Dday, Empty, Progress, StatusSelect } from '../components/ui'
import { STATUS, STATUS_ORDER } from '../constants'
import { useStore } from '../store'
import type { Project, ProjectStatus } from '../types'
import { fmtDate, fmtRelative, includesText } from '../utils'

type Sort = 'deadline' | 'updated' | 'created'

export function Projects() {
  const { data, updateProject } = useStore()
  const { openNew } = useLayout()
  const [params, setParams] = useSearchParams()
  const status = params.get('status') as ProjectStatus | null
  const view = params.get('view') === 'board' ? 'board' : 'list'
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('deadline')

  const list = useMemo(() => {
    const filtered = data.projects.filter(
      (p) =>
        (!status || p.status === status) &&
        includesText(
          [p.company, p.position, ...p.questions.map((q) => q.prompt)],
          query,
        ),
    )
    return filtered.sort((a, b) => {
      if (sort === 'updated') return b.updatedAt - a.updatedAt
      if (sort === 'created') return b.createdAt - a.createdAt
      return (
        (a.deadline || '9999').localeCompare(b.deadline || '9999') ||
        b.updatedAt - a.updatedAt
      )
    })
  }, [data.projects, status, query, sort])

  const setStatus = (s: ProjectStatus | null) => {
    const next = new URLSearchParams(params)
    if (s) next.set('status', s)
    else next.delete('status')
    setParams(next, { replace: true })
  }
  const setView = (v: 'list' | 'board') => {
    const next = new URLSearchParams(params)
    if (v === 'board') next.set('view', 'board')
    else next.delete('view')
    next.delete('status')
    setParams(next, { replace: true })
  }
  const setProjectStatus = (id: string, s: ProjectStatus) =>
    updateProject(id, (x) => ({ ...x, status: s }))

  return (
    <div className='page'>
      <header className='page-head'>
        <div>
          <h1>자소서 프로젝트</h1>
        </div>
        <button type='button' className='btn primary' onClick={() => openNew()}>
          <Plus size={16} /> 새 자소서
        </button>
      </header>

      <div className='toolbar'>
        <div className='segmented icons' role='tablist' aria-label='보기 방식'>
          <button
            type='button'
            role='tab'
            aria-selected={view === 'list'}
            aria-label='목록'
            title='목록'
            className={view === 'list' ? 'on' : ''}
            onClick={() => setView('list')}
          >
            <List size={17} />
          </button>
          <button
            type='button'
            role='tab'
            aria-selected={view === 'board'}
            aria-label='보드'
            title='보드'
            className={view === 'board' ? 'on' : ''}
            onClick={() => setView('board')}
          >
            <KanbanSquare size={17} />
          </button>
        </div>
        <div className='toolbar-right'>
          <label className='search'>
            <Search size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder='회사, 직무, 문항 검색'
            />
          </label>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            aria-label='정렬'
          >
            <option value='deadline'>마감 임박순</option>
            <option value='updated'>최근 수정순</option>
            <option value='created'>최근 생성순</option>
          </select>
        </div>
      </div>
      {view === 'list' && (
        <div className='status-tabs'>
            <button
              type='button'
              className={'status-tab' + (!status ? ' on' : '')}
              onClick={() => setStatus(null)}
            >
              전체 <b>{data.projects.length}</b>
            </button>
            {STATUS_ORDER.map((s) => (
              <button
                type='button'
                key={s}
                className={'status-tab' + (status === s ? ' on' : '')}
                onClick={() => setStatus(status === s ? null : s)}
              >
                {STATUS[s].label}{' '}
                <b>{data.projects.filter((p) => p.status === s).length}</b>
              </button>
            ))}
        </div>
      )}

      {view === 'board' ? (
        <Board projects={list} onStatus={setProjectStatus} />
      ) : list.length ? (
        <div className='table-card'>
          <table className='project-table'>
            <thead>
              <tr>
                <th>회사 · 직무</th>
                <th className='col-deadline'>마감</th>
                <th className='col-progress'>진행</th>
                <th className='col-status'>상태</th>
                <th className='col-updated'>수정</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link to={`/projects/${p.id}`} className='row-link'>
                      <strong>{p.company || '이름 없는 자소서'}</strong>
                      <span>{p.position || '직무 미정'}</span>
                    </Link>
                  </td>
                  <td>
                    <div className='deadline-cell'>
                      {p.deadline ? (
                        <>
                          <Dday
                            date={p.deadline}
                            muted={p.status !== 'writing'}
                          />
                          <span>{fmtDate(p.deadline)}</span>
                        </>
                      ) : (
                        <span className='muted'>미정</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <Progress
                      value={p.questions.filter((q) => q.done).length}
                      max={p.questions.length}
                    />
                  </td>
                  <td>
                    <StatusSelect
                      value={p.status}
                      onChange={(s) => setProjectStatus(p.id, s)}
                    />
                  </td>
                  <td className='col-updated muted small'>{fmtRelative(p.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          icon={<FileText size={28} />}
          title={
            data.projects.length
              ? '조건에 맞는 자소서가 없어요'
              : '아직 자소서가 없어요'
          }
          desc={
            data.projects.length
              ? '검색어나 필터를 바꿔 보세요'
              : '새 자소서로 시작해 보세요'
          }
          action={
            !data.projects.length && (
              <button type='button' className='btn primary' onClick={() => openNew()}>
                <Plus size={16} /> 새 자소서 시작하기
              </button>
            )
          }
        />
      )}
    </div>
  )
}

/** 지원현황 보드: 상태별 칸, 카드를 끌어다 놓으면 상태가 바뀐다 */
function Board({
  projects,
  onStatus,
}: {
  projects: Project[]
  onStatus: (id: string, s: ProjectStatus) => void
}) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [over, setOver] = useState<ProjectStatus | null>(null)

  const onDrop = (e: DragEvent, s: ProjectStatus) => {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/plain') || dragId
    if (id) onStatus(id, s)
    setDragId(null)
    setOver(null)
  }

  return (
    <div className='board'>
      {STATUS_ORDER.map((s) => {
        const items = projects.filter((p) => p.status === s)
        return (
          <section
            key={s}
            className={
              `board-col tone-${STATUS[s].tone}` + (over === s ? ' over' : '')
            }
            onDragOver={(e) => {
              e.preventDefault()
              if (over !== s) setOver(s)
            }}
            onDragLeave={() => over === s && setOver(null)}
            onDrop={(e) => onDrop(e, s)}
          >
            <header className='board-head'>
              <span className='dot' />
              <strong>{STATUS[s].label}</strong>
              <span className='board-count'>{items.length}</span>
            </header>
            <div className='board-cards'>
              {items.map((p) => {
                const done = p.questions.filter((q) => q.done).length
                return (
                  <article
                    key={p.id}
                    className={
                      'board-card' + (dragId === p.id ? ' dragging' : '')
                    }
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', p.id)
                      e.dataTransfer.effectAllowed = 'move'
                      setDragId(p.id)
                    }}
                    onDragEnd={() => {
                      setDragId(null)
                      setOver(null)
                    }}
                  >
                    <Link to={`/projects/${p.id}`} className='board-card-title'>
                      <strong>{p.company || '이름 없는 자소서'}</strong>
                      <span>{p.position || '직무 미정'}</span>
                    </Link>
                    <div className='board-card-foot'>
                      {p.deadline ? (
                        <Dday
                          date={p.deadline}
                          muted={p.status !== 'writing'}
                        />
                      ) : (
                        <span className='badge tone-gray'>마감 미정</span>
                      )}
                      <Progress value={done} max={p.questions.length} />
                    </div>
                  </article>
                )
              })}
              {!items.length && dragId && (
                <p className='board-empty'>여기로 끌어다 놓기</p>
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}
