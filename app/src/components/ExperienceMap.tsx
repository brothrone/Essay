import { Maximize2, Minus, Plus } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { COMPETENCY_TAGS, EXPERIENCE_TYPES } from '../constants'
import type { Experience } from '../types'

type Mode = 'tag' | 'type'

const W = 1100
const H = 840
const CX = W / 2
const CY = H / 2
const R_GROUP = 190
const R_EXP = 335
const R_EXP_OUTER = 392
const NO_TAG = '태그 없음'

const textWidth = (s: string, px = 13) => [...s].reduce((w, ch) => w + (ch.charCodeAt(0) > 127 ? px : px * 0.6), 0)
const clip = (s: string, n: number) => ([...s].length > n ? [...s].slice(0, n - 1).join('') + '…' : s)

interface GroupNode {
  name: string
  angle: number
  x: number
  y: number
  count: number
}

interface ExpNode {
  exp: Experience
  groups: string[]
  angle: number
  x: number
  y: number
}

function layout(experiences: Experience[], mode: Mode) {
  const groupsOf = (e: Experience) =>
    mode === 'tag' ? (e.tags.length ? e.tags : [NO_TAG]) : [e.type || '기타']

  // 역량 모드는 경험이 없는 역량도 보여 줘서 빈 곳이 드러나게 한다
  const names =
    mode === 'tag'
      ? [
          ...COMPETENCY_TAGS,
          ...[...new Set(experiences.flatMap((e) => e.tags))].filter((t) => !COMPETENCY_TAGS.includes(t)),
          ...(experiences.some((e) => !e.tags.length) ? [NO_TAG] : []),
        ]
      : [...EXPERIENCE_TYPES, ...new Set(experiences.map((e) => e.type))].filter(
          (t, i, a) => a.indexOf(t) === i && experiences.some((e) => (e.type || '기타') === t),
        )

  // 같이 쓰인 그룹끼리 이웃하게 순서를 정해 선이 덜 엇갈리게 한다 (빈 그룹은 뒤로)
  const countOf = (n: string) => experiences.filter((e) => groupsOf(e).includes(n)).length
  const together = (a: string, b: string) =>
    experiences.filter((e) => {
      const gs = groupsOf(e)
      return gs.includes(a) && gs.includes(b)
    }).length
  const filled = names.filter((n) => countOf(n) > 0).sort((a, b) => countOf(b) - countOf(a))
  const ordered: string[] = filled.length ? [filled[0]] : []
  const rest = filled.slice(1)
  while (rest.length) {
    const last = ordered[ordered.length - 1]
    let best = 0
    rest.forEach((n, i) => {
      if (together(last, n) * 10 + countOf(n) > together(last, rest[best]) * 10 + countOf(rest[best])) best = i
    })
    ordered.push(rest.splice(best, 1)[0])
  }
  ordered.push(...names.filter((n) => countOf(n) === 0))

  const groups: GroupNode[] = ordered.map((name, i) => {
    const angle = (i / Math.max(ordered.length, 1)) * Math.PI * 2 - Math.PI / 2
    return {
      name,
      angle,
      x: CX + R_GROUP * Math.cos(angle),
      y: CY + R_GROUP * Math.sin(angle),
      count: countOf(name),
    }
  })
  const byName = new Map(groups.map((g) => [g.name, g]))

  // 경험은 연결된 그룹들의 평균 방향에 두고, 겹치지 않게 간격을 벌린다
  const raw = experiences.map((exp) => {
    const gs = groupsOf(exp).filter((n) => byName.has(n))
    let sx = 0
    let sy = 0
    for (const n of gs) {
      sx += Math.cos(byName.get(n)!.angle)
      sy += Math.sin(byName.get(n)!.angle)
    }
    const angle = Math.hypot(sx, sy) < 1e-6 ? byName.get(gs[0])?.angle ?? 0 : Math.atan2(sy, sx)
    return { exp, groups: gs, angle }
  })
  raw.sort((a, b) => a.angle - b.angle)
  // 경험은 연결된 방향 순서를 지키면서 원 둘레에 고르게 놓는다 (많으면 안쪽 · 바깥쪽 번갈아)
  const n = raw.length
  const step = (Math.PI * 2) / Math.max(n, 1)
  let sx2 = 0
  let sy2 = 0
  raw.forEach((r, i) => {
    sx2 += Math.cos(r.angle - i * step)
    sy2 += Math.sin(r.angle - i * step)
  })
  const offset = n ? Math.atan2(sy2, sx2) : 0
  const twoRings = n > 12
  const exps: ExpNode[] = raw.map((r, i) => {
    const angle = offset + i * step
    const radius = twoRings && i % 2 ? R_EXP_OUTER : R_EXP
    return { ...r, angle, x: CX + radius * Math.cos(angle), y: CY + radius * Math.sin(angle) }
  })
  return { groups, exps }
}

export function ExperienceMap({
  experiences,
  usage,
  onOpen,
}: {
  experiences: Experience[]
  usage: Map<string, number>
  onOpen: (id: string) => void
}) {
  const [mode, setMode] = useState<Mode>('tag')
  const [hover, setHover] = useState<{ kind: 'group' | 'exp'; id: string } | null>(null)
  const [view, setView] = useState({ x: 0, y: 0, k: 1 })
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null)

  const { groups, exps } = useMemo(() => layout(experiences, mode), [experiences, mode])
  const groupByName = useMemo(() => new Map(groups.map((g) => [g.name, g])), [groups])

  // 휠로 커서 위치를 기준으로 확대 · 축소 (passive가 아니어야 페이지 스크롤을 막을 수 있음)
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const ctm = svg.getScreenCTM()
      if (!ctm) return
      const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
      setView((v) => {
        const k = Math.min(2.5, Math.max(0.5, v.k * (e.deltaY < 0 ? 1.1 : 0.9)))
        return { k, x: pt.x - (pt.x - v.x) * (k / v.k), y: pt.y - (pt.y - v.y) * (k / v.k) }
      })
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [])

  const scale = () => W / (svgRef.current?.clientWidth || W)
  const onPointerDown = (e: ReactPointerEvent<SVGRectElement>) => {
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: ReactPointerEvent<SVGRectElement>) => {
    const d = drag.current
    if (!d) return
    const s = scale()
    setView((v) => ({ ...v, x: d.vx + (e.clientX - d.x) * s, y: d.vy + (e.clientY - d.y) * s }))
  }
  const zoom = (f: number) =>
    setView((v) => {
      const k = Math.min(2.5, Math.max(0.5, v.k * f))
      return { k, x: CX - (CX - v.x) * (k / v.k), y: CY - (CY - v.y) * (k / v.k) }
    })

  const lit = (groupName: string, expId?: string) => {
    if (!hover) return true
    if (hover.kind === 'group') return groupName === hover.id
    if (expId) return expId === hover.id
    return exps.find((n) => n.exp.id === hover.id)?.groups.includes(groupName) ?? false
  }
  const expLit = (n: ExpNode) =>
    !hover || (hover.kind === 'exp' ? n.exp.id === hover.id : n.groups.includes(hover.id))

  const empty = groups.filter((g) => g.count === 0).map((g) => g.name)

  return (
    <div className="exp-map card">
      <div className="exp-map-bar">
        <div className="segmented">
          <button type="button" className={mode === 'tag' ? 'on' : ''} onClick={() => setMode('tag')}>
            역량별
          </button>
          <button type="button" className={mode === 'type' ? 'on' : ''} onClick={() => setMode('type')}>
            유형별
          </button>
        </div>
        <span className="muted small">휠로 확대 · 끌어서 이동 · 경험을 누르면 편집</span>
        <div className="exp-map-zoom">
          <button type="button" className="icon-btn" onClick={() => zoom(1.2)} aria-label="확대">
            <Plus size={16} />
          </button>
          <button type="button" className="icon-btn" onClick={() => zoom(1 / 1.2)} aria-label="축소">
            <Minus size={16} />
          </button>
          <button type="button" className="icon-btn" onClick={() => setView({ x: 0, y: 0, k: 1 })} aria-label="처음 크기">
            <Maximize2 size={15} />
          </button>
        </div>
      </div>

      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="exp-map-svg" role="img" aria-label="경험 마인드맵">
        <defs>
          <linearGradient id="map-me" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#3854DB" />
            <stop offset="1" stopColor="#0F1440" />
          </linearGradient>
        </defs>
        <rect
          x={-W}
          y={-H}
          width={W * 3}
          height={H * 3}
          fill="transparent"
          className="exp-map-bg"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => (drag.current = null)}
        />
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {/* 연결선 */}
          {groups.map((g) => (
            <line
              key={`c-${g.name}`}
              x1={CX}
              y1={CY}
              x2={g.x}
              y2={g.y}
              className={'map-edge center' + (lit(g.name) ? '' : ' dim')}
            />
          ))}
          {exps.flatMap((n) =>
            n.groups.map((name) => {
              const g = groupByName.get(name)!
              const mx = CX + ((R_GROUP + R_EXP) / 2) * Math.cos(n.angle)
              const my = CY + ((R_GROUP + R_EXP) / 2) * Math.sin(n.angle)
              const on = hover ? lit(name, undefined) && expLit(n) : true
              return (
                <path
                  key={`e-${n.exp.id}-${name}`}
                  d={`M${g.x},${g.y} Q${mx},${my} ${n.x},${n.y}`}
                  className={'map-edge' + (on ? (hover ? ' hot' : '') : ' dim')}
                />
              )
            }),
          )}

          {/* 가운데: 나 */}
          <g className="map-me">
            <circle cx={CX} cy={CY} r={46} fill="url(#map-me)" />
            <text x={CX} y={CY - 4} textAnchor="middle" className="map-me-label">
              나
            </text>
            <text x={CX} y={CY + 16} textAnchor="middle" className="map-me-sub">
              경험 {experiences.length}
            </text>
          </g>

          {/* 역량 / 유형 */}
          {groups.map((g) => {
            const w = textWidth(g.name) + 40
            return (
              <g
                key={`g-${g.name}`}
                className={'map-group' + (g.count ? '' : ' zero') + (lit(g.name) ? '' : ' dim')}
                transform={`translate(${g.x - w / 2} ${g.y - 15})`}
                onMouseEnter={() => setHover({ kind: 'group', id: g.name })}
                onMouseLeave={() => setHover(null)}
              >
                <rect width={w} height={30} rx={15} />
                <text x={14} y={20}>
                  {g.name}
                </text>
                <text x={w - 12} y={20} textAnchor="end" className="map-count">
                  {g.count}
                </text>
              </g>
            )
          })}

          {/* 경험 */}
          {exps.map((n) => {
            const used = usage.get(n.exp.id) ?? 0
            return (
              <g
                key={`x-${n.exp.id}`}
                className={'map-exp' + (expLit(n) ? '' : ' dim')}
                transform={`translate(${n.x - 78} ${n.y - 22})`}
                onMouseEnter={() => setHover({ kind: 'exp', id: n.exp.id })}
                onMouseLeave={() => setHover(null)}
                onClick={() => onOpen(n.exp.id)}
              >
                <title>{n.exp.title}</title>
                <rect width={156} height={44} rx={10} />
                <text x={10} y={19} className="map-exp-title">
                  {clip(n.exp.title || '제목 없는 경험', 11)}
                </text>
                <text x={10} y={35} className="map-exp-sub">
                  {mode === 'tag' ? n.exp.type : n.exp.tags.slice(0, 2).join(' · ') || '태그 없음'}
                  {used ? ` · 문항 ${used}` : ''}
                </text>
              </g>
            )
          })}
        </g>
      </svg>

      {mode === 'tag' && empty.length > 0 && (
        <p className="exp-map-gap">
          <b>아직 경험이 없는 역량:</b> {empty.join(', ')} — 자주 나오는 문항이라면 경험을 하나씩 채워 두세요.
        </p>
      )}
    </div>
  )
}
