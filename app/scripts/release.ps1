# Essay 새 버전 배포: 빌드 → GitHub Releases(brothrone/Essay)에 올리기 → 설치된 앱들이 자동 업데이트.
#
# 쓰는 법 (app 폴더에서, PowerShell):
#   1) package.json 의 "version" 을 올린다 (예: 1.2.0 → 1.2.1). 올리지 않으면 같은 버전은 업데이트로 안 잡힌다.
#   2) .\scripts\release.ps1
#      - node 가 PATH 에 있어야 한다.
#      - GitHub 토큰은 (a) 환경변수 GH_TOKEN, 없으면 (b) Git Credential Manager 에 저장된 github.com 로그인에서 가져온다.
#        (b) 가 없으면 한 번 `git push` 를 해서 브라우저 로그인을 마치면 저장된다.
#   3) 끝나면 https://github.com/brothrone/Essay/releases 에 v<버전> 릴리스와 Essay-Setup-<버전>.exe · latest.yml · .blockmap 이 올라간다.
#      latest.yml 이 있어야 앱이 새 버전을 알아보니 파일을 지우지 말 것.
#
# 옵션:  -NoPublish  빌드만 하고 올리지 않는다 (release\ 에 파일만 만든다)

param([switch]$NoPublish)

$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
Write-Host "Essay $version 빌드" -ForegroundColor Cyan

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'node 를 찾을 수 없어요. Node.js 를 설치하거나 PATH 에 넣어 주세요.' }

if (-not $NoPublish -and -not $env:GH_TOKEN) {
  # 1) GitHub CLI 로 로그인돼 있으면 그 토큰, 2) 아니면 Git Credential Manager 에 저장된 github.com 로그인. 둘 다 이 프로세스 안에서만 쓰고 화면에 찍지 않는다
  if (Get-Command gh -ErrorAction SilentlyContinue) {
    $t = (gh auth token 2>$null | Select-Object -First 1)
    if ($t) { $env:GH_TOKEN = $t.Trim() }
  }
  if (-not $env:GH_TOKEN) {
    $fill = "protocol=https`nhost=github.com`n`n" | git credential fill 2>$null
    $line = $fill | Where-Object { $_ -like 'password=*' } | Select-Object -First 1
    if ($line) { $env:GH_TOKEN = $line.Substring(9) }
  }
  if (-not $env:GH_TOKEN) { throw 'GitHub 토큰이 없어요. gh auth login 을 하거나, git push 로 한 번 로그인하거나, $env:GH_TOKEN 을 설정해 주세요.' }
}

node node_modules/typescript/bin/tsc -b
if ($LASTEXITCODE -ne 0) { throw 'tsc 실패' }
node node_modules/vite/bin/vite.js build
if ($LASTEXITCODE -ne 0) { throw 'vite 빌드 실패' }

$publish = if ($NoPublish) { 'never' } else { 'always' }
node node_modules/electron-builder/cli.js --win --x64 --publish $publish
if ($LASTEXITCODE -ne 0) { throw 'electron-builder 실패' }

$exe = "release\Essay-Setup-$version.exe"
$hash = (Get-FileHash $exe -Algorithm SHA256).Hash
Write-Host ''
Write-Host "완료: $exe" -ForegroundColor Green
Write-Host "SHA-256: $hash"
if (-not $NoPublish) { Write-Host "릴리스: https://github.com/brothrone/Essay/releases/tag/v$version" }
