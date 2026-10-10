// 유료 판매: 이용권(라이선스) 확인 (서버: server/src/billing.ts, 구매 페이지: docs/buy.html, 고객 응대: guides/고객응대-매뉴얼.md)
// - app-config 의 billing.enabled 가 true 일 때만 결제를 요구한다.
// - '먼저 쓰던 사람': 결제를 켜기 전에 이 기기에서 Essay 를 켜면 서버가 서명한 확인증(LEGACY)을 받아 두고, 결제를 켠 뒤에도 계속 무료.
//   확인증은 서버 서명이라 파일을 만들어 흉내 낼 수 없다.
// - [구매하기]: 무작위 ref 를 붙여 구매 페이지를 브라우저로 열고, 결제가 끝날 때까지 서버에 ref 로 물어 이용권을 받아 온다.
// - 서버가 서명한 등록증(token: 키 · 기기 번호 · 확인 시각)을 userData/license.json 에 두고, 인터넷이 없어도 아래 공개 키로 확인한다.
//   3일마다 환불 여부를 확인해 새 등록증을 받고, 60일 넘게 확인하지 못하면 인터넷 연결 뒤 확인을 요구한다.
// - 시험용 환경 변수(ESSAY_BILLING · ESSAY_BUY_URL · ESSAY_NO_EXTERNAL · ESSAY_API_URL)는 개발 실행(패키지 전)에서만 듣는다.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { execFileSync } = require('node:child_process')
const { webContents } = require('electron')

// 서버의 LICENSE_PRIVATE_KEY 와 짝인 공개 키 (Ed25519 SPKI). 바꾸면 이미 등록한 기기는 다시 등록해야 한다
const PUBLIC_KEY = 'MCowBQYDK2VwAyEAjkewH0XEcq61RIFRRTRoTjZi6J3mgVsP995ltGUbVdk='
const CHECK_EVERY = 3 * 24 * 3600 * 1000
const OFFLINE_GRACE = 60 * 24 * 3600 * 1000
const KEY_RE = /^ESSAY(-[A-HJ-NP-Z2-9]{4}){4}$/
const SITE_RE = /^https:\/\/(www\.)?essay\.win\//

module.exports = function setupBilling({ app, ipcMain, shell, getConfig, configIsRemote, isMac }) {
  const dev = !app.isPackaged
  const testEnv = (name) => (dev ? process.env[name] : undefined)
  const LICENSE_FILE = () => path.join(app.getPath('userData'), 'license.json')
  const LEGACY_FILE = () => path.join(app.getPath('userData'), 'billing-legacy')

  // ---------- 기기 번호: 운영체제가 주는 기기 고유 번호의 해시 (원래 값은 보내지 않음). 못 읽으면 처음 만든 무작위 값
  let deviceCache = ''
  function deviceId() {
    if (deviceCache) return deviceCache
    let raw = ''
    try {
      if (isMac) {
        const out = execFileSync('/usr/sbin/ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'], { encoding: 'utf8', timeout: 5000 })
        raw = (out.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/) || [])[1] || ''
      } else if (process.platform === 'win32') {
        const out = execFileSync('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], { encoding: 'utf8', timeout: 5000, windowsHide: true })
        raw = (out.match(/MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]+)/) || [])[1] || ''
      }
    } catch {
      /* 아래 무작위 값 */
    }
    if (!raw) {
      const f = path.join(app.getPath('userData'), 'device-id')
      try {
        raw = fs.readFileSync(f, 'utf8').trim()
      } catch {
        raw = crypto.randomBytes(16).toString('hex')
        try {
          fs.writeFileSync(f, raw)
        } catch {
          /* 무시 */
        }
      }
    }
    deviceCache = crypto.createHash('sha256').update(`essay-device:${raw}`).digest('hex')
    return deviceCache
  }

  // ---------- 서명 확인: { k, d, t } 를 돌려주거나 null
  const pub = crypto.createPublicKey({ key: Buffer.from(PUBLIC_KEY, 'base64'), format: 'der', type: 'spki' })
  function verify(token) {
    if (typeof token !== 'string') return null
    const [body, sig] = token.split('.')
    if (!body || !sig) return null
    try {
      if (!crypto.verify(null, Buffer.from(body), pub, Buffer.from(sig, 'base64url'))) return null
      const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
      return p && p.v === 1 && p.d === deviceId() && typeof p.t === 'number' ? p : null
    } catch {
      return null
    }
  }

  const readJson = (f) => {
    try {
      const d = JSON.parse(fs.readFileSync(f, 'utf8'))
      return d && typeof d === 'object' ? d : null
    } catch {
      return null
    }
  }
  const writeJson = (f, d) => {
    try {
      fs.writeFileSync(f, JSON.stringify(d))
    } catch {
      /* 다음에 다시 */
    }
  }
  const remove = (f) => {
    try {
      fs.rmSync(f, { force: true })
    } catch {
      /* 무시 */
    }
  }

  // 이 기기의 이용권: 서명이 맞고 키가 같으면 { key, token, t }
  function readLicense() {
    const d = readJson(LICENSE_FILE())
    if (!d || !KEY_RE.test(d.key || '')) return null
    const p = verify(d.token)
    return p && p.k === d.key ? { key: d.key, token: d.token, t: p.t } : null
  }
  const saveLicense = (key, token) => writeJson(LICENSE_FILE(), { key, token })

  // ---------- 서버
  async function base() {
    const env = testEnv('ESSAY_API_URL')
    if (env && /^https?:\/\//.test(env)) return env.replace(/\/+$/, '')
    const u = (await getConfig())?.api?.baseUrl
    return typeof u === 'string' && /^https:\/\/\S+$/.test(u) ? u.replace(/\/+$/, '') : ''
  }
  async function post(p, body) {
    const b = await base()
    if (!b) return { ok: false, offline: true, error: '서버가 아직 준비되지 않았어요' }
    try {
      const r = await fetch(b + p, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'user-agent': `Essay/${app.getVersion()}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      })
      const j = await r.json().catch(() => ({}))
      return r.ok ? { ok: true, ...j } : { ok: false, status: r.status, error: j.error || `서버 응답 ${r.status}` }
    } catch {
      return { ok: false, offline: true, error: '서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요' }
    }
  }

  async function billingConfig() {
    const c = (await getConfig())?.billing
    const site = (v, def) => (typeof v === 'string' && SITE_RE.test(v) ? v : def)
    return {
      enabled: testEnv('ESSAY_BILLING') === '1' || c?.enabled === true,
      price: Number(c?.price) || 3900,
      listPrice: Number(c?.listPrice) || 4900,
      // 구매 · 약관 페이지는 essay.win 주소만 연다 (설정이 바뀌어도 다른 사이트로 보내지 않게)
      buyUrl: testEnv('ESSAY_BUY_URL') || site(c?.buyUrl, 'https://essay.win/buy.html'),
      termsUrl: site(c?.termsUrl, 'https://essay.win/terms.html'),
    }
  }

  // ---------- '먼저 쓰던 사람' (서버가 서명한 LEGACY 확인증)
  let legacyAsked = 0
  async function legacy(cfg) {
    const saved = readJson(LEGACY_FILE())
    const p = saved && verify(saved.token)
    if (p && p.k === 'LEGACY') return true
    // 결제를 켜기 전(서버에서 받은 설정 기준)이거나, 1.9.9 가 남긴 예전 표시가 있으면 서버에 확인증을 받는다.
    // 서버는 결제를 켠 뒤로는 그 전에 기록된 기기에만 준다
    const oldMark = fs.existsSync(LEGACY_FILE()) && !saved
    const before = !cfg.enabled && configIsRemote()
    if (!before && !oldMark) return false
    if (Date.now() - legacyAsked < 60 * 1000) return !cfg.enabled
    legacyAsked = Date.now()
    const r = await post('/v1/license/legacy', { device: deviceId() })
    const q = r.ok && verify(r.token)
    if (q && q.k === 'LEGACY') {
      writeJson(LEGACY_FILE(), { token: r.token })
      return true
    }
    if (r.status === 403) remove(LEGACY_FILE())
    // 결제를 켜기 전엔 서버가 안 돼도 막지 않는다 (다음에 다시 받음)
    return !cfg.enabled
  }

  // ---------- 환불 확인 · 등록증 새로 받기
  let checking = null
  function recheck(lic) {
    if (checking) return checking
    checking = (async () => {
      const r = await post('/v1/license/check', { key: lic.key, device: deviceId() })
      if (r.ok && r.valid === false) {
        remove(LICENSE_FILE())
        return null
      }
      if (r.ok && r.active === false) {
        // 관리자가 기기 목록을 비웠다(기기 교체 요청 등) → 이 기기를 다시 등록
        const a = await post('/v1/license/activate', { key: lic.key, device: deviceId() })
        if (a.ok && verify(a.token)) {
          saveLicense(lic.key, a.token)
          return readLicense()
        }
        if (a.status === 409 || a.status === 403 || a.status === 404) {
          remove(LICENSE_FILE())
          return null
        }
        return lic
      }
      if (r.ok && verify(r.token)) {
        saveLicense(lic.key, r.token)
        return readLicense()
      }
      return lic
    })().finally(() => (checking = null))
    return checking
  }
  // 키는 있는데 등록증을 확인할 수 없을 때(다른 PC 로 자료를 옮김 · 서명 키 교체 등) 저장된 키로 이 기기를 다시 등록한다 (1분에 한 번까지)
  let reactivateAsked = 0
  async function reactivate() {
    const d = readJson(LICENSE_FILE())
    if (!d || !KEY_RE.test(d.key || '') || Date.now() - reactivateAsked < 60 * 1000) return null
    reactivateAsked = Date.now()
    const a = await post('/v1/license/activate', { key: d.key, device: deviceId() })
    const p = a.ok && verify(a.token)
    if (p && p.k === d.key) {
      saveLicense(d.key, a.token)
      return readLicense()
    }
    if (a.status === 403 || a.status === 404) remove(LICENSE_FILE())
    return null
  }
  const broadcast = (p) => {
    for (const wc of webContents.getAllWebContents()) if (!wc.isDestroyed()) wc.send('billing:changed', p)
  }

  async function state() {
    const cfg = await billingConfig()
    // 결제를 켜기 전엔 확인증만 뒤에서 받아 두고 화면은 막지 않는다
    const isLegacy = cfg.enabled ? await legacy(cfg) : (legacy(cfg).catch(() => {}), false)
    let lic = readLicense()
    if (!lic && cfg.enabled) lic = await reactivate()
    let offlineTooLong = false
    if (lic && cfg.enabled) {
      const age = Date.now() - lic.t
      if (age > OFFLINE_GRACE || age < -24 * 3600 * 1000) {
        // 오래 확인하지 못했거나 시계가 이상하면 지금 확인 (인터넷이 없으면 확인할 때까지 막음)
        lic = await recheck(lic)
        if (lic && Date.now() - lic.t > OFFLINE_GRACE) offlineTooLong = true
      } else if (age > CHECK_EVERY) {
        // 환불 확인은 화면을 막지 않게 뒤에서 하고, 풀렸으면 화면에 알린다
        recheck(lic).then((next) => !next && broadcast({ revoked: true }))
      }
    }
    const licensed = !!lic && !offlineTooLong
    return {
      enabled: cfg.enabled,
      required: cfg.enabled && !isLegacy && !licensed,
      licensed,
      legacy: cfg.enabled && isLegacy,
      offlineTooLong,
      key: lic ? lic.key.replace(/^(ESSAY-....)-.*-(....)$/, '$1-····-····-$2') : '',
      price: cfg.price,
      listPrice: cfg.listPrice,
      termsUrl: cfg.termsUrl,
    }
  }

  ipcMain.handle('billing:state', () => state())

  ipcMain.handle('billing:activate', async (_e, raw) => {
    const key = String(raw || '').trim().toUpperCase().replace(/\s+/g, '')
    if (!KEY_RE.test(key)) return { ok: false, error: '키 모양이 맞지 않아요 (ESSAY-XXXX-XXXX-XXXX-XXXX)' }
    const r = await post('/v1/license/activate', { key, device: deviceId() })
    if (!r.ok) return { ok: false, error: r.error }
    const p = verify(r.token)
    if (!p || p.k !== key) return { ok: false, error: '이용권을 확인하지 못했어요. 다시 시도해 주세요.' }
    saveLicense(key, r.token)
    return { ok: true }
  })

  // [구매하기]: 구매 페이지를 열고 결제가 끝날 때까지 기다린다 (처음 2분은 3초, 그 뒤 10초 간격, 최대 30분)
  let waiting = null
  ipcMain.handle('billing:buy', async (e) => {
    const cfg = await billingConfig()
    if (waiting) waiting.stop()
    const ref = crypto.randomBytes(16).toString('hex')
    const url = `${cfg.buyUrl}?ref=${ref}`
    if (testEnv('ESSAY_NO_EXTERNAL') !== '1') await shell.openExternal(url)
    const wc = e.sender
    const send = (p) => !wc.isDestroyed() && wc.send('billing:changed', p)
    let stopped = false
    const started = Date.now()
    waiting = { stop: () => (stopped = true) }
    const me = waiting
    ;(async () => {
      while (!stopped && Date.now() - started < 30 * 60 * 1000) {
        await new Promise((r) => setTimeout(r, Date.now() - started < 2 * 60 * 1000 ? 3000 : 10000))
        if (stopped) return
        const r = await post('/v1/license/claim', { ref, device: deviceId() })
        const p = r.ok && r.key && verify(r.token)
        if (p && p.k === r.key) {
          saveLicense(r.key, r.token)
          send({ done: true })
          break
        }
        if (!r.ok && r.status && r.status !== 429) {
          send({ error: r.error })
          break
        }
      }
      if (waiting === me) waiting = null
    })()
    return { ok: true, url }
  })
  ipcMain.handle('billing:cancel', () => {
    if (waiting) waiting.stop()
    waiting = null
    return true
  })
  ipcMain.handle('billing:open-terms', async () => {
    await shell.openExternal((await billingConfig()).termsUrl)
    return true
  })
}
