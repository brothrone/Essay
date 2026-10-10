// 유료 판매: 이용권(라이선스) 확인 (서버: server/src/billing.ts, 구매 페이지: docs/buy.html)
// - app-config 의 billing.enabled 가 true 일 때만 결제를 요구한다. 그 전에 이 PC 에서 Essay 를 켠 적이 있으면 '먼저 쓰던 사람'으로 계속 무료.
// - [구매하기]: 무작위 ref 를 붙여 구매 페이지를 브라우저로 열고, 결제가 끝날 때까지 서버에 ref 로 물어 이용권을 받아 온다.
// - 서버가 서명한 등록증(token)을 userData/license.json 에 두고, 인터넷이 없어도 아래 공개 키로 확인한다. 며칠에 한 번 환불 여부를 확인한다.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { execFileSync } = require('node:child_process')
const { webContents } = require('electron')

// 서버의 LICENSE_PRIVATE_KEY 와 짝인 공개 키 (Ed25519 SPKI). 바꾸면 이미 등록한 기기는 다시 등록해야 한다
const PUBLIC_KEY = 'MCowBQYDK2VwAyEAjkewH0XEcq61RIFRRTRoTjZi6J3mgVsP995ltGUbVdk='
const CHECK_EVERY = 3 * 24 * 3600 * 1000
const KEY_RE = /^ESSAY(-[A-HJ-NP-Z2-9]{4}){4}$/

module.exports = function setupBilling({ app, ipcMain, shell, getConfig, configIsRemote, isMac }) {
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

  // ---------- 저장된 이용권
  function readLicense() {
    try {
      const d = JSON.parse(fs.readFileSync(LICENSE_FILE(), 'utf8'))
      return d && typeof d === 'object' ? d : null
    } catch {
      return null
    }
  }
  function writeLicense(d) {
    try {
      fs.writeFileSync(LICENSE_FILE(), JSON.stringify(d))
    } catch {
      /* 다음에 다시 */
    }
  }
  /** 등록증이 이 기기 · 이 키로 서버가 서명한 것인지 */
  function tokenValid(lic) {
    if (!lic || typeof lic.token !== 'string' || !KEY_RE.test(lic.key || '')) return false
    const [body, sig] = lic.token.split('.')
    if (!body || !sig) return false
    try {
      const pub = crypto.createPublicKey({ key: Buffer.from(PUBLIC_KEY, 'base64'), format: 'der', type: 'spki' })
      if (!crypto.verify(null, Buffer.from(body), pub, Buffer.from(sig, 'base64url'))) return false
      const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
      return p.k === lic.key && p.d === deviceId()
    } catch {
      return false
    }
  }

  // ---------- 서버
  async function base() {
    const env = process.env.ESSAY_API_URL
    if (env && /^https?:\/\//.test(env)) return env.replace(/\/+$/, '')
    const u = (await getConfig())?.api?.baseUrl
    return typeof u === 'string' && /^https:\/\/\S+$/.test(u) ? u.replace(/\/+$/, '') : ''
  }
  async function post(p, body) {
    const b = await base()
    if (!b) return { ok: false, error: '서버가 아직 준비되지 않았어요' }
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
    const forced = process.env.ESSAY_BILLING === '1'
    return {
      enabled: forced || c?.enabled === true,
      price: Number(c?.price) || 3900,
      listPrice: Number(c?.listPrice) || 4900,
      buyUrl: process.env.ESSAY_BUY_URL || (typeof c?.buyUrl === 'string' && /^https:\/\//.test(c.buyUrl) ? c.buyUrl : 'https://essay.win/buy.html'),
      termsUrl: typeof c?.termsUrl === 'string' && /^https:\/\//.test(c.termsUrl) ? c.termsUrl : 'https://essay.win/terms.html',
    }
  }

  // 결제를 켜기 전에 이 PC 에서 켠 적이 있으면 계속 무료 (서버에서 받은 설정으로만 판단 — 처음 켤 때 인터넷이 없으면 정하지 않음)
  async function legacy(cfg) {
    if (fs.existsSync(LEGACY_FILE())) return true
    if (!cfg.enabled && process.env.ESSAY_BILLING !== '1' && configIsRemote()) {
      try {
        fs.writeFileSync(LEGACY_FILE(), new Date().toISOString())
      } catch {
        /* 무시 */
      }
      return true
    }
    return false
  }

  // 며칠에 한 번 환불 · 취소 여부 확인 (인터넷이 없으면 넘어감)
  async function recheck(lic) {
    if (Date.now() - (lic.checkedAt || 0) < CHECK_EVERY) return lic
    const r = await post('/v1/license/check', { key: lic.key, device: deviceId() })
    if (r.ok && r.valid === false) {
      try {
        fs.rmSync(LICENSE_FILE(), { force: true })
      } catch {
        /* 무시 */
      }
      return null
    }
    if (r.ok) {
      const next = { ...lic, checkedAt: Date.now() }
      writeLicense(next)
      return next
    }
    return lic
  }

  async function state() {
    const cfg = await billingConfig()
    const isLegacy = await legacy(cfg)
    let lic = readLicense()
    if (lic && !tokenValid(lic)) lic = null
    // 환불 확인은 화면을 막지 않게 뒤에서 하고, 풀렸으면 화면에 알린다
    if (lic && cfg.enabled)
      recheck(lic).then((next) => {
        if (!next) for (const wc of webContents.getAllWebContents()) if (!wc.isDestroyed()) wc.send('billing:changed', { revoked: true })
      })
    return {
      enabled: cfg.enabled,
      required: cfg.enabled && !isLegacy && !lic,
      licensed: !!lic,
      legacy: isLegacy,
      key: lic ? lic.key.replace(/^(ESSAY-....)-.*-(....)$/, '$1-····-····-$2') : '',
      price: cfg.price,
      listPrice: cfg.listPrice,
      termsUrl: cfg.termsUrl,
    }
  }

  function saved(key, token) {
    writeLicense({ key, token, checkedAt: Date.now(), at: new Date().toISOString() })
  }

  ipcMain.handle('billing:state', () => state())

  ipcMain.handle('billing:activate', async (_e, raw) => {
    const key = String(raw || '').trim().toUpperCase().replace(/\s+/g, '')
    if (!KEY_RE.test(key)) return { ok: false, error: '키 모양이 맞지 않아요 (ESSAY-XXXX-XXXX-XXXX-XXXX)' }
    const r = await post('/v1/license/activate', { key, device: deviceId() })
    if (!r.ok) return { ok: false, error: r.error }
    saved(r.key, r.token)
    return { ok: true }
  })

  // [구매하기]: 구매 페이지를 열고 결제가 끝날 때까지 기다린다 (최대 30분, 다시 누르면 새로)
  let waiting = null
  ipcMain.handle('billing:buy', async (e) => {
    const cfg = await billingConfig()
    if (waiting) waiting.stop()
    const ref = crypto.randomBytes(16).toString('hex')
    const url = `${cfg.buyUrl}?ref=${ref}`
    // (시험할 때 ESSAY_NO_EXTERNAL=1 이면 브라우저를 열지 않고 주소만 돌려준다)
    if (process.env.ESSAY_NO_EXTERNAL !== '1') await shell.openExternal(url)
    const wc = e.sender
    const send = (p) => !wc.isDestroyed() && wc.send('billing:changed', p)
    let stopped = false
    const started = Date.now()
    waiting = { stop: () => (stopped = true) }
    const me = waiting
    ;(async () => {
      while (!stopped && Date.now() - started < 30 * 60 * 1000) {
        await new Promise((r) => setTimeout(r, 3000))
        if (stopped) return
        const r = await post('/v1/license/claim', { ref, device: deviceId() })
        if (r.ok && r.key && r.token) {
          saved(r.key, r.token)
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
