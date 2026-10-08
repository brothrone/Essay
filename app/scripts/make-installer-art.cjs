// NSIS 설치 화면용 그림(BMP)을 Electron으로 그려서 build/ 에 저장한다.
//   npx electron scripts/make-installer-art.cjs
// 만드는 파일: build/installerSidebar.bmp (164×314, 시작·완료 화면 왼쪽)
//             build/installerHeader.bmp  (150×57, 나머지 화면 오른쪽 위)
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const OUT = path.join(__dirname, '..', 'build')
const LOGO = `<svg width="SIZE" height="SIZE" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3854DB"/><stop offset="1" stop-color="#0F1440"/></linearGradient></defs>
  <rect width="64" height="64" rx="14.5" fill="url(#g)"/>
  <g fill="#fff" transform="translate(32 32) scale(0.96) translate(-32 -36.25)">
    <path fill-rule="evenodd" d="M32 57C28.5 50 21.5 40 21 32C20.8 27.5 22.6 24.2 25 22.5H39C41.4 24.2 43.2 27.5 43 32C42.5 40 35.5 50 32 57ZM34.6 33A2.6 2.6 0 1 0 29.4 33A2.6 2.6 0 1 0 34.6 33ZM31.25 36.2H32.75V53H31.25Z"/>
    <rect x="24.5" y="15.5" width="15" height="5" rx="1.4"/>
  </g>
</svg>`

const page = (w, h, body) => `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden}
  body{font-family:'Segoe UI Variable Display','Segoe UI','Malgun Gothic',sans-serif;-webkit-font-smoothing:antialiased}
  .side{width:${w}px;height:${h}px;display:flex;flex-direction:column;justify-content:flex-end;gap:10px;padding:22px 18px;box-sizing:border-box;
    background:linear-gradient(160deg,#4d6cf0 0%,#2b45c8 45%,#0f1440 100%);color:#fff}
  .side .glow{position:absolute;left:-40px;top:-30px;width:200px;height:200px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.28),transparent 65%)}
  .side .logo{position:relative;filter:drop-shadow(0 8px 18px rgba(0,0,0,.35))}
  .side h1{margin:14px 0 0;font-size:28px;font-weight:700;letter-spacing:-.02em;line-height:1}
  .side p{margin:0;font-size:12.5px;line-height:1.5;opacity:.85}
  .side .tag{display:inline-block;margin-top:4px;padding:3px 8px;border-radius:99px;background:rgba(255,255,255,.16);font-size:10.5px;font-weight:600}
  .head{width:${w}px;height:${h}px;display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:0 10px;box-sizing:border-box;background:#fff;color:#191f28}
  .head b{font-size:18px;font-weight:700;letter-spacing:-.02em}
  .head small{display:block;font-size:10px;color:#6b7280;font-weight:500}
</style></head><body>${body}</body></html>`

const SIDEBAR = page(
  164,
  314,
  `<div class="side"><div class="glow"></div><div class="logo">${LOGO.replace(/SIZE/g, '64')}</div>
   <h1>Essay</h1><p>자소서 · 스펙 관리<br>윈도우 앱</p><span class="tag">내 PC에만 저장</span></div>`,
)
const HEADER = page(
  150,
  57,
  `<div class="head"><div>${LOGO.replace(/SIZE/g, '34')}</div><div><b>Essay</b><small>자소서 · 스펙 관리</small></div></div>`,
)

// Electron nativeImage(BGRA, 위에서 아래) → 24비트 BMP(BGR, 아래에서 위, 줄마다 4바이트 정렬)
function toBmp(image) {
  const { width, height } = image.getSize()
  const src = image.toBitmap()
  const rowBytes = Math.ceil((width * 3) / 4) * 4
  const pixelBytes = rowBytes * height
  const buf = Buffer.alloc(54 + pixelBytes)
  buf.write('BM', 0)
  buf.writeUInt32LE(54 + pixelBytes, 2)
  buf.writeUInt32LE(54, 10)
  buf.writeUInt32LE(40, 14)
  buf.writeInt32LE(width, 18)
  buf.writeInt32LE(height, 22)
  buf.writeUInt16LE(1, 26)
  buf.writeUInt16LE(24, 28)
  buf.writeUInt32LE(0, 30)
  buf.writeUInt32LE(pixelBytes, 34)
  buf.writeInt32LE(2835, 38)
  buf.writeInt32LE(2835, 42)
  for (let y = 0; y < height; y++) {
    const dstRow = 54 + (height - 1 - y) * rowBytes
    for (let x = 0; x < width; x++) {
      const s = (y * width + x) * 4
      const d = dstRow + x * 3
      buf[d] = src[s] // B
      buf[d + 1] = src[s + 1] // G
      buf[d + 2] = src[s + 2] // R
    }
  }
  return buf
}

// 창 하나를 재사용한다 (창을 지우고 새로 만들면 두 번째 로드가 ERR_FAILED 로 실패함)
async function render(win, html, width, height, file) {
  const tmp = path.join(app.getPath('temp'), `essay-art-${file}.html`)
  fs.writeFileSync(tmp, html, 'utf8')
  win.setContentSize(width, height)
  await win.loadFile(tmp)
  await new Promise((r) => setTimeout(r, 400)) // 글꼴 로드 대기
  let img = await win.webContents.capturePage({ x: 0, y: 0, width, height })
  if (img.getSize().width !== width || img.getSize().height !== height) img = img.resize({ width, height, quality: 'best' })
  fs.writeFileSync(path.join(OUT, file), toBmp(img))
  // ESSAY_ART_PREVIEW=<폴더> 를 주면 확인용 PNG도 같이 남긴다
  if (process.env.ESSAY_ART_PREVIEW) fs.writeFileSync(path.join(process.env.ESSAY_ART_PREVIEW, file.replace(/\.bmp$/, '.png')), img.toPNG())
  console.log('wrote', path.join(OUT, file), `${width}x${height}`)
  fs.rmSync(tmp, { force: true })
}

app.commandLine.appendSwitch('force-device-scale-factor', '1')
app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const win = new BrowserWindow({ width: 164, height: 314, show: false, frame: false, useContentSize: true, webPreferences: { offscreen: true } })
  try {
    await render(win, SIDEBAR, 164, 314, 'installerSidebar.bmp')
    await render(win, HEADER, 150, 57, 'installerHeader.bmp')
  } catch (e) {
    console.error(e)
    app.exit(1)
  }
  app.exit(0)
})
