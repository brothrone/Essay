// electron-builder 가 앱을 다 꾸린 뒤(dmg · zip 으로 묶기 전) 실행된다.
// 맥: 애플 개발자 서명이 아직 없으므로 ad-hoc 서명을 한다. 서명이 전혀 없으면 Apple Silicon 맥에서 앱이 켜지자마자 꺼진다.
// (universal 로 만들 때는 x64 · arm64 임시 폴더(…-temp)에 서명하면 합치지 못하므로 최종 앱에만 서명한다)
const { execFileSync } = require('node:child_process')
const path = require('node:path')

const fs = require('node:fs')

// 쓰지 않는 Chromium 언어 파일을 지워 용량을 줄인다 (한국어 · 영어만 남김). 맥은 package.json 의 electronLanguages 가 같은 일을 한다
const KEEP_LOCALES = new Set(['ko.pak', 'en-US.pak', 'en-GB.pak'])

module.exports = async function afterPack(context) {
  if (context.electronPlatformName === 'win32') {
    const dir = path.join(context.appOutDir, 'locales')
    for (const f of fs.readdirSync(dir)) if (!KEEP_LOCALES.has(f)) fs.rmSync(path.join(dir, f))
    return
  }
  if (context.electronPlatformName !== 'darwin') return
  if (/-temp$/.test(context.appOutDir)) return
  const appName = context.packager.appInfo.productFilename
  const appPath = path.join(context.appOutDir, `${appName}.app`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' })
  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' })
  console.log(`  • ad-hoc 서명 완료: ${appPath}`)
}
