import { Info } from 'lucide-react'
import { APP_NAME } from '../constants'
import { useStore } from '../store'
import { openAboutDialog } from './AboutDialog'
import { Logo } from './Logo'

const SAVE_LABEL = { saved: '자동 저장됨', saving: '저장 중…', error: '저장 실패 · 디스크 용량 확인' }

/** 윈도우 11 식 제목 표시줄. 띠 전체가 끌기 영역이고, 최소화·최대화·닫기 버튼은 Electron이 오른쪽에 그린다 */
export function TitleBar() {
  const { saveState } = useStore()
  return (
    <header className="titlebar">
      <Logo size={20} />
      <span className="titlebar-name">{APP_NAME}</span>
      <span className={`save-state ${saveState}`} title="데이터는 문서\Essay 폴더에 바로 저장돼요">
        <i />
        {SAVE_LABEL[saveState]}
      </span>
      <button type="button" className="icon-btn titlebar-info" onClick={openAboutDialog} title="Essay 정보 · 만든 사람" aria-label="Essay 정보">
        <Info size={15} />
      </button>
    </header>
  )
}
