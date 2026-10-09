import { useEffect, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { desktop } from '../desktop'
import type { LayoutContext } from '../layoutContext'
import { NewProjectModal } from './NewProjectModal'
import { Sidebar } from './Sidebar'
import { useTheme } from '../useTheme'
import { AboutDialogHost } from './AboutDialog'
import { AuthCodeDialog } from './AuthCodeDialog'
import { HelpDialogHost } from './HelpDialog'
import { ImportDialogHost, openImportDialog } from './ImportModal'
import { TitleBar } from './TitleBar'
import { Toaster } from './Toaster'
import { UpdateBanner } from './UpdateBanner'
import { WelcomeDialogHost } from './WelcomeDialog'

export function Layout() {
  const [newOpen, setNewOpen] = useState(false)
  const openNew = () => setNewOpen(true)
  const navigate = useNavigate()
  useTheme() // 윈도우 테마를 <html data-theme>에 반영

  // 마감 알림 클릭 · 메뉴 단축키(Ctrl+1~5) · 점프 목록에서 오는 이동 요청, Ctrl+N · 점프 목록 '새 자소서 시작하기'
  useEffect(() => {
    const offNav = desktop.onNavigate((route) => navigate(route))
    const offNew = desktop.onNewProject(() => setNewOpen(true))
    const offImport = desktop.onImport(() => openImportDialog())
    const offFull = desktop.onFullscreen((on) => {
      document.documentElement.dataset.fullscreen = on ? '1' : ''
    })
    desktop.ready()
    return () => {
      offNav()
      offNew()
      offImport()
      offFull()
    }
  }, [navigate])

  return (
    <div className="app">
      <TitleBar />
      <Sidebar onNew={openNew} />
      <main className="main">
        <Outlet context={{ openNew } satisfies LayoutContext} />
      </main>
      {newOpen && <NewProjectModal onClose={() => setNewOpen(false)} />}
      <AuthCodeDialog />
      <ImportDialogHost />
      <AboutDialogHost />
      <HelpDialogHost />
      <WelcomeDialogHost />
      <UpdateBanner />
      <Toaster />
    </div>
  )
}
