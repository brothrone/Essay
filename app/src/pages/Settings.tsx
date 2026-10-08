import { BookOpen, Bot, CircleHelp, Download, FileText, FileUp, FolderOpen, Info, Monitor, Moon, RotateCcw, Sparkles, Sun, Upload } from 'lucide-react'
import { useState } from 'react'
import { AboutContent } from '../components/AboutDialog'
import { AiSetup } from '../components/AiSetup'
import { openHelpDialog } from '../components/HelpDialog'
import { openImportDialog } from '../components/ImportModal'
import { UpdateCard } from '../components/UpdateBanner'
import { openWelcomeDialog } from '../components/WelcomeDialog'
import { loggedInFor, useAiStatus } from '../useAiStatus'
import { APP_NAME } from '../constants'
import { desktop, type AiProvider, type ThemeSource } from '../desktop'
import { buildSample } from '../sample'
import { emptyData, isEmptyData, normalize, useStore } from '../store'
import { toast } from '../toast'
import { AI_PROVIDERS, saveAiProvider, savedAiProvider } from '../useAiTask'
import { useTheme } from '../useTheme'
import { toDateInput } from '../utils'

export function Settings() {
  const { data, replaceAll } = useStore()

  const sizeKb = Math.ceil(new Blob([JSON.stringify(data)]).size / 1024)
  const summary = `자소서 ${data.projects.length}개, 경험 ${data.experiences.length}개, 스펙 ${data.specs.length}개`

  const exportBackup = async () => {
    const stamp = toDateInput(new Date()).replaceAll('-', '')
    const r = await desktop.exportBackup(JSON.stringify(data, null, 2), `${APP_NAME}-백업-${stamp}.json`)
    if (r.ok) toast('백업 파일을 저장했어요')
  }

  const importBackup = async () => {
    const r = await desktop.importBackup()
    if (!r.ok || !r.text) return
    try {
      const next = normalize(JSON.parse(r.text))
      const ok = await desktop.confirm('백업 파일 내용으로 바꿀까요?', {
        detail: `불러올 데이터: 자소서 ${next.projects.length}개, 경험 ${next.experiences.length}개, 스펙 ${next.specs.length}개\n지금 데이터(${summary})는 사라져요.`,
        ok: '바꾸기',
        danger: true,
      })
      if (!ok) return
      replaceAll(next)
      toast('백업을 불러왔어요')
    } catch (err) {
      toast(err instanceof Error && err.message.includes('백업') ? err.message : '파일을 읽을 수 없어요')
    }
  }

  const loadSample = async () => {
    if (
      !isEmptyData(data) &&
      !(await desktop.confirm('예시 데이터로 바꿀까요?', { detail: `지금 데이터(${summary})는 사라져요.`, ok: '바꾸기', danger: true }))
    )
      return
    replaceAll(buildSample())
    toast('예시 데이터를 불러왔어요')
  }

  const resetAll = async () => {
    if (!(await desktop.confirm(`모든 데이터(${summary})를 삭제할까요?`, { ok: '삭제', danger: true }))) return
    if (!(await desktop.confirm('정말 삭제할까요?', { detail: '백업 파일이 없으면 되돌릴 수 없어요.', ok: '모두 삭제', danger: true })))
      return
    replaceAll(emptyData())
    toast('모든 데이터를 지웠어요')
  }

  return (
    <div className="page narrow">
      <header className="page-head">
        <div>
          <h1>백업 · 데이터</h1>
          <p className="muted">모든 데이터는 이 PC의 문서 폴더에 파일로 저장돼요. 인터넷으로 보내지 않아요.</p>
        </div>
      </header>

      <section className="card">
        <header className="card-head">
          <h3>현재 데이터</h3>
          <span className="muted small">
            {summary} · 약 {sizeKb.toLocaleString()}KB
          </span>
        </header>
        <p className="muted small data-path" title="데이터 파일 위치">
          {desktop.dataPath}
        </p>
        <p className="muted small">
          매일 처음 저장하기 직전 상태를 같은 폴더의 '자동백업'에 30일치 보관해요. 다른 PC로 옮길 때는 아래 백업 파일을 쓰세요.
        </p>
        <div className="btn-row">
          <button type="button" className="btn small" onClick={() => desktop.openDataFolder()}>
            <FolderOpen size={14} /> 데이터 폴더 열기
          </button>
          <button type="button" className="btn small ghost" onClick={() => desktop.openLogsFolder()} title="AI 실행 기록(ai-last-run.json)이 있어요">
            <FileText size={14} /> 로그 폴더 열기
          </button>
        </div>
      </section>

      <ThemeSettings />

      <AiSettings />

      <section className="card setting-actions">
        <div className="setting-row">
          <div>
            <strong>예전 자소서로 한 번에 채우기</strong>
            <p className="muted small">지금까지 쓴 자소서·이력서를 넣으면 AI가 경험·스펙·과거 답변을 뽑아 채우고 맞춤 공고 조건도 잡아요.</p>
          </div>
          <button type="button" className="btn" onClick={openImportDialog}>
            <FileUp size={16} /> 불러오기
          </button>
        </div>
      </section>

      <section className="card setting-actions">
        <div className="setting-row">
          <div>
            <strong>백업 파일 저장</strong>
            <p className="muted small">전체 데이터를 JSON 파일 하나로 저장해요. 다른 PC로 옮길 때도 사용해요.</p>
          </div>
          <button type="button" className="btn primary" onClick={exportBackup}>
            <Download size={16} /> 백업하기
          </button>
        </div>
        <div className="setting-row">
          <div>
            <strong>백업 불러오기</strong>
            <p className="muted small">저장해 둔 백업 파일로 지금 데이터를 바꿔요.</p>
          </div>
          <button type="button" className="btn" onClick={importBackup}>
            <Upload size={16} /> 파일 선택
          </button>
        </div>
        <div className="setting-row">
          <div>
            <strong>예시 데이터</strong>
            <p className="muted small">가상의 자소서·경험·스펙으로 기능을 둘러봐요.</p>
          </div>
          <button type="button" className="btn" onClick={loadSample}>
            <Sparkles size={16} /> 불러오기
          </button>
        </div>
        <div className="setting-row">
          <div>
            <strong>전체 삭제</strong>
            <p className="muted small">모든 자소서, 경험, 스펙을 지워요.</p>
          </div>
          <button type="button" className="btn ghost danger" onClick={resetAll} disabled={isEmptyData(data)}>
            <RotateCcw size={16} /> 초기화
          </button>
        </div>
      </section>

      <UpdateCard />

      <section className="card">
        <header className="card-head">
          <h3>
            <Info size={18} /> 만든 사람
          </h3>
        </header>
        <AboutContent />
      </section>
    </div>
  )
}

const THEMES: { value: ThemeSource; label: string; icon: React.ReactNode }[] = [
  { value: 'system', label: '윈도우 설정 따라가기', icon: <Monitor size={14} /> },
  { value: 'light', label: '밝게', icon: <Sun size={14} /> },
  { value: 'dark', label: '어둡게', icon: <Moon size={14} /> },
]

function ThemeSettings() {
  const { theme, set } = useTheme()
  return (
    <section className="card">
      <header className="card-head">
        <h3>화면 테마</h3>
        <span className="muted small">{theme.source === 'system' ? `지금은 윈도우 설정대로 ${theme.dark ? '어둡게' : '밝게'}` : ''}</span>
      </header>
      <div className="segmented">
        {THEMES.map((t) => (
          <button type="button" key={t.value} className={theme.source === t.value ? 'on' : ''} onClick={() => set(t.value)}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>
    </section>
  )
}

function AiSettings() {
  const { status, checking, refresh } = useAiStatus()
  const [provider, setProvider] = useState<AiProvider>(savedAiProvider)

  const describe = (p: AiProvider) => {
    const st = status?.[p]
    if (!status) return '확인 중…'
    if (!st?.available) return `${AI_PROVIDERS.find((x) => x.value === p)!.cli} 명령어를 찾지 못했어요 — 아래에서 설치·로그인하세요`
    const cliName = p === 'gemini' ? (st.cli === 'agy' ? 'Antigravity CLI(agy)' : 'Gemini CLI(gemini)') : 'Claude Code'
    const login = loggedInFor(status, p) ? ' · 로그인됨' : st.loggedIn === false ? ' · 로그인 필요' : ' · 로그인 확인 안 됨'
    return `${cliName} 설치됨${login} · ${st.path}`
  }

  return (
    <section className="card">
      <header className="card-head">
        <h3>
          <Bot size={18} /> AI 설정
        </h3>
        <span className="muted small">API 키 없이 로그인 계정으로만 실행돼요</span>
      </header>
      <div className="ai-provider-list">
        {AI_PROVIDERS.map((x) => {
          const st = status?.[x.value]
          const on = provider === x.value
          return (
            <label key={x.value} className={'ai-provider' + (on ? ' on' : '')}>
              <input
                type="radio"
                name="ai-provider"
                checked={on}
                onChange={() => {
                  setProvider(x.value)
                  saveAiProvider(x.value)
                  toast(`${x.short}(으)로 AI를 실행해요`)
                }}
              />
              <span className="ai-provider-text">
                <strong>{x.label}</strong>
                <span className={'muted small' + (st && !st.available ? ' warn' : '')}>{describe(x.value)}</span>
              </span>
            </label>
          )
        })}
      </div>

      <AiSetup provider={provider} status={status} checking={checking} refresh={refresh} />
      <div className="btn-row">
        <button type="button" className="btn small" onClick={openWelcomeDialog}>
          <BookOpen size={14} /> 처음 설정 안내 다시 보기
        </button>
        <button type="button" className="btn small ghost" onClick={openHelpDialog}>
          <CircleHelp size={14} /> 막혔을 때 (F1)
        </button>
      </div>
      <p className="muted small">
        설치 경로가 특이하면 환경 변수 ESSAY_CLAUDE_PATH · ESSAY_AGY_PATH · ESSAY_GEMINI_PATH 에 실행 파일 전체 경로를 넣어 주세요.
      </p>
    </section>
  )
}
