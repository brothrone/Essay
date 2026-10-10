import { useCallback, useEffect, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { desktop, type BillingState } from '../desktop'
import type { LayoutContext } from '../layoutContext'
import { NewProjectModal } from './NewProjectModal'
import { Paywall } from './Paywall'
import { Sidebar } from './Sidebar'
import { useTheme } from '../useTheme'
import { AboutDialogHost } from './AboutDialog'
import { AuthCodeDialog } from './AuthCodeDialog'
import { CommunityConsentHost } from './CommunityConsent'
import { FeedbackDialogHost } from './FeedbackDialog'
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

  // 유료 판매: 결제가 필요하면 앱 대신 결제 화면 (결제를 켜기 전엔 required 가 항상 false)
  const [billing, setBilling] = useState<BillingState | null>(null)
  const refreshBilling = useCallback(() => {
    desktop.billing.state().then(setBilling, () => setBilling(null))
  }, [])
  useEffect(() => {
    refreshBilling()
    return desktop.billing.onChanged((p) => p.revoked && refreshBilling())
  }, [refreshBilling])

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

  if (billing?.required)
    return (
      <div className="app paywall-app">
        <TitleBar />
        <Paywall state={billing} onUnlocked={refreshBilling} />
        <Toaster />
      </div>
    )

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
      <FeedbackDialogHost />
      <WelcomeDialogHost />
      <CommunityConsentHost />
      <UpdateBanner />
      <Toaster />
    </div>
  )
}
