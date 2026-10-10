import { BookOpen, Bot, CircleHelp, Info, KeyRound, MessageSquareHeart, Monitor, Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'
import { AboutContent } from '../components/AboutDialog'
import { AiSetup } from '../components/AiSetup'
import { AiUsageCard } from '../components/AiUsageCard'
import { CommunitySettingsCard } from '../components/CommunityConsent'
import { openFeedbackDialog } from '../components/FeedbackDialog'
import { useAppConfig } from '../useAppConfig'
import { openHelpDialog } from '../components/HelpDialog'
import { UpdateCard } from '../components/UpdateBanner'
import { openWelcomeDialog } from '../components/WelcomeDialog'
import { loggedInFor, useAiStatus } from '../useAiStatus'
import { desktop, type AiProvider, type BillingState, type ThemeSource } from '../desktop'
import { toast } from '../toast'
import { AI_PROVIDERS, saveAiProvider, savedAiProvider } from '../useAiTask'
import { useTheme } from '../useTheme'
import { AiLogo } from '../components/AiLogo'
import { HAS_GPT, IS_MAC } from '../platform'

/** 설정: 화면 테마 · AI · 업데이트 · Essay 정보 */
export function Settings() {
  return (
    <div className="page narrow">
      <header className="page-head">
        <div>
          <h1>설정</h1>
        </div>
      </header>

      <ThemeSettings />

      <AiSettings />

      <AiUsageCard />

      <UpdateCard />

      <CommunitySettingsCard />

      <LicenseCard />

      <section className="card">
        <header className="card-head">
          <h3>
            <Info size={18} /> Essay 정보
          </h3>
        </header>
        <AboutContent />
        <div className="btn-row">
          <button type="button" className="btn small" onClick={openFeedbackDialog}>
            <MessageSquareHeart size={14} /> 의견 보내기
          </button>
        </div>
      </section>
    </div>
  )
}

/** 이용권 (결제를 켠 뒤에만 보임) */
function LicenseCard() {
  const [b, setB] = useState<BillingState | null>(null)
  useEffect(() => {
    desktop.billing.state().then(setB, () => setB(null))
  }, [])
  if (!b?.enabled) return null
  return (
    <section className="card">
      <header className="card-head">
        <h3>
          <KeyRound size={18} /> 이용권
        </h3>
      </header>
      <p className="muted">{b.licensed ? `등록됨 · ${b.key}` : b.legacy ? '먼저 써 주신 분이라 계속 무료예요' : '등록 안 됨'}</p>
    </section>
  )
}

const THEMES: { value: ThemeSource; label: string; icon: React.ReactNode }[] = [
  { value: 'system', label: IS_MAC ? '시스템 설정' : '윈도우 설정', icon: <Monitor size={14} /> },
  { value: 'light', label: '밝게', icon: <Sun size={14} /> },
  { value: 'dark', label: '어둡게', icon: <Moon size={14} /> },
]

function ThemeSettings() {
  const { theme, set } = useTheme()
  return (
    <section className="card">
      <header className="card-head">
        <h3>화면 테마</h3>
      </header>
      <div className="segmented">
        {THEMES.map((t) => (
          <button type="button" key={t.value} className={theme.source === t.value ? 'on' : ''} onClick={() => set(t.value)}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>
    </section>
  )
}

function AiSettings() {
  const { status, checking, refresh } = useAiStatus()
  const [provider, setProvider] = useState<AiProvider>(savedAiProvider)

  const describe = (p: AiProvider) => {
    const st = status?.[p]
    if (!status) return '확인 중…'
    if (!st?.available) return '설치 안 됨'
    const login = loggedInFor(status, p) ? ' · 로그인됨' : st.loggedIn === false ? ' · 로그인 필요' : ' · 로그인 확인 안 됨'
    return `설치됨${login}`
  }

  return (
    <section className="card">
      <header className="card-head">
        <h3>
          <Bot size={18} /> AI 설정
        </h3>
      </header>
      <div className="ai-provider-list">
        {AI_PROVIDERS.map((x) => {
          const st = status?.[x.value]
          const on = provider === x.value
          return (
            <label key={x.value} className={'ai-provider' + (on ? ' on' : '')}>
              <input
                type="radio"
                name="ai-provider"
                checked={on}
                onChange={() => {
                  setProvider(x.value)
                  saveAiProvider(x.value)
                  toast(`${x.short}(으)로 AI를 실행해요`)
                }}
              />
              <span className="ai-provider-text">
                <strong>
                  <AiLogo provider={x.value} /> {x.label}
                </strong>
                <span className={'muted small' + (st && !st.available ? ' warn' : '')}>{describe(x.value)}</span>
              </span>
            </label>
          )
        })}
      </div>

      <AiSetup provider={provider} status={status} checking={checking} refresh={refresh} />
      <div className="btn-row">
        <button type="button" className="btn small" onClick={openWelcomeDialog}>
          <BookOpen size={14} /> 처음 설정 안내
        </button>
        <button type="button" className="btn small ghost" onClick={openHelpDialog}>
          <CircleHelp size={14} /> 도움말 ({IS_MAC ? '⌘/' : 'F1'})
        </button>
      </div>
      <PlanNotes />
    </section>
  )
}

/** 어떤 계정으로 어떤 AI 를 쓸 수 있는지 (사이트의 app-config.json 으로 갱신) */
function PlanNotes() {
  const config = useAppConfig()
  if (!config) return null
  const rows = [config.plans.agy, config.plans.claude, ...(HAS_GPT && config.plans.gpt ? [config.plans.gpt] : []), config.plans['gemini-free']]
  return (
    <details className="plan-notes">
      <summary>
        <strong>필요한 계정</strong> <span className="muted small">{config.checkedAt.replaceAll('-', '.')} 기준</span>
      </summary>
      {config.notice && <p className="ai-hint">{config.notice}</p>}
      <ul>
        {rows.map((r) => (
          <li key={r.name}>
            <b>{r.name}</b> · {r.need}
            {r.note && <span className="muted small"> — {r.note}</span>}
          </li>
        ))}
      </ul>
    </details>
  )
}
