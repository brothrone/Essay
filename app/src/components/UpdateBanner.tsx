import { Download, LoaderCircle, RefreshCw, RotateCcw, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { desktop, type UpdateStatus } from '../desktop'

/** 자동 업데이트 상태. 앱이 켜지면 메인 프로세스가 GitHub Releases 를 확인하고 새 버전을 조용히 내려받는다 */
export function useUpdateStatus() {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' })
  useEffect(() => {
    desktop.update.status().then(setStatus)
    return desktop.update.onStatus(setStatus)
  }, [])
  return status
}

/** 새 버전을 다 받았을 때 화면 아래에 조용히 뜨는 띠. [지금 다시 시작] 또는 닫기(다음에 끌 때 적용).
 *  맥은 앱이 직접 바꿔 끼우지 못해 "새 버전이 나왔어요 → 다운로드" 로 안내한다 */
export function UpdateBanner() {
  const status = useUpdateStatus()
  const [hidden, setHidden] = useState('')
  const manual = status.state === 'available' && status.manual
  if ((status.state !== 'ready' && !manual) || hidden === status.version) return null
  return (
    <div className="update-banner" role="status">
      <Download size={16} />
      <span>{manual ? `새 버전 ${status.version} · 받아서 응용 프로그램 폴더에 덮어써요` : `새 버전 ${status.version} 준비됨`}</span>
      <button type="button" className="btn small primary" onClick={() => desktop.update.install()}>
        {manual ? <Download size={14} /> : <RotateCcw size={14} />} {manual ? '다운로드' : '다시 시작'}
      </button>
      <button type="button" className="icon-btn" aria-label="나중에" onClick={() => setHidden(status.version || '')}>
        <X size={16} />
      </button>
    </div>
  )
}

/** 설정 화면의 업데이트 카드 */
export function UpdateCard() {
  const status = useUpdateStatus()
  const [checking, setChecking] = useState(false)
  const [note, setNote] = useState('')
  const check = async () => {
    setChecking(true)
    setNote('')
    const r = await desktop.update.check()
    setChecking(false)
    if (!r.ok) setNote(r.error || '확인하지 못했어요')
  }
  const text = (() => {
    switch (status.state) {
      case 'checking':
        return '확인 중…'
      case 'available':
        return status.manual ? `새 버전 ${status.version} · 받아서 응용 프로그램 폴더에 덮어써요` : `${status.version} 내려받기 시작`
      case 'downloading':
        return `${status.version} 내려받는 중 · ${status.percent ?? 0}%`
      case 'ready':
        return `${status.version} 준비됨`
      case 'none':
        return '최신 버전이에요.'
      case 'error':
        return `확인 실패 (${status.message})`
      default:
        return '자동으로 확인해요'
    }
  })()
  return (
    <section className="card setting-actions">
      <div className="setting-row">
        <div>
          <strong>업데이트 · 지금 {desktop.info.version}</strong>
          <p className={'muted small' + (status.state === 'error' ? ' warn' : '')}>{note || text}</p>
          {status.state === 'downloading' && (
            <div className="update-bar">
              <i style={{ width: `${status.percent ?? 0}%` }} />
            </div>
          )}
        </div>
        {status.state === 'ready' ? (
          <button type="button" className="btn primary" onClick={() => desktop.update.install()}>
            <RotateCcw size={16} /> 다시 시작하고 적용
          </button>
        ) : status.state === 'available' && status.manual ? (
          <button type="button" className="btn primary" onClick={() => desktop.update.install()}>
            <Download size={16} /> {status.version} 다운로드
          </button>
        ) : (
          <button type="button" className="btn" onClick={check} disabled={checking || status.state === 'downloading' || status.state === 'checking'}>
            {checking ? <LoaderCircle size={16} className="spin" /> : <RefreshCw size={16} />} 업데이트 확인
          </button>
        )}
      </div>
    </section>
  )
}
