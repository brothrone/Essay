import { HeartHandshake } from 'lucide-react'
import { useEffect, useState } from 'react'
import { loadCommunity, setConsent, useCommunity } from '../community'
import type { CommunityConsent } from '../desktop'
import { toast } from '../toast'
import { Modal } from './ui'

type Choice = Omit<CommunityConsent, 'at'>

const OPTIONS: { key: keyof Choice; title: string; desc: string }[] = [
  { key: 'stats', title: '사용 통계', desc: '기능별 사용 횟수, 앱 버전 · 운영체제 · AI 종류만 보내요.' },
  { key: 'errors', title: '오류 보고', desc: '오류 메시지를 보내요. 사용자 이름이 든 경로는 지워요.' },
  {
    key: 'questions',
    title: '회사별 자소서 문항 모음',
    desc: '공고에서 읽은 문항을 회사 · 직무와 함께 보내고, 다른 지원자가 모은 문항을 받아 봐요. 공고 본문과 내 답변은 안 보내요.',
  },
]

function Options({ value, onChange }: { value: Choice; onChange: (v: Choice) => void }) {
  return (
    <div className="consent-list">
      {OPTIONS.map((o) => (
        <label key={o.key} className="consent-item">
          <input type="checkbox" checked={value[o.key]} onChange={(e) => onChange({ ...value, [o.key]: e.target.checked })} />
          <span>
            <strong>{o.title}</strong>
            <span className="muted small">{o.desc}</span>
          </span>
        </label>
      ))}
    </div>
  )
}

const INTRO = '필요한 것만 익명으로 보내요. 자소서 내용, 이름, 메일, 파일 경로는 안 보내요.'

/** 서버가 켜져 있고 아직 고르지 않았으면, 처음 안내를 마친 뒤 한 번 묻는다. 닫기만 하면 다음 실행 때 다시 묻는다 */
export function CommunityConsentHost() {
  const [open, setOpen] = useState(false)
  const [choice, setChoice] = useState<Choice>({ stats: true, errors: true, questions: true })
  useEffect(() => {
    let alive = true
    const timer = setTimeout(async () => {
      let welcomed = false
      try {
        welcomed = localStorage.getItem('essay/welcome-done') === '1'
      } catch {
        /* 무시 */
      }
      const s = await loadCommunity()
      if (alive && welcomed && s.available && !s.consent) setOpen(true)
    }, 1500)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [])
  if (!open) return null
  const decide = async (c: Choice) => {
    await setConsent(c)
    setOpen(false)
    toast(c.stats || c.errors || c.questions ? '고마워요!' : '아무것도 보내지 않아요')
  }
  return (
    <Modal
      title="Essay 개선 돕기"
      onClose={() => setOpen(false)}
      footer={
        <>
          <button type="button" className="btn ghost mr-auto" onClick={() => decide({ stats: false, errors: false, questions: false })}>
            보내지 않기
          </button>
          <button type="button" className="btn primary" onClick={() => decide(choice)}>
            고른 대로 돕기
          </button>
        </>
      }
    >
      <div className="feedback">
        <p className="muted small">
          <HeartHandshake size={14} /> {INTRO} 설정에서 바꿀 수 있어요.
        </p>
        <Options value={choice} onChange={setChoice} />
      </div>
    </Modal>
  )
}

/** 설정 화면의 '개선 돕기' 카드 (서버가 켜져 있을 때만) */
export function CommunitySettingsCard() {
  const state = useCommunity()
  if (!state?.available) return null
  const value: Choice = { stats: !!state.consent?.stats, errors: !!state.consent?.errors, questions: !!state.consent?.questions }
  return (
    <section className="card">
      <header className="card-head">
        <h3>
          <HeartHandshake size={18} /> 개선 돕기
        </h3>
      </header>
      <p className="muted small">{INTRO}</p>
      <Options value={value} onChange={(v) => setConsent(v).then(() => toast('바꿨어요'))} />
    </section>
  )
}
