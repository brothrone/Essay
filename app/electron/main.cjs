// Essay 데스크톱 앱(윈도우 · 맥): 창을 띄우고, 데이터를 '문서/Essay' 폴더의 JSON 파일로 저장한다.
const { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme, shell, clipboard, Notification } = require('electron')
const { spawn, execFileSync } = require('node:child_process')
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')

// 맥이면 true. 윈도우 동작은 그대로 두고 맥에서만 다르게 할 곳을 이 값으로 나눈다
const IS_MAC = process.platform === 'darwin'

// 윈도우 알림·작업 표시줄 묶음에 쓰이는 앱 ID (NSIS 바로가기와 같은 값)
if (!IS_MAC) app.setAppUserModelId('com.brothrone.essay')

const APP_NAME = 'Essay'
const ICON_ICO = path.join(__dirname, 'icon.ico')
const ICON_PNG = path.join(__dirname, 'icon.png')
const TITLEBAR_HEIGHT = 38
// 개발 검증용: ESSAY_DATA_DIR 로 데이터 폴더를 바꿔 실제 데이터를 건드리지 않고 시험한다
const DATA_DIR = process.env.ESSAY_DATA_DIR || path.join(app.getPath('documents'), 'Essay')
const DATA_FILE = path.join(DATA_DIR, 'Essay-데이터.json')
const BACKUP_DIR = path.join(DATA_DIR, '자동백업')
const KEEP_BACKUPS = 30
const HOME = os.homedir()
const APPDATA = process.env.APPDATA || path.join(HOME, 'AppData', 'Roaming')
const LOCALAPPDATA = process.env.LOCALAPPDATA || path.join(HOME, 'AppData', 'Local')

/* ---------- 데이터 파일 ---------- */

// 예전 이름(취준노트)으로 저장된 데이터 폴더를 한 번만 옮긴다
function migrateOldData() {
  const oldDir = path.join(app.getPath('documents'), '취준노트')
  if (fs.existsSync(DATA_DIR) || !fs.existsSync(oldDir)) return
  fs.renameSync(oldDir, DATA_DIR)
  const oldFile = path.join(DATA_DIR, '취준노트-데이터.json')
  if (fs.existsSync(oldFile) && !fs.existsSync(DATA_FILE)) fs.renameSync(oldFile, DATA_FILE)
}
migrateOldData()

function readData() {
  let text
  try {
    text = fs.readFileSync(DATA_FILE, 'utf8')
  } catch {
    return null
  }
  try {
    JSON.parse(text)
    return text
  } catch {
    // 손상된 파일은 지우지 않고 옆에 보관한 뒤 빈 상태로 시작
    fs.renameSync(DATA_FILE, DATA_FILE.replace(/\.json$/, `.손상-${Date.now()}.json`))
    return null
  }
}

function localDay() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// 그날 처음 저장하기 직전의 파일을 자동백업 폴더에 남기고, 오래된 것은 지운다
function dailyBackup() {
  if (!fs.existsSync(DATA_FILE)) return
  const target = path.join(BACKUP_DIR, `${localDay()}.json`)
  if (fs.existsSync(target)) return
  fs.mkdirSync(BACKUP_DIR, { recursive: true })
  fs.copyFileSync(DATA_FILE, target)
  const old = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort()
    .slice(0, -KEEP_BACKUPS)
  for (const f of old) fs.rmSync(path.join(BACKUP_DIR, f))
}

/** 백업 폴더의 파일 목록 (자동 일별 + 교체전 스냅샷), 최신순 */
function listBackups() {
  try {
    return fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        const st = fs.statSync(path.join(BACKUP_DIR, f))
        return { name: f, at: st.mtimeMs, size: st.size }
      })
      .sort((a, b) => b.at - a.at)
  } catch {
    return []
  }
}

/** 데이터를 통째로 바꾸기 전(예시 데이터 · 백업 불러오기 · 복원 · 전체 삭제) 현재 파일을 스냅샷으로 남긴다. 최근 20개만 */
function snapshotData(label) {
  if (!fs.existsSync(DATA_FILE)) return null
  fs.mkdirSync(BACKUP_DIR, { recursive: true })
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  const safe = String(label || '스냅샷').replace(/[\\/:*?"<>|]/g, '').slice(0, 20)
  const name = `${localDay()}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${safe}.json`
  fs.copyFileSync(DATA_FILE, path.join(BACKUP_DIR, name))
  const snaps = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}-\d{6}-.*\.json$/.test(f))
    .sort()
  for (const f of snaps.slice(0, Math.max(0, snaps.length - 20))) fs.rmSync(path.join(BACKUP_DIR, f))
  return name
}

ipcMain.handle('backup:list', () => listBackups())
ipcMain.handle('backup:read', (_e, name) => {
  if (typeof name !== 'string' || !/^[^/\\]+\.json$/.test(name)) throw new Error('잘못된 파일 이름')
  const text = fs.readFileSync(path.join(BACKUP_DIR, name), 'utf8')
  JSON.parse(text)
  return text
})
ipcMain.handle('backup:snapshot', (_e, label) => snapshotData(label))

function writeData(json) {
  JSON.parse(json) // 깨진 데이터는 저장하지 않음
  fs.mkdirSync(DATA_DIR, { recursive: true })
  dailyBackup()
  const tmp = `${DATA_FILE}.tmp`
  fs.writeFileSync(tmp, json, 'utf8')
  fs.renameSync(tmp, DATA_FILE)
  scheduleBadgeUpdate()
}

ipcMain.on('data:load', (e) => {
  e.returnValue = readData()
})
ipcMain.handle('data:save', (_e, json) => writeData(json))
ipcMain.on('data:save-sync', (e, json) => {
  try {
    writeData(json)
    e.returnValue = true
  } catch {
    e.returnValue = false
  }
})
ipcMain.on('app:data-path', (e) => {
  e.returnValue = DATA_FILE
})
ipcMain.on('app:info', (e) => {
  e.returnValue = {
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
  }
})
ipcMain.handle('app:open-data-folder', async () => {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  return shell.openPath(DATA_DIR)
})
ipcMain.handle('app:open-logs-folder', async () => {
  const dir = app.getPath('logs')
  fs.mkdirSync(dir, { recursive: true })
  return shell.openPath(dir)
})
ipcMain.handle('clipboard:write', (_e, text) => clipboard.writeText(String(text)))

/* ---------- 윈도우 대화 상자 (확인 · 파일 저장 · 파일 열기) ---------- */

const ownerOf = (e) => BrowserWindow.fromWebContents(e.sender) || undefined

// 브라우저식 confirm() 대신 버튼 이름을 고를 수 있는 윈도우 메시지 상자
ipcMain.handle('dialog:confirm', async (e, { message, detail, ok = '확인', cancel = '취소', danger = false }) => {
  const { response } = await dialog.showMessageBox(ownerOf(e), {
    type: danger ? 'warning' : 'question',
    title: APP_NAME,
    message: String(message || ''),
    detail: detail ? String(detail) : undefined,
    buttons: [ok, cancel],
    defaultId: danger ? 1 : 0,
    cancelId: 1,
    noLink: true,
  })
  return response === 0
})

ipcMain.handle('backup:export', async (e, { json, filename }) => {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  const { canceled, filePath } = await dialog.showSaveDialog(ownerOf(e), {
    title: '백업 파일 저장',
    defaultPath: path.join(DATA_DIR, String(filename || 'Essay-백업.json')),
    filters: [{ name: 'Essay 백업 (*.json)', extensions: ['json'] }],
  })
  if (canceled || !filePath) return { ok: false }
  fs.writeFileSync(filePath, String(json), 'utf8')
  return { ok: true, path: filePath }
})

ipcMain.handle('backup:import', async (e) => {
  const { canceled, filePaths } = await dialog.showOpenDialog(ownerOf(e), {
    title: '백업 파일 불러오기',
    defaultPath: fs.existsSync(DATA_DIR) ? DATA_DIR : app.getPath('documents'),
    filters: [{ name: 'Essay 백업 (*.json)', extensions: ['json'] }],
    properties: ['openFile'],
  })
  if (canceled || !filePaths[0]) return { ok: false }
  return { ok: true, path: filePaths[0], text: fs.readFileSync(filePaths[0], 'utf8') }
})

/* ---------- 예전 자소서 파일 읽기 (.txt · .md · .docx) ---------- */

// .docx 는 zip 안의 word/document.xml 이 본문. 외부 라이브러리 없이 zip 을 직접 읽는다.
function docxToText(buf) {
  const zlib = require('node:zlib')
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 70000); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('zip 구조를 찾지 못했어요')
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break
    const method = buf.readUInt16LE(p + 10)
    const csize = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const local = buf.readUInt32LE(p + 42)
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen)
    if (name === 'word/document.xml') {
      const ln = buf.readUInt16LE(local + 26)
      const le = buf.readUInt16LE(local + 28)
      const start = local + 30 + ln + le
      const data = buf.subarray(start, start + csize)
      const xml = (method === 8 ? zlib.inflateRawSync(data) : data).toString('utf8')
      return xml
        .replace(/<w:tab\/>/g, '\t')
        .replace(/<w:br[^>]*\/>/g, '\n')
        .replace(/<\/w:p>/g, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    }
    p += 46 + nameLen + extraLen + commentLen
  }
  throw new Error('문서 본문(word/document.xml)이 없어요')
}

ipcMain.handle('import:pick-files', async (e) => {
  const { canceled, filePaths } = await dialog.showOpenDialog(ownerOf(e), {
    title: '예전 자소서 파일 선택',
    defaultPath: app.getPath('documents'),
    filters: [
      { name: '자소서 파일 (txt, md, docx)', extensions: ['txt', 'md', 'docx'] },
      { name: '모든 파일', extensions: ['*'] },
    ],
    properties: ['openFile', 'multiSelections'],
  })
  if (canceled) return []
  return filePaths.map((fp) => {
    const name = path.basename(fp)
    try {
      const buf = fs.readFileSync(fp)
      if (/\.docx$/i.test(fp)) return { name, text: docxToText(buf) }
      if (/\.(hwp|hwpx|pdf|doc)$/i.test(fp)) return { name, text: '', error: '이 형식은 바로 읽지 못해요. 내용을 복사해서 붙여넣어 주세요.' }
      let text = buf.toString('utf8')
      if (text.includes('�')) text = new TextDecoder('euc-kr').decode(buf) // 한글 윈도우 메모장(ANSI) 파일
      return { name, text: text.replace(/^﻿/, '') }
    } catch (ex) {
      return { name, text: '', error: `읽지 못했어요: ${ex.message}` }
    }
  })
})

/* ---------- AI: 이 PC에 설치된 구독형 CLI로 글쓰기 ----------
   claude → Claude Code (Claude 구독), gemini → Antigravity CLI `agy` (Google AI 구독)
   둘 다 API 키 없이 로그인 세션으로 돌고, 유료 API 환경변수는 걸러서 넘긴다. */

const AI_SYSTEM =
  '당신은 한국 기업 자기소개서 작성을 돕는 전문가입니다. 사용자가 요청한 형식으로만 답하세요. 도구를 쓰거나 파일을 찾지 마세요.'
const AI_SYSTEM_WEB =
  '당신은 한국 채용 공고를 찾아 정리하는 리서처입니다. 웹 검색과 웹 페이지 읽기만 사용하고, 파일이나 셸 명령은 쓰지 마세요. 확인한 사실만 요청한 형식으로 답하세요.'
const CLAUDE_WEB_TOOLS = 'WebSearch,WebFetch'
const GEMINI_SETTINGS = () => path.join(HOME, '.gemini', 'antigravity-cli', 'settings.json')
const GEMINI_WEB_RULE = 'read_url(*)'
const PROVIDER_LABEL = { claude: 'Claude Code', gemini: 'Gemini CLI(agy 또는 gemini)' }
// Antigravity CLI 로그인 기록 (agy 는 로그인 여부를 물어볼 명령이 없다) · 로그인 콘솔 창 제목
const AGY_LOGIN_MARK = () => path.join(app.getPath('userData'), 'agy-login-ok')
const AGY_LOGIN_RESULT = () => path.join(app.getPath('userData'), 'agy-login-result.txt')
const AGY_LOGIN_CODE = () => path.join(app.getPath('userData'), 'agy-login-code.txt')
const AGY_LOGIN_WINDOW = 'Essay 로그인 창 - Gemini'
// 윈도우 명령줄 길이 한도(32,767자) 안에서 agy에 요청문을 인자로 넘길 수 있는 최대 길이
const WIN_ARG_LIMIT = 30000
// 맥은 인자 하나가 256KB 까지라 넉넉하다
const MAC_ARG_LIMIT = 200000

let aiChild = null
let aiChildKind = ''
let aiCancelled = false

const firstExisting = (list) => list.filter(Boolean).find((p) => fs.existsSync(p)) || null

// 맥: 앱은 터미널의 PATH 를 못 받으므로 로그인 셸(zsh)의 PATH 를 한 번 읽어 둔다
let loginPathCache = null
function loginShellPath() {
  if (loginPathCache !== null) return loginPathCache
  try {
    const out = execFileSync('/bin/zsh', ['-lc', 'printf %s "$PATH"'], { encoding: 'utf8', timeout: 8000, stdio: ['ignore', 'pipe', 'ignore'] })
    loginPathCache = out.split(':').filter(Boolean)
  } catch {
    loginPathCache = []
  }
  return loginPathCache
}
const MAC_EXTRA_PATH = () => [path.join(HOME, '.local', 'bin'), '/opt/homebrew/bin', '/usr/local/bin']

// PATH 에서 명령어 위치를 찾는다 (윈도우: where.exe, 맥: 로그인 셸 PATH 의 폴더를 직접 확인)
function whereBin(name) {
  if (IS_MAC) {
    for (const dir of [...MAC_EXTRA_PATH(), ...loginShellPath(), '/usr/bin', '/bin']) {
      const p = path.join(dir, name)
      try {
        fs.accessSync(p, fs.constants.X_OK)
        if (fs.statSync(p).isFile()) return p
      } catch {
        /* 없음 */
      }
    }
    return null
  }
  try {
    const out = execFileSync('where.exe', [name], { encoding: 'utf8', timeout: 5000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })
    const p = out
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find(Boolean)
    return p && fs.existsSync(p) ? p : null
  } catch {
    return null
  }
}

// Gemini는 두 CLI 중 설치된 것을 쓴다: Antigravity CLI(agy, 구독 로그인) → 없으면 Gemini CLI(gemini, Google 로그인)
function findGemini() {
  const agy =
    firstExisting(
      IS_MAC
        ? [process.env.ESSAY_AGY_PATH, path.join(HOME, '.local', 'bin', 'agy'), '/opt/homebrew/bin/agy', '/usr/local/bin/agy']
        : [
            process.env.ESSAY_AGY_PATH,
            path.join(LOCALAPPDATA, 'agy', 'bin', 'agy.exe'),
            path.join(HOME, '.local', 'bin', 'agy.exe'),
            path.join(APPDATA, 'npm', 'agy.cmd'),
          ],
    ) || whereBin('agy')
  if (agy) return { bin: agy, cli: 'agy' }
  const gemini =
    firstExisting(
      IS_MAC
        ? [process.env.ESSAY_GEMINI_PATH, '/opt/homebrew/bin/gemini', '/usr/local/bin/gemini', path.join(HOME, '.npm-global', 'bin', 'gemini')]
        : [process.env.ESSAY_GEMINI_PATH, path.join(APPDATA, 'npm', 'gemini.cmd'), path.join(LOCALAPPDATA, 'Programs', 'gemini', 'gemini.exe')],
    ) || whereBin('gemini')
  if (gemini) return { bin: gemini, cli: 'gemini' }
  return null
}

function findCli(provider) {
  if (provider === 'gemini') return findGemini()
  const found =
    firstExisting(
      IS_MAC
        ? [
            process.env.ESSAY_CLAUDE_PATH,
            path.join(HOME, '.local', 'bin', 'claude'),
            path.join(HOME, '.claude', 'local', 'claude'),
            '/opt/homebrew/bin/claude',
            '/usr/local/bin/claude',
          ]
        : [
            process.env.ESSAY_CLAUDE_PATH,
            path.join(HOME, '.local', 'bin', 'claude.exe'),
            path.join(HOME, '.claude', 'local', 'claude.exe'),
            path.join(LOCALAPPDATA, 'Programs', 'claude', 'claude.exe'),
            path.join(APPDATA, 'npm', 'claude.cmd'),
          ],
    ) || whereBin('claude')
  return found ? { bin: found, cli: 'claude' } : null
}

// API 키·다른 세션 설정이 섞이면 유료 API로 결제되거나 인증이 꼬이므로 걸러서 넘긴다
function aiEnv(provider) {
  const drop =
    provider === 'gemini'
      ? /^(GEMINI_API_KEY|GOOGLE_API_KEY|GOOGLE_GENAI_|GOOGLE_GEMINI_BASE_URL|GOOGLE_APPLICATION_CREDENTIALS|ANTIGRAVITY_API_KEY|ANTIGRAVITY_LS_ADDRESS|ELECTRON_)/i
      : /^(ANTHROPIC_|CLAUDE_|CLAUDECODE|USE_LOCAL_OAUTH|USE_STAGING_OAUTH|ELECTRON_)/i
  const env = {}
  for (const [k, v] of Object.entries(process.env)) if (!drop.test(k)) env[k] = v
  if (IS_MAC) {
    // 맥: 앱이 Finder 에서 켜지면 터미널 PATH 가 없으므로 로그인 셸 PATH 와 흔한 설치 폴더를 앞에 붙인다
    env.PATH = [...new Set([...MAC_EXTRA_PATH(), ...loginShellPath(), ...(env.PATH || '').split(':')])].filter(Boolean).join(':')
    return env
  }
  // 윈도우 환경변수 이름은 대소문자를 구분하지 않으므로 기존 키 이름을 그대로 쓴다
  const key = Object.keys(env).find((k) => k.toLowerCase() === 'path') || 'Path'
  env[key] = [path.join(HOME, '.local', 'bin'), path.join(LOCALAPPDATA, 'agy', 'bin'), path.join(APPDATA, 'npm'), env[key] || '']
    .filter(Boolean)
    .join(';')
  return env
}

// 윈도우에서는 .cmd 래퍼로 띄운 자식까지 함께 끝내야 하므로 프로세스 트리를 통째로 종료한다
function killTree(child) {
  if (!child || child.pid === undefined || child.exitCode !== null) return
  if (IS_MAC) {
    // 맥: detached 로 띄운 자식은 자기 프로세스 그룹의 우두머리라 그룹 전체(-pid)를 끝낼 수 있다
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      try {
        child.kill('SIGKILL')
      } catch {
        /* 이미 끝남 */
      }
    }
    return
  }
  try {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
  } catch {
    try {
      child.kill()
    } catch {
      /* 이미 끝남 */
    }
  }
}

function claudeErrorMessage(d) {
  const status = d.api_error_status
  const text = String(d.result || '')
  if (status === 401 || /authenticat|OAuth|log ?in/i.test(text))
    return `Claude 로그인이 필요해요. ${IS_MAC ? '터미널' : 'PowerShell'}에서 claude auth login --claudeai 를 실행해 주세요.`
  if (/claude_code_version_too_old|version .* or newer is required/i.test(text))
    return `Claude Code가 오래돼서 이 모델을 쓸 수 없어요. 모델을 "기본"으로 바꾸거나, ${IS_MAC ? '터미널' : 'PowerShell'}에서 claude update 를 실행해 주세요.`
  if (status === 429 || /rate.?limit|usage limit|limit reached/i.test(text))
    return 'Claude 사용량 한도에 도달했어요. 한도가 초기화된 뒤 다시 시도해 주세요.'
  return text.slice(0, 400) || '알 수 없는 오류가 났어요.'
}

function geminiErrorMessage(text) {
  const t = String(text || '')
  if (/authentication (required|failed)|sign.?in|not (logged|signed) in|login/i.test(t))
    return 'Gemini 로그인이 필요해요. 홈의 [AI 연결하기] 카드에서 [로그인]을 눌러 브라우저 로그인 → 인증 코드 붙여넣기를 진행해 주세요.'
  if (/quota|rate.?limit|exhausted|too many requests/i.test(t))
    return 'Gemini 사용량 한도에 도달했어요. 한도가 초기화된 뒤 다시 시도하거나 모델을 바꿔 보세요.'
  if (/unknown model|model .* not (found|available)/i.test(t)) return '선택한 Gemini 모델을 쓸 수 없어요. 모델을 "기본"으로 바꿔 주세요.'
  return t.trim().slice(0, 400) || '알 수 없는 오류가 났어요.'
}

function geminiReadSettings() {
  try {
    const d = JSON.parse(fs.readFileSync(GEMINI_SETTINGS(), 'utf8'))
    return d && typeof d === 'object' ? d : {}
  } catch {
    return {}
  }
}

function geminiWebAllowed() {
  const allow = geminiReadSettings().permissions?.allow
  return Array.isArray(allow) && allow.includes(GEMINI_WEB_RULE)
}

// 마지막 실행의 이벤트 흐름만 남긴다(문제 진단용, 프롬프트·생성 글은 저장하지 않음)
function writeAiLog(info) {
  try {
    const dir = app.getPath('logs')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'ai-last-run.json'), JSON.stringify({ at: new Date().toISOString(), ...info }, null, 2))
  } catch {
    /* 로그 실패는 무시 */
  }
}

// 로그인됐는지 짐작한다: true/false 를 확신할 때만, 모르면 null
let claudeLoginCache = { bin: '', at: 0, value: null }
function claudeLoggedIn(bin) {
  // 창이 활성화될 때마다 묻는데 명령 실행에 0.5초쯤 걸려 화면이 멈칫하므로 30초 동안은 지난 결과를 쓴다
  if (claudeLoginCache.bin === bin && Date.now() - claudeLoginCache.at < 30000) return claudeLoginCache.value
  const value = claudeLoggedInUncached(bin)
  claudeLoginCache = { bin, at: Date.now(), value }
  return value
}
function claudeLoggedInUncached(bin) {
  try {
    const viaCmd = /\.(cmd|bat)$/i.test(bin)
    const out = viaCmd
      ? execFileSync('cmd.exe', ['/d', '/s', '/c', `"${bin}" auth status`], { encoding: 'utf8', timeout: 8000, windowsHide: true, env: aiEnv('claude'), stdio: ['ignore', 'pipe', 'ignore'] })
      : execFileSync(bin, ['auth', 'status'], { encoding: 'utf8', timeout: 8000, windowsHide: true, env: aiEnv('claude'), stdio: ['ignore', 'pipe', 'ignore'] })
    const m = out.match(/\{[\s\S]*\}/)
    if (m) {
      const d = JSON.parse(m[0])
      if (typeof d.loggedIn === 'boolean') return d.loggedIn
    }
    return /logged in|authenticated/i.test(out) ? true : null
  } catch (e) {
    // 로그인 안 됐으면 보통 0이 아닌 코드로 끝난다
    return e && typeof e.status === 'number' && e.status !== 0 ? false : null
  }
}

function geminiLoggedIn(cli) {
  const base = path.join(HOME, '.gemini')
  if (cli === 'gemini') return fs.existsSync(path.join(base, 'oauth_creds.json')) || fs.existsSync(path.join(base, 'google_accounts.json'))
  // agy: 마지막 실행 로그(cli.log)에서 성공·실패 문구 중 더 뒤에 찍힌 쪽을 믿는다
  // (로그인에 성공한 실행도 초반에는 'silent auth failed' 가 남으므로 실패 문구만 보면 안 된다)
  try {
    const log = fs.readFileSync(path.join(base, 'antigravity-cli', 'cli.log'), 'utf8').slice(-300000)
    const lastIndex = (re) => {
      let i = -1
      for (const m of log.matchAll(re)) i = m.index
      return i
    }
    const ok = lastIndex(/Print mode: authenticated as|authentication completed successfully|OAuth: authenticated successfully/g)
    const bad = lastIndex(/Print mode: silent auth failed|Print mode: auth timed out|Print mode: auth error|not logged into Antigravity/g)
    if (ok >= 0 && ok > bad) return true
    if (bad >= 0 && bad > ok) return false
  } catch {
    /* 로그 없음 */
  }
  return fs.existsSync(AGY_LOGIN_MARK()) ? true : null
}

ipcMain.handle('ai:status', () => {
  const claude = findCli('claude')
  const gemini = findCli('gemini')
  return {
    claude: { available: !!claude, path: claude?.bin || null, cli: 'claude', loggedIn: claude ? claudeLoggedIn(claude.bin) : null },
    gemini: {
      available: !!gemini,
      path: gemini?.bin || null,
      cli: gemini?.cli || null,
      loggedIn: gemini ? geminiLoggedIn(gemini.cli) : null,
      // Gemini CLI는 --allowed-tools 로 웹 도구를 바로 허용하므로 agy일 때만 설정 파일 규칙이 필요하다
      webAllowed: gemini?.cli === 'gemini' ? true : geminiWebAllowed(),
    },
    nodeAvailable: !!whereBin('npm'),
  }
})

// 설치·로그인은 사용자가 보는 PowerShell 창에서 진행한다 (허용된 명령만)
const TERMINAL_ACTIONS = {
  // 도움말 '직접 명령어로 하기': 아무 명령도 실행하지 않고 안내만 적힌 빈 창
  'open-shell': {
    title: 'PowerShell',
    cmd: '',
    provider: 'claude',
    hint: [
      'Essay 도움말 창에서 [복사]한 명령을 이 창에 마우스 오른쪽 클릭으로 붙여넣고 Enter 를 누르세요.',
      '한 줄씩 차례로 하세요. 끝나면 이 창을 닫고 Essay 로 돌아가 [연결 확인] 을 누르세요.',
    ],
  },
  'install-agy': {
    title: 'Antigravity CLI 설치',
    cmd: 'irm https://antigravity.google/cli/install.ps1 | iex',
    provider: 'gemini',
    hint: ['설치가 끝나면 이 창을 닫고 Essay로 돌아가세요. 2단계 [로그인 창 열기]를 누르면 돼요.'],
  },
  // agy 는 파이프 stdin 을 읽지 않아(콘솔 입력만 받음) 로그인은 진짜 콘솔 창에서 print 모드로 돌린다.
  // Essay 가 코드 파일을 쓰면 같은 콘솔의 입력 버퍼(WriteConsoleInput)에 코드를 넣어 준다 — 다른 창에 키를 보내지 않는다.
  // 코드가 맞으면 "ok" 를 출력하고 0 으로 끝나며, 그때 Essay 가 읽는 기록 파일을 남긴다. 60초 안에 못 넣으면 한 번 더 기회를 준다.
  'login-agy': {
    title: 'Gemini 로그인 (Antigravity CLI)',
    windowTitle: AGY_LOGIN_WINDOW,
    // 코드는 Essay 가 입력 버퍼에 넣어 주므로 창은 최소화해 두고 브라우저 + Essay 안내 창만 보이게 한다
    minimized: true,
    cmd: () =>
      [
        `Remove-Item -LiteralPath '${AGY_LOGIN_MARK()}' -ErrorAction SilentlyContinue`,
        `Remove-Item -LiteralPath '${AGY_LOGIN_RESULT()}' -ErrorAction SilentlyContinue`,
        `Remove-Item -LiteralPath '${AGY_LOGIN_CODE()}' -ErrorAction SilentlyContinue`,
        "$src = @'",
        CONSOLE_INPUT_CS,
        "'@",
        'Add-Type -TypeDefinition $src',
        '$code = 1',
        'for ($try = 1; $try -le 2; $try++) {',
        "  if ($try -gt 1) { Write-Host ''; Write-Host '시간이 지났어요. 한 번 더 시도할게요 (브라우저가 다시 열려요).' -ForegroundColor Yellow }",
        "  $p = Start-Process -FilePath 'agy' -ArgumentList @('-p', '\"ok라고만 답하세요\"', '--output-format', 'text', '--print-timeout', '120s') -NoNewWindow -PassThru",
        '  $null = $p.Handle',
        '  while (-not $p.HasExited) {',
        `    if (Test-Path -LiteralPath '${AGY_LOGIN_CODE()}') {`,
        `      $c = (Get-Content -LiteralPath '${AGY_LOGIN_CODE()}' -Raw).Trim(); Remove-Item -LiteralPath '${AGY_LOGIN_CODE()}' -Force`,
        '      Start-Sleep -Milliseconds 300',
        '      $null = [EssayConsoleInput]::Type($c + "`r")',
        "      Write-Host '(Essay 에서 받은 인증 코드를 입력했어요)' -ForegroundColor DarkGray",
        '    }',
        '    Start-Sleep -Milliseconds 400',
        '  }',
        '  $p.WaitForExit()',
        '  $code = $p.ExitCode',
        '  if ($code -eq 0) { break }',
        '}',
        `Set-Content -LiteralPath '${AGY_LOGIN_RESULT()}' -Value ("exit " + $code)`,
        "if ($code -eq 0) { Set-Content -LiteralPath '" + AGY_LOGIN_MARK() + "' -Value (Get-Date).ToString('o'); Write-Host ''; Write-Host '로그인 완료! Essay 로 돌아가세요. 이 창은 닫아도 돼요.' -ForegroundColor Green }",
        "else { Write-Host ''; Write-Host '로그인이 끝나지 않았어요. Essay 에서 [로그인] 을 다시 눌러 주세요.' -ForegroundColor Red }",
      ].join('\r\n'),
    provider: 'gemini',
    hint: [
      '1) 잠시 뒤 브라우저가 열리면 Google 계정으로 로그인하세요.',
      '2) 로그인 후 브라우저에 "Paste this code into your application" 과 긴 인증 코드가 떠요. [Copy to Clipboard] 를 누르세요.',
      '3) Essay 창의 인증 코드 칸에 붙여넣고 [코드 보내기] 를 누르면 이 창에 자동으로 입력돼요.',
      '   (직접 하려면: 이 창을 클릭하고 마우스 오른쪽 클릭으로 붙여넣은 뒤 Enter)',
      '4) 아래에 ok 와 "로그인 완료!" 가 나오면 끝이에요. 60초 안에 넣어야 하고, 늦으면 한 번 더 기회를 줘요.',
    ],
  },
  'install-gemini': {
    title: 'Gemini CLI 설치',
    cmd: 'npm install -g @google/gemini-cli',
    provider: 'gemini',
    hint: ['설치가 끝나면 이 창을 닫고 Essay로 돌아가세요.'],
  },
  'login-gemini': {
    title: 'Gemini 로그인 (Gemini CLI)',
    cmd: 'gemini',
    provider: 'gemini',
    hint: [
      '1) 로그인 방법을 물으면 방향키로 "Login with Google" 을 고르고 Enter.',
      '2) 브라우저가 열리면 Google 계정으로 로그인하세요. 성공 메시지가 뜨면 브라우저를 닫아도 돼요.',
      '3) 이 창에서 /quit 를 입력해 gemini 를 끝내고 창을 닫은 뒤 Essay 로 돌아오세요.',
    ],
  },
  'install-node': {
    title: 'Node.js 설치',
    cmd: 'winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements',
    provider: 'gemini',
    hint: ['설치가 끝나면 이 창을 닫고 Essay 를 완전히 종료했다가 다시 실행하세요(새 PATH 를 읽어야 해요).'],
  },
  'install-claude': {
    title: 'Claude Code 설치',
    cmd: 'irm https://claude.ai/install.ps1 | iex',
    provider: 'claude',
    hint: ['설치가 끝나면 이 창을 닫고 Essay로 돌아가세요.'],
  },
  'login-claude': {
    title: 'Claude 로그인',
    cmd: 'claude auth login --claudeai',
    provider: 'claude',
    hint: [
      '1) 브라우저가 열리면 Claude 구독 계정(Pro·Max)으로 로그인하세요. Anthropic Console 계정은 API 요금이 나가요.',
      '2) 브라우저에 인증 코드가 뜨면 복사해서 이 창에 붙여넣고(마우스 오른쪽 클릭) Enter.',
      '3) 완료 메시지가 나오면 이 창을 닫고 Essay 로 돌아오세요.',
    ],
  },
}
// 맥: 같은 일을 터미널 앱(zsh)에서 한다. 설치는 공식 설치 스크립트, 로그인은 CLI 가 띄우는 브라우저로
const TERMINAL_ACTIONS_MAC = {
  'open-shell': {
    title: '터미널',
    cmd: '',
    provider: 'claude',
    hint: ['Essay 도움말 창에서 [복사]한 명령을 이 창에 ⌘V 로 붙여넣고 Enter 를 누르세요.', '한 줄씩 차례로 하세요. 끝나면 이 창을 닫고 Essay 로 돌아가 [연결 확인] 을 누르세요.'],
  },
  'install-agy': {
    title: 'Antigravity CLI 설치',
    cmd: 'curl -fsSL https://antigravity.google/cli/install.sh | bash',
    provider: 'gemini',
    hint: ['설치가 끝나면 이 창을 닫고 Essay로 돌아가세요. 2단계 [로그인]을 누르면 돼요.'],
  },
  // 맥에서 로그인은 보통 Essay 안에서 끝난다(가상 터미널로 agy 를 띄우고 코드를 대신 입력). 이건 그게 안 될 때 쓰는 직접 방식
  'login-agy': {
    title: 'Gemini 로그인 (Antigravity CLI)',
    cmd: 'agy -p "ok라고만 답하세요" --output-format text --print-timeout 120s',
    provider: 'gemini',
    hint: [
      '1) 잠시 뒤 브라우저가 열리면 Google 계정으로 로그인하세요.',
      '2) 로그인 후 브라우저에 "Paste this code into your application" 과 긴 인증 코드가 떠요. [Copy to Clipboard] 를 누르세요.',
      '3) 이 창을 클릭하고 ⌘V 로 붙여넣은 뒤 Enter. 60초 안에 넣어야 해요.',
      '4) 아래에 ok 가 나오면 끝이에요. 이 창을 닫고 Essay 로 돌아가 [연결 확인] 을 누르세요.',
    ],
  },
  'install-gemini': {
    title: 'Gemini CLI 설치',
    cmd: 'npm install -g @google/gemini-cli',
    provider: 'gemini',
    hint: ['설치가 끝나면 이 창을 닫고 Essay로 돌아가세요.'],
  },
  'login-gemini': {
    title: 'Gemini 로그인 (Gemini CLI)',
    cmd: 'gemini',
    provider: 'gemini',
    hint: [
      '1) 로그인 방법을 물으면 방향키로 "Login with Google" 을 고르고 Enter.',
      '2) 브라우저가 열리면 Google 계정으로 로그인하세요. 성공 메시지가 뜨면 브라우저를 닫아도 돼요.',
      '3) 이 창에서 /quit 를 입력해 gemini 를 끝내고 창을 닫은 뒤 Essay 로 돌아오세요.',
    ],
  },
  'install-node': {
    title: 'Node.js 설치',
    cmd: 'brew install node',
    provider: 'gemini',
    hint: ['Homebrew 로 Node.js 를 설치해요. 끝나면 이 창을 닫고 Essay 를 완전히 종료했다가 다시 실행하세요.'],
  },
  'install-claude': {
    title: 'Claude Code 설치',
    cmd: 'curl -fsSL https://claude.ai/install.sh | bash',
    provider: 'claude',
    hint: ['설치가 끝나면 이 창을 닫고 Essay로 돌아가세요.'],
  },
  'login-claude': {
    title: 'Claude 로그인',
    cmd: 'claude auth login --claudeai',
    provider: 'claude',
    hint: [
      '1) 브라우저가 열리면 Claude 구독 계정(Pro·Max)으로 로그인하세요. Anthropic Console 계정은 API 요금이 나가요.',
      '2) 브라우저에 인증 코드가 뜨면 복사해서 이 창에 붙여넣고(⌘V) Enter.',
      '3) 완료 메시지가 나오면 이 창을 닫고 Essay 로 돌아오세요.',
    ],
  },
}
const terminalAction = (action) => (IS_MAC ? TERMINAL_ACTIONS_MAC : TERMINAL_ACTIONS)[action]
ipcMain.handle('ai:open-terminal', (_e, action) => openTerminal(action))

// 설치는 창 없이 조용히 돌리고 진행 상황만 화면에 흘려보낸다 (실패하면 화면에서 PowerShell 창 방식으로 넘어갈 수 있다)
const INSTALL_ACTIONS = new Set(['install-agy', 'install-claude', 'install-gemini', 'install-node'])
// 설치 스크립트가 찍는 색상 코드(ESC[…m) 제거용
const ANSI_RE = new RegExp(String.fromCharCode(27) + '\\[[0-9;?]*[A-Za-z]', 'g')
let installChild = null
ipcMain.handle('ai:install', (e, action) => {
  const a = terminalAction(action)
  if (!a || !INSTALL_ACTIONS.has(action)) return { ok: false, error: '허용되지 않은 설치예요' }
  if (installChild) return { ok: false, error: '다른 설치가 진행 중이에요' }
  const wc = e.sender
  const started = Date.now()
  const emit = (line) => {
    const text = String(line).replace(ANSI_RE, '').trim()
    if (text && !wc.isDestroyed()) wc.send('ai:install-progress', { action, line: text })
  }
  if (IS_MAC && action === 'install-node' && !whereBin('brew')) {
    // 맥에서 Node.js 는 Homebrew 로 설치한다. Homebrew 가 없으면 설치 페이지를 열어 준다
    shell.openExternal('https://nodejs.org/ko/download')
    emit('Homebrew 가 없어 nodejs.org 다운로드 페이지를 열었어요. 설치한 뒤 Essay 를 다시 켜 주세요.')
    if (!wc.isDestroyed()) wc.send('ai:install-done', { action, code: 1, seconds: 0 })
    return { ok: true }
  }
  try {
    const child = IS_MAC
      ? spawn('/bin/zsh', ['-lc', a.cmd], { stdio: ['ignore', 'pipe', 'pipe'], env: aiEnv(a.provider), detached: true })
      : spawn(
          'powershell.exe',
          [
            '-NoLogo',
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-Command',
            `[Console]::OutputEncoding = [Text.Encoding]::UTF8; $ProgressPreference = 'SilentlyContinue'; ${a.cmd}; exit $LASTEXITCODE`,
          ],
          { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: aiEnv(a.provider) },
        )
    installChild = child
    let buf = ''
    const onData = (d) => {
      buf += d
      const parts = buf.split(/\r\n|\n|\r/)
      buf = parts.pop() || ''
      parts.forEach(emit)
    }
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.on('close', (code) => {
      if (buf) emit(buf)
      installChild = null
      if (!wc.isDestroyed()) wc.send('ai:install-done', { action, code: code ?? 1, seconds: Math.round((Date.now() - started) / 1000) })
    })
    child.on('error', (err) => {
      installChild = null
      emit(err.message)
      if (!wc.isDestroyed()) wc.send('ai:install-done', { action, code: 1, seconds: 0 })
    })
    return { ok: true }
  } catch (err) {
    installChild = null
    return { ok: false, error: err.message }
  }
})
ipcMain.handle('ai:install-cancel', () => {
  if (!installChild) return false
  killTree(installChild)
  return true
})
// Node.js 처럼 PATH 가 바뀌는 설치 뒤에는 앱을 다시 켜야 새 명령어가 보인다
ipcMain.handle('app:relaunch', () => {
  app.relaunch()
  app.exit(0)
})

// 맥: 안내와 명령을 적은 .command 파일을 만들어 터미널 앱으로 연다
function openTerminalMac(a, action) {
  const dir = path.join(app.getPath('temp'), 'essay-ai')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${action}.command`)
  const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`
  const env = aiEnv(a.provider)
  const script = [
    '#!/bin/zsh',
    `export PATH=${q(env.PATH)}`,
    `printf '\\033]0;%s\\007' ${q(`Essay · ${a.title}`)}`,
    'clear',
    `echo ${q(`— Essay: ${a.title} —`)}`,
    'echo',
    ...(a.hint || []).map((h) => `echo ${q(h)}`),
    'echo',
    a.cmd,
    'echo',
    `echo ${q('끝났으면 이 창을 닫고 Essay 로 돌아가세요.')}`,
  ].join('\n')
  fs.writeFileSync(file, script + '\n', { encoding: 'utf8', mode: 0o755 })
  fs.chmodSync(file, 0o755)
  try {
    const child = spawn('/usr/bin/open', ['-a', 'Terminal', file], { stdio: 'ignore' })
    child.unref()
    return true
  } catch {
    return false
  }
}

function openTerminal(action) {
  const a = terminalAction(action)
  if (!a) return false
  if (IS_MAC) return openTerminalMac(a, action)
  const cmd = typeof a.cmd === 'function' ? a.cmd() : a.cmd
  const windowTitle = a.windowTitle || `Essay · ${a.title}`
  // 스크립트 파일로 저장한 뒤 cmd 의 start 로 새 콘솔 창을 연다
  // (Node 의 detached 는 윈도우에서 '콘솔 없음' 플래그라 창이 보이지 않는다)
  const dir = path.join(app.getPath('temp'), 'essay-ai')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${action}.ps1`)
  const script = [
    '[Console]::OutputEncoding = [Text.Encoding]::UTF8',
    `$Host.UI.RawUI.WindowTitle = '${windowTitle}'`,
    `Write-Host '— Essay: ${a.title} —' -ForegroundColor Cyan`,
    "Write-Host ''",
    ...(a.hint || []).map((h) => `Write-Host '${h.replace(/'/g, "''")}' -ForegroundColor Yellow`),
    "Write-Host ''",
    cmd,
  ].join('\r\n')
  fs.writeFileSync(file, '﻿' + script, 'utf8') // BOM 이 있어야 PowerShell 5 가 한글을 제대로 읽는다
  try {
    const child = spawn(
      'cmd.exe',
      // minimized: 로그인 창처럼 콘솔은 필요하지만 사용자가 볼 필요는 없는 창은 작업 표시줄로 내려 보낸다
      ['/d', '/c', 'start', `"${windowTitle}"`, ...(a.minimized ? ['/min'] : []), 'powershell.exe', '-NoLogo', '-NoExit', '-ExecutionPolicy', 'Bypass', '-File', `"${file}"`],
      { stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true, env: aiEnv(a.provider) },
    )
    child.unref()
    return true
  } catch {
    return false
  }
}

// 로그인 창(PowerShell)이 같은 콘솔의 입력 버퍼에 글자를 써 넣을 때 쓰는 C# 도우미.
// (SendKeys 처럼 활성 창에 키를 보내는 방식은 다른 창에 타이핑될 수 있어 쓰지 않는다)
const CONSOLE_INPUT_CS = `
using System;
using System.Runtime.InteropServices;
public static class EssayConsoleInput {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct KEY_EVENT_RECORD { public int bKeyDown; public ushort wRepeatCount; public ushort wVirtualKeyCode; public ushort wVirtualScanCode; public char UnicodeChar; public uint dwControlKeyState; }
  [StructLayout(LayoutKind.Explicit, CharSet = CharSet.Unicode)]
  public struct INPUT_RECORD { [FieldOffset(0)] public ushort EventType; [FieldOffset(4)] public KEY_EVENT_RECORD KeyEvent; }
  [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr GetStdHandle(int nStdHandle);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool WriteConsoleInputW(IntPtr hConsoleInput, INPUT_RECORD[] lpBuffer, uint nLength, out uint lpNumberOfEventsWritten);
  public static uint Type(string text) {
    IntPtr h = GetStdHandle(-10);
    var list = new System.Collections.Generic.List<INPUT_RECORD>();
    foreach (char c in text) {
      var k = new KEY_EVENT_RECORD();
      k.bKeyDown = 1; k.wRepeatCount = 1; k.UnicodeChar = c; k.wVirtualKeyCode = (ushort)(c == '\\r' ? 0x0D : 0);
      var down = new INPUT_RECORD(); down.EventType = 1; down.KeyEvent = k; list.Add(down);
      k.bKeyDown = 0;
      var up = new INPUT_RECORD(); up.EventType = 1; up.KeyEvent = k; list.Add(up);
    }
    uint written; WriteConsoleInputW(h, list.ToArray(), (uint)list.Count, out written); return written;
  }
}`

// Essay 의 입력칸에 붙여넣은 인증 코드를 파일로 넘기면 로그인 창이 집어 간다
function handOverLoginCode(code) {
  try {
    fs.writeFileSync(AGY_LOGIN_CODE(), String(code).trim(), 'utf8')
    return true
  } catch {
    return false
  }
}

function readLoginResult() {
  try {
    return fs.readFileSync(AGY_LOGIN_RESULT(), 'utf8').trim()
  } catch {
    return ''
  }
}

// Antigravity CLI는 비대화형에서 웹 페이지 읽기(read_url)를 허용 규칙 없이는 막는다 → 사용자가 누르면 규칙 추가
ipcMain.handle('ai:gemini-allow-web', () => {
  const s = geminiReadSettings()
  const perms = s.permissions && typeof s.permissions === 'object' ? s.permissions : {}
  const allow = Array.isArray(perms.allow) ? [...perms.allow] : []
  if (!allow.includes(GEMINI_WEB_RULE)) allow.push(GEMINI_WEB_RULE)
  s.permissions = { ...perms, allow }
  fs.mkdirSync(path.dirname(GEMINI_SETTINGS()), { recursive: true })
  fs.writeFileSync(GEMINI_SETTINGS(), JSON.stringify(s, null, 2))
  return { ok: true, path: GEMINI_SETTINGS() }
})

// Gemini 검색 결과의 링크는 구글 중간 주소(grounding-api-redirect)라 며칠 뒤 사라진다 → 실제 공고 주소로 바꿔 둔다.
// 구글의 그 주소만 열고(리디렉션 대상만 읽고 본문은 받지 않음), 다른 주소는 건드리지 않는다
const GROUNDING_RE = /^https:\/\/vertexaisearch\.cloud\.google\.com\/grounding-api-redirect\//i
async function resolveGrounding(url) {
  if (typeof url !== 'string' || !GROUNDING_RE.test(url)) return typeof url === 'string' ? url : ''
  try {
    const r = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(8000) })
    const loc = r.headers.get('location') || ''
    return /^https?:\/\//i.test(loc) && !GROUNDING_RE.test(loc) ? loc : ''
  } catch {
    return ''
  }
}
// 한꺼번에 많이 열면 구글이 거절할 수 있어 4개씩 나눠 열고, 실패하면 한 번 더 시도한다
async function mapLimited(items, limit, fn) {
  const out = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i])
      }
    }),
  )
  return out
}
ipcMain.handle('net:resolve-urls', (_e, urls) =>
  mapLimited((Array.isArray(urls) ? urls : []).slice(0, 60), 4, async (u) => {
    const first = await resolveGrounding(u)
    if (first || !GROUNDING_RE.test(String(u))) return first
    await new Promise((r) => setTimeout(r, 600))
    return resolveGrounding(u)
  }),
)

// AI 가 찾은 공고가 정말 접수 중인지 공고 페이지를 직접 열어 확인한다 (AI 를 더 쓰지 않고 몇 초 안에 끝남)
// - 마감 표시(제목의 '(마감)', "마감된 공고입니다" 등)나 지난 마감일(validThrough · '마감일:YYYY-MM-DD')이면 closed
// - 페이지에서 마감일을 찾으면 돌려준다 (AI 가 못 찾은 마감일 채우기)
// - 열리지 않거나 판단할 근거가 없으면 unknown (빼지 않는다)
const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|\[?::1\]?$|0\.)/i
const pad2 = (n) => String(n).padStart(2, '0')
const ymd = (y, m, d) => `${y}-${pad2(m)}-${pad2(d)}`

// 회사 · 공공기관 채용 페이지처럼 '마감일:' 칸이 없는 곳: 본문의 "접수기간 2026.10.01 ~ 10.20" · "2026년 10월 20일까지"에서 마감일을 찾는다
const DATE = String.raw`(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})`
const PERIOD_RE = new RegExp(
  String.raw`(?:(?:접수|모집|지원|채용)\s*(?:기간|일정|마감|일시)|서류\s*접수|원서\s*접수|지원서\s*접수)[^0-9]{0,30}` +
    DATE +
    String.raw`[^~～∼\-–]{0,40}[~～∼\-–]\s*(?:(\d{4})\s*[.\-/년]\s*)?(\d{1,2})\s*[.\-/월]\s*(\d{1,2})`,
)
const UNTIL_RE = new RegExp(DATE + String.raw`\s*일?\s*(?:\([^)]{1,4}\))?\s*(?:\d{1,2}\s*[:시]\s*\d{0,2}\s*분?)?\s*까지`)
function periodEnd(html) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/\s+/g, ' ')
  const p = text.match(PERIOD_RE)
  if (p) {
    const year = p[4] || p[1]
    return ymd(year, p[5], p[6])
  }
  const u = text.match(UNTIL_RE)
  return u ? ymd(u[1], u[2], u[3]) : ''
}
async function checkPosting(url, today) {
  try {
    const u = new URL(String(url))
    if (!/^https?:$/.test(u.protocol) || PRIVATE_HOST.test(u.hostname)) return { status: 'unknown', deadline: '' }
    const r = await fetch(u, {
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
    })
    if (r.status === 404 || r.status === 410) return { status: 'closed', deadline: '' }
    if (!r.ok) return { status: 'unknown', deadline: '' }
    const html = (await r.text()).slice(0, 800000)
    const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || ''
    // 화면에 적힌 '마감일: …'을 먼저 믿는다. validThrough 는 상시 채용이면 1년 뒤로 적어 두는 사이트(잡코리아)가 있어
    // 반년 넘게 남은 값은 마감일로 쓰지 않는다
    let deadline = ''
    let alwaysOpen = false // 반년 넘게 남은 validThrough = 상시 채용
    const m = html.match(/(?:마감일|접수\s*마감|지원\s*마감|모집\s*마감)\s*[:：]?\s*(\d{4})[-./년]\s*(\d{1,2})[-./월]\s*(\d{1,2})/)
    if (m) deadline = ymd(m[1], m[2], m[3])
    // 캐치 등: 화면 데이터 안의 지원 마감 시각 (O.ApplyEndDatetime="2026-10-05T09:00:00.000Z")
    if (!deadline) {
      const a = html.match(/\.ApplyEndDate(?:time)?="(\d{4})-(\d{2})-(\d{2})/) || html.match(/"applyEndDate(?:time)?"\s*:\s*"(\d{4})-(\d{2})-(\d{2})/i)
      if (a) deadline = ymd(a[1], a[2], a[3])
    }
    if (!deadline) deadline = periodEnd(html)
    if (!deadline) {
      const vt = html.match(/"validThrough"\s*:\s*"(\d{4})-(\d{2})-(\d{2})/)
      const far = new Date(Date.parse(today) + 200 * 86400000).toISOString().slice(0, 10)
      if (vt && ymd(vt[1], vt[2], vt[3]) <= far) deadline = ymd(vt[1], vt[2], vt[3])
      else if (vt) alwaysOpen = true
    }
    if (deadline && deadline < today) return { status: 'closed', deadline }
    if (/[([]\s*(마감|접수\s*마감|채용\s*마감)\s*[)\]]/.test(title)) return { status: 'closed', deadline }
    const closedText = /마감된\s*(공고|포지션|채용)입니다|(채용|모집|접수|지원)이\s*마감(되었|됐)습니다|이미\s*마감된\s*(공고|채용)/.test(html)
    if (closedText && !(deadline && deadline >= today)) return { status: 'closed', deadline }
    // 제목에 남은 날짜(D-6) · 상시 채용 표시가 있으면 접수 중 (사람인 등)
    if (deadline || alwaysOpen || /\(D-\d+\)|\(D-day\)|상시\s*채용|채용\s*시\s*마감/i.test(title)) return { status: 'open', deadline }
    return { status: 'unknown', deadline }
  } catch {
    return { status: 'unknown', deadline: '' }
  }
}
ipcMain.handle('net:check-postings', (_e, urls, today) =>
  mapLimited((Array.isArray(urls) ? urls : []).slice(0, 30), 6, (u) => checkPosting(u, String(today || ''))),
)

ipcMain.handle('ai:cancel', () => {
  if (!aiChild) return false
  aiCancelled = true
  killTree(aiChild)
  return true
})

// cmd.exe 를 거치는 .cmd/.bat 래퍼일 때 인자를 따옴표로 감싼다 (안쪽 따옴표 · 끝 역슬래시 처리)
const quoteArg = (a) => `"${String(a).replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1')}"`

// 맥: agy 는 파이프 stdin 을 읽지 않으므로 expect(맥 기본 포함)로 가상 터미널을 만들어 그 안에서 띄우고,
// 우리가 파이프로 넣는 줄을 expect 가 터미널 입력으로 넘긴다. 창은 뜨지 않고 Essay 안내 창만 보인다.
const RELAY_EXPECT = `set timeout -1
spawn -noecho {*}$argv
fileevent stdin readable {
  if {[gets stdin line] >= 0} { send -- "$line\\r" } else { fileevent stdin readable {} }
}
expect eof
catch wait result
exit [lindex $result 3]
`
let loginChild = null
function startGeminiLoginMac(bin) {
  for (const f of [AGY_LOGIN_MARK(), AGY_LOGIN_RESULT(), AGY_LOGIN_CODE()]) fs.rmSync(f, { force: true })
  if (loginChild && loginChild.exitCode === null) killTree(loginChild)
  const dir = path.join(app.getPath('temp'), 'essay-ai')
  fs.mkdirSync(dir, { recursive: true })
  const relay = path.join(dir, 'relay.exp')
  fs.writeFileSync(relay, RELAY_EXPECT, 'utf8')
  try {
    const child = spawn('/usr/bin/expect', ['-f', relay, bin, '-p', 'ok라고만 답하세요', '--output-format', 'text', '--print-timeout', '120s'], {
      cwd: dir,
      env: aiEnv('gemini'),
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: true,
    })
    loginChild = child
    let out = ''
    const onData = (d) => {
      out += d
    }
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.stdin.on('error', () => {})
    const timer = setTimeout(() => killTree(child), 150000)
    child.on('close', (code) => {
      clearTimeout(timer)
      if (loginChild === child) loginChild = null
      const text = out.replace(ANSI_RE, '')
      const ok = code === 0 && !/authentication failed|timed out/i.test(text)
      try {
        fs.writeFileSync(AGY_LOGIN_RESULT(), `exit ${ok ? 0 : code || 1}`)
        if (ok) fs.writeFileSync(AGY_LOGIN_MARK(), new Date().toISOString())
      } catch {
        /* 무시 */
      }
      writeAiLog({ provider: 'gemini', bin, login: true, code, output: text.slice(-1500) })
    })
    child.on('error', () => {
      if (loginChild === child) loginChild = null
      try {
        fs.writeFileSync(AGY_LOGIN_RESULT(), 'exit 1')
      } catch {
        /* 무시 */
      }
    })
    return true
  } catch {
    return false
  }
}

// 브라우저에서 받은 인증 코드를 로그인 콘솔 창에 넘긴다 (윈도우: 창이 파일을 읽어 자기 콘솔 입력에 넣는다 · 맥: 가상 터미널에 바로 입력)
ipcMain.handle('ai:auth-code', (_e, code) => {
  const c = String(code || '').trim()
  if (!c) return { ok: false, error: '코드가 비어 있어요.' }
  if (readLoginResult()) return { ok: false, error: '로그인 창이 이미 끝났어요. [로그인]을 다시 눌러 새 창에서 시도해 주세요.' }
  if (IS_MAC) {
    if (!loginChild || loginChild.exitCode !== null) return { ok: false, error: '로그인이 아직 시작되지 않았거나 이미 끝났어요. [로그인]을 다시 눌러 주세요.' }
    try {
      loginChild.stdin.write(c + '\n')
      return { ok: true }
    } catch {
      return { ok: false, error: '코드를 넘기지 못했어요. [로그인]을 다시 눌러 주세요.' }
    }
  }
  return handOverLoginCode(c) ? { ok: true } : { ok: false, error: '코드를 넘기지 못했어요. 로그인 창에 직접 붙여넣어 주세요.' }
})

// Antigravity CLI 로그인: agy 를 돌리고(브라우저 로그인 → 코드 입력), 성공하면 기록 파일이 생긴다
ipcMain.handle('ai:gemini-login', () => {
  const found = findGemini()
  if (!found) return { ok: false, error: 'Gemini CLI를 찾지 못했어요. 먼저 설치해 주세요.' }
  if (found.cli !== 'agy') return { ok: false, error: 'Gemini CLI(gemini)는 [로그인 창 열기]로 로그인해 주세요.' }
  if (IS_MAC) return { ok: startGeminiLoginMac(found.bin), terminal: false }
  return { ok: openTerminal('login-agy'), terminal: true }
})

// 로그인 창의 진행 상태: 기록 파일(성공) · 결과 파일(종료 코드)
ipcMain.handle('ai:gemini-login-status', () => ({
  loggedIn: fs.existsSync(AGY_LOGIN_MARK()),
  result: readLoginResult(),
}))

ipcMain.handle('ai:run', (e, opts) => runAi(e.sender, opts))

/* ---------- AI 사용량 (토큰) 기록: 이 컴퓨터에서 Essay 가 실행한 것만 날짜 · AI 별로 더해 둔다 ---------- */
const USAGE_FILE = () => path.join(app.getPath('userData'), 'ai-usage.json')
const USAGE_KEEP_DAYS = 120
const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : 0)

// CLI 마다 다른 결과 형식에서 입력 · 출력 토큰만 뽑는다 (캐시로 읽은 입력도 입력에 넣는다)
function usageFrom(cli, d) {
  if (!d) return null
  if (cli === 'claude') {
    const u = d.usage || {}
    const input = num(u.input_tokens) + num(u.cache_creation_input_tokens) + num(u.cache_read_input_tokens)
    const output = num(u.output_tokens)
    return input || output ? { input, output } : null
  }
  if (cli === 'agy') {
    const u = d.usage || {}
    const input = num(u.input_tokens) + num(u.cache_read_tokens)
    const output = num(u.output_tokens)
    return input || output ? { input, output } : null
  }
  // Gemini CLI: result.stats (input_tokens · output_tokens · total_tokens)
  const s = d.stats || d.usage || {}
  const input = num(s.input_tokens ?? s.prompt_tokens ?? s.inputTokens)
  const output = num(s.output_tokens ?? s.candidates_tokens ?? s.outputTokens)
  return input || output ? { input, output } : null
}

function readUsage() {
  try {
    const d = JSON.parse(fs.readFileSync(USAGE_FILE(), 'utf8'))
    return d && typeof d === 'object' && d.days && typeof d.days === 'object' ? d : { days: {} }
  } catch {
    return { days: {} }
  }
}

function recordUsage(provider, usage, web) {
  try {
    const d = readUsage()
    const day = localDay()
    const today = (d.days[day] ||= {})
    const row = (today[provider] ||= { runs: 0, web: 0, input: 0, output: 0 })
    row.runs += 1
    if (web) row.web += 1
    row.input += usage?.input || 0
    row.output += usage?.output || 0
    const keys = Object.keys(d.days).sort()
    for (const k of keys.slice(0, Math.max(0, keys.length - USAGE_KEEP_DAYS))) delete d.days[k]
    fs.writeFileSync(USAGE_FILE(), JSON.stringify(d))
  } catch {
    /* 기록 실패는 무시 */
  }
}

// 오늘 · 최근 7일 · 최근 30일 합계와 최근 14일 날짜별 값
ipcMain.handle('ai:usage', () => {
  const d = readUsage()
  const daysAgo = (n) => {
    const t = new Date()
    t.setDate(t.getDate() - n)
    const p = (x) => String(x).padStart(2, '0')
    return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`
  }
  const empty = () => ({ runs: 0, web: 0, input: 0, output: 0 })
  const sum = (from) => {
    const out = { claude: empty(), gemini: empty() }
    for (const [day, rows] of Object.entries(d.days)) {
      if (day < from) continue
      for (const p of ['claude', 'gemini']) {
        const r = rows[p]
        if (!r) continue
        out[p].runs += r.runs || 0
        out[p].web += r.web || 0
        out[p].input += r.input || 0
        out[p].output += r.output || 0
      }
    }
    return out
  }
  const recent = Array.from({ length: 14 }, (_, i) => {
    const day = daysAgo(13 - i)
    const rows = d.days[day] || {}
    return { day, claude: rows.claude || empty(), gemini: rows.gemini || empty() }
  })
  return { today: sum(daysAgo(0)), week: sum(daysAgo(6)), month: sum(daysAgo(29)), recent }
})
// 요금제 안내 · 공지 · 의견 보내기 주소: 사이트의 app-config.json 을 하루 한 번 받아 두고, 안 되면 앱에 든 기본값
const CONFIG_URL = 'https://brothrone.github.io/Essay/app-config.json'
const CONFIG_CACHE = () => path.join(app.getPath('userData'), 'app-config.json')
const CONFIG_DEFAULT = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'app-config-default.json'), 'utf8'))
const validConfig = (c) => c && typeof c === 'object' && c.plans && typeof c.plans === 'object' && c.feedback && typeof c.feedback === 'object'
ipcMain.handle('app:config', async () => {
  let cached = null
  try {
    cached = JSON.parse(fs.readFileSync(CONFIG_CACHE(), 'utf8'))
  } catch {
    /* 처음 */
  }
  if (validConfig(cached?.config) && Date.now() - (cached.at || 0) < 24 * 3600 * 1000) return cached.config
  try {
    const r = await fetch(CONFIG_URL, { signal: AbortSignal.timeout(8000), cache: 'no-store' })
    const c = r.ok ? await r.json() : null
    if (validConfig(c)) {
      fs.writeFileSync(CONFIG_CACHE(), JSON.stringify({ at: Date.now(), config: c }))
      return c
    }
  } catch {
    /* 오프라인 등 */
  }
  return validConfig(cached?.config) ? cached.config : CONFIG_DEFAULT()
})

ipcMain.handle('ai:usage-reset', () => {
  try {
    fs.rmSync(USAGE_FILE(), { force: true })
  } catch {
    /* 무시 */
  }
  return true
})

const GEMINI_LOGIN_ERROR =
  'Gemini 로그인이 필요해요. 홈의 [AI 연결하기] 카드에서 [로그인]을 눌러 브라우저 로그인 → 인증 코드 입력을 진행해 주세요.'

function runAi(sender, { prompt, model, web, provider }) {
  return new Promise((resolve) => {
    const p = provider === 'gemini' ? 'gemini' : 'claude'
    if (aiChild && aiChild.exitCode === null && !aiChild.killed)
      return resolve({ ok: false, code: 'busy', error: `다른 AI 작업(${aiChildKind})이 진행 중이에요. 끝나거나 취소한 뒤 다시 눌러 주세요.` })
    const found = findCli(p)
    if (!found) return resolve({ ok: false, code: 'not_installed', error: `${PROVIDER_LABEL[p]}를 찾지 못했어요. 설정 → AI 설정에서 설치 방법을 확인하세요.` })
    const { bin, cli } = found
    // agy 는 로그인 안 된 채 돌리면 브라우저를 열고 60초 기다리다 실패하므로 미리 막는다
    if (cli === 'agy' && geminiLoggedIn('agy') === false) return resolve({ ok: false, code: 'gemini_login', error: GEMINI_LOGIN_ERROR })

    // 빈 폴더에서 실행해 내 파일을 읽거나 바꾸지 않게 한다
    const cwd = path.join(app.getPath('temp'), 'essay-ai')
    fs.mkdirSync(cwd, { recursive: true })
    const timeoutMs = (web ? 10 : 5) * 60 * 1000
    const system = web ? AI_SYSTEM_WEB : AI_SYSTEM
    const env = aiEnv(p)
    let args
    let stdinText = ''
    if (cli === 'agy') {
      // agy는 시스템 프롬프트 옵션과 stdin 입력이 없어 요청문 앞에 붙여 인자로 넘긴다
      const full = `${system}\n\n${prompt}`
      if (full.length > (IS_MAC ? MAC_ARG_LIMIT : WIN_ARG_LIMIT))
        return resolve({
          ok: false,
          error: `요청문이 너무 길어서(${full.length.toLocaleString()}자) Antigravity CLI에 넘길 수 없어요. 연결한 경험이나 공고 메모를 줄이거나 Claude로 바꿔 보세요.`,
        })
      args = ['-p', full, '--output-format', 'stream-json', '--disable-slash-commands', '--print-timeout', `${Math.round(timeoutMs / 1000)}s`]
      if (model) args.push('--model', String(model))
    } else if (cli === 'gemini') {
      // Gemini CLI: 요청문은 stdin으로, 시스템 지시는 GEMINI_SYSTEM_MD 파일로, 웹 작업일 때만 검색·페이지 읽기 도구를 허용
      const sysFile = path.join(cwd, 'system.md')
      fs.writeFileSync(sysFile, system, 'utf8')
      env.GEMINI_SYSTEM_MD = sysFile
      args = ['-p', '', '--output-format', 'stream-json']
      if (web) args.push('--allowed-tools', 'google_web_search', 'web_fetch')
      if (model) args.push('--model', String(model))
      stdinText = String(prompt)
    } else {
      stdinText = String(prompt)
      const tools = web ? CLAUDE_WEB_TOOLS : ''
      args = ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--tools', tools]
      if (web) args.push('--allowedTools', CLAUDE_WEB_TOOLS)
      args.push('--no-session-persistence', '--strict-mcp-config', '--disable-slash-commands', '--system-prompt', system)
      if (model) args.push('--model', String(model))
    }

    aiCancelled = false
    const started = Date.now()
    const viaCmd = /\.(cmd|bat)$/i.test(bin)
    const opts = { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, detached: IS_MAC }
    let child
    try {
      child = viaCmd ? spawn(quoteArg(bin), args.map(quoteArg), { ...opts, shell: true }) : spawn(bin, args, opts)
    } catch (ex) {
      return resolve({ ok: false, error: `${PROVIDER_LABEL[p]}를 실행하지 못했어요: ${ex.message}` })
    }
    // 한글이 청크 경계에서 깨지지 않도록 스트림을 UTF-8 문자열로 받는다
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    aiChild = child
    aiChildKind = web ? '공고 찾기 · 공고 읽기' : '글쓰기'
    let err = ''
    let buf = ''
    let partial = ''
    let plain = '' // JSON이 아닌 출력(텍스트 모드로 떨어진 경우)
    let final = null
    let initModel = ''
    let geminiText = ''
    let geminiError = ''
    let timedOut = false
    let settled = false
    let authAsked = false
    const events = []
    const progress = (extra) => {
      if (!sender.isDestroyed()) sender.send('ai:progress', { text: partial, seconds: Math.round((Date.now() - started) / 1000), ...extra })
    }
    const timer = setTimeout(() => {
      timedOut = true
      killTree(child)
    }, timeoutMs)

    // 한 줄에 이벤트 하나(JSONL). 글자가 생성되는 대로 화면에 보내고, 마지막 result를 결과로 쓴다
    const onClaudeEvent = (ev) => {
      events.push(ev.type === 'stream_event' ? `${ev.type}:${ev.event?.type}` : `${ev.type}${ev.subtype ? ':' + ev.subtype : ''}`)
      if (ev.type === 'stream_event' && ev.event?.type === 'content_block_delta' && ev.event.delta?.type === 'text_delta') {
        partial += ev.event.delta.text
        progress()
      } else if (ev.type === 'system' && ev.subtype === 'api_retry') {
        progress({ retry: true })
      } else if (ev.type === 'assistant') {
        for (const block of ev.message?.content || []) {
          if (block.type !== 'tool_use') continue
          progress({ tool: block.name, detail: String(block.input?.query || block.input?.url || '').slice(0, 160) })
        }
      } else if (ev.type === 'result') {
        final = ev
      }
    }
    const onGeminiEvent = (ev) => {
      const su = ev.step_update || {}
      events.push(ev.event === 'step_update' ? `step:${su.step_type}:${su.state}${su.tool_name ? ':' + su.tool_name : ''}` : ev.event)
      if (ev.event === 'init') {
        initModel = ev.init?.model || ''
      } else if (ev.event === 'step_update') {
        if (su.step_type === 'tool' && su.state === 'ACTIVE' && su.tool_info) {
          const name = su.tool_info.name
          const prm = su.tool_info.parameters || {}
          const tool = name === 'search_web' ? 'WebSearch' : name === 'read_url_content' ? 'WebFetch' : name
          progress({ tool, detail: String(prm.query || prm.Url || prm.url || '').slice(0, 160) })
        } else if (su.step_type === 'agent_response' && typeof su.text_delta === 'string') {
          partial += su.text_delta
          progress()
        }
      } else if (ev.event === 'result') {
        final = ev.result || null
      }
    }
    // Gemini CLI(gemini) stream-json: init / message(role, content, delta) / tool_use / tool_result / error / result(status)
    const onGeminiCliEvent = (ev) => {
      events.push(`${ev.type}${ev.role ? ':' + ev.role : ''}${ev.tool_name ? ':' + ev.tool_name : ''}${ev.status ? ':' + ev.status : ''}`)
      if (ev.type === 'init') {
        initModel = ev.model || ''
      } else if (ev.type === 'message' && ev.role === 'assistant' && typeof ev.content === 'string') {
        geminiText = ev.delta ? geminiText + ev.content : ev.content
        partial = geminiText
        progress()
      } else if (ev.type === 'tool_use') {
        const name = ev.tool_name || ev.name || ''
        const prm = ev.parameters || ev.input || {}
        const tool = name === 'google_web_search' ? 'WebSearch' : name === 'web_fetch' ? 'WebFetch' : name
        progress({ tool, detail: String(prm.query || prm.prompt || prm.url || '').slice(0, 160) })
      } else if (ev.type === 'error') {
        geminiError = String(ev.message || ev.error || '')
      } else if (ev.type === 'result') {
        final = ev
      }
    }
    const onLine = (line) => {
      if (!line.trim()) return
      let ev
      try {
        ev = JSON.parse(line)
      } catch {
        plain += line + '\n'
        return
      }
      if (cli === 'agy') onGeminiEvent(ev)
      else if (cli === 'gemini') onGeminiCliEvent(ev)
      else onClaudeEvent(ev)
    }
    child.stdout.on('data', (d) => {
      buf += d
      const lines = buf.split(/\r?\n/)
      buf = lines.pop()
      lines.forEach(onLine)
    })
    child.stderr.on('data', (d) => {
      err += d
      // agy: 로그인 안 돼 있으면 브라우저를 열고 콘솔 입력만 60초 기다린다(파이프 stdin 은 읽지 않음) → 바로 끊고 로그인으로 안내
      if (cli === 'agy' && !authAsked && /Authentication required|paste the authorization code/i.test(err)) {
        authAsked = true
        events.push('auth:required')
        killTree(child)
      }
    })
    child.on('error', (ex) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (aiChild === child) aiChild = null
      resolve({ ok: false, error: `${PROVIDER_LABEL[p]}를 실행하지 못했어요: ${ex.message}` })
    })
    const finish = (code, signal) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (aiChild === child) aiChild = null
      if (buf) onLine(buf)
      writeAiLog({ provider: p, bin, model, web: !!web, code, signal, timedOut, seconds: Math.round((Date.now() - started) / 1000), events, stderr: err.slice(-2000) })
      if (aiCancelled) return resolve({ ok: false, cancelled: true, error: '취소했어요.' })
      if (timedOut) return resolve({ ok: false, error: `${timeoutMs / 60000}분이 지나도 끝나지 않아 멈췄어요. 잠시 뒤 다시 시도하거나 모델을 바꿔 보세요.` })
      const seconds = Math.round((Date.now() - started) / 1000)
      if (cli === 'gemini') {
        const text = (geminiText || plain).trim()
        const failed = (final && final.status && final.status !== 'success') || (!text && (geminiError || code))
        if (failed) return resolve({ ok: false, error: geminiErrorMessage(geminiError || final?.error?.message || err || `Gemini CLI가 결과 없이 끝났어요(종료 코드 ${code}).`) })
        if (!text) return resolve({ ok: false, error: geminiErrorMessage(err || 'Gemini CLI가 빈 답을 돌려줬어요.') })
        const used = initModel || model || 'gemini'
        const usage = usageFrom('gemini', final)
        recordUsage('gemini', usage, web)
        return resolve({ ok: true, text, seconds, model: used, models: [used], usage })
      }
      if (cli === 'agy') {
        const d = final
        if (authAsked) return resolve({ ok: false, code: 'gemini_login', error: GEMINI_LOGIN_ERROR })
        if (!d) return resolve({ ok: false, error: geminiErrorMessage(err || `Antigravity CLI가 결과 없이 끝났어요(종료 코드 ${code}).`) })
        if (d.status !== 'SUCCESS') return resolve({ ok: false, error: geminiErrorMessage(d.error || err) })
        // 결과를 받았다는 건 로그인돼 있다는 뜻 → 기록해 두고 다음부터 '로그인됨'으로 표시
        try {
          fs.writeFileSync(AGY_LOGIN_MARK(), String(Date.now()))
        } catch {
          /* 무시 */
        }
        const denied = (d.denied_actions || []).map((a) => a.action)
        const text = String(d.response || '')
        if (!text.trim() && denied.includes('read_url'))
          return resolve({
            ok: false,
            code: 'gemini_web_permission',
            error: 'Gemini(Antigravity CLI)가 웹 페이지를 읽을 권한이 없어요. 설정 → AI 설정에서 [웹 읽기 권한 허용]을 눌러 주세요.',
          })
        const used = initModel || model || 'gemini'
        const usage = usageFrom('agy', d)
        recordUsage('gemini', usage, web)
        return resolve({ ok: true, text, seconds: Math.round(d.duration_seconds || seconds), model: used, models: [used], usage })
      }
      try {
        const d = final
        if (!d) throw new Error('no result')
        if (d.is_error) return resolve({ ok: false, error: claudeErrorMessage(d) })
        const usage = usageFrom('claude', d)
        recordUsage('claude', usage, web)
        resolve({
          ok: true,
          usage,
          text: String(d.result || ''),
          seconds: Math.round((d.duration_ms || Date.now() - started) / 1000),
          // 여러 모델이 쓰였으면 출력을 가장 많이 만든 모델(실제로 글을 쓴 모델)을 보여 준다
          model:
            Object.entries(d.modelUsage || {}).sort((a, b) => (b[1]?.outputTokens || 0) - (a[1]?.outputTokens || 0))[0]?.[0] || '',
          models: Object.keys(d.modelUsage || {}),
        })
      } catch {
        resolve({ ok: false, error: err.trim().slice(0, 400) || `Claude Code가 결과 없이 끝났어요(종료 코드 ${code}).` })
      }
    }
    child.on('close', finish)
    // 백그라운드 프로세스가 출력을 붙잡아 close가 늦어져도 3초 뒤 마무리
    child.on('exit', (code, signal) => {
      if (aiChild === child) aiChild = null
      setTimeout(() => finish(code, signal), 3000)
    })
    if (stdinText) child.stdin.end(stdinText, 'utf8')
    else child.stdin.end()
    child.stdin.on('error', () => {
      /* 프로세스가 먼저 끝나면 EPIPE — 무시 */
    })
  })
}

/* ---------- 마감 알림 · 작업 표시줄 배지 ---------- */

const NOTIFY_FILE = () => path.join(app.getPath('userData'), 'deadline-notified.json')

function daysUntil(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr || '')
  if (!m) return null
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((new Date(+m[1], +m[2] - 1, +m[3]) - today) / 86400000)
}

function mainWindow() {
  return BrowserWindow.getAllWindows()[0] || null
}

function focusWindow() {
  let win = mainWindow()
  if (!win) win = createWindow()
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  return win
}

// 화면(React)이 준비됐다고 알려올 때까지 보낼 메시지를 쌓아 둔다 (첫 실행 직후 알림·점프 목록 명령이 유실되지 않게)
const readyContents = new WeakSet()
const pending = new Map() // webContents.id → [{channel, payload}]
ipcMain.on('app:ready', (e) => {
  readyContents.add(e.sender)
  for (const m of pending.get(e.sender.id) || []) e.sender.send(m.channel, m.payload)
  pending.delete(e.sender.id)
})
function sendWhenReady(win, channel, payload) {
  const wc = win.webContents
  if (readyContents.has(wc) && !wc.isLoading()) return wc.send(channel, payload)
  pending.set(wc.id, [...(pending.get(wc.id) || []), { channel, payload }])
}

function focusAndNavigate(route) {
  sendWhenReady(focusWindow(), 'app:navigate', route)
}

// 작성 중인 자소서의 마감 D-3 · D-1 · 당일에 한 번씩 윈도우 알림을 띄우고, 7일 안 마감 개수를 작업 표시줄 아이콘에 표시
function checkDeadlines({ notify = true } = {}) {
  let data
  try {
    data = JSON.parse(readData() || 'null')
  } catch {
    return
  }
  if (!data || !Array.isArray(data.projects)) return
  let notified = {}
  try {
    notified = JSON.parse(fs.readFileSync(NOTIFY_FILE(), 'utf8'))
  } catch {
    /* 처음 */
  }
  let soon = 0
  let changed = false
  for (const p of data.projects) {
    if (p.status !== 'writing') continue
    const days = daysUntil(p.deadline)
    if (days === null || days < 0) continue
    if (days <= 7) soon++
    const level = days === 0 ? 'd0' : days === 1 ? 'd1' : days <= 3 ? 'd3' : null
    if (!notify || !level) continue
    const key = `${p.id}:${p.deadline}:${level}`
    if (notified[key]) continue
    notified[key] = Date.now()
    changed = true
    if (!Notification.isSupported()) continue
    const questions = Array.isArray(p.questions) ? p.questions : []
    const done = questions.filter((q) => q.done).length
    const n = new Notification({
      title: days === 0 ? `오늘 마감 · ${p.company || '자소서'}` : `마감 D-${days} · ${p.company || '자소서'}`,
      body: [p.position, `완료 문항 ${done}/${questions.length}`, p.deadlineTime && `${p.deadlineTime} 마감`].filter(Boolean).join(' · '),
      icon: ICON_PNG,
      timeoutType: 'default',
    })
    n.on('click', () => focusAndNavigate(`/projects/${p.id}`))
    n.show()
  }
  if (changed) {
    const cutoff = Date.now() - 90 * 86400000
    for (const [k, t] of Object.entries(notified)) if (t < cutoff) delete notified[k]
    try {
      fs.writeFileSync(NOTIFY_FILE(), JSON.stringify(notified))
    } catch {
      /* 무시 */
    }
  }
  try {
    app.setBadgeCount(soon)
  } catch {
    /* 배지를 지원하지 않는 환경 */
  }
}

let badgeTimer = null
function scheduleBadgeUpdate() {
  clearTimeout(badgeTimer)
  badgeTimer = setTimeout(() => checkDeadlines({ notify: false }), 1500)
}

/* ---------- 테마 (윈도우 설정의 밝게·어둡게를 따라가거나 직접 고른다) ---------- */

const PREFS_FILE = () => path.join(app.getPath('userData'), 'prefs.json')
const THEME_COLORS = {
  light: { bg: '#f5f7fb', bar: '#ffffff', symbol: '#4e5968' },
  dark: { bg: '#15181e', bar: '#1b1f27', symbol: '#c3c9d4' },
}

function readPrefs() {
  try {
    const p = JSON.parse(fs.readFileSync(PREFS_FILE(), 'utf8'))
    return p && typeof p === 'object' ? p : {}
  } catch {
    return {}
  }
}

function writePrefs(patch) {
  try {
    fs.writeFileSync(PREFS_FILE(), JSON.stringify({ ...readPrefs(), ...patch }))
  } catch {
    /* 무시 */
  }
}

const themeInfo = () => ({ source: nativeTheme.themeSource, dark: nativeTheme.shouldUseDarkColors })

// 제목 표시줄 버튼 색과 창 배경도 테마에 맞춘다
function applyThemeToWindows() {
  const c = THEME_COLORS[nativeTheme.shouldUseDarkColors ? 'dark' : 'light']
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      if (!IS_MAC) win.setTitleBarOverlay({ color: c.bar, symbolColor: c.symbol, height: TITLEBAR_HEIGHT })
      win.setBackgroundColor(c.bg)
    } catch {
      /* 창이 닫히는 중 */
    }
    if (!win.webContents.isDestroyed()) win.webContents.send('theme:changed', themeInfo())
  }
}

nativeTheme.themeSource = ['light', 'dark'].includes(readPrefs().theme) ? readPrefs().theme : 'system'
nativeTheme.on('updated', applyThemeToWindows)

ipcMain.handle('theme:get', () => themeInfo())
ipcMain.handle('theme:set', (_e, source) => {
  const s = ['light', 'dark'].includes(source) ? source : 'system'
  nativeTheme.themeSource = s
  writePrefs({ theme: s })
  applyThemeToWindows()
  return themeInfo()
})

/* ---------- 창 ---------- */

const isHttp = (url) => /^https?:\/\//i.test(url)
const WINDOW_STATE = () => path.join(app.getPath('userData'), 'window-state.json')

function readWindowState() {
  try {
    const s = JSON.parse(fs.readFileSync(WINDOW_STATE(), 'utf8'))
    return s && typeof s === 'object' ? s : {}
  } catch {
    return {}
  }
}

// 창 크기·위치·최대화 상태를 기억했다가 다음 실행 때 그대로 연다
function rememberWindowState(win) {
  let timer = null
  const save = () => {
    if (win.isDestroyed()) return
    const state = { ...win.getNormalBounds(), maximized: win.isMaximized() }
    try {
      fs.writeFileSync(WINDOW_STATE(), JSON.stringify(state))
    } catch {
      /* 무시 */
    }
  }
  const later = () => {
    clearTimeout(timer)
    timer = setTimeout(save, 400)
  }
  win.on('resize', later)
  win.on('move', later)
  win.on('maximize', later)
  win.on('unmaximize', later)
  win.on('close', save)
}

function createWindow() {
  const saved = readWindowState()
  const colors = THEME_COLORS[nativeTheme.shouldUseDarkColors ? 'dark' : 'light']
  const win = new BrowserWindow({
    width: saved.width || 1360,
    height: saved.height || 880,
    x: saved.x,
    y: saved.y,
    minWidth: 960,
    minHeight: 620,
    title: APP_NAME,
    backgroundColor: colors.bg,
    show: false,
    // 윈도우 11 식 커스텀 제목 표시줄: 앱이 그린 띠 위에 기본 최소화·최대화·닫기 버튼만 얹는다
    // 맥: 신호등 버튼만 왼쪽에 두고 나머지는 앱이 그린다
    ...(IS_MAC
      ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 14, y: 13 } }
      : { icon: ICON_ICO, titleBarStyle: 'hidden', titleBarOverlay: { color: colors.bar, symbolColor: colors.symbol, height: TITLEBAR_HEIGHT } }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  })
  win.setMenuBarVisibility(false)
  rememberWindowState(win)
  win.once('ready-to-show', () => {
    if (saved.maximized) win.maximize()
    win.show()
  })

  // 공고 링크 같은 외부 주소는 기본 브라우저로 연다
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isHttp(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (isHttp(url) && !url.startsWith(process.env.ESSAY_DEV_URL || '\0')) {
      e.preventDefault()
      shell.openExternal(url)
    }
  })

  // 맥 전체 화면에서는 신호등 버튼이 숨으므로 화면에 알려 제목 표시줄 왼쪽 여백을 없앤다
  if (IS_MAC) {
    win.on('enter-full-screen', () => win.webContents.send('app:fullscreen', true))
    win.on('leave-full-screen', () => win.webContents.send('app:fullscreen', false))
  }

  // 새로고침·재로드하면 화면이 다시 준비 신호를 보낼 때까지 기다린다
  win.webContents.on('did-start-loading', () => readyContents.delete(win.webContents))

  if (process.env.ESSAY_DEV_URL) win.loadURL(process.env.ESSAY_DEV_URL)
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))

  // 개발 검증용: ESSAY_SHOT=<png 경로> 로 실행하면 화면을 찍고 바로 종료한다 (ESSAY_SHOT_ROUTE · ESSAY_SHOT_THEME 로 화면·테마 지정)
  if (process.env.ESSAY_SHOT) {
    if (process.env.ESSAY_SHOT_THEME) nativeTheme.themeSource = process.env.ESSAY_SHOT_THEME
    win.webContents.once('did-finish-load', () => {
      if (process.env.ESSAY_SHOT_ROUTE) sendWhenReady(win, 'app:navigate', process.env.ESSAY_SHOT_ROUTE)
      setTimeout(async () => {
        try {
          fs.writeFileSync(process.env.ESSAY_SHOT, (await win.webContents.capturePage()).toPNG())
        } finally {
          app.exit(0)
        }
      }, 2500)
    })
  }
  return win
}

// 메뉴 표시줄은 숨기고 단축키만 쓴다 (Ctrl+N 새 자소서, Ctrl+1~7 화면 이동, Ctrl+, 설정, F11 전체 화면)
function buildMenu() {
  const send = (channel, payload) => () => sendWhenReady(focusWindow(), channel, payload)
  const template = [
    // 맥은 맨 앞에 앱 이름 메뉴가 있어야 하고(⌘, 설정 · ⌘Q 종료), 편집 메뉴가 있어야 ⌘C · ⌘V 가 동작한다
    ...(IS_MAC
      ? [
          {
            label: APP_NAME,
            submenu: [
              { label: 'Essay 정보', click: send('app:about') },
              { type: 'separator' },
              { label: '설정…', accelerator: 'Cmd+,', click: send('app:navigate', '/settings') },
              { type: 'separator' },
              { role: 'services', label: '서비스' },
              { type: 'separator' },
              { role: 'hide', label: 'Essay 가리기' },
              { role: 'hideOthers', label: '다른 앱 가리기' },
              { role: 'unhide', label: '모두 보기' },
              { type: 'separator' },
              { role: 'quit', label: 'Essay 종료' },
            ],
          },
        ]
      : []),
    {
      label: '파일(&F)',
      submenu: [
        { label: '새 자소서', accelerator: 'CmdOrCtrl+N', click: send('app:new-project') },
        { type: 'separator' },
        { label: '홈', accelerator: 'CmdOrCtrl+1', click: send('app:navigate', '/') },
        { label: '자소서 프로젝트', accelerator: 'CmdOrCtrl+2', click: send('app:navigate', '/projects') },
        { label: '맞춤 공고', accelerator: 'CmdOrCtrl+3', click: send('app:navigate', '/jobs') },
        { label: '경험 관리', accelerator: 'CmdOrCtrl+4', click: send('app:navigate', '/experiences') },
        { label: '스펙 관리', accelerator: 'CmdOrCtrl+5', click: send('app:navigate', '/specs') },
        { label: '마감 달력', accelerator: 'CmdOrCtrl+8', click: send('app:navigate', '/calendar') },
        { label: '백업', accelerator: 'CmdOrCtrl+6', click: send('app:navigate', '/backup') },
        { label: '데이터', accelerator: 'CmdOrCtrl+7', click: send('app:navigate', '/data') },
        ...(IS_MAC ? [] : [{ label: '설정', accelerator: 'CmdOrCtrl+,', click: send('app:navigate', '/settings') }]),
        { type: 'separator' },
        { label: '데이터 폴더 열기', click: () => shell.openPath(DATA_DIR) },
        { type: 'separator' },
        ...(IS_MAC ? [{ role: 'close', label: '창 닫기' }] : [{ label: '종료', role: 'quit' }]),
      ],
    },
    {
      label: '편집(&E)',
      submenu: [
        { role: 'undo', label: '실행 취소' },
        { role: 'redo', label: '다시 실행' },
        { type: 'separator' },
        { role: 'cut', label: '잘라내기' },
        { role: 'copy', label: '복사' },
        { role: 'paste', label: '붙여넣기' },
        { role: 'selectAll', label: '모두 선택' },
      ],
    },
    {
      label: '보기(&V)',
      submenu: [
        { role: 'zoomIn', label: '확대' },
        { role: 'zoomOut', label: '축소' },
        { role: 'resetZoom', label: '원래 크기' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '전체 화면' },
        { role: 'toggleDevTools', label: '개발자 도구' },
      ],
    },
    ...(IS_MAC
      ? [
          {
            label: '윈도우',
            role: 'window',
            submenu: [
              { role: 'minimize', label: '최소화' },
              { role: 'zoom', label: '확대/축소' },
              { type: 'separator' },
              { role: 'front', label: '모두 앞으로 가져오기' },
            ],
          },
        ]
      : []),
    {
      label: '도움말(&H)',
      ...(IS_MAC ? { role: 'help' } : {}),
      submenu: [
        // 맥 키보드의 F1 은 화면 밝기 키라 ⌘/ 를 쓴다 (F1 도 보이지 않게 남겨 둔다)
        { label: '도움말', accelerator: IS_MAC ? 'Cmd+/' : 'F1', click: send('app:help') },
        ...(IS_MAC ? [{ label: '도움말 (F1)', accelerator: 'F1', visible: false, click: send('app:help') }] : []),
        { label: '처음 설정 안내', click: send('app:welcome') },
        { type: 'separator' },
        { label: '예전 자소서 불러오기', click: send('app:import') },
        { label: '로그 폴더 열기', click: () => shell.openPath(app.getPath('logs')) },
        { type: 'separator' },
        { label: '의견 보내기', click: send('app:feedback') },
        { label: 'Essay 정보', click: send('app:about') },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// 작업 표시줄 아이콘 오른쪽 클릭 메뉴(점프 목록)
function setJumpList() {
  if (IS_MAC) {
    // 맥: Dock 아이콘을 오른쪽 클릭하면 나오는 메뉴
    try {
      app.dock?.setMenu(
        Menu.buildFromTemplate([
          { label: '새 자소서 시작하기', click: () => sendWhenReady(focusWindow(), 'app:new-project') },
          { label: '맞춤 공고 보기', click: () => focusAndNavigate('/jobs') },
        ]),
      )
    } catch {
      /* 무시 */
    }
    return
  }
  try {
    app.setUserTasks([
      {
        program: process.execPath,
        arguments: '--new-project',
        iconPath: process.execPath,
        iconIndex: 0,
        title: '새 자소서 시작하기',
        description: '공고 링크나 회사명으로 새 자소서를 만들어요',
      },
      {
        program: process.execPath,
        arguments: '--open-jobs',
        iconPath: process.execPath,
        iconIndex: 0,
        title: '맞춤 공고 보기',
        description: 'AI가 찾아 둔 맞춤 공고를 확인해요',
      },
    ])
  } catch {
    /* 지원하지 않는 환경 */
  }
}

// 점프 목록이나 바로가기 인자로 받은 명령 처리
function handleArgs(argv) {
  if (argv.includes('--new-project')) sendWhenReady(focusWindow(), 'app:new-project')
  else if (argv.includes('--open-jobs')) focusAndNavigate('/jobs')
}

/* ---------- 자동 업데이트 (GitHub Releases: package.json build.publish) ---------- */
// 켜지고 8초 뒤와 6시간마다 확인 → 새 버전은 조용히 내려받고 → 화면 아래 띠에서 [지금 다시 시작] 또는 다음에 끌 때 설치.
// 설치판(app.isPackaged)에서만 돈다. 코드 서명이 없으므로 서명 검증은 건너뛴다(electron-updater 기본 동작).
let updateStatus = { state: 'idle' }
let autoUpdater = null
function setUpdateStatus(s) {
  updateStatus = s
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('update:status', s)
}
// 맥: 애플 서명이 없어 앱이 스스로 바꿔 끼우지는 못한다 → GitHub Releases 에 새 버전이 있으면 알려 주고 다운로드로 보낸다
const RELEASES_API = 'https://api.github.com/repos/brothrone/Essay/releases/latest'
const RELEASES_PAGE = 'https://brothrone.github.io/Essay/'
const newerThan = (a, b) => {
  const pa = String(a).split('.').map(Number)
  const pb = String(b).split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0)
  return false
}
async function checkMacUpdate() {
  setUpdateStatus({ state: 'checking' })
  try {
    const r = await fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(10000) })
    if (!r.ok) throw new Error(`GitHub ${r.status}`)
    const rel = await r.json()
    const version = String(rel.tag_name || '').replace(/^v/, '')
    // 내 맥에 맞는 파일(arm64 = Apple Silicon, x64 = Intel)을 고르고, 없으면 아무 dmg 나
    const dmgs = (rel.assets || []).filter((a) => /\.dmg$/i.test(a.name))
    const dmg = dmgs.find((a) => a.name.includes(`-${process.arch}`)) || dmgs[0]
    if (version && newerThan(version, app.getVersion()))
      setUpdateStatus({ state: 'available', version, manual: true, url: dmg?.browser_download_url || rel.html_url || RELEASES_PAGE })
    else setUpdateStatus({ state: 'none', version: app.getVersion() })
    return { ok: true, version }
  } catch (err) {
    setUpdateStatus({ state: 'error', message: (err?.message || String(err)).slice(0, 160) })
    return { ok: false, error: err?.message || String(err) }
  }
}
ipcMain.handle('update:status', () => updateStatus)
ipcMain.handle('update:check', async () => {
  if (IS_MAC) return checkMacUpdate()
  if (!autoUpdater) return { ok: false, error: '설치한 Essay 에서만 업데이트를 확인해요' }
  try {
    const r = await autoUpdater.checkForUpdates()
    return { ok: true, version: r?.updateInfo?.version }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})
ipcMain.handle('update:install', () => {
  if (IS_MAC) {
    if (updateStatus.url) shell.openExternal(updateStatus.url)
    return
  }
  if (!autoUpdater) return
  killTree(aiChild)
  autoUpdater.quitAndInstall(false, true)
})
function setupAutoUpdate() {
  if (!app.isPackaged) return
  if (IS_MAC) {
    setTimeout(() => checkMacUpdate(), 8000)
    setInterval(() => checkMacUpdate(), 6 * 60 * 60 * 1000)
    return
  }
  try {
    autoUpdater = require('electron-updater').autoUpdater
  } catch {
    return
  }
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.logger = null
  autoUpdater.on('checking-for-update', () => setUpdateStatus({ state: 'checking' }))
  autoUpdater.on('update-available', (info) => setUpdateStatus({ state: 'available', version: info.version }))
  autoUpdater.on('update-not-available', (info) => setUpdateStatus({ state: 'none', version: info.version }))
  autoUpdater.on('download-progress', (p) =>
    setUpdateStatus({ state: 'downloading', version: updateStatus.version, percent: Math.round(p.percent || 0) }),
  )
  autoUpdater.on('update-downloaded', (info) => setUpdateStatus({ state: 'ready', version: info.version }))
  autoUpdater.on('error', (err) => setUpdateStatus({ state: 'error', message: (err?.message || String(err)).split('\n')[0].slice(0, 160) }))
  const check = () => autoUpdater.checkForUpdates().catch(() => {})
  setTimeout(check, 8000)
  setInterval(check, 6 * 60 * 60 * 1000)
}

// 같은 데이터 파일을 두 창이 동시에 쓰지 않도록 한 번만 실행
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_e, argv) => {
    focusWindow()
    handleArgs(argv)
  })
  app.whenReady().then(() => {
    buildMenu()
    createWindow()
    setJumpList()
    handleArgs(process.argv)
    setTimeout(() => checkDeadlines(), 4000)
    setInterval(() => checkDeadlines(), 30 * 60 * 1000)
    setupAutoUpdate()
  })
  // 맥은 창을 닫아도 앱이 Dock 에 남고(⌘Q 로 종료), Dock 아이콘을 누르면 창을 다시 연다
  app.on('window-all-closed', () => {
    if (!IS_MAC) app.quit()
  })
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
  app.on('before-quit', () => {
    killTree(aiChild)
    killTree(loginChild)
  })
}
