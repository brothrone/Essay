// 개선 돕기: 의견 보내기 · 익명 사용 통계 · 오류 보고 · 회사별 자소서 문항 모음 (서버: server/, guides/서버-안내.md)
// - 서버 주소(app-config 의 api.baseUrl, 시험할 때는 환경 변수 ESSAY_API_URL)가 없으면 아무것도 보내지 않는다.
// - 통계 · 오류 · 문항 모음은 사용자가 '개선 돕기'에서 고른 것만 보낸다. 의견은 사용자가 [보내기]를 누를 때만.
// - 자소서 내용 · 이름 · 메일 · 파일 경로는 보내지 않는다. 기기 번호는 처음 실행 때 만든 무작위 값이다.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')

const EVENT_RE = /^[a-z0-9_]{1,40}$/
const KEEP_DAYS = 8

module.exports = function setupCommunity({ app, ipcMain, getConfig, isMac }) {
  const FILE = () => path.join(app.getPath('userData'), 'community.json')
  const OS_NAME = isMac ? 'macOS' : process.platform === 'win32' ? 'Windows' : process.platform
  const today = () => new Date().toLocaleDateString('sv-SE') // 내 컴퓨터 시간대의 YYYY-MM-DD

  let state = load()
  function load() {
    let s = {}
    try {
      s = JSON.parse(fs.readFileSync(FILE(), 'utf8'))
    } catch {
      /* 처음 */
    }
    return {
      installId: /^[0-9a-f]{32}$/.test(s.installId || '') ? s.installId : crypto.randomBytes(16).toString('hex'),
      consent: s.consent && typeof s.consent === 'object' ? s.consent : null,
      days: s.days && typeof s.days === 'object' ? s.days : {},
      ai: s.ai === 'claude' ? 'claude' : 'gemini',
    }
  }
  let saveTimer = null
  function save(now = false) {
    clearTimeout(saveTimer)
    const write = () => {
      try {
        const tmp = FILE() + '.tmp'
        fs.writeFileSync(tmp, JSON.stringify(state))
        fs.renameSync(tmp, FILE())
      } catch {
        /* 다음에 다시 */
      }
    }
    if (now) write()
    else saveTimer = setTimeout(write, 2000)
  }
  save(true)

  /** 서버 주소. 없으면 '' → 아무것도 보내지 않는다 */
  async function base() {
    const env = process.env.ESSAY_API_URL
    if (env && /^https?:\/\//.test(env)) return env.replace(/\/+$/, '')
    try {
      const u = (await getConfig())?.api?.baseUrl
      return typeof u === 'string' && /^https:\/\/[^\s]+$/.test(u) ? u.replace(/\/+$/, '') : ''
    } catch {
      return ''
    }
  }

  async function call(method, p, body) {
    const b = await base()
    if (!b) return { ok: false, error: '서버가 아직 준비되지 않았어요' }
    try {
      const r = await fetch(b + p, {
        method,
        headers: { 'content-type': 'application/json', 'user-agent': `Essay/${app.getVersion()} (${OS_NAME})` },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10000),
      })
      const j = await r.json().catch(() => ({}))
      return r.ok ? { ok: true, ...j } : { ok: false, status: r.status, error: j.error || `서버 응답 ${r.status}` }
    } catch {
      return { ok: false, error: '서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요' }
    }
  }

  // ---------- 익명 사용 통계: 기능 이름별 횟수만 날짜별로 모아 몇 시간마다 보낸다
  function track(name) {
    if (!state.consent?.stats || !EVENT_RE.test(name)) return
    const d = (state.days[today()] ||= { events: {} })
    d.events[name] = (d.events[name] || 0) + 1
    d.dirty = true
    save()
  }
  let flushing = false
  async function flushStats() {
    if (flushing || !state.consent?.stats) return
    const cutoff = new Date(Date.now() - KEEP_DAYS * 864e5).toLocaleDateString('sv-SE')
    for (const day of Object.keys(state.days)) if (day < cutoff) delete state.days[day]
    const dirty = Object.keys(state.days).filter((day) => state.days[day].dirty).sort().slice(-KEEP_DAYS)
    if (!dirty.length) return save()
    flushing = true
    const r = await call('POST', '/v1/stats', {
      install: state.installId,
      days: dirty.map((day) => ({ day, version: app.getVersion(), os: OS_NAME, arch: process.arch, ai: state.ai, events: state.days[day].events })),
    })
    flushing = false
    if (r.ok) for (const day of dirty) if (state.days[day]) state.days[day].dirty = false
    save()
  }

  // ---------- 오류 보고: 같은 오류는 한 번만, 한 번 실행에 최대 20개
  const home = os.homedir()
  const scrub = (text) =>
    String(text || '')
      .split(home)
      .join('~')
      .replace(/\/Users\/[^/\s'"]+/g, '~')
      .replace(/[A-Za-z]:\\+Users\\+[^\\\s'"]+/gi, '~')
      .replace(/file:\/\/\/?[^\s)'"]*?\/(?:app\.asar|dist)\//g, '')
      .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<메일>')
  const seen = new Set()
  let queue = []
  let sentCount = 0
  let errTimer = null
  function reportError({ source, message, stack }) {
    if (!state.consent?.errors || sentCount >= 20) return
    const msg = scrub(message).slice(0, 500)
    if (!msg || /ResizeObserver loop/.test(msg)) return
    const st = scrub(stack).slice(0, 4000)
    const key = `${source}|${msg}|${st.split('\n')[1] || ''}`
    if (seen.has(key)) return
    seen.add(key)
    sentCount++
    queue.push({ source, message: msg, stack: st })
    clearTimeout(errTimer)
    errTimer = setTimeout(async () => {
      const items = queue.splice(0, 10)
      if (items.length) await call('POST', '/v1/errors', { install: state.installId, version: app.getVersion(), os: OS_NAME, items })
    }, 3000)
  }
  // 기본 동작(오류 창 등)은 그대로 두고 지켜보기만 한다
  process.on('uncaughtExceptionMonitor', (err) => reportError({ source: 'main', message: err?.message || String(err), stack: err?.stack || '' }))
  app.on('render-process-gone', (_e, _wc, d) => {
    if (d.reason !== 'clean-exit') reportError({ source: 'crash', message: `화면 프로세스 종료: ${d.reason}`, stack: `exitCode ${d.exitCode}` })
  })
  app.on('child-process-gone', (_e, d) => {
    if (d.reason !== 'clean-exit' && d.reason !== 'killed') reportError({ source: 'crash', message: `${d.type} 프로세스 종료: ${d.reason}`, stack: `exitCode ${d.exitCode}` })
  })

  // ---------- 회사별 자소서 문항 모음
  async function shareQuestions(info) {
    if (!state.consent?.questions || !info || typeof info !== 'object') return
    const questions = (Array.isArray(info.questions) ? info.questions : [])
      .filter((q) => q && typeof q.prompt === 'string' && q.prompt.trim().length >= 5)
      .slice(0, 10)
      .map((q) => ({ prompt: q.prompt.trim().slice(0, 600), limit: Number.isFinite(q.limit) ? q.limit : null }))
    const company = String(info.company || '').trim()
    if (!questions.length || company.length < 2 || /\(예시\)/.test(company)) return
    let sourceHost = ''
    try {
      sourceHost = new URL(String(info.url || '')).hostname
    } catch {
      /* 붙여넣은 공고 등 */
    }
    await call('POST', '/v1/questions', {
      install: state.installId,
      company: company.slice(0, 60),
      position: String(info.position || '').trim().slice(0, 60),
      deadline: /^\d{4}-\d{2}-\d{2}$/.test(info.deadline || '') ? info.deadline : '',
      sourceHost,
      questions,
    })
  }
  async function findQuestions({ company, position } = {}) {
    if (!state.consent?.questions) return { ok: false, sets: [] }
    const c = String(company || '').trim()
    if (c.length < 2) return { ok: true, sets: [] }
    const q = new URLSearchParams({ company: c.slice(0, 60), position: String(position || '').trim().slice(0, 60) })
    const r = await call('GET', `/v1/questions?${q}`)
    return r.ok ? { ok: true, sets: Array.isArray(r.sets) ? r.sets : [] } : { ok: false, sets: [], error: r.error }
  }

  // ---------- 화면과 주고받기
  ipcMain.handle('community:state', async () => ({ available: !!(await base()), consent: state.consent }))
  ipcMain.handle('community:set-consent', (_e, c) => {
    state.consent = { stats: !!c?.stats, errors: !!c?.errors, questions: !!c?.questions, at: new Date().toISOString() }
    if (!state.consent.stats) state.days = {}
    save(true)
    if (state.consent.stats) {
      track('app_open')
      setTimeout(flushStats, 3000)
    }
    return state.consent
  })
  ipcMain.on('community:track', (_e, name) => track(String(name)))
  ipcMain.on('community:context', (_e, ctx) => {
    if (ctx?.ai === 'claude' || ctx?.ai === 'gemini') state.ai = ctx.ai
  })
  ipcMain.on('community:error', (_e, e) => reportError({ source: 'renderer', message: e?.message, stack: e?.stack }))
  ipcMain.handle('community:feedback', async (_e, f) => {
    const r = await call('POST', '/v1/feedback', {
      kind: f?.kind,
      message: String(f?.message || '').slice(0, 5000),
      contact: String(f?.contact || '').slice(0, 200),
      app: f?.withInfo ? { version: app.getVersion(), os: `${OS_NAME} ${process.arch}`, ai: state.ai } : {},
    })
    if (r.ok) track('feedback_sent')
    return r
  })
  ipcMain.handle('community:find-questions', (_e, q) => findQuestions(q))
  ipcMain.on('community:share-questions', (_e, info) => {
    shareQuestions(info)
  })

  app.whenReady().then(() => {
    track('app_open')
    setTimeout(flushStats, 20000)
    setInterval(flushStats, 3 * 3600 * 1000)
  })
  app.on('before-quit', () => save(true))
}
