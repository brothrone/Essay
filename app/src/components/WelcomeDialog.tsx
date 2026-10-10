import { ArrowLeft, ArrowRight, Check, FileUp } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { desktop, type AiProvider } from '../desktop'
import { buildSample } from '../sample'
import { isEmptyData, useStore } from '../store'
import { aiReady, useAiStatus } from '../useAiStatus'
import { HAS_GPT } from '../platform'
import { AI_PREFS_EVENT, providerInfo, saveAiProvider, savedAiProvider } from '../useAiTask'
import { AiSetup } from './AiSetup'
import { openHelpDialog } from './HelpDialog'
import { openImportDialog } from './ImportModal'
import { Logo } from './Logo'
import { Modal } from './ui'
import { useAppConfig } from '../useAppConfig'

const DONE_KEY = 'essay/welcome-done'

type Listener = () => void
const listeners = new Set<Listener>()
/** 어디서든 처음 설정 안내를 연다 (도움말 메뉴 · 설정 화면) */
export function openWelcomeDialog() {
  listeners.forEach((l) => l())
}

function welcomeDone() {
  try {
    return localStorage.getItem(DONE_KEY) === '1'
  } catch {
    return true
  }
}
function markWelcomeDone() {
  try {
    localStorage.setItem(DONE_KEY, '1')
  } catch {
    /* 무시 */
  }
}

/** 첫 실행 때 저절로 뜨는 안내. 소개 → AI 고르기 → 연결 → 끝 */
export function WelcomeDialogHost() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const l = () => setOpen(true)
    listeners.add(l)
    const off = desktop.onWelcome(l)
    const t = welcomeDone() ? 0 : window.setTimeout(() => setOpen(true), 500)
    return () => {
      listeners.delete(l)
      off()
      if (t) clearTimeout(t)
    }
  }, [])
  if (!open) return null
  return <WelcomeWizard onClose={() => setOpen(false)} />
}

type AiChoice = 'agy' | 'claude' | 'gpt' | 'gemini-free'

const ALL_CHOICES: { value: AiChoice; provider: AiProvider; name: string; need: string }[] = [
  { value: 'agy', provider: 'gemini', name: 'Gemini', need: 'Google AI Pro · Ultra 구독' },
  { value: 'claude', provider: 'claude', name: 'Claude', need: 'Claude Pro · Max 구독' },
  { value: 'gpt', provider: 'gpt', name: 'ChatGPT', need: 'ChatGPT 계정 · 무료 · Go 는 한도 작음' },
  { value: 'gemini-free', provider: 'gemini', name: 'Gemini 무료', need: '무료 Google 계정 · 한도 작음' },
]
const CHOICES = ALL_CHOICES.filter((c) => HAS_GPT || c.value !== 'gpt')
const CHOICE_OF: Record<AiProvider, AiChoice> = { gemini: 'agy', claude: 'claude', gpt: 'gpt' }

const STEP_LABELS = ['소개', 'AI', '연결', '내 자소서']

function WelcomeWizard({ onClose }: { onClose: () => void }) {
  const config = useAppConfig()
  const [step, setStep] = useState(0)
  // 여러 개 골라도 된다. 먼저 고른 것이 홈의 기본 AI
  const [choices, setChoices] = useState<AiChoice[]>(() => [CHOICE_OF[savedAiProvider()]])
  const { status, checking, refresh } = useAiStatus()
  const { data, replaceAll } = useStore()
  const navigate = useNavigate()

  const providers = CHOICES.filter((c) => choices.includes(c.value))
    .map((c) => c.provider)
    .filter((p, i, a) => a.indexOf(p) === i)
  const ready = providers.length > 0 && providers.every((p) => aiReady(status, p))
  const anyReady = providers.some((p) => aiReady(status, p))

  const notify = () => window.dispatchEvent(new Event(AI_PREFS_EVENT))
  const pick = (c: AiChoice) => {
    const next = choices.includes(c) ? choices.filter((x) => x !== c) : [...choices, c]
    if (!next.length) return
    setChoices(next)
    saveAiProvider(CHOICES.find((x) => x.value === next[0])!.provider)
    notify()
  }
  const close = () => {
    markWelcomeDone()
    if (!ready) sessionStorage.setItem('essay/ai-setup-later', '1')
    notify()
    onClose()
  }
  // 마지막 단계: 예전 자소서 불러오기 창을 띄워 바로 내 경험 · 스펙 · 학력을 채우게 한다
  const finishWithImport = () => {
    close()
    window.setTimeout(openImportDialog, 150)
  }

  const trySample = () => {
    if (isEmptyData(data)) replaceAll(buildSample())
    close()
    navigate('/projects')
  }

  const title = ['Essay', 'AI 고르기', 'AI 연결', '준비 끝'][step]

  return (
    <Modal title={title} onClose={close} wide>
      <ol className="wizard-steps" aria-label="진행 단계">
        {STEP_LABELS.map((l, i) => (
          <li key={l} className={i < step ? 'done' : i === step ? 'now' : ''}>
            <span className="wizard-dot">{i < step ? <Check size={12} strokeWidth={3} /> : i + 1}</span>
            {l}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="welcome">
          <div className="welcome-hero">
            <Logo size={44} />
            <div>
              <h3>내 AI 구독으로 자소서를 씁니다.</h3>
              <p className="muted">{HAS_GPT ? 'Google AI · Claude · ChatGPT' : 'Google AI나 Claude'} 구독에 로그인하면 끝. API 키도, 추가 요금도 없습니다.</p>
            </div>
          </div>
          <ul className="welcome-points">
            <li>
              <strong>자소서 사이트 구독료 없음</strong>
              <p>이미 쓰는 Claude · Google AI{HAS_GPT && ' · ChatGPT'} 구독(또는 무료 Google 계정) 한도 안에서 씁니다.</p>
            </li>
            <li>
              <strong>최신 모델</strong>
              <p>Claude, Gemini{HAS_GPT && ', GPT'} 최신 모델을 직접 고릅니다.</p>
            </li>
            <li>
              <strong>데이터는 이 컴퓨터에만</strong>
              <p>자소서와 스펙은 문서 폴더의 파일로 남습니다.</p>
            </li>
            <li>
              <strong>경험에서 글로</strong>
              <p>STAR로 정리한 경험을 문항 옆에 두고 씁니다. 회사 이름이 섞이면 잡아 줍니다.</p>
            </li>
            <li>
              <strong>예전 자소서로 시작</strong>
              <p>파일을 넣으면 경험과 스펙이 채워집니다.</p>
            </li>
            <li>
              <strong>공고는 웹 전체에서</strong>
              <p>사람인, 잡코리아, 원티드, 공공기관을 한 번에.</p>
            </li>
          </ul>
          <p className="muted small">준비는 AI 프로그램 설치와 로그인, 10분이면 됩니다.</p>
        </div>
      )}

      {step === 1 && (
        <div className="welcome">
          <p className="muted">쓰고 있는 구독을 고르세요. 여러 개도 됩니다.</p>
          <div className="ai-choice-list">
            {CHOICES.map((c) => (
              <button
                type="button"
                key={c.value}
                role="checkbox"
                aria-checked={choices.includes(c.value)}
                className={'ai-choice' + (choices.includes(c.value) ? ' on' : '')}
                onClick={() => pick(c.value)}
              >
                <span className="ai-choice-radio check">{choices.includes(c.value) && <Check size={12} strokeWidth={3} />}</span>
                <span className="ai-choice-text">
                  <strong>{c.name}</strong>
                  <span>{config?.plans[c.value]?.need || c.need}</span>
                </span>
              </button>
            ))}
          </div>
          <p className="muted small">
            구독이 없으면 {HAS_GPT ? 'Gemini 무료나 무료 ChatGPT 계정.' : 'Gemini 무료.'}
            {choices.length > 1 && <> 기본 AI는 먼저 고른 {CHOICES.find((c) => c.value === choices[0])!.name}.</>}
          </p>
        </div>
      )}

      {step === 2 && (
        <div className="welcome">
          <p className="muted">
            위에서부터 차례로 누르세요.
            {choices.includes('gemini-free') && <> 무료 Google 계정도 Antigravity CLI 로 로그인하면 돼요.</>}
          </p>
          {providers.map((p) => (
            <AiSetup key={p} provider={p} status={status} checking={checking} refresh={refresh} title={providerInfo(p).name} />
          ))}
          <p className="muted small">
            안 되면{' '}
            <button type="button" className="link-btn" onClick={() => openHelpDialog()}>
              도움말
            </button>
          </p>
        </div>
      )}

      {step === 3 && (
        <div className="welcome">
          <p className={ready || anyReady ? 'import-ok big' : 'muted'}>
            {ready ? (
              <>
                <Check size={16} /> AI가 연결됐습니다.
              </>
            ) : anyReady ? (
              <>
                <Check size={16} /> 하나가 연결됐습니다. 나머지는 홈의 [연결 관리]에서.
              </>
            ) : (
              <>AI는 나중에 홈의 [연결 관리]에서 연결할 수 있습니다. 자소서 작성은 AI 없이도 됩니다.</>
            )}
          </p>
          <div className="welcome-import">
            <span className="welcome-import-icon">
              <FileUp size={22} />
            </span>
            <div>
              <strong>마지막으로, 지금까지 쓴 자소서를 넣어 주세요</strong>
              <p className="muted small">
                예전 자소서 · 이력서 파일을 넣거나 붙여넣으면 AI가 경험(STAR) · 스펙 · 학력 · 어학 · 수상을 뽑아 채우고, 맞춤 공고 조건까지 잡아요.
                한 번만 하면 이후 초안 쓰기와 공고 추천이 내 이야기로 맞춰집니다.
              </p>
            </div>
          </div>
          <p className="muted small">이 안내는 F1 도움말과 설정에서 다시 볼 수 있습니다.</p>
        </div>
      )}

      <footer className="wizard-foot">
        {step === 0 ? (
          <button type="button" className="btn ghost" onClick={close}>
            나중에
          </button>
        ) : (
          <button type="button" className="btn ghost" onClick={() => setStep(step - 1)}>
            <ArrowLeft size={16} /> 이전
          </button>
        )}
        <span className="mr-auto" />
        {step < 2 && (
          <button type="button" className="btn primary" onClick={() => setStep(step + 1)}>
            다음 <ArrowRight size={16} />
          </button>
        )}
        {step === 2 && (
          <button type="button" className={'btn ' + (ready || anyReady ? 'primary' : '')} onClick={() => setStep(3)}>
            {ready || anyReady ? '다음' : '건너뛰기'} <ArrowRight size={16} />
          </button>
        )}
        {step === 3 && (
          <>
            {isEmptyData(data) && (
              <button type="button" className="btn ghost" onClick={trySample}>
                예시 데이터로 둘러보기
              </button>
            )}
            <button type="button" className="btn" onClick={close}>
              나중에 넣을게요
            </button>
            <button type="button" className="btn primary" onClick={finishWithImport}>
              <FileUp size={16} /> 예전 자소서 넣기
            </button>
          </>
        )}
      </footer>
    </Modal>
  )
}
