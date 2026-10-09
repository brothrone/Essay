#!/usr/bin/env bash
# Essay 새 버전 배포 (맥에서 실행): 맥 · 윈도우 설치 파일을 만들어 GitHub Releases(brothrone/Essay) 에 올린다.
# 설치된 윈도우 앱은 자동 업데이트되고, 맥 앱은 새 버전이 나왔다고 알려 준다.
#
# 쓰는 법 (app 폴더에서):
#   1) package.json 의 "version" 을 올린다 (같은 버전은 업데이트로 안 잡힌다).
#   2) npm install   (처음 한 번)
#   3) ./scripts/release.sh                 # 맥 + 윈도우 빌드 + 릴리스 업로드
#      ./scripts/release.sh --no-publish    # 빌드만 (release/ 에 파일만)
#      ./scripts/release.sh --mac-only      # 맥 파일만 (윈도우는 윈도우 PC 의 release.ps1 로 같은 버전에 올린다)
#   토큰: 환경변수 GH_TOKEN 이 없으면 `gh auth token` 에서 가져온다 (gh auth login 이 돼 있어야 함). 업로드는 gh 로 한다.
#   맥에서 윈도우용 NSIS 설치 파일을 만드는 데 wine 은 필요 없다 (electron-builder 24+).
#   끝나면 릴리스에 Essay-Setup-<버전>.exe · latest.yml · .blockmap(윈도우) 과 Essay-<버전>-mac-arm64.dmg · Essay-<버전>-mac-x64.dmg(맥) 이 올라간다.
#   latest.yml 을 지우면 윈도우 자동 업데이트가 멈춘다.
set -euo pipefail
cd "$(dirname "$0")/.."

PUBLISH=always
MAC_ONLY=0
for arg in "$@"; do
  [[ "$arg" == "--no-publish" ]] && PUBLISH=never
  [[ "$arg" == "--mac-only" ]] && MAC_ONLY=1
done

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
if [[ "$PUBLISH" == "always" ]]; then
  # GitHub 는 "published" 릴리스에 실제 태그가 있어야 받아 준다 → 태그를 먼저 만들어 올린다 (이미 있으면 그대로)
  git tag "v$VERSION" 2>/dev/null || true
  git push origin "v$VERSION" >/dev/null 2>&1 || true
  # electron-builder 가 자산을 병렬로 올리며 릴리스를 두 번 만드는 경쟁을 막기 위해 릴리스를 먼저 만들어 둔다
  if ! curl -fsS -H "Authorization: Bearer $GH_TOKEN" "https://api.github.com/repos/brothrone/Essay/releases/tags/v$VERSION" >/dev/null 2>&1; then
    curl -fsS -X POST -H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github+json" \
      "https://api.github.com/repos/brothrone/Essay/releases" \
      -d "{\"tag_name\":\"v$VERSION\",\"name\":\"Essay $VERSION\",\"draft\":false,\"prerelease\":false}" >/dev/null || true
  fi
fi
# electron-builder 의 업로드는 큰 파일에서 가끔 끊긴다(socket hang up). 그래서 빌드만 하고, 올리는 건 gh 로 한다 (이어 올리기 · 덮어쓰기 가능)
upload() {
  [[ "$PUBLISH" == "always" ]] || return 0
  local files=()
  for f in "$@"; do [[ -f "$f" ]] && files+=("$f"); done
  [[ ${#files[@]} -gt 0 ]] || return 0
  for try in 1 2 3; do
    GH_TOKEN="$GH_TOKEN" gh release upload "v$VERSION" "${files[@]}" --repo brothrone/Essay --clobber && return 0
    echo "업로드 실패 ($try/3) — 다시 시도" >&2; sleep 5
  done
  return 1
}
# 맥 파일 (arch 는 package.json 의 build.mac 설정을 따른다 — Apple Silicon 용 arm64 와 Intel 용 x64 dmg 따로)
npx electron-builder --mac --publish never
upload release/Essay-"$VERSION"-mac-*.dmg release/Essay-"$VERSION"-mac-*.dmg.blockmap release/latest-mac.yml
# 윈도우 파일 (latest.yml 이 있어야 설치된 윈도우 앱이 자동 업데이트된다)
if [[ "$MAC_ONLY" == "0" ]]; then
  npx electron-builder --win --x64 --publish never
  upload release/Essay-Setup-"$VERSION".exe release/Essay-Setup-"$VERSION".exe.blockmap release/latest.yml
fi

echo
echo "완료:"
for f in release/Essay-"$VERSION"-mac-*.dmg release/Essay-Setup-"$VERSION".exe; do
  [[ -f "$f" ]] || continue
  echo "  $f"
  shasum -a 256 "$f" | awk '{print "    SHA-256: " toupper($1)}'
done
[[ "$PUBLISH" == "always" ]] && echo "릴리스: https://github.com/brothrone/Essay/releases/tag/v$VERSION"
