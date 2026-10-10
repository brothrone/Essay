import { useEffect, useRef, useState } from 'react'
import { desktop, type AiProvider, type AiResult } from './desktop'
import { HAS_GPT } from './platform'
import { noteAiResult } from './useAiStatus'

export const AI_MODEL_KEY = 'essay/ai-model'
export const AI_PROVIDER_KEY = 'essay/ai-provider'
/** 다른 화면(환영 창)에서 AI 선택을 바꿨을 때 홈 AI 바가 다시 읽도록 알리는 이벤트 */
export const AI_PREFS_EVENT = 'essay:ai-prefs'

/** name: 탭 · 카드 제목, account: 로그인하는 계정 */
type ProviderInfo = { value: AiProvider; label: string; short: string; cli: string; name: string; account: string }
const ALL_PROVIDERS: ProviderInfo[] = [
  { value: 'claude', label: 'Claude (Claude Code · Claude 구독)', short: 'Claude 구독', cli: 'claude', name: 'Claude', account: 'Claude 구독' },
  { value: 'gemini', label: 'Gemini (Antigravity CLI · Google 계정)', short: 'Gemini', cli: 'agy 또는 gemini', name: 'Gemini', account: 'Google 계정' },
  { value: 'gpt', label: 'GPT (Codex CLI · ChatGPT 계정)', short: 'GPT', cli: 'codex', name: 'GPT', account: 'ChatGPT 계정' },
]
/** 이 운영체제에서 고를 수 있는 AI (설정 화면 순서) */
export const AI_PROVIDERS = ALL_PROVIDERS.filter((x) => HAS_GPT || x.value !== 'gpt')
/** 홈 AI 바 · 연결 카드 탭 순서: Gemini → Claude → GPT */
export const AI_TABS = (['gemini', 'claude', 'gpt'] as AiProvider[]).flatMap((v) => AI_PROVIDERS.filter((x) => x.value === v))
export const providerInfo = (p: AiProvider) => ALL_PROVIDERS.find((x) => x.value === p)!

function cliModels(p: AiProvider) {
  try {
    return desktop.ai.models(p)
  } catch {
    return []
  }
}
let gptModels: { at: number; list: { value: string; label: string }[] } = { at: 0, list: [] }

export const AI_MODELS: Record<AiProvider, { value: string; label: string }[]> = {
  claude: [
    { value: '', label: '기본 모델 (Claude Code 설정)' },
    { value: 'opus', label: 'Opus · 가장 잘 씀' },
    { value: 'sonnet', label: 'Sonnet · 빠르고 한도 절약' },
  ],
  gemini: [
    { value: '', label: '기본 모델 (Antigravity 설정)' },
    { value: 'gemini-3.1-pro-high', label: 'Gemini 3.1 Pro · 가장 잘 씀' },
    { value: 'gemini-3.8-flash-high', label: 'Gemini 3.8 Flash · 빠르고 한도 절약' },
  ],
  // 요금제 · 시기마다 모델이 바뀌어서 기본은 Codex 가 정한 모델, 나머지는 Codex 가 받아 둔 목록(한 번 실행한 뒤부터 보임).
  // 첫 실행 뒤 목록이 생기므로 1분마다 다시 읽는다
  get gpt() {
    if (HAS_GPT && Date.now() - gptModels.at > 60000) gptModels = { at: Date.now(), list: cliModels('gpt') }
    return [{ value: '', label: '기본 모델 (Codex 추천)' }, ...gptModels.list]
  },
}

/** 고른 적이 없으면 Gemini(Google 계정) 가 기본 */
export function savedAiProvider(): AiProvider {
  try {
    const v = localStorage.getItem(AI_PROVIDER_KEY)
    return v === 'claude' || (v === 'gpt' && HAS_GPT) ? v : 'gemini'
  } catch {
    return 'gemini'
  }
}

export function saveAiProvider(p: AiProvider) {
  try {
    localStorage.setItem(AI_PROVIDER_KEY, p)
  } catch {
    /* 저장 못 해도 이번 세션에는 적용됨 */
  }
  try {
    desktop.community.setContext({ ai: p }) // 익명 통계의 'AI 종류' (동의했을 때만 보냄)
  } catch {
    /* 무시 */
  }  // 열려 있는 다른 화면(AI 도우미 · 대화 · 홈 AI 바 · 설정)도 같은 AI 로 바뀌게 알린다
  window.dispatchEvent(new Event(AI_PREFS_EVENT))
}


export function savedAiModel(provider: AiProvider = savedAiProvider()) {
  try {
    const v = localStorage.getItem(`${AI_MODEL_KEY}:${provider}`) ?? (provider === 'claude' ? localStorage.getItem(AI_MODEL_KEY) ?? '' : '')
    // GPT 모델 목록은 바뀌므로 목록에서 사라진(은퇴한) 모델이면 기본으로
    return provider === 'gpt' && !AI_MODELS.gpt.some((m) => m.value === v) ? '' : v
  } catch {
    return ''
  }
}

export function saveAiModel(provider: AiProvider, model: string) {
  try {
    localStorage.setItem(`${AI_MODEL_KEY}:${provider}`, model)
  } catch {
    /* 저장 못 해도 이번 세션에는 적용됨 */
  }
}

/** 설치된 AI CLI로 웹 작업(공고 찾기 · 공고 읽기)을 돌리고 진행 단계를 모은다 */
export function useAiTask({ cancelOnUnmount = true } = {}) {
  const ai = desktop.ai
  const [running, setRunning] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [steps, setSteps] = useState<string[]>([])
  const active = useRef(false)
  const keepAlive = useRef(!cancelOnUnmount)

  useEffect(
    () =>
      ai.onProgress((p) => {
        if (!active.current || !p.tool) return
        const label = p.tool === 'WebSearch' ? '검색' : p.tool === 'WebFetch' ? '공고 읽기' : p.tool
        setSteps((s) => [...s, `${label} · ${p.detail || ''}`].slice(-8))
      }),
    [ai],
  )

  useEffect(() => {
    if (!running) return
    const t0 = Date.now()
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 500)
    return () => clearInterval(id)
  }, [running])

  useEffect(
    () => () => {
      if (active.current && !keepAlive.current) ai.cancel()
    },
    [ai],
  )

  const run = async (prompt: string, opts: { web?: boolean } = {}): Promise<AiResult> => {
    active.current = true
    setRunning(true)
    setElapsed(0)
    setSteps([])
    const provider = savedAiProvider()
    const r = await ai.run(prompt, savedAiModel(provider) || undefined, { ...opts, provider })
    noteAiResult(provider, r)
    active.current = false
    setRunning(false)
    return r
  }

  return { run, running, elapsed, steps, cancel: () => ai.cancel() }
}
