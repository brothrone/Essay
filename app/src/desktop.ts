/** 데스크톱 앱(Electron · 윈도우/맥)에서 preload가 넣어 주는 기능. 화면 코드는 이 객체로만 바깥세상과 통한다 */
export interface DesktopBridge {
  dataPath: string
  /** platform: 'win32' | 'darwin' (src/platform.ts 의 IS_MAC 이 이 값을 본다) */
  info: { version: string; electron: string; chrome: string; node: string; platform: string; arch: string }
  /** 예전 자소서 파일(.txt · .md · .docx)을 골라 본문을 읽어 온다 */
  pickImportFiles: () => Promise<{ name: string; text: string; error?: string }[]>
  onAbout: (fn: () => void) => () => void
  onImport: (fn: () => void) => () => void
  /** 도움말 메뉴 → 처음 설정 안내(설치 · AI 연결) */
  onWelcome: (fn: () => void) => () => void
  /** 도움말 메뉴(F1) → 문제 해결 */
  onHelp: (fn: () => void) => () => void
  loadData: () => string | null
  saveData: (json: string) => Promise<void>
  saveDataSync: (json: string) => boolean
  copyText: (text: string) => Promise<void>
  openDataFolder: () => Promise<string>
  openLogsFolder: () => Promise<string>
  /** 운영체제 기본 메시지 상자. 확인 버튼을 누르면 true */
  confirm: (message: string, options?: ConfirmOptions) => Promise<boolean>
  /** '다른 이름으로 저장' 대화 상자로 백업 파일을 쓴다 */
  exportBackup: (json: string, filename: string) => Promise<{ ok: boolean; path?: string }>
  /** '열기' 대화 상자로 백업 파일을 고르고 내용을 읽는다 */
  importBackup: () => Promise<{ ok: boolean; path?: string; text?: string }>
  /** 리스너를 모두 붙인 뒤 한 번 호출. 그 전에 온 이동·새 자소서 명령은 메인 프로세스가 들고 있다 */
  ready: () => void
  /** 앱을 껐다가 다시 켠다 (Node.js 설치 뒤 새 PATH 를 읽을 때) */
  relaunch: () => Promise<void>
  onNavigate: (fn: (route: string) => void) => () => void
  onNewProject: (fn: () => void) => () => void
  theme: {
    get: () => Promise<ThemeInfo>
    set: (source: ThemeSource) => Promise<ThemeInfo>
    onChanged: (fn: (t: ThemeInfo) => void) => () => void
  }
  /** 자동 업데이트(GitHub Releases). 설치판에서만 동작하고 개발 실행에서는 check 가 ok:false 를 돌려준다 */
  update: {
    status: () => Promise<UpdateStatus>
    check: () => Promise<{ ok: boolean; version?: string; error?: string }>
    /** 내려받은 새 버전으로 지금 다시 시작 */
    install: () => Promise<void>
    onStatus: (fn: (s: UpdateStatus) => void) => () => void
  }
  ai: {
    status: () => Promise<AiStatus>
    run: (prompt: string, model?: string, options?: { web?: boolean; provider?: AiProvider }) => Promise<AiResult>
    cancel: () => Promise<boolean>
    geminiAllowWeb: () => Promise<{ ok: boolean; path: string }>
    /** Gemini 검색 결과의 구글 중간 주소를 실제 공고 주소로 바꾼다 (못 바꾸면 빈 문자열) */
    resolveUrls: (urls: string[]) => Promise<string[]>
    /** 공고 페이지를 직접 열어 접수 중인지 · 마감일을 확인한다 (closed 면 목록에서 뺀다) */
    checkPostings: (urls: string[], today: string) => Promise<{ status: 'open' | 'closed' | 'unknown'; deadline: string }[]>
    /** 설치·로그인 명령을 사용자가 보는 PowerShell(맥: 터미널) 창에서 실행 */
    openTerminal: (action: TerminalAction) => Promise<boolean>
    /** 설치를 창 없이 조용히 실행. 진행 줄은 onInstallProgress, 끝은 onInstallDone 으로 온다 */
    install: (action: InstallAction) => Promise<{ ok: boolean; error?: string }>
    installCancel: () => Promise<boolean>
    onInstallProgress: (fn: (p: { action: InstallAction; line: string }) => void) => () => void
    onInstallDone: (fn: (p: { action: InstallAction; code: number; seconds: number }) => void) => () => void
    /** Antigravity CLI 로그인: 콘솔 창에서 agy 를 돌린다(브라우저 로그인 → 인증 코드). 성공 여부는 geminiLoginStatus 로 확인 */
    geminiLogin: () => Promise<{ ok: boolean; terminal?: boolean; error?: string }>
    /** 로그인 창 진행 상태. result 는 "exit 0" 같은 종료 코드 문자열(아직 안 끝났으면 빈 값) */
    geminiLoginStatus: () => Promise<{ loggedIn: boolean; result: string }>
    /** 브라우저에 뜬 인증 코드를 로그인 콘솔 창에 대신 입력 */
    sendAuthCode: (code: string) => Promise<{ ok: boolean; error?: string }>
    onProgress: (fn: (p: AiProgress) => void) => () => void
  }
}

export type TerminalAction =
  | 'install-agy'
  | 'login-agy'
  | 'install-gemini'
  | 'login-gemini'
  | 'install-node'
  | 'install-claude'
  | 'login-claude'
  /** 명령 없이 안내만 적힌 PowerShell · 터미널 창 (도움말의 '직접 명령어로 하기') */
  | 'open-shell'

export type InstallAction = 'install-agy' | 'install-claude' | 'install-gemini' | 'install-node'

export interface ConfirmOptions {
  /** 본문 아래 작은 글씨 */
  detail?: string
  /** 확인 버튼 이름 (기본 '확인') */
  ok?: string
  /** 취소 버튼 이름 (기본 '취소') */
  cancel?: string
  /** 삭제처럼 되돌릴 수 없는 일이면 경고 아이콘 + 기본 선택을 취소로 */
  danger?: boolean
}

export type UpdateStatus = {
  state: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'none' | 'error'
  version?: string
  percent?: number
  message?: string
  /** 맥: 앱이 직접 바꿔 끼우지 못해 다운로드 페이지로 안내한다 (install 을 부르면 url 을 연다) */
  manual?: boolean
  url?: string
}

/** system = 운영체제 설정(윈도우: 개인 설정 → 색, 맥: 시스템 설정 → 화면 모드)을 따라감 */
export type ThemeSource = 'system' | 'light' | 'dark'
export interface ThemeInfo {
  source: ThemeSource
  dark: boolean
}

export type AiProvider = 'claude' | 'gemini'

/** loggedIn: true/false 는 확인된 것, null 은 모름(첫 실행 때 알 수 있음) */
export interface AiStatus {
  claude: { available: boolean; path: string | null; cli: 'claude'; loggedIn: boolean | null }
  /** cli: 실제로 찾은 명령어. agy(Antigravity CLI) 또는 gemini(Gemini CLI) */
  gemini: { available: boolean; path: string | null; cli: 'agy' | 'gemini' | null; loggedIn: boolean | null; webAllowed: boolean }
  /** npm 이 있으면 Gemini CLI(npm 설치)도 고를 수 있다 */
  nodeAvailable: boolean
}

export type AiProgress = {
  text: string
  seconds: number
  retry?: boolean
  tool?: string
  detail?: string
  /** CLI 가 브라우저 로그인 뒤 인증 코드를 기다리는 중 (timeout 초 안에 넣어야 함) */
  auth?: { url: string; timeout: number }
}

export type AiResult =
  | { ok: true; text: string; seconds: number; model: string }
  | { ok: false; error: string; cancelled?: boolean; code?: string }

declare global {
  interface Window {
    desktop?: DesktopBridge
  }
}

/** 이 앱은 데스크톱 앱으로만 실행된다. 브라우저에서 열면 main.tsx가 안내 화면을 띄운다 */
export const desktop: DesktopBridge = window.desktop!
