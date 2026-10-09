import { useEffect, useState } from 'react'
import { APP_NAME, AUTHOR } from '../constants'
import { desktop } from '../desktop'
import { DATA_FOLDER, HAS_GPT, OS_NAME } from '../platform'
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
        <dd>지원할 공고별로 자소서 문항과 답변을 쓰고, 내 경험을 STAR로 정리해 꺼내 쓰고, 스펙을 한곳에 모아 두는 개인용 도구예요.</dd>
        <dt>데이터</dt>
        <dd>자소서 · 경험 · 스펙은 모두 이 컴퓨터의 {DATA_FOLDER} 폴더에만 저장되고 인터넷 서버로 보내지 않아요. 설정의 [개선 돕기]에서 고른 경우에만 익명 사용 통계 · 오류 메시지 · 공고 문항을 보내요.</dd>
        <dt>AI</dt>
        <dd>
          API 키 없이 이 컴퓨터에 로그인된 Claude Code{HAS_GPT ? ', Gemini(Antigravity CLI), GPT(Codex CLI) 중 하나를' : ' 또는 Gemini(Antigravity CLI)를'} 실행해요.
          요청문에는 이름·연락처를 넣지 않아요.
        </dd>
        <dt>만든 재료</dt>
        <dd>
          Electron {info.electron} · Chromium {info.chrome} · React · Vite · Pretendard 글꼴 · Lucide 아이콘.
        </dd>
      </dl>
    </div>
  )
}
