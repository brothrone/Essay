import { Check, Download, ExternalLink, KeyRound, LoaderCircle, RefreshCw, Settings2, Sparkles, TerminalSquare } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { desktop, type AiProvider, type AiStatus, type TerminalAction } from '../desktop'
import { IS_MAC, PASTE_HINT, TERMINAL } from '../platform'
import { toast } from '../toast'
import { aiReady, loggedInFor, setLoginConfirmed, useAiStatus } from '../useAiStatus'
import { openGeminiLoginDialog } from './AuthCodeDialog'
import { openHelpDialog } from './HelpDialog'
import { InstallPanel, isInstallAction, useInstaller } from './InstallProgress'
import { AI_MODELS, AI_PREFS_EVENT, AI_PROVIDERS, saveAiModel, saveAiProvider, savedAiModel, savedAiProvider } from '../useAiTask'

type Step = { title: string; done: boolean; unknown?: boolean; body: ReactNode }

export function AiSetup({
  provider,
  status,
  checking,
  refresh,
  onProvider,
  onLater,
  title,
}: {
  provider: AiProvider
  status: AiStatus | null
  checking: boolean
  refresh: () => void
  /** 없으면 제공자 선택 UI를 숨긴다 (설정 화면처럼 바깥에 이미 있을 때) */
  onProvider?: (p: AiProvider) => void
  onLater?: () => void
  /** 카드 제목 (기본 'AI 연결하기'). 처음 설정 안내에서 카드가 여러 개일 때 'Gemini' · 'Claude' 로 */
  title?: string
}) {
  const [busy, setBusy] = useState<TerminalAction | 'web' | 'login' | null>(null)
  const [loginError, setLoginError] = useState('')
  const st = status?.[provider]
  // 설치는 창 없이 앱 안에서 진행 상황을 보여 주며 돌린다. 끝나면 상태를 다시 확인한다
  const installer = useInstaller((ok, action) => {
    if (ok && action !== 'install-node') {
      toast('설치가 끝났어요')
      refresh()
    }
  })
  // Antigravity CLI 로그인: 콘솔 창에서 agy 실행 + Essay 안내 창(인증 코드를 받아 그 창에 대신 입력)
  const geminiLogin = async () => {
    setBusy('login')
    setLoginError('')
    try {
      const r = await desktop.ai.geminiLogin()
      if (r.ok) openGeminiLoginDialog()
      else setLoginError(r.error || '로그인 창을 열지 못했어요')
    } finally {
      setTimeout(() => setBusy(null), 1500)
    }
  }
  const open = async (action: TerminalAction) => {
    setBusy(action)
    await desktop.ai.openTerminal(action)
    toast(`${TERMINAL} 창이 열렸어요. 끝나면 Essay로 돌아오세요`)
    setTimeout(() => setBusy(null), 1500)
  }
  const allowWeb = async () => {
    setBusy('web')
    try {
      await desktop.ai.geminiAllowWeb()
      toast('웹 읽기 권한을 허용했어요')
      refresh()
    } catch {
      toast('설정 파일을 고치지 못했어요')
    } finally {
      setBusy(null)
    }
  }
  const btn = (action: TerminalAction, label: string, primary = false) => (
    <button
      type="button"
      className={'btn small' + (primary ? ' primary' : '')}
      disabled={busy !== null || installer.running}
      onClick={() => (isInstallAction(action) ? installer.start(action) : open(action))}
    >
      {busy === action ? <LoaderCircle size={14} className="spin" /> : isInstallAction(action) ? <Download size={14} /> : <TerminalSquare size={14} />}{' '}
      {label}
    </button>
  )
  // CLI가 로그인 여부를 알려 주지 못하면 사용자가 직접 확정한다
  const confirmBtn = (p: AiProvider) => (
    <button
      type="button"
      className="btn small"
      onClick={() => {
        setLoginConfirmed(p, true)
        toast('로그인한 것으로 표시했어요. 실제로 안 돼 있으면 첫 AI 실행 때 로그인 오류가 나요')
        refresh()
      }}
    >
      <Check size={14} /> 로그인 마쳤어요
    </button>
  )
  const loginGuide = (lines: string[]) => (
    <ol className="login-guide">
      {lines.map((l) => (
        <li key={l}>{l}</li>
      ))}
    </ol>
  )

  const steps: Step[] = []
  if (provider === 'gemini') {
    const g = status?.gemini
    const gLogged = !!status && loggedInFor(status, 'gemini')
    steps.push({
      title: g?.available ? `설치됨 · ${g.cli === 'agy' ? 'Antigravity CLI(agy)' : 'Gemini CLI(gemini)'}` : 'Antigravity CLI 설치',
      done: !!g?.available,
      body: g?.available ? (
        <span className="muted small">{g.path}</span>
      ) : (
        <>
          <p className="muted small">
            Antigravity CLI 하나면 돼요. Google AI Pro · Ultra 구독은 물론 무료 Google 계정으로도 로그인돼요(무료는 한도가 작아요).
          </p>
          <div className="btn-row">{btn('install-agy', 'Antigravity CLI 설치', true)}</div>
        </>
      ),
    })
    const loginAction: TerminalAction = g?.cli === 'gemini' ? 'login-gemini' : 'login-agy'
    steps.push({
      title: gLogged ? 'Google 계정 로그인됨' : 'Google 계정으로 로그인',
      done: gLogged,
      unknown: !!g?.available && g.loggedIn === null,
      body: gLogged ? null : (
        <>
          {!g?.available ? (
            <p className="muted small">설치가 끝나면 로그인할 수 있어요.</p>
          ) : g.cli === 'gemini' ? (
            loginGuide([
              '열리는 창에서 "Login with Google"을 고르고 브라우저에서 로그인.',
              '창에 /quit 를 입력해 끝낸 뒤 [로그인 마쳤어요].',
            ])
          ) : (
            loginGuide([
              '브라우저가 열리면 Google 계정으로 로그인.',
              '화면에 뜨는 인증 코드를 [Copy to Clipboard]로 복사.',
              IS_MAC ? 'Essay 창에 ⌘V 로 붙여넣고 [코드 보내기].' : 'Essay 창에 붙여넣고 [코드 보내기].',
            ])
          )}
          {g?.available && (
            <div className="btn-row">
              {g.cli === 'agy' ? (
                <button type="button" className="btn small primary" disabled={busy !== null} onClick={geminiLogin}>
                  {busy === 'login' ? <LoaderCircle size={14} className="spin" /> : <KeyRound size={14} />} 로그인
                </button>
              ) : (
                btn(loginAction, '로그인 창 열기', true)
              )}
              {g.loggedIn === null && confirmBtn('gemini')}
            </div>
          )}
          {loginError && <p className="ai-error">{loginError}</p>}
        </>
      ),
    })
    if (g?.available && g.cli === 'agy')
      steps.push({
        title: g.webAllowed ? '웹 읽기 권한 허용됨' : '웹 읽기 권한 (맞춤 공고 · 공고 링크용)',
        done: g.webAllowed,
        body: g.webAllowed ? null : (
          <>
            <p className="muted small">맞춤 공고와 공고 링크 불러오기에 필요해요. 글쓰기만 쓰면 건너뛰어도 돼요.</p>
            <button type="button" className="btn small" disabled={busy !== null} onClick={allowWeb}>
              웹 읽기 권한 허용
            </button>
          </>
        ),
      })
  } else {
    const c = status?.claude
    const cLogged = !!status && loggedInFor(status, 'claude')
    steps.push({
      title: c?.available ? '설치됨 · Claude Code' : 'Claude Code 설치',
      done: !!c?.available,
      body: c?.available ? (
        <span className="muted small">{c.path}</span>
      ) : (
        <>
          <p className="muted small">1~2분 걸려요.</p>
          <div className="btn-row">{btn('install-claude', 'Claude Code 설치', true)}</div>
        </>
      ),
    })
    steps.push({
      title: cLogged ? 'Claude 구독 계정 로그인됨' : 'Claude 구독 계정으로 로그인',
      done: cLogged,
      unknown: !!c?.available && c.loggedIn === null,
      body: cLogged ? null : (
        <>
          {c?.available ? (
            loginGuide([
              '브라우저가 열리면 Claude 구독 계정으로 로그인. (Anthropic Console 계정은 API 요금이 나가요.)',
              `인증 코드를 복사해 열린 창에 붙여넣고(${PASTE_HINT}) Enter.`,
              '완료 메시지가 뜨면 창을 닫으세요.',
            ])
          ) : (
            <p className="muted small">설치가 끝나면 로그인할 수 있어요.</p>
          )}
          {c?.available && (
            <div className="btn-row">
              {btn('login-claude', '로그인 창 열기', true)}
              {c.loggedIn === null && confirmBtn('claude')}
            </div>
          )}
        </>
      ),
    })
  }

  const ready = aiReady(status, provider)

  return (
    <section className={'card ai-setup' + (ready ? ' ready' : '')}>
      <header className="card-head">
        <h3>{title ? title : <><Sparkles size={18} /> AI 연결하기</>}</h3>
        <div className="btn-row">
          {!status ? (
            <span className="muted small">확인 중…</span>
          ) : ready ? (
            <span className="import-ok">
              <Check size={14} /> {AI_PROVIDERS.find((x) => x.value === provider)!.short} 사용 가능
            </span>
          ) : (
            <span className="badge tone-amber">{st?.available ? '로그인 필요' : '설치 필요'}</span>
          )}
          <button type="button" className="btn small" onClick={refresh} disabled={checking}>
            {checking ? <LoaderCircle size={14} className="spin" /> : <RefreshCw size={14} />} 연결 확인
          </button>
        </div>
      </header>

      {onProvider && (
        <div className="segmented ai-setup-pick">
          {[...AI_PROVIDERS].reverse().map((x) => (
            <button type="button" key={x.value} className={provider === x.value ? 'on' : ''} onClick={() => onProvider(x.value)}>
              {x.value === 'gemini' ? 'Gemini (Google 계정)' : 'Claude (Claude 구독)'}
              {status && aiReady(status, x.value) && <Check size={12} />}
            </button>
          ))}
        </div>
      )}

      <ol className="setup-steps">
        {steps.map((s, i) => (
          <li key={s.title} className={s.done ? 'done' : s.unknown ? 'unknown' : ''}>
            <span className="setup-num">{s.done ? <Check size={13} strokeWidth={3} /> : i + 1}</span>
            <div className="setup-body">
              <strong>{s.title}</strong>
              {s.body}
              {i === 0 && installer.state && <InstallPanel installer={installer} />}
            </div>
          </li>
        ))}
      </ol>

      <p className="muted small">
        API 키 없이 로그인한 CLI만 실행해요. 요금이 따로 나가지 않아요.{' '}
        <button type="button" className="link-btn" onClick={() => openHelpDialog()}>
          도움말
        </button>{' '}
        {provider === 'gemini' ? (
          <a href="https://antigravity.google/cli" target="_blank" rel="noreferrer" className="link-btn">
            Antigravity CLI 안내 <ExternalLink size={11} />
          </a>
        ) : (
          <a href="https://claude.ai/download" target="_blank" rel="noreferrer" className="link-btn">
            Claude Code 안내 <ExternalLink size={11} />
          </a>
        )}
      </p>
      {onLater && !ready && (
        <div className="btn-row">
          <button type="button" className="btn small ghost" onClick={onLater}>
            나중에 할게요 (AI 없이도 자소서 작성은 돼요)
          </button>
        </div>
      )}
    </section>
  )
}

/** 홈 상단: 어떤 AI · 어떤 모델을 쓰는지 고르고 연결 상태를 본다. 준비가 안 됐으면 아래에 연결 카드가 펼쳐진다 */
export function HomeAi() {
  const { status, checking, refresh } = useAiStatus()
  const [provider, setProvider] = useState<AiProvider>(savedAiProvider)
  const [model, setModel] = useState(() => savedAiModel(savedAiProvider()))
  const [later, setLater] = useState(() => sessionStorage.getItem('essay/ai-setup-later') === '1')
  const [manage, setManage] = useState(false)

  // 처음 설정 안내(환영 창)에서 AI 를 고르거나 '나중에' 를 누르면 저장값을 다시 읽는다
  useEffect(() => {
    const sync = () => {
      const p = savedAiProvider()
      setProvider(p)
      setModel(savedAiModel(p))
      setLater(sessionStorage.getItem('essay/ai-setup-later') === '1')
    }
    window.addEventListener(AI_PREFS_EVENT, sync)
    return () => window.removeEventListener(AI_PREFS_EVENT, sync)
  }, [])

  const ready = aiReady(status, provider)
  const st = status?.[provider]
  const cliName = provider === 'claude' ? 'Claude Code' : st && 'cli' in st && st.cli === 'gemini' ? 'Gemini CLI' : 'Antigravity CLI'
  const showSetup = manage || (!ready && !later && !!status)

  const pick = (p: AiProvider) => {
    setProvider(p)
    saveAiProvider(p)
    setModel(savedAiModel(p))
  }

  return (
    <>
      <section className="card ai-bar">
        <div className="ai-bar-main">
          <span className="ai-bar-label">
            <Sparkles size={16} /> AI
          </span>
          <div className="segmented">
            {[...AI_PROVIDERS].reverse().map((x) => (
              <button type="button" key={x.value} className={provider === x.value ? 'on' : ''} onClick={() => pick(x.value)}>
                {x.value === 'gemini' ? 'Gemini' : 'Claude'}
                {status && aiReady(status, x.value) && <Check size={12} />}
              </button>
            ))}
          </div>
          <select
            value={model}
            aria-label="AI 모델"
            onChange={(e) => {
              setModel(e.target.value)
              saveAiModel(provider, e.target.value)
            }}
          >
            {AI_MODELS[provider].map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div className="ai-bar-status">
          {!status ? (
            <span className="muted small">연결 확인 중…</span>
          ) : ready ? (
            <span className="import-ok">
              <Check size={14} /> {cliName} 사용 가능
            </span>
          ) : st?.available ? (
            <span className="badge tone-amber">로그인 필요</span>
          ) : (
            <span className="badge tone-amber">{cliName} 설치 필요</span>
          )}
          <button type="button" className={'btn small' + (showSetup ? '' : ' ghost')} onClick={() => setManage((v) => !v || !ready)}>
            <Settings2 size={14} /> {showSetup && ready ? '닫기' : '연결 관리'}
          </button>
        </div>
      </section>

      {showSetup && (
        <AiSetup
          provider={provider}
          status={status}
          checking={checking}
          refresh={refresh}
          onLater={
            ready
              ? undefined
              : () => {
                  sessionStorage.setItem('essay/ai-setup-later', '1')
                  setLater(true)
                  setManage(false)
                }
          }
        />
      )}
    </>
  )
}
