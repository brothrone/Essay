import { Copy, FileText, TerminalSquare } from 'lucide-react'
import { useEffect, useState } from 'react'
import { desktop } from '../desktop'
import { HAS_GPT, IS_MAC, PASTE_HINT, TERMINAL } from '../platform'
import { toast } from '../toast'
import { openFeedbackDialog } from './FeedbackDialog'
import { Modal } from './ui'

type Listener = () => void
const listeners = new Set<Listener>()
/** 어디서든 '문제 해결' 창을 연다 (F1 · AI 연결 카드 · 설정) */
export function openHelpDialog() {
  listeners.forEach((l) => l())
}

export function HelpDialogHost() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const l = () => setOpen(true)
    listeners.add(l)
    const off = desktop.onHelp(l)
    return () => {
      listeners.delete(l)
      off()
    }
  }, [])
  if (!open) return null
  return (
    <Modal title="도움말" onClose={() => setOpen(false)} wide>
      <HelpContent />
    </Modal>
  )
}

type Item = { q: string; a: React.ReactNode }
type Group = { title: string; items: Item[] }

const GROUPS: Group[] = [
  {
    title: '설치가 안 돼요',
    items: [
      IS_MAC
        ? {
            q: '"확인되지 않은 개발자" 또는 "손상되었기 때문에 열 수 없습니다" 라고 떠요',
            a: (
              <>
                <b>시스템 설정 → 개인정보 보호 및 보안</b>에서 Essay의 <b>[그래도 열기]</b>를 누르세요. 안 되면 터미널에서{' '}
                <code>xattr -cr /Applications/Essay.app</code> 실행 뒤 다시 여세요.
              </>
            ),
          }
        : {
            q: '"Windows의 PC 보호" 파란 창에 실행 버튼이 없어요',
            a: (
              <>
                창 가운데 작은 글씨 <b>"추가 정보"</b>를 먼저 누르세요. 그러면 아래에 <b>[실행]</b> 버튼이 나타나요. Essay가 아직 마이크로소프트 서명을
                받지 않아서 뜨는 안내일 뿐이에요.
              </>
            ),
          },
      {
        q: '설치 버튼을 눌렀는데 창이 바로 닫히거나 빨간 글씨가 떠요',
        a: (
          <>
            인터넷 연결을 확인하고 다시 눌러 보세요. 회사 컴퓨터라면 관리자에게{' '}
            <code>claude.ai</code> 와 <code>antigravity.google</code>
            {HAS_GPT && (
              <>
                {' '}· <code>chatgpt.com</code>
              </>
            )}{' '}
            접속 허용을 요청하세요.
          </>
        ),
      },
      {
        q: '설치가 끝났는데 Essay에 계속 "설치 필요"라고 떠요',
        a: (
          <>
            <b>[연결 확인]</b>을 누르고, 안 되면 Essay를 <b>완전히 종료</b>했다가 다시 켜세요.
          </>
        ),
      },
    ],
  },
  {
    title: '로그인이 안 돼요',
    items: [
      {
        q: '인증 코드를 넣었는데 "로그인이 끝나지 않았어요"가 떠요',
        a: (
          <>
            코드가 잘렸거나 60초가 지났어요. <b>[로그인]</b>을 다시 누르고 <b>[Copy to Clipboard]</b>로 복사하세요.
          </>
        ),
      },
      {
        q: 'Claude 로그인했는데 요금이나 크레딧 얘기가 나와요',
        a: (
          <>
            <b>Anthropic Console</b>(유료 API) 계정이에요. <b>[로그인 창 열기]</b>를 다시 눌러 <b>Claude 구독 계정</b>을 고르세요.
          </>
        ),
      },
      ...(HAS_GPT
        ? [
            {
              q: 'GPT가 "API 키로 로그인돼 있어요"라고 해요',
              a: (
                <>
                  API 키로 쓰면 요금이 나가서 막아 뒀어요. <b>[로그인]</b>을 누르면 ChatGPT 계정으로 다시 로그인해요.
                </>
              ),
            },
            {
              q: 'GPT [로그인]을 눌렀는데 브라우저가 안 열려요',
              a: (
                <>
                  <b>[로그인 페이지 다시 열기]</b>를 누르세요. 안 되면 <b>[{TERMINAL} 창에서 로그인]</b>으로 해 보세요.
                </>
              ),
            },
          ]
        : []),
      {
        q: '잘 쓰다가 갑자기 "로그인이 필요해요"가 떠요',
        a: (
          <>
            로그인이 만료됐어요. 홈 <b>[연결 관리]</b>에서 다시 <b>[로그인]</b>하세요. 글은 그대로예요.
          </>
        ),
      },
    ],
  },
  {
    title: 'AI 실행이 이상해요',
    items: [
      {
        q: '"사용량 한도" 또는 "limit" 오류가 나요',
        a: (
          <>
            구독 한도를 다 썼어요. 잠시 뒤 다시 하거나 <b>"빠르고 한도 절약"</b> 모델로 바꿔 보세요.
          </>
        ),
      },
      {
        q: '"요청문이 너무 길어서 넘길 수 없어요" (Gemini)',
        a: <>연결한 경험이나 공고 메모를 줄이거나 Claude로 바꿔 보세요.</>,
      },
      {
        q: '"다른 AI 작업이 진행 중"이에요',
        a: <>AI는 한 번에 하나씩 돌아요. 끝나거나 [취소]한 뒤 다시 하세요.</>,
      },
      {
        q: '원인을 더 자세히 알고 싶어요',
        a: (
          <>
            로그 폴더의 <code>ai-last-run.json</code>을 함께 보내 주세요. 쓴 글은 들어 있지 않아요.{' '}
            <button type="button" className="link-btn" onClick={() => desktop.openLogsFolder()}>
              <FileText size={12} /> 로그 폴더 열기
            </button>
          </>
        ),
      },
    ],
  },
]

const COMMANDS: { title: string; lines: { cmd: string; note?: string }[] }[] = [
  {
    title: 'Gemini (Antigravity CLI) 설치 → 로그인',
    lines: [
      { cmd: IS_MAC ? 'curl -fsSL https://antigravity.google/cli/install.sh | bash' : 'irm https://antigravity.google/cli/install.ps1 | iex', note: '설치' },
      { cmd: 'agy', note: '로그인 → 인증 코드를 창에 붙여넣고 Enter' },
    ],
  },
  {
    title: 'Claude Code 설치 → 로그인',
    lines: [
      { cmd: IS_MAC ? 'curl -fsSL https://claude.ai/install.sh | bash' : 'irm https://claude.ai/install.ps1 | iex', note: '설치' },
      { cmd: 'claude auth login --claudeai', note: 'Claude 구독 계정으로 로그인' },
    ],
  },
  ...(HAS_GPT
    ? [
        {
          title: 'GPT (Codex CLI) 설치 → 로그인',
          lines: [
            { cmd: IS_MAC ? 'curl -fsSL https://chatgpt.com/codex/install.sh | sh' : 'irm https://chatgpt.com/codex/install.ps1 | iex', note: '설치' },
            { cmd: 'codex login', note: 'ChatGPT 계정으로 로그인' },
          ],
        },
      ]
    : []),
  {
    title: '설치됐는지 확인',
    lines: [
      { cmd: 'agy --version', note: '숫자가 나오면 OK' },
      { cmd: 'claude --version' },
      ...(HAS_GPT ? [{ cmd: 'codex login status', note: '"Logged in using ChatGPT" 가 나오면 돼요' }] : []),
    ],
  },
]

export function HelpContent() {
  const copy = async (cmd: string) => {
    await desktop.copyText(cmd)
    toast('복사했어요')
  }
  return (
    <div className="help">
      {GROUPS.map((g) => (
        <section key={g.title} className="help-group">
          <h3>{g.title}</h3>
          {g.items.map((it) => (
            <details key={it.q} className="help-item">
              <summary>{it.q}</summary>
              <p>{it.a}</p>
            </details>
          ))}
        </section>
      ))}

      <section className="help-group">
        <h3>직접 명령어로 하기</h3>
        <p className="muted small">버튼이 안 될 때만. 한 줄씩 붙여넣고({PASTE_HINT}) Enter</p>
        <div className="btn-row">
          <button type="button" className="btn small" onClick={() => desktop.ai.openTerminal('open-shell')}>
            <TerminalSquare size={14} /> {TERMINAL} 열기
          </button>
        </div>
        {COMMANDS.map((c) => (
          <div key={c.title} className="cmd-block">
            <strong>{c.title}</strong>
            {c.lines.map((l) => (
              <div key={l.cmd} className="cmd-row">
                <code>{l.cmd}</code>
                <button type="button" className="btn small ghost" onClick={() => copy(l.cmd)} title="복사">
                  <Copy size={13} /> 복사
                </button>
                {l.note && <span className="muted small">{l.note}</span>}
              </div>
            ))}
          </div>
        ))}
      </section>

      <section className="help-group">
        <h3>그래도 안 되면</h3>
        <div className="btn-row">
          <button type="button" className="btn small" onClick={openFeedbackDialog}>
            의견 보내기
          </button>
        </div>
      </section>
    </div>
  )
}
