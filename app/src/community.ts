import { useEffect, useState } from 'react'
import { desktop, type CommunityConsent, type CommunityState } from './desktop'
import { AI_PREFS_EVENT, savedAiProvider } from './useAiTask'

// 개선 돕기(의견 보내기 · 익명 통계 · 오류 보고 · 문항 모음). 보낼지 말지는 메인 프로세스가 동의와 서버 주소를 보고 정한다

/** 기능을 썼다는 횟수 하나. 동의하지 않았으면 메인 프로세스가 버린다 */
export function track(name: string) {
  try {
    desktop.community.track(name)
  } catch {
    /* 무시 */
  }
}

const CHANGED = 'essay:community'
let cached: Promise<CommunityState> | null = null
export const loadCommunity = (fresh = false) => (fresh || !cached ? (cached = desktop.community.state()) : cached)

export async function setConsent(c: Omit<CommunityConsent, 'at'>) {
  const consent = await desktop.community.setConsent(c)
  cached = null
  window.dispatchEvent(new Event(CHANGED))
  return consent
}

/** 서버를 쓸 수 있는지와 지금 동의 상태 */
export function useCommunity() {
  const [state, setState] = useState<CommunityState | null>(null)
  useEffect(() => {
    let alive = true
    const read = () => loadCommunity().then((s) => alive && setState(s))
    read()
    window.addEventListener(CHANGED, read)
    return () => {
      alive = false
      window.removeEventListener(CHANGED, read)
    }
  }, [])
  return state
}

/** 앱 시작 때 한 번: 화면 오류를 잡아 보내고(동의했을 때만), 고른 AI 종류를 알려 둔다 */
export function startCommunity() {
  const send = (message: string, stack?: string) => {
    try {
      desktop.community.reportError({ message, stack })
    } catch {
      /* 무시 */
    }
  }
  window.addEventListener('error', (e) => {
    const err = e.error as Error | undefined
    send(err?.message || e.message || '알 수 없는 오류', err?.stack || `${e.filename}:${e.lineno}:${e.colno}`)
  })
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason as Error | undefined
    send(r?.message || String(e.reason), r?.stack)
  })
  const context = () => desktop.community.setContext({ ai: savedAiProvider() })
  context()
  window.addEventListener(AI_PREFS_EVENT, context)
}
