import { ArrowLeft, ArrowRight, Check, CircleHelp, FileUp, Lightbulb, Lock, Radar, Sparkles, Wallet } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { desktop, type AiProvider } from '../desktop'
import { buildSample } from '../sample'
import { isEmptyData, useStore } from '../store'
import { toast } from '../toast'
import { aiReady, useAiStatus } from '../useAiStatus'
import { AI_PREFS_EVENT, saveAiProvider, savedAiProvider } from '../useAiTask'
import { AiSetup } from './AiSetup'
import { openHelpDialog } from './HelpDialog'
import { Logo } from './Logo'
import { Modal } from './ui'

const DONE_KEY = 'essay/welcome-done'

type Listener = () => void
const listeners = new Set<Listener>()
/** 어디서든 처음 설정 안내를 연다 (도움말 메뉴 · 백업·데이터 화면) */
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

/** 첫 실행 때 저절로 뜨는 안내. 환영 → AI 고르기 → 설치·로그인 → 써 보기 */
export function WelcomeDialogHost() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const l = () => setOpen(true)
    listeners.add(l)
    const off = desktop.onWelcome(l)
    // 처음 켠 PC에서는 화면이 그려진 뒤 잠깐 있다가 연다
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

type AiChoice = 'agy' | 'claude' | 'gemini-free'

const CHOICES: { value: AiChoice; provider: AiProvider; name: string; need: string; cost: string; tag?: string }[] = [
  { value: 'agy', provider: 'gemini', name: 'Gemini', need: 'Google AI Pro · Ultra 구독', cost: '구독 사용량만 써요', tag: '권장' },
  { value: 'claude', provider: 'claude', name: 'Claude', need: 'Claude Pro · Max 구독', cost: '구독 사용량만 써요' },
  { value: 'gemini-free', provider: 'gemini', name: 'Gemini 무료', need: 'Google 계정만 있으면 돼요', cost: '무료 한도 안에서 써요' },
]

const STEP_LABELS = ['환영', 'AI 고르기', '연결하기', '써 보기']

function WelcomeWizard({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0)
  const [choice, setChoice] = useState<AiChoice>(() => (savedAiProvider() === 'claude' ? 'claude' : 'agy'))
  const { status, checking, refresh } = useAiStatus()
  const { data, replaceAll } = useStore()
  const navigate = useNavigate()

  const provider = CHOICES.find((c) => c.value === choice)!.provider
  const ready = aiReady(status, provider)

  const notify = () => window.dispatchEvent(new Event(AI_PREFS_EVENT))
  const pick = (c: AiChoice) => {
    setChoice(c)
    saveAiProvider(CHOICES.find((x) => x.value === c)!.provider)
    notify()
  }
  const later = () => {
    markWelcomeDone()
    sessionStorage.setItem('essay/ai-setup-later', '1')
    notify()
    onClose()
    toast('언제든 도움말 메뉴(F1)나 백업 · 데이터에서 다시 볼 수 있어요')
  }
  const finish = () => {
    markWelcomeDone()
    notify()
    onClose()
  }
  const trySample = () => {
    if (isEmptyData(data)) {
      replaceAll(buildSample())
      toast('예시 데이터를 넣었어요')
    }
    markWelcomeDone()
    onClose()
    navigate('/projects')
  }

  const title = ['Essay에 오신 걸 환영해요', '어떤 AI를 쓸까요?', 'AI 연결하기', '이제 써 볼까요?'][step]

  return (
    <Modal title={title} onClose={step === 3 ? finish : later} wide>
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
            <Logo size={64} />
            <div>
              <h3>자소서 쓰기, AI와 함께. 추가 요금은 없어요.</h3>
              <p className="muted">
                Essay는 <b>이미 쓰고 있는 AI 구독</b>으로 돌아가요. 유료 API 키도, 월 요금도, 건당 결제도 없어요.
              </p>
            </div>
          </div>
          <ul className="welcome-points grid">
            <li>
              <span className="welcome-icon">
                <Wallet size={18} />
              </span>
              <div>
                <strong>추가 비용 0원, 횟수 제한 없음</strong>
                <p>내 구독 한도만큼 써요. 첨삭 횟수를 세지 않아요.</p>
              </div>
            </li>
            <li>
              <span className="welcome-icon">
                <Sparkles size={18} />
              </span>
              <div>
                <strong>최신 모델 그대로</strong>
                <p>내가 고른 Claude · Gemini 최신 모델로 써요. 서비스용 저가 모델이 아니에요.</p>
              </div>
            </li>
            <li>
              <span className="welcome-icon">
                <Lock size={18} />
              </span>
              <div>
                <strong>내 글은 내 PC 밖으로 안 나가요</strong>
                <p>자소서·스펙·수험번호는 문서 폴더의 파일로만 남아요. 서버에 쌓이지 않아요.</p>
              </div>
            </li>
            <li>
              <span className="welcome-icon">
                <Lightbulb size={18} />
              </span>
              <div>
                <strong>경험이 바로 글이 돼요</strong>
                <p>STAR로 정리한 경험이 문항 옆에 뜨고, 이전 답변을 재활용하고, 다른 회사 이름이 섞이면 잡아 줘요.</p>
              </div>
            </li>
            <li>
              <span className="welcome-icon">
                <FileUp size={18} />
              </span>
              <div>
                <strong>예전 자소서 하나로 시작</strong>
                <p>통째로 넣으면 경험·스펙·공고 조건까지 한 번에 채워져요.</p>
              </div>
            </li>
            <li>
              <span className="welcome-icon">
                <Radar size={18} />
              </span>
              <div>
                <strong>공고는 웹 전체에서</strong>
                <p>사람인 · 잡코리아 · 원티드 · 공공기관을 한 번에 찾아요.</p>
              </div>
            </li>
          </ul>
          <p className="welcome-ready">
            준비는 딱 두 가지, <b>10분</b>이면 돼요. AI 프로그램을 한 번 설치하고 내 계정으로 로그인하면 끝. 버튼만 누르면 Essay가 대신 진행해요.
          </p>
        </div>
      )}

      {step === 1 && (
        <div className="welcome">
          <p className="muted">
            구독 중인 걸 고르세요. <b>하나만</b> 있으면 돼요. 나중에 다른 걸 추가해도 돼요.
          </p>
          <div className="ai-choice-list">
            {CHOICES.map((c) => (
              <button type="button" key={c.value} className={'ai-choice' + (choice === c.value ? ' on' : '')} onClick={() => pick(c.value)}>
                <span className="ai-choice-radio">{choice === c.value && <Check size={12} strokeWidth={3} />}</span>
                <span className="ai-choice-text">
                  <strong>
                    {c.name} {c.tag && <em className="badge tone-blue">{c.tag}</em>}
                  </strong>
                  <span>{c.need}</span>
                  <span className="ai-choice-cost">{c.cost}</span>
                </span>
              </button>
            ))}
          </div>
          <p className="muted small">
            구독이 하나도 없다면 <b>Gemini 무료</b>를 고르세요. 하루 사용량에 제한이 있지만 자소서 몇 편은 충분해요.
          </p>
        </div>
      )}

      {step === 2 && (
        <div className="welcome">
          <p className="muted">
            아래 버튼을 <b>위에서부터 차례로</b> 누르세요. 설치는 여기서 바로 진행되고, 로그인은 브라우저가 열리면 내 계정으로 로그인하면 돼요.
            {choice === 'gemini-free' && (
              <>
                {' '}
                무료로 쓰려면 1단계에서 <b>[Gemini CLI 설치]</b> 쪽을 누르세요(Node.js가 없으면 먼저 설치 버튼이 보여요).
              </>
            )}
          </p>
          <AiSetup provider={provider} status={status} checking={checking} refresh={refresh} />
          <p className="muted small">
            막혔나요?{' '}
            <button type="button" className="link-btn" onClick={() => openHelpDialog()}>
              <CircleHelp size={12} /> 문제 해결 보기
            </button>
          </p>
        </div>
      )}

      {step === 3 && (
        <div className="welcome">
          {ready ? (
            <p className="import-ok big">
              <Check size={16} /> AI 연결이 끝났어요. 이제 바로 쓸 수 있어요.
            </p>
          ) : (
            <p className="muted">
              AI 연결은 아직이에요. 자소서 작성은 AI 없이도 되고, 홈 위쪽 <b>[연결 관리]</b>에서 언제든 이어서 할 수 있어요.
            </p>
          )}
          <ol className="login-guide big">
            <li>
              <b>예시 데이터</b>로 시작하면 샘플 자소서와 경험이 들어와요. 아래 버튼으로 바로 넣을 수 있어요.
            </li>
            <li>
              자소서를 열고 오른쪽 <b>AI 도우미</b> 탭 → <b>[초안 쓰기]</b>. 30초쯤 뒤 글이 실시간으로 흘러나오면 성공이에요.
            </li>
            <li>
              홈 위쪽 AI 바에서 모델을 고를 수 있어요. 구독 사용량을 아끼려면 <b>"빠르고 한도 절약"</b>을 고르세요.
            </li>
          </ol>
          <p className="muted small">
            이 안내는 <b>도움말 메뉴(F1)</b>와 <b>백업 · 데이터</b>에서 언제든 다시 볼 수 있어요.
          </p>
        </div>
      )}

      <footer className="wizard-foot">
        {step === 0 ? (
          <button type="button" className="btn ghost" onClick={later}>
            나중에 할게요
          </button>
        ) : (
          <button type="button" className="btn ghost" onClick={() => setStep(step - 1)}>
            <ArrowLeft size={16} /> 이전
          </button>
        )}
        <span className="mr-auto" />
        {step === 0 && (
          <button type="button" className="btn primary" onClick={() => setStep(1)}>
            AI 연결 시작하기 <ArrowRight size={16} />
          </button>
        )}
        {step === 1 && (
          <button type="button" className="btn primary" onClick={() => setStep(2)}>
            다음 <ArrowRight size={16} />
          </button>
        )}
        {step === 2 && (
          <button type="button" className={'btn ' + (ready ? 'primary' : '')} onClick={() => setStep(3)}>
            {ready ? '다음' : '나중에 하고 넘어가기'} <ArrowRight size={16} />
          </button>
        )}
        {step === 3 && (
          <>
            {isEmptyData(data) && (
              <button type="button" className="btn" onClick={trySample}>
                <Sparkles size={16} /> 예시 데이터로 시작
              </button>
            )}
            <button type="button" className="btn primary" onClick={finish}>
              <Check size={16} /> 시작하기
            </button>
          </>
        )}
      </footer>
    </Modal>
  )
}
