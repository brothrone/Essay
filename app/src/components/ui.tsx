import { X } from 'lucide-react'
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react'
import { createPortal } from 'react-dom'
import { STATUS, STATUS_ORDER } from '../constants'
import type { FieldDef } from '../specConfig'
import type { ProjectStatus } from '../types'
import { daysUntil, ddayLabel } from '../utils'

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [])

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="닫기">
            <X size={18} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}

export function FieldInput({
  def,
  value,
  onChange,
}: {
  def: FieldDef
  value: string
  onChange: (v: string) => void
}) {
  const id = useId()
  const common = {
    id,
    value,
    placeholder: def.placeholder,
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
  }
  let control: ReactNode
  if (def.type === 'textarea') control = <AutoTextarea minRows={3} {...common} />
  else if (def.type === 'select')
    control = (
      <select {...common}>
        <option value="">선택</option>
        {def.options?.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    )
  else
    control = (
      <input
        {...common}
        type={def.type ?? 'text'}
        step={def.type === 'number' ? 'any' : undefined}
        list={def.suggestions ? `${id}-list` : undefined}
      />
    )

  return (
    <div className={'field' + (def.full || def.type === 'textarea' ? ' full' : '')}>
      <label htmlFor={id} className="field-label">
        {def.label}
        {def.required && <em>*</em>}
      </label>
      {control}
      {def.suggestions && (
        <datalist id={`${id}-list`}>
          {def.suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </div>
  )
}

/** 내용에 맞춰 높이가 늘어나는 textarea (rows 가 최소 높이) */
export function AutoTextarea({
  minRows = 2,
  value,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: number; value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const fit = () => {
    const el = ref.current
    // 숨겨진 탭 안에 있으면 scrollHeight 가 0 → 건드리지 않는다 (보이게 되면 ResizeObserver 가 다시 맞춘다)
    if (!el || el.offsetParent === null) return
    el.style.height = 'auto'
    const h = el.scrollHeight
    if (h > 0) el.style.height = `${h + 2}px`
  }
  useLayoutEffect(fit, [value])
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => fit())
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return <textarea ref={ref} rows={minRows} value={value} {...props} />
}

export function Empty({
  icon,
  title,
  desc,
  action,
}: {
  icon?: ReactNode
  title: string
  desc?: string
  action?: ReactNode
}) {
  return (
    <div className="empty">
      {icon && <div className="empty-icon">{icon}</div>}
      <p className="empty-title">{title}</p>
      {desc && <p className="empty-desc">{desc}</p>}
      {action}
    </div>
  )
}

export function StatusBadge({ status }: { status: ProjectStatus }) {
  const s = STATUS[status]
  return <span className={`badge tone-${s.tone}`}>{s.label}</span>
}

export function StatusSelect({
  value,
  onChange,
}: {
  value: ProjectStatus
  onChange: (s: ProjectStatus) => void
}) {
  return (
    <select
      className={`status-select tone-${STATUS[value].tone}`}
      value={value}
      onChange={(e) => onChange(e.target.value as ProjectStatus)}
      onClick={(e) => e.stopPropagation()}
      aria-label="진행 상태"
    >
      {STATUS_ORDER.map((s) => (
        <option key={s} value={s}>
          {STATUS[s].label}
        </option>
      ))}
    </select>
  )
}

export function Dday({ date, muted }: { date: string; muted?: boolean }) {
  const n = daysUntil(date)
  if (n === null) return null
  const tone = muted ? 'gray' : n < 0 ? 'gray' : n <= 3 ? 'red' : n <= 7 ? 'amber' : 'blue'
  return <span className={`badge dday tone-${tone}`}>{ddayLabel(n)}</span>
}

export function Progress({ value, max }: { value: number; max: number }) {
  const pct = max ? Math.round((value / max) * 100) : 0
  return (
    <div className="progress" title={`${value}/${max} 문항 완료`}>
      <div className="progress-bar">
        <i style={{ width: `${pct}%` }} />
      </div>
      <span>
        {value}/{max}
      </span>
    </div>
  )
}
