import { useEffect, useState } from 'react'
import { desktop, type AppConfig } from './desktop'

// 앱 전체에서 한 번만 받아 온다 (메인 프로세스가 하루 한 번 사이트의 app-config.json 을 확인하고, 안 되면 앱에 든 기본값)
let cached: Promise<AppConfig> | null = null
export const loadAppConfig = () => (cached ||= desktop.appConfig())

/** 요금제 안내 · 공지 · 의견 보내기 주소. 앱을 다시 배포하지 않아도 사이트의 app-config.json 만 고치면 바뀐다 */
export function useAppConfig() {
  const [config, setConfig] = useState<AppConfig | null>(null)
  useEffect(() => {
    let alive = true
    loadAppConfig().then((c) => alive && setConfig(c))
    return () => {
      alive = false
    }
  }, [])
  return config
}
