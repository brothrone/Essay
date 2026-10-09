import { Check, Download, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useCommunity } from '../community'
import { QUESTION_PRESETS } from '../constants'
import { desktop, type CommunityQuestionSet } from '../desktop'
import type { Project, Question } from '../types'
import { PostingCheck } from './PostingCheck'
import { Modal } from './ui'

/**
 * 편집 화면의 [문항 불러오기]: 공고에서(AI 가 읽어 자동으로 채움) · 다른 지원자가 모은 문항 · 자주 나오는 문항.
 * 공고 읽기는 창을 닫아도 계속되고, 끝나면 이 자소서에 바로 들어간다.
 */
export function QuestionImportDialog({
  project,
  onPatch,
  onAdd,
  onClose,
}: {
  project: Project
  onPatch: (p: Partial<Project>) => void
  onAdd: (qs: Pick<Question, 'prompt' | 'limit'>[]) => void
  onClose: () => void
}) {
  const community = useCommunity()
  const canFind = !!community?.available && !!community.consent?.questions
  const company = project.company.trim()
  const position = project.position.trim()
  const [sets, setSets] = useState<CommunityQuestionSet[] | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const have = new Set(project.questions.map((q) => q.prompt.trim()).filter(Boolean))

  useEffect(() => {
    if (!canFind || company.length < 2) return
    let alive = true
    desktop.community.findQuestions({ company, position }).then((r) => alive && setSets(r.sets.slice(0, 3)))
    return () => {
      alive = false
    }
  }, [canFind, company, position])

  const toggle = (k: string) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]))
  const chosen = () => {
    const out: Pick<Question, 'prompt' | 'limit'>[] = []
    for (const k of picked) {
      const [kind, a, b] = k.split(':')
      if (kind === 'c') {
        const q = sets?.find((x) => x.id === Number(a))?.questions[Number(b)]
        if (q) out.push({ prompt: q.prompt, limit: q.limit })
      } else {
        const p = QUESTION_PRESETS[Number(a)]
        if (p) out.push({ prompt: p.prompt, limit: p.limit })
      }
    }
    return out
  }

  const item = (k: string, prompt: string, limit: number | null) => {
    const exists = have.has(prompt.trim())
    const on = picked.includes(k)
    return (
      <button
        type="button"
        key={k}
        className={'preset' + (on ? ' on' : '')}
        disabled={exists}
        aria-pressed={on}
        onClick={() => toggle(k)}
        title={exists ? '이미 들어 있는 문항이에요' : undefined}
      >
        <span className="preset-check">{(on || exists) && <Check size={12} strokeWidth={3} />}</span>
        {prompt}
        {limit ? <span className="muted preset-limit">{limit.toLocaleString()}자</span> : null}
      </button>
    )
  }

  return (
    <Modal
      title="문항 불러오기"
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn ghost mr-auto" onClick={onClose}>
            닫기
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!picked.length}
            onClick={() => {
              onAdd(chosen())
              onClose()
            }}
          >
            <Download size={16} /> 고른 문항 {picked.length ? `${picked.length}개 ` : ''}넣기
          </button>
        </>
      }
    >
      <div className="qi">
        <section className="qi-section">
          <h4>공고에서 불러오기</h4>
          <p className="muted small">
            공고 주소를 넣고 버튼을 누르면 AI가 공고를 읽어 문항을 바로 채워요. 정해진 문항이 없는 공고(자유 양식)면 공고 내용에 맞춘 예상
            문항을 넣어요. 창을 닫아도 계속 읽어요.
          </p>
          <input
            type="url"
            value={project.jobUrl}
            placeholder="https:// 로 시작하는 공고 주소 (없으면 회사명으로 찾아요)"
            aria-label="공고 주소"
            onChange={(e) => onPatch({ jobUrl: e.target.value.trim() })}
          />
          <PostingCheck project={project} onPatch={onPatch} />
        </section>

        {community?.available && (
          <section className="qi-section">
            <h4>
              <Users size={16} /> 다른 지원자가 모은 {company || '이 회사'} 문항
            </h4>
            {!community.consent?.questions ? (
              <p className="muted small">설정 → 개선 돕기에서 '회사별 자소서 문항 모음'을 켜면 볼 수 있어요.</p>
            ) : company.length < 2 ? (
              <p className="muted small">위에 회사명을 적으면 찾아봐요.</p>
            ) : !sets ? (
              <p className="muted small">찾는 중…</p>
            ) : sets.length ? (
              <div className="community-sets">
                {sets.map((x) => (
                  <div key={x.id}>
                    <div className="community-set-head muted">
                      {[x.position || '직무 표시 없음', x.period, `${x.contributors}명이 불러옴`].join(' · ')}
                    </div>
                    <div className="preset-list">{x.questions.map((q, i) => item(`c:${x.id}:${i}`, q.prompt, q.limit))}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted small">아직 모인 문항이 없어요.</p>
            )}
          </section>
        )}

        <section className="qi-section">
          <h4>자주 나오는 문항</h4>
          <div className="preset-list">{QUESTION_PRESETS.map((p, i) => item(`p:${i}`, p.prompt, p.limit))}</div>
        </section>
      </div>
    </Modal>
  )
}
