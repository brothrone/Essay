import { Copy, FileText, TerminalSquare } from 'lucide-react'
import { useEffect, useState } from 'react'
import { desktop } from '../desktop'
import { toast } from '../toast'
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
      {
        q: '"Windows의 PC 보호" 파란 창에 실행 버튼이 없어요',
        a: (
          <>
            창 가운데 작은 글씨 <b>"추가 정보"</b>를 먼저 누르세요. 그러면 아래에 <b>[실행]</b> 버튼이 나타나요. Essay가 아직 마이크로소프트 서명을 받지
            않아서 뜨는 안내일 뿐이에요.
          </>
        ),
      },
      {
        q: '설치 버튼을 눌렀는데 검은 창이 바로 닫히거나 빨간 글씨가 떠요',
        a: (
          <>
            인터넷 연결을 확인하고 다시 눌러 보세요. 회사 PC라면 보안 프로그램이나 프록시가 다운로드를 막을 수 있어요. 그땐 관리자에게{' '}
            <code>claude.ai</code> 와 <code>antigravity.google</code> 접속 허용을 요청하세요.
          </>
        ),
      },
      {
        q: '설치가 끝났는데 Essay에 계속 "설치 필요"라고 떠요',
        a: (
          <>
            ① 카드의 <b>[연결 확인]</b>을 누르세요. ② 그래도 안 되면 Essay를 <b>완전히 종료</b>했다가 다시 켜세요. ③ 그래도 안 되면 아래 "직접 명령어로
            하기"의 확인 명령으로 설치됐는지 보세요.
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
            코드 앞뒤가 잘렸거나 60초가 지난 경우예요. 카드의 <b>[로그인]</b>을 다시 누르고, 이번엔 브라우저의 <b>[Copy to Clipboard]</b> 버튼으로
            복사하세요. 두 번째부터는 Google 로그인이 바로 넘어가요.
          </>
        ),
      },
      {
        q: 'Claude 로그인했는데 요금이나 크레딧 얘기가 나와요',
        a: (
          <>
            <b>Anthropic Console</b> 계정으로 로그인한 거예요. 그건 유료 API 계정이에요. <b>[로그인 창 열기]</b>를 다시 눌러 이번엔{' '}
            <b>Claude 앱(Pro · Max 구독) 계정</b>을 고르세요.
          </>
        ),
      },
      {
        q: '잘 쓰다가 갑자기 "로그인이 필요해요"가 떠요',
        a: (
          <>
            구독 로그인은 가끔 만료돼요. 홈 위쪽 <b>[연결 관리]</b> → 카드에서 다시 <b>[로그인]</b>하면 돼요. 글은 그대로 남아 있어요.
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
            구독의 시간당·일일 한도를 다 쓴 거예요. 잠시 뒤 다시 하거나, 홈 AI 바에서 <b>"빠르고 한도 절약"</b> 모델로 바꿔 보세요.
          </>
        ),
      },
      {
        q: '"요청문이 너무 길어서 넘길 수 없어요" (Gemini)',
        a: <>연결한 경험이나 공고 메모가 너무 많을 때 나요. 연결한 항목을 줄이거나, AI 바에서 Claude로 바꿔 보세요.</>,
      },
      {
        q: '"다른 AI 작업이 진행 중"이에요',
        a: <>AI는 한 번에 하나만 실행돼요. 끝나기를 기다리거나 [취소]를 누른 뒤 다시 하세요.</>,
      },
      {
        q: '원인을 더 자세히 알고 싶어요',
        a: (
          <>
            <b>데이터 → [로그 폴더 열기]</b>의 <code>ai-last-run.json</code> 파일을 문제를 알릴 때 함께 보내 주세요. 여러분이 쓴 글은 들어
            있지 않아요.{' '}
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
      { cmd: 'irm https://antigravity.google/cli/install.ps1 | iex', note: '설치' },
      { cmd: 'agy', note: '실행하면 브라우저가 열려요. 로그인 → 인증 코드 복사 → 창에 붙여넣고 Enter' },
    ],
  },
  {
    title: 'Claude Code 설치 → 로그인',
    lines: [
      { cmd: 'irm https://claude.ai/install.ps1 | iex', note: '설치' },
      { cmd: 'claude auth login --claudeai', note: '브라우저에서 Claude 구독 계정으로 로그인' },
    ],
  },
  {
    title: 'Gemini 무료 (Gemini CLI) · Node.js가 먼저 필요',
    lines: [
      { cmd: 'winget install --id OpenJS.NodeJS.LTS -e', note: 'Node.js 설치 (끝나면 창을 새로 여세요)' },
      { cmd: 'npm install -g @google/gemini-cli', note: '설치' },
      { cmd: 'gemini', note: '"Login with Google" 선택 → 브라우저 로그인 → /quit' },
    ],
  },
  {
    title: '설치됐는지 확인',
    lines: [
      { cmd: 'agy --version', note: '버전 숫자가 나오면 설치된 거예요' },
      { cmd: 'claude --version' },
    ],
  },
]

export function HelpContent() {
  const copy = async (cmd: string) => {
    await desktop.copyText(cmd)
    toast('복사했어요. PowerShell 창에서 마우스 오른쪽 클릭으로 붙여넣고 Enter')
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
        <h3>직접 명령어로 하기 (버튼이 안 될 때만)</h3>
        <p className="muted small">PowerShell 창을 열고, 명령을 복사해 마우스 오른쪽 클릭으로 붙여넣은 뒤 Enter. 한 줄씩.</p>
        <div className="btn-row">
          <button type="button" className="btn small" onClick={() => desktop.ai.openTerminal('open-shell')}>
            <TerminalSquare size={14} /> PowerShell 열기
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
    </div>
  )
}
