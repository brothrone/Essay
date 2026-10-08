// 개발용: Vite 개발 서버를 띄운 뒤 같은 화면을 Electron 창으로 연다 (저장하면 바로 반영)
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import net from 'node:net'

const require = createRequire(import.meta.url)
const PORT = 5173
const URL = `http://localhost:${PORT}`
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'

const vite = spawn(npx, ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'inherit', shell: true })

const waitPort = () =>
  new Promise((resolve) => {
    const tryOnce = () => {
      const s = net.connect(PORT, '127.0.0.1')
      s.once('connect', () => (s.end(), resolve()))
      s.once('error', () => setTimeout(tryOnce, 300))
    }
    tryOnce()
  })

await waitPort()
const electron = spawn(require('electron'), ['.'], {
  stdio: 'inherit',
  env: { ...process.env, ESSAY_DEV_URL: URL },
})
electron.on('exit', () => {
  vite.kill()
  process.exit(0)
})
process.on('SIGINT', () => {
  electron.kill()
  vite.kill()
})
