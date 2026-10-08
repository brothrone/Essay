#!/usr/bin/env bash
# Essay 새 버전 배포 (맥/리눅스용): 빌드 → GitHub Releases(hyilkimm/Essay) 업로드 → 설치된 윈도우 앱들이 자동 업데이트.
#
# 쓰는 법 (app 폴더에서):
#   1) package.json 의 "version" 을 올린다 (같은 버전은 업데이트로 안 잡힌다).
#   2) npm install   (처음 한 번)
#   3) ./scripts/release.sh          # 빌드 + 릴리스 업로드
#      ./scripts/release.sh --no-publish   # 빌드만 (release/ 에 파일만)
#   토큰: 환경변수 GH_TOKEN 이 없으면 `gh auth token` 에서 가져온다 (gh auth login 이 돼 있어야 함).
#   맥에서 윈도우용 NSIS 설치 파일을 만드는 데 wine 은 필요 없다 (electron-builder 24+).
#   끝나면 https://github.com/hyilkimm/Essay/releases 에 Essay-Setup-<버전>.exe · latest.yml · .blockmap 이 올라간다. latest.yml 을 지우면 안 된다.
set -euo pipefail
cd "$(dirname "$0")/.."

PUBLISH=always
[[ "${1:-}" == "--no-publish" ]] && PUBLISH=never

VERSION=$(node -p "require('./package.json').version")
echo "Essay $VERSION 빌드"

if [[ "$PUBLISH" == "always" && -z "${GH_TOKEN:-}" ]]; then
  if command -v gh >/dev/null 2>&1; then
    GH_TOKEN=$(gh auth token 2>/dev/null || true)
    export GH_TOKEN
  fi
  if [[ -z "${GH_TOKEN:-}" ]]; then
    echo "GitHub 토큰이 없어요. gh auth login 을 하거나 GH_TOKEN 을 설정해 주세요." >&2
    exit 1
  fi
fi

npx tsc -b
npx vite build
npx electron-builder --win --x64 --publish "$PUBLISH"

EXE="release/Essay-Setup-$VERSION.exe"
echo
echo "완료: $EXE"
shasum -a 256 "$EXE" | awk '{print "SHA-256: " toupper($1)}'
[[ "$PUBLISH" == "always" ]] && echo "릴리스: https://github.com/hyilkimm/Essay/releases/tag/v$VERSION"
