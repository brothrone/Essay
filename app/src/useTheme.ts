import { useEffect, useState } from 'react'
import { desktop, type ThemeInfo, type ThemeSource } from './desktop'

const apply = (t: ThemeInfo) => {
  document.documentElement.dataset.theme = t.dark ? 'dark' : 'light'
}

/** 윈도우 테마(밝게·어둡게)를 화면에 반영하고, 설정에서 고른 값을 저장한다 */
export function useTheme() {
  const [theme, setTheme] = useState<ThemeInfo>({ source: 'system', dark: false })

  useEffect(() => {
    let alive = true
    desktop.theme.get().then((t) => {
      if (!alive) return
      setTheme(t)
      apply(t)
    })
    const off = desktop.theme.onChanged((t) => {
      setTheme(t)
      apply(t)
    })
    return () => {
      alive = false
      off()
    }
  }, [])

  const set = async (source: ThemeSource) => {
    const t = await desktop.theme.set(source)
    setTheme(t)
    apply(t)
  }

  return { theme, set }
}
