import { Check, KeyRound, LoaderCircle } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { desktop } from '../desktop'
import { toast } from '../toast'
import { setLoginConfirmed } from '../useAiStatus'
import { Modal } from './ui'

type Listener = () => void
const listeners = new Set<Listener>()
/** 어디서든 Gemini 로그인 안내 창을 연다 (AiSetup 의 [로그인] 버튼이 호출) */
export function openGeminiLoginDialog() {
  listeners.forEach((l) => l())
}

/** Antigravity CLI 로그인 도우미: 콘솔 창에서 agy 가 도는 동안 브라우저 인증 코드를 받아 그 창에 대신 입력한다 */
export function AuthCodeDialog() {
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [failed, setFailed] = useState('')

  useEffect(() => {
    const l = () => {
      setCode('')
      setSent(false)
      setFailed('')
      setElapsed(0)
      setOpen(true)
    }
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])

  // 열려 있는 동안 2초마다 로그인 창의 결과를 확인한다
  useEffect(() => {
    if (!open) return
    const t0 = Date.now()
    const id = setInterval(async () => {
      setElapsed(Math.floor((Date.now() - t0) / 1000))
      const s = await desktop.ai.geminiLoginStatus()
      if (s.loggedIn) {
        setLoginConfirmed('gemini', true)
        setOpen(false)
        toast('Gemini 로그인이 끝났어요. 이제 AI 기능을 쓸 수 있어요')
        window.dispatchEvent(new Event('focus')) // 상태 카드가 다시 확인하도록
      } else if (s.result && !/^exit 0/.test(s.result)) {
        setFailed('로그인 창이 성공하지 못하고 끝났어요. [로그인]을 다시 눌러 새 창에서 시도해 주세요.')
      }
    }, 2000)
    return () => clearInterval(id)
  }, [open])

  if (!open) return null

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const c = code.trim()
    if (!c) return
    setSending(true)
    const r = await desktop.ai.sendAuthCode(c)
    setSending(false)
    if (r.ok) {
      setSent(true)
      toast('로그인 창에 코드를 입력했어요. 확인 중…')
    } else toast(r.error || '코드를 보내지 못했어요')
  }

  return (
    <Modal
      title="Gemini 로그인 · 인증 코드 붙여넣기"
      onClose={() => setOpen(false)}
      footer={
        <>
          <span className="muted small mr-auto">
            {sent ? (
              <>
                <LoaderCircle size={12} className="spin" /> 로그인 확인 중… {elapsed}초
              </>
            ) : (
              `창이 열린 뒤 ${elapsed}초 · 60초 안에 넣어야 해요`
            )}
          </span>
          <button type="button" className="btn ghost" onClick={() => setOpen(false)}>
            닫기
          </button>
          <button type="submit" form="auth-code-form" className="btn primary" disabled={!code.trim() || sending}>
            {sending ? <LoaderCircle size={16} className="spin" /> : <KeyRound size={16} />} 코드 보내기
          </button>
        </>
      }
    >
      <ol className="login-guide big">
        <li>
          곧 브라우저가 떠요. 브라우저에서 <b>Google 계정으로 로그인</b>하세요. (작업 표시줄에 "Essay 로그인 창"이 하나 생기는데 건드리지 않아도 돼요.)
        </li>
        <li>
          로그인하면 <b>"Paste this code into your application"</b> 과 긴 코드가 떠요. <b>[Copy to Clipboard]</b> 를 누르세요.
        </li>
        <li>
          아래 칸에 <b>Ctrl+V</b> 로 붙여넣고 <b>[코드 보내기]</b>. Essay가 로그인 창에 대신 입력해요. 그 창에 <code>ok</code> 와 "로그인 완료!"가
          나오면 이 창은 저절로 닫혀요.
        </li>
      </ol>
      <form id="auth-code-form" onSubmit={submit}>
        <input
          autoFocus
          className="auth-code-input"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="4/0A…  (브라우저에서 복사한 인증 코드)"
          spellCheck={false}
          autoComplete="off"
        />
      </form>
      {sent && (
        <p className="import-ok" style={{ marginTop: 10 }}>
          <Check size={14} /> 보냈어요. 20초가 지나도 안 끝나면 작업 표시줄의 "Essay 로그인 창"을 열어 마우스 오른쪽 클릭(붙여넣기) → Enter 를 눌러 주세요.
        </p>
      )}
      {failed && <p className="ai-error" style={{ marginTop: 10 }}>{failed}</p>}
      <p className="muted small" style={{ marginTop: 10 }}>
        늦어서 시간이 지나면 로그인 창이 한 번 더 브라우저를 열어 줘요. 두 번째부터는 Google 로그인이 바로 넘어가요.
      </p>
    </Modal>
  )
}
