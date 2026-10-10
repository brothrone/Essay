import { useEffect, useState } from 'react'
import { ExternalLink, KeyRound, LoaderCircle } from 'lucide-react'
import { desktop, type BillingState } from '../desktop'
import { Logo } from './Logo'

const won = (n: number) => n.toLocaleString('ko-KR') + '원'

/** 결제가 필요할 때 앱 대신 보여 주는 화면: [구매하기] → 브라우저에서 결제 → 저절로 열림. 이용권 키를 직접 넣을 수도 있다 */
export function Paywall({ state, onUnlocked }: { state: BillingState; onUnlocked: () => void }) {
  const [waiting, setWaiting] = useState(false)
  const [buyUrl, setBuyUrl] = useState('')
  const [keyOpen, setKeyOpen] = useState(false)
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(
    () =>
      desktop.billing.onChanged((p) => {
        if (p.done) onUnlocked()
        else if (p.error) {
          setWaiting(false)
          setError(p.error)
        }
      }),
    [onUnlocked],
  )

  const buy = async () => {
    setError('')
    const r = await desktop.billing.buy()
    if (r.ok) {
      setWaiting(true)
      setBuyUrl(r.url || '')
    } else setError('구매 페이지를 열지 못했어요')
  }
  const cancel = () => {
    desktop.billing.cancel()
    setWaiting(false)
  }
  const activate = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    const r = await desktop.billing.activate(key)
    setBusy(false)
    if (r.ok) onUnlocked()
    else setError(r.error || '등록하지 못했어요')
  }

  return (
    <div className="paywall">
      <div className="paywall-card">
        <Logo size={56} />
        <h1>Essay 이용권</h1>
        <p className="paywall-lead">한 번 결제하면 계속 써요.</p>
        <div className="paywall-price">
          {state.listPrice > state.price && <s>{won(state.listPrice)}</s>}
          <strong>{won(state.price)}</strong>
        </div>
        {waiting ? (
          <div className="paywall-wait">
            <p>
              <LoaderCircle size={16} className="spin" /> 브라우저에서 결제를 마치면 저절로 열려요
            </p>
            <div className="btn-row center">
              {buyUrl && (
                <a className="btn" href={buyUrl} target="_blank" rel="noreferrer">
                  <ExternalLink size={15} /> 구매 페이지 다시 열기
                </a>
              )}
              <button type="button" className="btn ghost" onClick={cancel}>
                취소
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn primary paywall-buy" onClick={buy}>
            구매하기
          </button>
        )}
        {keyOpen ? (
          <form className="paywall-key" onSubmit={activate}>
            <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="ESSAY-XXXX-XXXX-XXXX-XXXX" autoFocus spellCheck={false} />
            <button type="submit" className="btn" disabled={busy || key.trim().length < 10}>
              {busy ? <LoaderCircle size={15} className="spin" /> : '등록'}
            </button>
          </form>
        ) : (
          <button type="button" className="link-btn paywall-has-key" onClick={() => setKeyOpen(true)}>
            <KeyRound size={14} /> 이용권 키가 있어요
          </button>
        )}
        {error && <p className="ai-error">{error}</p>}
        <button type="button" className="link-btn paywall-terms" onClick={() => desktop.billing.openTerms()}>
          이용약관 · 환불 규정
        </button>
      </div>
    </div>
  )
}
