import { Check, Copy, ExternalLink, LoaderCircle, MessageSquareHeart, Send } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useCommunity } from '../community'
import { desktop } from '../desktop'
import { OS_NAME } from '../platform'
import { toast } from '../toast'
import { useAppConfig } from '../useAppConfig'
import { savedAiProvider } from '../useAiTask'
import { Modal } from './ui'

type Listener = () => void
const listeners = new Set<Listener>()
/** 어디서든 '의견 보내기' 창을 연다 (도움말 메뉴 · 설정 · 도움말 창) */
export function openFeedbackDialog() {
  listeners.forEach((l) => l())
}

export function FeedbackDialogHost() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const l = () => setOpen(true)
    listeners.add(l)
    const off = desktop.onFeedback(l)
    return () => {
      listeners.delete(l)
      off()
    }
  }, [])
  if (!open) return null
  return <FeedbackDialog onClose={() => setOpen(false)} />
}

const KINDS = [
  { value: 'bug', label: '안 되는 게 있어요' },
  { value: 'idea', label: '이런 기능이 있으면 좋겠어요' },
  { value: 'etc', label: '기타 의견' },
] as const
type Kind = (typeof KINDS)[number]['value']

/**
 * 의견 보내기: Essay 서버가 켜져 있으면 [보내기]로 바로 보낸다(계정 없이, 공개되지 않음).
 * 서버가 없거나 원하면 GitHub 이슈(또는 설문지)를 내용이 채워진 채로 브라우저에서 연다
 */
function FeedbackDialog({ onClose }: { onClose: () => void }) {
  const config = useAppConfig()
  const [kind, setKind] = useState<Kind>('bug')
  const [text, setText] = useState('')
  const [withInfo, setWithInfo] = useState(true)
  const [contact, setContact] = useState('')
  const [sending, setSending] = useState(false)
  const community = useCommunity()
  const direct = !!community?.available

  const info = `Essay ${desktop.info.version} · ${OS_NAME} (${desktop.info.platform} ${desktop.info.arch}) · AI ${savedAiProvider()}`
  const kindLabel = KINDS.find((k) => k.value === kind)!.label
  const body = [text.trim(), withInfo ? `\n---\n${info}` : ''].join('')
  const title = `[${kindLabel}] ${text.trim().split('\n')[0].slice(0, 60)}`
  const formUrl = config?.feedback.formUrl || ''
  const issuesUrl = config?.feedback.issuesUrl || 'https://github.com/brothrone/Essay/issues/new'

  const openIssue = () => {
    const url = `${issuesUrl}?${new URLSearchParams({ title, body }).toString()}`
    window.open(url, '_blank')
    toast('브라우저에서 내용을 확인하고 [Submit new issue]를 누르면 보내져요')
  }
  const openForm = async () => {
    await desktop.copyText(`${title}\n\n${body}`)
    window.open(formUrl, '_blank')
    toast('내용을 복사해 뒀어요. 설문지에 붙여넣어 주세요')
  }
  const send = async () => {
    setSending(true)
    const r = await desktop.community.sendFeedback({ kind, message: text.trim(), contact: contact.trim(), withInfo })
    setSending(false)
    if (r.ok) {
      toast('보냈어요. 고마워요! 다음 버전에 반영할게요')
      onClose()
    } else toast(`보내지 못했어요: ${r.error || '잠시 뒤 다시 시도해 주세요'}`)
  }
  const copy = async () => {
    await desktop.copyText(`${title}\n\n${body}`)
    toast('복사했어요')
  }

  return (
    <Modal
      title="의견 보내기"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost mr-auto" disabled={!text.trim()} onClick={copy}>
            <Copy size={16} /> 내용 복사
          </button>
          {formUrl && (
            <button type="button" className="btn" disabled={!text.trim()} onClick={openForm}>
              <ExternalLink size={16} /> 설문지로 보내기
            </button>
          )}
          <button type="button" className={direct ? 'btn' : 'btn primary'} disabled={!text.trim()} onClick={openIssue}>
            <ExternalLink size={16} /> {direct ? 'GitHub에 올리기' : 'GitHub로 보내기'}
          </button>
          {direct && (
            <button type="button" className="btn primary" disabled={!text.trim() || sending} onClick={send}>
              {sending ? <LoaderCircle size={16} className="spin" /> : <Send size={16} />} 보내기
            </button>
          )}
        </>
      }
    >
      <div className="feedback">
        <p className="muted small">
          <MessageSquareHeart size={14} /> 불편한 점이나 바라는 기능을 적어 주세요. 개발자가 읽고 다음 버전에 반영해요. 쓴 자소서 내용은 붙이지 마세요.
        </p>
        <div className="segmented">
          {KINDS.map((k) => (
            <button type="button" key={k.value} className={kind === k.value ? 'on' : ''} onClick={() => setKind(k.value)}>
              {kind === k.value && <Check size={12} />} {k.label}
            </button>
          ))}
        </div>
        <textarea
          autoFocus
          rows={7}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            kind === 'bug'
              ? '어떤 화면에서 무엇을 눌렀더니 어떻게 됐는지 적어 주세요. (예: 맞춤 공고에서 [AI로 찾기]를 누르면 3분 뒤 오류가 떠요)'
              : '자유롭게 적어 주세요.'
          }
        />
        {direct && (
          <input
            type="text"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="답장 받을 메일 (선택) · 적으면 개발자가 답장할 수 있어요"
            maxLength={200}
          />
        )}
        <label className="check-row">
          <input type="checkbox" checked={withInfo} onChange={(e) => setWithInfo(e.target.checked)} />
          <span>
            앱 정보 함께 보내기 <span className="muted small">({info})</span>
          </span>
        </label>
        {direct ? (
          <p className="muted small">
            [보내기]는 계정 없이 개발자에게만 보내져요(공개되지 않아요). [GitHub에 올리기]는 GitHub 이슈 작성 화면을 내용이 채워진 채로 열어요(계정 필요, 글이 공개돼요).
          </p>
        ) : (
        <p className="muted small">
          [GitHub로 보내기]는 브라우저에서 GitHub 이슈 작성 화면을 내용이 채워진 채로 열어요(GitHub 계정 필요, 글은 공개돼요).
          {formUrl ? ' 계정이 없으면 [설문지로 보내기]를 쓰세요.' : ' 계정이 없으면 [내용 복사]로 복사해 두세요.'}
        </p>
        )}
      </div>
    </Modal>
  )
}
