import { BookOpen, Bot, CircleHelp, Info, Monitor, Moon, Sun } from 'lucide-react'
import { useState } from 'react'
import { AboutContent } from '../components/AboutDialog'
import { AiSetup } from '../components/AiSetup'
import { openHelpDialog } from '../components/HelpDialog'
import { UpdateCard } from '../components/UpdateBanner'
import { openWelcomeDialog } from '../components/WelcomeDialog'
import { loggedInFor, useAiStatus } from '../useAiStatus'
import { type AiProvider, type ThemeSource } from '../desktop'
import { toast } from '../toast'
import { AI_PROVIDERS, saveAiProvider, savedAiProvider } from '../useAiTask'
import { useTheme } from '../useTheme'
import { IS_MAC } from '../platform'

/** 설정: 화면 테마 · AI · 업데이트 · Essay 정보 */
export function Settings() {
  return (
    <div className="page narrow">
      <header className="page-head">
        <div>
          <h1>설정</h1>
          <p className="muted">화면 테마와 AI 연결, 업데이트를 여기서 관리해요. 백업과 데이터 정리는 왼쪽의 [백업] · [데이터]에 있어요.</p>
        </div>
      </header>

      <ThemeSettings />

      <AiSettings />

      <UpdateCard />

      <section className="card">
        <header className="card-head">
          <h3>
            <Info size={18} /> Essay 정보
          </h3>
        </header>
        <AboutContent />
      </section>
    </div>
  )
}

const THEMES: { value: ThemeSource; label: string; icon: React.ReactNode }[] = [
  { value: 'system', label: IS_MAC ? '시스템 설정 따라가기' : '윈도우 설정 따라가기', icon: <Monitor size={14} /> },
  { value: 'light', label: '밝게', icon: <Sun size={14} /> },
  { value: 'dark', label: '어둡게', icon: <Moon size={14} /> },
]

function ThemeSettings() {
  const { theme, set } = useTheme()
  return (
    <section className="card">
      <header className="card-head">
        <h3>화면 테마</h3>
        <span className="muted small">{theme.source === 'system' ? `지금은 ${IS_MAC ? '시스템' : '윈도우'} 설정대로 ${theme.dark ? '어둡게' : '밝게'}` : ''}</span>
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
    if (!st?.available) return `${AI_PROVIDERS.find((x) => x.value === p)!.cli} 명령어를 찾지 못했어요 — 아래에서 설치·로그인하세요`
    const cliName = p === 'gemini' ? (st.cli === 'agy' ? 'Antigravity CLI(agy)' : 'Gemini CLI(gemini)') : 'Claude Code'
    const login = loggedInFor(status, p) ? ' · 로그인됨' : st.loggedIn === false ? ' · 로그인 필요' : ' · 로그인 확인 안 됨'
    return `${cliName} 설치됨${login} · ${st.path}`
  }

  return (
    <section className="card">
      <header className="card-head">
        <h3>
          <Bot size={18} /> AI 설정
        </h3>
        <span className="muted small">API 키 없이 로그인 계정으로만 실행돼요</span>
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
                <strong>{x.label}</strong>
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
      <p className="muted small">
        설치 경로가 특이하면 환경 변수 ESSAY_CLAUDE_PATH · ESSAY_AGY_PATH · ESSAY_GEMINI_PATH 에 실행 파일 전체 경로를 넣어 주세요.
      </p>
    </section>
  )
}
