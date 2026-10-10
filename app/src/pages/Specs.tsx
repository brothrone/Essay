import { ClipboardCopy, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { FieldInput, Modal } from '../components/ui'
import { desktop } from '../desktop'
import { CATEGORY_MAP, languageExpiry, SPEC_CATEGORIES, sortSpecs, specsToText } from '../specConfig'
import { newSpec, useStore } from '../store'
import type { Profile, SpecCategory, SpecItem } from '../types'
import { copyText, daysUntil, fmtDate } from '../utils'
import { toast } from '../toast'

const PROFILE_FIELDS: { key: keyof Profile; label: string; type?: string; placeholder?: string }[] = [
  { key: 'name', label: '이름' },
  { key: 'birth', label: '생년월일', type: 'date' },
  { key: 'email', label: '이메일', type: 'email' },
  { key: 'phone', label: '연락처', type: 'tel', placeholder: '010-0000-0000' },
  { key: 'targetJob', label: '희망 직무', placeholder: '예: 서비스 기획, 데이터 분석' },
  { key: 'address', label: '주소' },
  { key: 'links', label: '포트폴리오 · 링크', placeholder: 'GitHub, 노션, 블로그 등' },
  { key: 'skills', label: '보유 스킬', placeholder: '예: Python, Excel' },
]

export function Specs() {
  const { data, setProfile } = useStore()
  const [editing, setEditing] = useState<SpecItem | null>(null)

  const byCat = (c: SpecCategory) => sortSpecs(data.specs.filter((s) => s.category === c))
  const edu = byCat('education')[0]
  const langs = byCat('language')

  const summary: [string, string][] = [
    ['학점', edu?.data.gpa ? `${edu.data.gpa}${edu.data.gpaMax ? ` / ${edu.data.gpaMax}` : ''}` : '-'],
    ['어학', langs.length ? langs.map((l) => [l.data.test, l.data.score].filter(Boolean).join(' ')).slice(0, 2).join(', ') : '-'],
    ['자격증', `${byCat('certificate').length}개`],
    ['수상', `${byCat('award').length}회`],
    ['경력·인턴', `${byCat('career').length}건`],
    ['대외활동', `${byCat('activity').length}건`],
  ]

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>스펙 관리</h1>
        </div>
        <button type="button" className="btn" onClick={() => copyText(specsToText(data), '스펙을 복사했어요')}>
          <ClipboardCopy size={16} /> 텍스트로 복사
        </button>
      </header>

      <div className="spec-summary">
        {summary.map(([k, v]) => (
          <div key={k}>
            <span>{k}</span>
            <b>{v}</b>
          </div>
        ))}
      </div>

      <section className="card">
        <header className="card-head">
          <h3>기본 정보</h3>
        </header>
        <div className="form-grid three">
          {PROFILE_FIELDS.map((f) => (
            <div className={'field' + (f.key === 'links' || f.key === 'skills' ? ' full' : '')} key={f.key}>
              <label className="field-label" htmlFor={`pf-${f.key}`}>
                {f.label}
              </label>
              <input
                id={`pf-${f.key}`}
                type={f.type ?? 'text'}
                value={data.profile[f.key]}
                placeholder={f.placeholder}
                onChange={(e) => setProfile({ [f.key]: e.target.value })}
              />
            </div>
          ))}
        </div>
      </section>

      {SPEC_CATEGORIES.map((cat) => {
        const items = byCat(cat.key)
        return (
          <section className="card spec-section" key={cat.key}>
            <header className="card-head">
              <h3>
                {cat.label} <span className="count">{items.length}</span>
              </h3>
              <button type="button" className="btn small" onClick={() => setEditing(newSpec(cat.key))}>
                <Plus size={14} /> 추가
              </button>
            </header>
            {items.length ? (
              <ul className="spec-list">
                {items.map((item) => (
                  <li key={item.id}>
                    <button type="button" className="spec-row" onClick={() => setEditing(item)}>
                      <div className="spec-main">
                        <strong>{cat.title(item.data) || '(이름 없음)'}</strong>
                        {cat.sub(item.data) && <span>{cat.sub(item.data)}</span>}
                      </div>
                      <div className="spec-meta">
                        {cat.key === 'language' && <ExpiryBadge item={item} />}
                        <span>{cat.meta(item.data)}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="spec-empty">{cat.empty}</p>
            )}
          </section>
        )
      })}

      {editing && <SpecModal key={editing.id} item={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function ExpiryBadge({ item }: { item: SpecItem }) {
  const expiry = languageExpiry(item.data)
  const n = daysUntil(expiry)
  if (n === null) return null
  const tone = n < 0 ? 'red' : n <= 90 ? 'amber' : 'gray'
  const label = n < 0 ? '만료됨' : n <= 90 ? `만료 D-${n}` : `~${fmtDate(expiry)}`
  return (
    <span className={`badge tone-${tone}`} title={`유효기간 ${fmtDate(expiry)}`}>
      {label}
    </span>
  )
}

function SpecModal({ item, onClose }: { item: SpecItem; onClose: () => void }) {
  const { data, saveSpec, deleteSpec } = useStore()
  const cat = CATEGORY_MAP[item.category]
  const exists = data.specs.some((s) => s.id === item.id)
  const [draft, setDraft] = useState<Record<string, string>>(item.data)
  const dirty = JSON.stringify(draft) !== JSON.stringify(item.data)

  const close = async () => {
    if (dirty && !(await desktop.confirm('저장하지 않은 내용이 있어요. 닫을까요?', { ok: '닫기', cancel: '계속 쓰기' }))) return
    onClose()
  }

  const save = () => {
    const missing = cat.fields.find((f) => f.required && !draft[f.key]?.trim())
    if (missing) return toast(`${missing.label}을(를) 입력해 주세요`)
    const cleaned = Object.fromEntries(Object.entries(draft).filter(([, v]) => v.trim()))
    saveSpec({ ...item, data: cleaned })
    onClose()
  }

  const remove = async () => {
    if (!(await desktop.confirm(`${cat.label} 항목을 삭제할까요?`, { detail: cat.title(draft) || undefined, ok: '삭제', danger: true }))) return
    deleteSpec(item.id)
    onClose()
  }

  const autoExpiry = item.category === 'language' && !draft.expiry ? languageExpiry(draft) : ''

  return (
    <Modal
      title={`${cat.label} ${exists ? '수정' : '추가'}`}
      onClose={close}
      footer={
        <>
          {exists && (
            <button type="button" className="btn ghost danger mr-auto" onClick={remove}>
              <Trash2 size={16} /> 삭제
            </button>
          )}
          <button type="button" className="btn ghost" onClick={close}>
            취소
          </button>
          <button type="button" className="btn primary" onClick={save}>
            저장
          </button>
        </>
      }
    >
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        {cat.fields.map((f) => (
          <FieldInput
            key={f.key}
            def={f}
            value={draft[f.key] ?? ''}
            onChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))}
          />
        ))}
        {autoExpiry && <p className="muted small full">유효기간 {fmtDate(autoExpiry)} (응시일 + 2년)</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
