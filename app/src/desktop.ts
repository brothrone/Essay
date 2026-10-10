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
  /** 도움말 메뉴 → 의견 보내기 */
  onFeedback: (fn: () => void) => () => void
  /** 요금제 안내 · 공지 · 의견 보내기 주소 (사이트에서 하루 한 번 갱신) */
  appConfig: () => Promise<AppConfig>
  /** 개선 돕기: 서버 주소(app-config 의 api.baseUrl)가 없거나 사용자가 고르지 않은 것은 보내지 않는다 */
  community: {
    state: () => Promise<CommunityState>
    setConsent: (c: Omit<CommunityConsent, 'at'>) => Promise<CommunityConsent>
    /** 기능 사용 횟수 하나 올리기 (이름은 영어 소문자 · 숫자 · _ ) */
    track: (name: string) => void
    setContext: (ctx: { ai: AiProvider }) => void
    reportError: (e: { message: string; stack?: string }) => void
    sendFeedback: (f: { kind: 'bug' | 'idea' | 'etc'; message: string; contact?: string; withInfo: boolean }) => Promise<{ ok: boolean; error?: string }>
    findQuestions: (q: { company: string; position?: string }) => Promise<{ ok: boolean; sets: CommunityQuestionSet[]; error?: string }>
    shareQuestions: (info: { company: string; position: string; deadline: string; url: string; questions: { prompt: string; limit: number | null }[] }) => void
    /** 공고 모음: 이 공고를 이미 읽어 둔 게 있는지 (주소 해시만 보냄) */
    lookupPosting: (url: string) => Promise<{ ok: boolean; posting: ServerPosting | null; error?: string }>
    /** AI 로 읽은 공고를 공고 모음에 보태기 ('문항 모음' 동의한 사람만) */
    sharePosting: (info: { company: string; position: string; deadline: string; deadlineTime: string; notes: string; url: string; questions: { prompt: string; limit: number | null }[]; questionsSource: string }) => void
    /** 공개된 기업 · 직무 · 문항 분석 */
    insights: (q: { company: string; position?: string; postingId?: number }) => Promise<{ ok: boolean; company: Insight | null; job: Insight | null; questions: Insight | null; error?: string }>
  }
  /** 유료 판매: 이용권 확인 · 구매 (app-config 의 billing.enabled 가 true 일 때만 결제를 요구) */
  billing: {
    state: () => Promise<BillingState>
    activate: (key: string) => Promise<{ ok: boolean; error?: string }>
    /** 구매 페이지를 브라우저로 열고, 결제가 끝나면 onChanged({ done: true }) */
    buy: () => Promise<{ ok: boolean; url?: string }>
    cancel: () => Promise<boolean>
    openTerms: () => Promise<boolean>
    onChanged: (fn: (p: { done?: boolean; error?: string; revoked?: boolean }) => void) => () => void
  }
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
  /** 자동백업 폴더: 목록 보기 · 파일 읽기 · 데이터를 통째로 바꾸기 전 스냅샷 남기기 */
  backups: {
    list: () => Promise<BackupFile[]>
    read: (name: string) => Promise<string>
    snapshot: (label: string) => Promise<string | null>
  }
  /** 리스너를 모두 붙인 뒤 한 번 호출. 그 전에 온 이동·새 자소서 명령은 메인 프로세스가 들고 있다 */
  ready: () => void
  /** 앱을 껐다가 다시 켠다 (Node.js 설치 뒤 새 PATH 를 읽을 때) */
  relaunch: () => Promise<void>
  onNavigate: (fn: (route: string) => void) => () => void
  /** 맥 전체 화면 들어가기 · 나오기 (제목 표시줄 여백 조정용) */
  onFullscreen: (fn: (on: boolean) => void) => () => void
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
    /** fresh: 기억해 둔 명령어 위치 · 로그인 결과를 버리고 새로 확인 ([연결 확인] 버튼) */
    status: (opts?: { fresh?: boolean }) => Promise<AiStatus>
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
    /** GPT(Codex CLI) 로그인: 창 없이 codex login 을 띄운다(브라우저가 열림). 진행은 onGptLogin 으로 온다 */
    gptLogin: () => Promise<{ ok: boolean; error?: string }>
    gptLoginCancel: () => Promise<boolean>
    /** url: 브라우저가 안 열렸을 때 열 로그인 주소 · done: 끝남(ok 면 로그인됨) */
    onGptLogin: (fn: (p: { url?: string; done?: boolean; ok?: boolean; cancelled?: boolean; error?: string }) => void) => () => void
    onProgress: (fn: (p: AiProgress) => void) => () => void
    /** 이 컴퓨터에서 Essay 가 쓴 AI 토큰 합계 (오늘 · 7일 · 30일, 최근 14일 날짜별) */
    usage: () => Promise<AiUsageSummary>
    usageReset: () => Promise<boolean>
    /** 그 AI CLI 가 받아 둔 고를 수 있는 모델 (지금은 GPT 만. 없으면 빈 목록) */
    models: (provider: AiProvider) => { value: string; label: string }[]
  }
}

export interface CommunityConsent {
  stats: boolean
  errors: boolean
  questions: boolean
  at: string
}
export interface CommunityState {
  /** 서버 주소가 있어 보낼 수 있는지 */
  available: boolean
  /** 아직 고르지 않았으면 null */
  consent: CommunityConsent | null
}
/** 서버 공고 모음의 공고 한 건 */
export interface ServerPosting {
  id: number
  company: string
  position: string
  deadline: string
  deadlineTime: string
  notes: string
  questions: { prompt: string; limit: number | null }[]
  questionsSource: string
  url: string
  /** 개발자가 확인해 공개한 것 (아니면 여러 사용자가 똑같이 읽은 것) */
  verified: boolean
  contributors: number
  updatedAt: string
}
export interface InsightSection {
  title: string
  text?: string
  items?: string[]
  table?: { head: string[]; rows: string[][] }
}
/** 기업 · 직무 · 문항 분석 (서버에서 받거나 내 AI 로 만든 것) */
export interface Insight {
  summary: string
  sections: InsightSection[]
  sources: { title: string; url: string }[]
  /** 기준 (예: 2025 사업보고서 · 2026 하반기 공고) */
  basis: string
  updatedAt?: string
}

export interface CommunityQuestionSet {
  id: number
  company: string
  position: string
  period: string
  contributors: number
  lastSeen: string
  questions: { prompt: string; limit: number | null }[]
}

export interface PlanInfo {
  name: string
  need: string
  note: string
}
export interface BillingState {
  enabled: boolean
  /** true 면 결제 화면만 보여 준다 */
  required: boolean
  licensed: boolean
  /** 결제를 켜기 전에 설치해 계속 무료 */
  legacy: boolean
  /** 이용권은 있지만 60일 넘게 확인하지 못함 → 인터넷 연결 뒤 확인 */
  offlineTooLong: boolean
  /** 가린 키 (ESSAY-ABCD-····-····-WXYZ) */
  key: string
  price: number
  listPrice: number
  termsUrl: string
}

export interface AppConfig {
  /** 요금제 조건을 마지막으로 확인한 날 (YYYY-MM-DD) */
  checkedAt: string
  plans: Record<'agy' | 'claude' | 'gemini-free', PlanInfo> & { gpt?: PlanInfo }
  /** 앱 안에 띄울 공지 (비어 있으면 안 띄움) */
  notice: string
  feedback: { formUrl: string; issuesUrl: string }
  /** Essay 서버 주소 (비어 있으면 의견 보내기 · 통계 · 오류 보고 · 문항 모음을 쓰지 않음) */
  api?: { baseUrl: string }
  /** 유료 판매 (enabled 가 true 일 때만 결제를 요구) */
  billing?: { enabled: boolean; price: number; listPrice: number; buyUrl: string; termsUrl: string }
}

export interface BackupFile {
  name: string
  at: number
  size: number
}

export type TerminalAction =
  | 'install-agy'
  | 'login-agy'
  | 'install-gemini'
  | 'login-gemini'
  | 'install-node'
  | 'install-claude'
  | 'login-claude'
  | 'install-codex'
  | 'login-codex'
  /** 명령 없이 안내만 적힌 PowerShell · 터미널 창 (도움말의 '직접 명령어로 하기') */
  | 'open-shell'

export type InstallAction = 'install-agy' | 'install-claude' | 'install-gemini' | 'install-node' | 'install-codex'

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

/** gpt = OpenAI Codex CLI (ChatGPT 계정 로그인) */
export type AiProvider = 'claude' | 'gemini' | 'gpt'

/** loggedIn: true/false 는 확인된 것, null 은 모름(첫 실행 때 알 수 있음) */
export interface AiStatus {
  claude: { available: boolean; path: string | null; cli: 'claude'; loggedIn: boolean | null }
  /** cli: 실제로 찾은 명령어. agy(Antigravity CLI) 또는 gemini(Gemini CLI) */
  gemini: { available: boolean; path: string | null; cli: 'agy' | 'gemini' | null; loggedIn: boolean | null; webAllowed: boolean }
  /** apiKey: ChatGPT 가 아니라 API 키로 로그인돼 있음 (쓰면 API 요금이 나가서 loggedIn 은 false) */
  gpt: { available: boolean; path: string | null; cli: 'codex'; loggedIn: boolean | null; apiKey: boolean }
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

export type TokenUsage = { input: number; output: number }
export type UsageRow = { runs: number; web: number; input: number; output: number }
export type UsageByProvider = Record<AiProvider, UsageRow>
export interface AiUsageSummary {
  today: UsageByProvider
  week: UsageByProvider
  month: UsageByProvider
  recent: ({ day: string } & UsageByProvider)[]
}

export type AiResult =
  | { ok: true; text: string; seconds: number; model: string; usage?: TokenUsage | null }
  | { ok: false; error: string; cancelled?: boolean; code?: string }

declare global {
  interface Window {
    desktop?: DesktopBridge
  }
}

/** 이 앱은 데스크톱 앱으로만 실행된다. 브라우저에서 열면 main.tsx가 안내 화면을 띄운다 */
export const desktop: DesktopBridge = window.desktop!
