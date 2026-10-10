import { ArrowUpRight, Maximize2, Minus, Plus, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { COMPETENCY_TAGS, EXPERIENCE_TYPES, STAR_FIELDS } from '../constants'
import type { Experience } from '../types'
import { fmtPeriod } from '../utils'

type Mode = 'tag' | 'type'
type Focus = { kind: 'group' | 'exp'; id: string } | null

const NO_TAG = '태그 없음'
/** 역량(또는 유형)마다 하나씩 쓰는 색. 배경은 화면 색과 섞어 밝게/어둡게 모두 자연스럽게 */
const PALETTE = ['#2b62f2', '#7c3aed', '#0d9488', '#d97706', '#e11d48', '#16a34a', '#4f46e5', '#0891b2', '#c026d3', '#65a30d']

const CARD_W = 196
const CARD_H = 58
const textWidth = (s: string, px: number) => [...s].reduce((w, ch) => w + (ch.charCodeAt(0) > 127 ? px : px * 0.58), 0)
const clip = (s: string, n: number) => ([...s].length > n ? [...s].slice(0, n - 1).join('') + '…' : s)
const starCount = (e: Experience) => STAR_FIELDS.filter((f) => e[f.key].trim()).length

interface GroupNode {
  name: string
  color: string
  x: number
  y: number
  w: number
  count: number
}

interface ExpNode {
  exp: Experience
  primary: string
  groups: string[]
  x: number
  y: number
}

/**
 * 가운데 '나' → 역량(유형) → 경험 세 겹으로 놓는다.
 * - 경험이 있는 역량만 지도에 올린다 (빈 역량은 옆 패널에 모아 보여 준다)
 * - 경험은 대표 역량(첫 태그) 쪽 부채꼴 안에 모아 두고, 다른 역량과의 연결은 마우스를 올렸을 때만 보인다
 * - 카드가 겹치면 서로 밀어내 정리한다
 */
function layout(experiences: Experience[], mode: Mode) {
  const groupsOf = (e: Experience) => (mode === 'tag' ? (e.tags.length ? e.tags : [NO_TAG]) : [e.type || '기타'])
  const order =
    mode === 'tag'
      ? [...COMPETENCY_TAGS, ...new Set(experiences.flatMap((e) => e.tags)), NO_TAG]
      : [...EXPERIENCE_TYPES, ...new Set(experiences.map((e) => e.type || '기타'))]
  const names = order.filter((n, i, a) => a.indexOf(n) === i && experiences.some((e) => groupsOf(e).includes(n)))

  const primaryOf = (e: Experience) => groupsOf(e).find((g) => names.includes(g)) ?? names[0]
  const primaryCount = (n: string) => experiences.filter((e) => primaryOf(e) === n).length
  const total = names.reduce((s, n) => s + Math.max(1, primaryCount(n)), 0) || 1

  const ELL = 1.55 // 가로 / 세로 비율: 카드가 가로로 길고 화면도 가로로 넓다
  const r1 = Math.max(120, names.length * 12.5)
  const r2 = Math.max(r1 + 150, (experiences.length * 150) / (Math.PI * 2 * 1.25))

  const groups: GroupNode[] = []
  const exps: ExpNode[] = []
  let cursor = -Math.PI / 2 - (Math.PI * 2 * Math.max(1, primaryCount(names[0] ?? ''))) / total / 2
  names.forEach((name, gi) => {
    const share = (Math.PI * 2 * Math.max(1, primaryCount(name))) / total
    const mid = cursor + share / 2
    const w = textWidth(name, 14) + 58
    groups.push({
      name,
      color: PALETTE[gi % PALETTE.length],
      x: r1 * ELL * Math.cos(mid),
      y: r1 * Math.sin(mid),
      w,
      count: experiences.filter((e) => groupsOf(e).includes(name)).length,
    })
    const mine = experiences.filter((e) => primaryOf(e) === name)
    const span = Math.min(share * 0.82, Math.max(0, mine.length - 1) * 0.5)
    mine.forEach((exp, i) => {
      const a = mine.length === 1 ? mid : mid - span / 2 + (span * i) / (mine.length - 1)
      const r = r2 + (mine.length > 3 && i % 2 ? 64 : 0)
      exps.push({ exp, primary: name, groups: groupsOf(exp).filter((g) => names.includes(g)), x: r * ELL * Math.cos(a), y: r * Math.sin(a) })
    })
    cursor += share
  })

  // 겹치는 카드끼리 밀어내기 (가운데 · 역량 노드와도 겹치지 않게)
  const fixed = [{ x: 0, y: 0, w: 120, h: 120 }, ...groups.map((g) => ({ x: g.x, y: g.y, w: g.w + 16, h: 52 }))]
  for (let iter = 0; iter < 120; iter++) {
    let moved = false
    for (let i = 0; i < exps.length; i++) {
      const a = exps[i]
      const push = (bx: number, by: number, bw: number, bh: number, both: ExpNode | null) => {
        const dx = a.x - bx
        const dy = a.y - by
        const ox = (CARD_W + bw) / 2 + 12 - Math.abs(dx)
        const oy = (CARD_H + bh) / 2 + 12 - Math.abs(dy)
        if (ox <= 0 || oy <= 0) return
        moved = true
        // 덜 겹친 축으로 밀어낸다
        if (ox < oy) {
          const s = (dx === 0 ? 1 : Math.sign(dx)) * (both ? ox / 2 : ox)
          a.x += s
          if (both) both.x -= s
        } else {
          const s = (dy === 0 ? 1 : Math.sign(dy)) * (both ? oy / 2 : oy)
          a.y += s
          if (both) both.y -= s
        }
      }
      for (const f of fixed) push(f.x, f.y, f.w, f.h, null)
      for (let j = i + 1; j < exps.length; j++) push(exps[j].x, exps[j].y, CARD_W, CARD_H, exps[j])
    }
    if (!moved) break
  }

  // 화면에 꽉 차게 보이도록 전체 범위를 잰다
  const xs = [...groups.flatMap((g) => [g.x - g.w / 2, g.x + g.w / 2]), ...exps.flatMap((n) => [n.x - CARD_W / 2, n.x + CARD_W / 2]), -60, 60]
  const ys = [...groups.flatMap((g) => [g.y - 20, g.y + 20]), ...exps.flatMap((n) => [n.y - CARD_H / 2, n.y + CARD_H / 2]), -60, 60]
  const pad = 36
  const box = {
    x: Math.min(...xs) - pad,
    y: Math.min(...ys) - pad,
    w: Math.max(...xs) - Math.min(...xs) + pad * 2,
    h: Math.max(...ys) - Math.min(...ys) + pad * 2,
  }
  const missing = mode === 'tag' ? COMPETENCY_TAGS.filter((t) => !names.includes(t)) : []
  return { groups, exps, box, missing }
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
  const [hover, setHover] = useState<Focus>(null)
  const [selected, setSelected] = useState<Focus>(null)
  const [view, setView] = useState({ x: 0, y: 0, k: 1 })
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null)

  const { groups, exps, box, missing } = useMemo(() => layout(experiences, mode), [experiences, mode])
  const groupByName = useMemo(() => new Map(groups.map((g) => [g.name, g])), [groups])
  const focus = hover ?? selected

  // 보기 방식이 바뀌면 처음 크기 · 선택 없음으로
  const switchMode = (m: Mode) => {
    setMode(m)
    setView({ x: 0, y: 0, k: 1 })
    setSelected(null)
  }

  // 휠로 커서 위치를 기준으로 확대 · 축소 (passive 가 아니어야 페이지 스크롤을 막을 수 있음)
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

  const unit = () => 1 / (svgRef.current?.getScreenCTM()?.a || 1)
  const onPointerDown = (e: ReactPointerEvent<SVGRectElement>) => {
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: ReactPointerEvent<SVGRectElement>) => {
    const d = drag.current
    if (!d) return
    if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 3) d.moved = true
    const s = unit()
    setView((v) => ({ ...v, x: d.vx + (e.clientX - d.x) * s, y: d.vy + (e.clientY - d.y) * s }))
  }
  const onPointerUp = () => {
    // 끌지 않고 빈 곳을 누르면 선택을 푼다
    if (drag.current && !drag.current.moved) setSelected(null)
    drag.current = null
  }
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  const zoom = (f: number) =>
    setView((v) => {
      const k = Math.min(2.5, Math.max(0.5, v.k * f))
      return { k, x: cx - (cx - v.x) * (k / v.k), y: cy - (cy - v.y) * (k / v.k) }
    })

  // 무엇을 밝게 둘지: 역량을 가리키면 그 역량과 경험들, 경험을 가리키면 그 경험과 연결된 역량들
  const focusedExp = focus?.kind === 'exp' ? exps.find((n) => n.exp.id === focus.id) : undefined
  const groupLit = (name: string) =>
    !focus || (focus.kind === 'group' ? focus.id === name : !!focusedExp?.groups.includes(name))
  const expLit = (n: ExpNode) => !focus || (focus.kind === 'exp' ? n.exp.id === focus.id : n.groups.includes(focus.id))
  const showSecondary = (n: ExpNode, g: string) =>
    !!focus && (focus.kind === 'exp' ? n.exp.id === focus.id : focus.id === g && n.primary !== g)

  const toggle = (f: NonNullable<Focus>) => setSelected((s) => (s && s.kind === f.kind && s.id === f.id ? null : f))

  return (
    <div className="exp-map card">
      <div className="exp-map-bar">
        <div className="segmented">
          <button type="button" className={mode === 'tag' ? 'on' : ''} onClick={() => switchMode('tag')}>
            역량별
          </button>
          <button type="button" className={mode === 'type' ? 'on' : ''} onClick={() => switchMode('type')}>
            유형별
          </button>
        </div>
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

      <div className="exp-map-body">
        <svg
          ref={svgRef}
          viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
          preserveAspectRatio="xMidYMid meet"
          className={'exp-map-svg' + (focus ? ' has-focus' : '')}
          role="img"
          aria-label="경험 마인드맵"
        >
          <defs>
            <radialGradient id="map-me" cx="35%" cy="30%" r="80%">
              <stop offset="0" stopColor="#4f7bff" />
              <stop offset="1" stopColor="#1e3aa8" />
            </radialGradient>
            <filter id="map-shadow" x="-20%" y="-20%" width="140%" height="160%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.10" />
            </filter>
          </defs>
          <rect
            x={box.x - box.w}
            y={box.y - box.h}
            width={box.w * 3}
            height={box.h * 3}
            fill="transparent"
            className="exp-map-bg"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          />
          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            {/* 나 → 역량 */}
            {groups.map((g) => (
              <path
                key={`c-${g.name}`}
                d={`M0,0 L${g.x},${g.y}`}
                className={'map-edge trunk' + (groupLit(g.name) ? '' : ' dim')}
                style={{ '--c': g.color } as CSSProperties}
              />
            ))}
            {/* 역량 → 경험 (대표 역량은 실선, 다른 역량은 가리켰을 때만 점선) */}
            {exps.flatMap((n) =>
              n.groups.map((name) => {
                const g = groupByName.get(name)!
                const primary = name === n.primary
                if (!primary && !showSecondary(n, name)) return null
                const mx = (g.x + n.x) / 2 + (primary ? 0 : (n.y - g.y) * 0.12)
                const my = (g.y + n.y) / 2 - (primary ? 0 : (n.x - g.x) * 0.12)
                return (
                  <path
                    key={`e-${n.exp.id}-${name}`}
                    d={`M${g.x},${g.y} Q${mx},${my} ${n.x},${n.y}`}
                    className={'map-edge' + (primary ? '' : ' secondary') + (primary && !(groupLit(name) && expLit(n)) ? ' dim' : '')}
                    style={{ '--c': g.color } as CSSProperties}
                  />
                )
              }),
            )}

            {/* 가운데: 나 */}
            <g className={'map-me' + (focus ? ' dim' : '')}>
              <circle r={50} className="map-me-halo" />
              <circle r={40} fill="url(#map-me)" />
              <text y={-2} textAnchor="middle" className="map-me-label">
                나
              </text>
              <text y={16} textAnchor="middle" className="map-me-sub">
                경험 {experiences.length}
              </text>
            </g>

            {/* 역량 / 유형 */}
            {groups.map((g) => {
              const isSel = selected?.kind === 'group' && selected.id === g.name
              return (
                <g
                  key={`g-${g.name}`}
                  className={'map-group' + (groupLit(g.name) ? '' : ' dim') + (isSel ? ' selected' : '')}
                  style={{ '--c': g.color } as CSSProperties}
                  transform={`translate(${g.x - g.w / 2} ${g.y - 18})`}
                  onMouseEnter={() => setHover({ kind: 'group', id: g.name })}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => toggle({ kind: 'group', id: g.name })}
                >
                  <rect width={g.w} height={36} rx={18} />
                  <circle cx={17} cy={18} r={4.5} className="map-dot" />
                  <text x={29} y={23} className="map-group-name">
                    {g.name}
                  </text>
                  <text x={g.w - 14} y={23} textAnchor="end" className="map-count">
                    {g.count}
                  </text>
                </g>
              )
            })}

            {/* 경험 카드 */}
            {exps.map((n) => {
              const used = usage.get(n.exp.id) ?? 0
              const stars = starCount(n.exp)
              const color = groupByName.get(n.primary)?.color ?? PALETTE[0]
              const isSel = selected?.kind === 'exp' && selected.id === n.exp.id
              return (
                <g
                  key={`x-${n.exp.id}`}
                  className={'map-exp' + (expLit(n) ? '' : ' dim') + (isSel ? ' selected' : '')}
                  style={{ '--c': color } as CSSProperties}
                  transform={`translate(${n.x - CARD_W / 2} ${n.y - CARD_H / 2})`}
                  onMouseEnter={() => setHover({ kind: 'exp', id: n.exp.id })}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => toggle({ kind: 'exp', id: n.exp.id })}
                  onDoubleClick={() => onOpen(n.exp.id)}
                >
                  <title>{n.exp.title}</title>
                  <rect width={CARD_W} height={CARD_H} rx={12} className="map-card" filter="url(#map-shadow)" />
                  <rect x={0} y={12} width={4} height={CARD_H - 24} rx={2} className="map-accent" />
                  <text x={16} y={24} className="map-exp-title">
                    {clip(n.exp.title || '제목 없는 경험', 12)}
                  </text>
                  <text x={16} y={43} className="map-exp-sub">
                    {clip([n.exp.type, used ? `문항 ${used}` : ''].filter(Boolean).join(' · '), 12)}
                  </text>
                  {/* STAR 채운 정도 */}
                  {STAR_FIELDS.map((f, i) => (
                    <circle key={f.key} cx={CARD_W - 44 + i * 9} cy={39} r={3} className={'map-star' + (i < stars ? ' on' : '')} />
                  ))}
                </g>
              )
            })}
          </g>
        </svg>

        {selected && (
          <MapPanel
            experiences={experiences}
            usage={usage}
            selected={selected}
            groups={groups}
            mode={mode}
            onSelect={setSelected}
            onOpen={onOpen}
          />
        )}
      </div>
      <MapSummary experiences={experiences} usage={usage} groups={groups} mode={mode} missing={missing} onSelect={setSelected} />
    </div>
  )
}

/** 지도 위에 뜨는 설명 패널: 역량을 고르면 그 경험 목록, 경험을 고르면 그 경험 */
function MapPanel({
  experiences,
  usage,
  selected,
  groups,
  mode,
  onSelect,
  onOpen,
}: {
  experiences: Experience[]
  usage: Map<string, number>
  selected: Focus
  groups: GroupNode[]
  mode: Mode
  onSelect: (f: Focus) => void
  onOpen: (id: string) => void
}) {
  const inGroup = (e: Experience, name: string) =>
    mode === 'tag' ? (e.tags.length ? e.tags.includes(name) : name === NO_TAG) : (e.type || '기타') === name

  if (selected?.kind === 'exp') {
    const e = experiences.find((x) => x.id === selected.id)
    if (!e) return null
    const stars = starCount(e)
    return (
      <aside className="map-panel">
        <header className="map-panel-head">
          <span className="muted small">{e.type}</span>
          <button type="button" className="icon-btn" onClick={() => onSelect(null)} aria-label="닫기">
            <X size={15} />
          </button>
        </header>
        <h3>{e.title || '제목 없는 경험'}</h3>
        <p className="muted small">{[e.org, e.role, fmtPeriod(e.start, e.end)].filter(Boolean).join(' · ')}</p>
        {e.summary && <p className="map-panel-summary">{e.summary}</p>}
        <div className="map-panel-tags">
          {e.tags.map((t) => (
            <button type="button" key={t} className="chip" onClick={() => mode === 'tag' && onSelect({ kind: 'group', id: t })}>
              {t}
            </button>
          ))}
        </div>
        <dl className="map-panel-meta">
          <dt>STAR</dt>
          <dd>
            {STAR_FIELDS.map((f) => (
              <span key={f.key} className={'star-pill' + (e[f.key].trim() ? ' on' : '')}>
                {f.short}
              </span>
            ))}
            <span className="muted small"> {stars === 4 ? '모두 채움' : `${4 - stars}칸 비어 있어요`}</span>
          </dd>
          <dt>쓴 문항</dt>
          <dd>{usage.get(e.id) ? `${usage.get(e.id)}개` : '없음'}</dd>
        </dl>
        <button type="button" className="btn primary small" onClick={() => onOpen(e.id)}>
          경험 편집 <ArrowUpRight size={14} />
        </button>
      </aside>
    )
  }

  if (selected?.kind === 'group') {
    const g = groups.find((x) => x.name === selected.id)
    const list = experiences.filter((e) => inGroup(e, selected.id))
    return (
      <aside className="map-panel">
        <header className="map-panel-head">
          <span className="map-panel-title" style={{ '--c': g?.color } as CSSProperties}>
            <i /> {selected.id}
          </span>
          <button type="button" className="icon-btn" onClick={() => onSelect(null)} aria-label="닫기">
            <X size={15} />
          </button>
        </header>
        <p className="muted small">경험 {list.length}개</p>
        <ul className="map-panel-list">
          {list.map((e) => (
            <li key={e.id}>
              <button type="button" onClick={() => onSelect({ kind: 'exp', id: e.id })}>
                <strong>{e.title || '제목 없는 경험'}</strong>
                <span className="muted small">
                  {e.type} · STAR {starCount(e)}/4{usage.get(e.id) ? ` · 문항 ${usage.get(e.id)}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
    )
  }

  return null
}

/** 지도 아래 요약: 경험 수 · 채운 역량 · STAR 완성, 빈 역량, 많이 쓴 경험 */
function MapSummary({
  experiences,
  usage,
  groups,
  mode,
  missing,
  onSelect,
}: {
  experiences: Experience[]
  usage: Map<string, number>
  groups: GroupNode[]
  mode: Mode
  missing: string[]
  onSelect: (f: Focus) => void
}) {
  const complete = experiences.filter((e) => starCount(e) === 4).length
  const top = [...experiences].sort((a, b) => (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0)).filter((e) => usage.get(e.id))
  return (
    <div className="map-summary">
      <div className="map-panel-stats">
        <div>
          <b>{experiences.length}</b>
          <span>경험</span>
        </div>
        <div>
          <b>{mode === 'tag' ? `${groups.filter((g) => g.name !== NO_TAG).length}/${COMPETENCY_TAGS.length}` : groups.length}</b>
          <span>{mode === 'tag' ? '채운 역량' : '유형'}</span>
        </div>
        <div>
          <b>{complete}</b>
          <span>STAR 완성</span>
        </div>
      </div>
      {mode === 'tag' && missing.length > 0 && (
        <div className="map-summary-block">
          <p className="map-panel-label">아직 경험이 없는 역량</p>
          <div className="map-panel-tags">
            {missing.map((t) => (
              <span key={t} className="chip ghost-chip">
                {t}
              </span>
            ))}
          </div>
        </div>
      )}
      {top.length > 0 && (
        <div className="map-summary-block">
          <p className="map-panel-label">많이 쓴 경험</p>
          <div className="map-panel-tags">
            {top.slice(0, 3).map((e) => (
              <button type="button" key={e.id} className="chip" onClick={() => onSelect({ kind: 'exp', id: e.id })}>
                {clip(e.title, 14)} · {usage.get(e.id)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
