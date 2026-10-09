import { Check, ChevronDown, ChevronUp, LoaderCircle, RotateCcw, TerminalSquare, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { desktop, type InstallAction } from '../desktop'
import { TERMINAL } from '../platform'
import { toast } from '../toast'

export const INSTALL_ACTIONS: InstallAction[] = ['install-agy', 'install-claude', 'install-gemini', 'install-node', 'install-codex']
export const isInstallAction = (a: string): a is InstallAction => (INSTALL_ACTIONS as string[]).includes(a)

const NAMES: Record<InstallAction, string> = {
  'install-agy': 'Antigravity CLI',
  'install-claude': 'Claude Code',
  'install-gemini': 'Gemini CLI',
  'install-node': 'Node.js',
  'install-codex': 'Codex CLI',
}

export type InstallState = {
  action: InstallAction
  startedAt: number
  lines: string[]
  done: null | { code: number; seconds: number }
}

export type Installer = {
  state: InstallState | null
  running: boolean
  start: (action: InstallAction) => Promise<void>
  cancel: () => void
  dismiss: () => void
}

/** 설치를 창 없이 돌리고 진행 줄을 모은다. 끝나면 onDone(성공 여부) 을 부른다 */
export function useInstaller(onDone: (ok: boolean, action: InstallAction) => void): Installer {
  const [state, setState] = useState<InstallState | null>(null)
  const cb = useRef(onDone)
  useEffect(() => {
    cb.current = onDone
  })
  useEffect(() => {
    const offP = desktop.ai.onInstallProgress((p) =>
      setState((s) => (s && s.action === p.action && !s.done ? { ...s, lines: [...s.lines.slice(-199), p.line] } : s)),
    )
    const offD = desktop.ai.onInstallDone((p) => {
      setState((s) => (s && s.action === p.action ? { ...s, done: { code: p.code, seconds: p.seconds } } : s))
      cb.current(p.code === 0, p.action)
    })
    return () => {
      offP()
      offD()
    }
  }, [])
  const start = useCallback(async (action: InstallAction) => {
    setState({ action, startedAt: Date.now(), lines: [], done: null })
    const r = await desktop.ai.install(action)
    if (!r.ok) {
      toast(r.error || '설치를 시작하지 못했어요')
      setState({ action, startedAt: Date.now(), lines: [r.error || '설치를 시작하지 못했어요'], done: { code: 1, seconds: 0 } })
    }
  }, [])
  const cancel = useCallback(() => void desktop.ai.installCancel(), [])
  const dismiss = useCallback(() => setState(null), [])
  return { state, running: !!state && !state.done, start, cancel, dismiss }
}

/** 설치 진행 카드: 진행 막대 + 마지막 줄, 펼치면 전체 로그. 실패하면 다시 시도 · PowerShell(맥: 터미널) 창으로 */
export function InstallPanel({ installer }: { installer: Installer }) {
  const { state } = installer
  const [open, setOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const logRef = useRef<HTMLPreElement>(null)
  const running = !!state && !state.done

  // 돌아가는 동안 1초마다 경과 시간을 다시 그린다
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [running])
  const elapsed = state ? Math.max(0, Math.floor((now - state.startedAt) / 1000)) : 0

  useEffect(() => {
    if (open && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [open, state?.lines.length])

  if (!state) return null
  const name = NAMES[state.action]
  const last = state.lines[state.lines.length - 1] || '준비하는 중…'
  const ok = state.done?.code === 0
  const phase = /download|내려받|fetch|받는/i.test(last) ? '내려받는 중' : /install|extract|압축|설치/i.test(last) ? '설치하는 중' : '준비하는 중'

  return (
    <div className={'install-panel' + (state.done ? (ok ? ' ok' : ' fail') : '')}>
      <div className="install-head">
        <span className="install-icon">
          {state.done ? ok ? <Check size={16} strokeWidth={3} /> : <X size={16} strokeWidth={3} /> : <LoaderCircle size={16} className="spin" />}
        </span>
        <div className="install-title">
          <strong>
            {state.done
              ? ok
                ? `${name} 설치 완료`
                : `${name} 설치가 끝나지 않았어요`
              : `${name} ${phase}…`}
          </strong>
          <span className="muted small">
            {state.done ? (ok ? `${state.done.seconds}초` : `다시 시도하거나 ${TERMINAL} 창에서 설치하세요`) : `${elapsed}초`}
          </span>
        </div>
        {!state.done && (
          <button type="button" className="btn small ghost" onClick={installer.cancel}>
            취소
          </button>
        )}
      </div>
      {!state.done && (
        <div className="install-bar">
          <i />
        </div>
      )}
      <button type="button" className="install-last" onClick={() => setOpen((v) => !v)} title="자세한 진행 내용">
        <code>{last}</code>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && <pre ref={logRef} className="install-log">{state.lines.join('\n') || '아직 출력이 없어요'}</pre>}
      {state.done && (
        <div className="btn-row">
          {ok ? (
            state.action === 'install-node' ? (
              <>
                <button type="button" className="btn small primary" onClick={() => desktop.relaunch()}>
                  <RotateCcw size={14} /> Essay 다시 시작
                </button>
                <span className="muted small">다시 켜야 Node.js가 잡혀요</span>
              </>
            ) : (
              <button type="button" className="btn small" onClick={installer.dismiss}>
                확인
              </button>
            )
          ) : (
            <>
              <button type="button" className="btn small primary" onClick={() => installer.start(state.action)}>
                <RotateCcw size={14} /> 다시 시도
              </button>
              <button type="button" className="btn small" onClick={() => desktop.ai.openTerminal(state.action)}>
                <TerminalSquare size={14} /> {TERMINAL} 창에서 설치
              </button>
              <button type="button" className="btn small ghost" onClick={installer.dismiss}>
                닫기
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
