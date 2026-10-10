import { useCallback, useEffect, useState } from 'react'
import { desktop, type AiProvider, type AiStatus } from './desktop'

/** AI CLI 설치·로그인 상태. 창이 다시 활성화되면(PowerShell에서 돌아오면) 자동으로 다시 확인한다 */
export function useAiStatus() {
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [checking, setChecking] = useState(false)
  const load = useCallback((fresh = false) => desktop.ai.status(fresh ? { fresh: true } : undefined).then(setStatus), [])
  useEffect(() => {
    load()
    const onFocus = () => void load()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load])
  // [연결 확인]: 기억해 둔 결과를 버리고 새로 (설치 · 로그인 직후)
  const refresh = useCallback(() => {
    setChecking(true)
    load(true).finally(() => setChecking(false))
  }, [load])
  return { status, checking, refresh }
}

const LOGIN_OK_KEY = (p: AiProvider) => `essay/ai-login-ok:${p}`

/** CLI가 로그인 여부를 알려 주지 못할 때 사용자가 [로그인 마쳤어요]로 확정한 값 */
export function loginConfirmed(p: AiProvider) {
  try {
    return localStorage.getItem(LOGIN_OK_KEY(p)) === '1'
  } catch {
    return false
  }
}

export function setLoginConfirmed(p: AiProvider, ok: boolean) {
  try {
    if (ok) localStorage.setItem(LOGIN_OK_KEY(p), '1')
    else localStorage.removeItem(LOGIN_OK_KEY(p))
  } catch {
    /* 무시 */
  }
}

/** AI 실행 결과가 로그인 오류면 '로그인 마쳤어요' 확정을 되돌린다 → 홈에 연결 카드가 다시 뜬다 */
export function noteAiResult(p: AiProvider, r: { ok: boolean; error?: string }) {
  if (!r.ok && r.error && /로그인/.test(r.error)) setLoginConfirmed(p, false)
}

/** 로그인됐다고 볼 수 있는지: CLI가 확인해 줬거나, 확인 불가라서 사용자가 직접 확정했거나 */
export function loggedInFor(status: AiStatus, p: AiProvider) {
  const v = status[p].loggedIn
  if (v === false) return false
  if (v === true) return true
  return loginConfirmed(p)
}

/** 고른 AI를 바로 쓸 수 있는 상태인지 (설치됨 + 로그인 확인) */
export const aiReady = (status: AiStatus | null, provider: AiProvider) =>
  !!status && status[provider].available && loggedInFor(status, provider)
