import { useEffect, useState } from 'react'
import { APP_NAME, AUTHOR } from '../constants'
import { desktop } from '../desktop'
import { DATA_FOLDER, OS_NAME } from '../platform'
import { Logo } from './Logo'
import { Modal } from './ui'

type Listener = () => void
const listeners = new Set<Listener>()
/** 어디서든 'Essay 정보' 창을 연다 */
export function openAboutDialog() {
  listeners.forEach((l) => l())
}

export function AboutDialogHost() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const l = () => setOpen(true)
    listeners.add(l)
    const off = desktop.onAbout(l)
    return () => {
      listeners.delete(l)
      off()
    }
  }, [])
  if (!open) return null
  return (
    <Modal title={`${APP_NAME} 정보`} onClose={() => setOpen(false)}>
      <AboutContent />
    </Modal>
  )
}

/** 설정 화면 카드와 정보 창에서 같이 쓰는 본문 */
export function AboutContent() {
  const info = desktop.info
  return (
    <div className="about">
      <div className="about-head">
        <Logo size={56} />
        <div>
          <h2>
            {APP_NAME} <span className="muted small">v{info.version}</span>
          </h2>
          <p className="muted">자소서 · 스펙 관리 {OS_NAME} 앱</p>
        </div>
      </div>
      <dl className="about-list">
        <dt>개발자</dt>
        <dd>
          <strong>{AUTHOR}</strong>
        </dd>
        <dt>무엇을 하나요</dt>
        <dd>자소서 · 경험 · 스펙을 한곳에서 관리해요.</dd>
        <dt>데이터</dt>
        <dd>이 컴퓨터의 {DATA_FOLDER} 폴더에만 저장돼요. [개선 돕기]에서 고른 것만 익명으로 보내요.</dd>
        <dt>AI</dt>
        <dd>로그인된 구독 AI를 API 키 없이 실행해요. 이름 · 연락처는 넣지 않아요.</dd>
        <dt>만든 재료</dt>
        <dd>
          Electron {info.electron} · Chromium {info.chrome} · React · Vite · Pretendard 글꼴 · Lucide 아이콘.
        </dd>
      </dl>
    </div>
  )
}
