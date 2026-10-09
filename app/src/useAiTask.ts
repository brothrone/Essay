import { useEffect, useRef, useState } from 'react'
import { desktop, type AiProvider, type AiResult } from './desktop'
import { noteAiResult } from './useAiStatus'

export const AI_MODEL_KEY = 'essay/ai-model'
export const AI_PROVIDER_KEY = 'essay/ai-provider'
/** 다른 화면(환영 창)에서 AI 선택을 바꿨을 때 홈 AI 바가 다시 읽도록 알리는 이벤트 */
export const AI_PREFS_EVENT = 'essay:ai-prefs'

export const AI_PROVIDERS: { value: AiProvider; label: string; short: string; cli: string }[] = [
  { value: 'claude', label: 'Claude (Claude Code · Claude 구독)', short: 'Claude 구독', cli: 'claude' },
  { value: 'gemini', label: 'Gemini (Antigravity CLI · Google 계정)', short: 'Gemini', cli: 'agy 또는 gemini' },
]

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
}

/** 고른 적이 없으면 Gemini(Google 계정) 가 기본 */
export function savedAiProvider(): AiProvider {
  try {
    return localStorage.getItem(AI_PROVIDER_KEY) === 'claude' ? 'claude' : 'gemini'
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
}

export function savedAiModel(provider: AiProvider = savedAiProvider()) {
  try {
    return localStorage.getItem(`${AI_MODEL_KEY}:${provider}`) ?? (provider === 'claude' ? localStorage.getItem(AI_MODEL_KEY) ?? '' : '')
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
