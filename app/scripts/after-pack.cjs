// electron-builder 가 앱을 다 꾸린 뒤(dmg · zip 으로 묶기 전) 실행된다.
// 맥: 애플 개발자 서명이 아직 없으므로 ad-hoc 서명을 한다. 서명이 전혀 없으면 Apple Silicon 맥에서 앱이 켜지자마자 꺼진다.
// universal 빌드는 x64 · arm64 를 임시 폴더(…-temp)에 각각 만든 뒤 합치는데, 임시 앱에 서명하면 서명 파일이 달라져 합치지 못하므로
// 합쳐진 최종 앱(release/mac-universal)에만 서명한다.
const { execFileSync } = require('node:child_process')
const path = require('node:path')

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  if (/-temp$/.test(context.appOutDir)) return
  const appName = context.packager.appInfo.productFilename
  const appPath = path.join(context.appOutDir, `${appName}.app`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' })
  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' })
  console.log(`  • ad-hoc 서명 완료: ${appPath}`)
}
