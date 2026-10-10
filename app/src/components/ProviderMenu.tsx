import { Check, ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { AiProvider, AiStatus } from '../desktop'
import { AI_PROVIDERS } from '../useAiTask'
import { AiLogo } from './AiLogo'

/** AI 고르기: 기본 select 는 로고를 못 넣어서 직접 만든 펼침 목록 (로고 + 이름, 설치 안 된 것은 표시) */
export function ProviderMenu({
  value,
  onChange,
  status,
  disabled,
}: {
  value: AiProvider
  onChange: (p: AiProvider) => void
  status?: AiStatus | null
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const current = AI_PROVIDERS.find((x) => x.value === value) ?? AI_PROVIDERS[0]

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  return (
    <div className="provider-menu" ref={box}>
      <button
        type="button"
        className="provider-menu-btn"
        aria-label="AI 종류"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <AiLogo provider={current.value} />
        <span title={current.label}>{current.name}</span>
        <ChevronDown size={15} className="provider-menu-caret" />
      </button>
      {open && (
        <ul className="provider-menu-list" role="listbox" aria-label="AI 종류">
          {AI_PROVIDERS.map((x) => (
            <li key={x.value}>
              <button
                type="button"
                role="option"
                aria-selected={x.value === value}
                className={x.value === value ? 'on' : ''}
                onClick={() => {
                  setOpen(false)
                  if (x.value !== value) onChange(x.value)
                }}
              >
                <AiLogo provider={x.value} />
                <span>
                  {x.label}
                  {status && !status[x.value].available ? ' — 설치 안 됨' : ''}
                </span>
                {x.value === value && <Check size={15} className="provider-menu-check" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
