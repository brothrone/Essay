# Essay — Claude Code 작업 규칙

자소서 · 스펙 관리 데스크톱 앱 (Electron 44 + React 19 + Vite 8 + TypeScript). 윈도우 · 맥 둘 다 같은 코드로 배포한다 (1.4.0 부터 맥 포함). 운영체제별 동작은 `main.cjs` 의 `IS_MAC`, 화면은 `src/platform.ts` 로 나눈다.
AI 기능은 유료 API 없이 사용자 PC에 로그인된 CLI(Claude Code `claude`, Antigravity CLI `agy`, Gemini CLI `gemini`, OpenAI Codex CLI `codex` — GPT 는 윈도우 1.9.3 · 맥 1.9.6 부터)를 실행한다.

## 사용자와 일하는 방식
- **답변은 한국어.**
- 요청을 끝내면 묻지 말고 **커밋 → push → (앱을 바꿨으면) 버전 올려 릴리스**까지 한다. 강제 push · 릴리스 삭제 · 기록 지우기는 사용자가 직접 하라고 하기 전엔 하지 않는다.
- 앱 · 사이트 문구는 **쉬운 말**로. 작은 회색 라벨, 녹색 강조, 명령어 · 코드 같은 어려운 표현처럼 "AI 티" 나는 장식은 넣지 않는다.
- 앱 · 사이트 글자는 **핵심만, 짧게** (사용자 지시, 2026-10-10 · 1.9.7). 제목 · 카드 밑 설명 문단, 작은 회색 안내 줄은 되도록 없애고 남길 땐 한 줄 안팎. 단 내용(구간 · 기능 · FAQ 항목)을 통째로 빼지는 않는다 — "보기 깔끔하게"는 줄이기가 아니라 다듬기. 요금 경고 · 삭제 확인 · 오류 · 로그인 단계 · 동의 창 내용은 남긴다. 홍보 녹화 스크립트가 글자로 누르는 버튼 문구는 바꾸면 스크립트도 같이 고친다.
- **개발자 표시는 `brothrone` 만.** 실명 · 블로그 · 이메일 · 개인 링크 · `C:\Users\…` 같은 사용자 경로를 앱 · 사이트 · 문서 · 스크린샷에 넣지 않는다.
- 커밋 작성자: `brothrone <261971426+brothrone@users.noreply.github.com>` (각 저장소 `git config user.*` 로 설정).
- **윈도우는 윈도우 PC 세션이, 맥은 맥북 세션이 알아서 맡는다. 서로 간섭하지 않는다** (사용자 지시, 2026-10-10). 다른 쪽 전용 코드(`IS_MAC` 분기 · 윈도우 분기), 배포 스크립트(`release.sh` / `release.ps1`), 안내 페이지(`mac.html` / `windows.html`), 릴리스 파일은 건드리지 않고, 다른 쪽 버전 · 상태를 대신 확인 · 보고 · 계획하지 않는다. 같이 쓰는 코드(화면 · 공통 로직)를 고칠 때는 다른 운영체제 동작이 바뀌지 않게 한다.

## 폴더
- `app/electron/main.cjs` 메인 프로세스 (데이터 파일, AI 실행 `runAi`, 설치 · 로그인, 공고 확인 `checkPosting`, 자동 업데이트, 메뉴)
- `app/electron/preload.cjs` 화면에 내보내는 `window.desktop` (타입은 `app/src/desktop.ts`)
- `app/src/prompts.ts` 모든 AI 요청문 · 공고 결과 해석
- `app/src/store.ts` · `StoreProvider.tsx` 데이터 모양 · 저장 · 예전 데이터 변환(`normalize`)
- `app/src/JobSearchProvider.tsx` 맞춤 공고 찾기 (AI 후보 → 구글 중간 주소 풀기 → 공고 페이지 직접 확인 → 뺀 공고와 이유)
- `app/src/PostingReaderProvider.tsx` 공고 읽기 (화면을 옮겨도 계속, 끝나면 자소서에 문항 · 메모 · 마감일 반영)
- `docs/` 소개 사이트 (GitHub Pages, 주소 https://essay.win — 2026-10-10 에 Cloudflare 에서 산 도메인. 예전 brothrone.github.io/Essay 는 GitHub 가 새 주소로 넘겨줌. `docs/CNAME` 을 지우지 말 것). `docs/windows.html` · `docs/mac.html` 은 다운로드 버튼이 여는 안내 페이지(자동 다운로드 + SmartScreen / Gatekeeper 넘기는 법, 맥 `?arch=x64` 는 Intel)
- `guides/` 개발 노트 · 사용자 설치 안내 · **맥 작업 안내**
- `server/` 백엔드 (Cloudflare Workers + D1, 무료 요금제): 의견 받기 · 익명 사용 통계 · 오류 보고 · 회사별 자소서 문항 모음 · 개발자용 관리 주소. 나중에 결제 확인 · 라이선스 키. 앱 쪽은 `app/electron/community.cjs` · `app/src/community.ts` — 서버 주소는 `docs/app-config.json` 의 `api.baseUrl`(비면 아무것도 안 보냄), 통계 · 오류 · 문항은 사용자가 [개선 돕기]에서 고른 것만. 배포 · 도메인 · 결제 설계는 `guides/서버-안내.md`. 비밀 값은 `wrangler secret` 과 `server/.dev.vars`(저장소 밖)에만

## 명령 (`app/` 에서)
```bash
npm install
npm run dev                 # 개발 실행 (Vite + Electron)
npx tsc -b                  # 타입 검사
npx oxlint src electron     # 코드 검사
npx vite build              # 화면 빌드
```
- 배포는 **운영체제별로 따로** 한다(사용자 결정, 2026-10-09): 맥 파일은 맥북에서 `scripts/release.sh`, 윈도우 파일은 **윈도우 PC에서만** `scripts/release.ps1`. 맥북에서 윈도우 exe 를 만들어 올리지 않는다. 버전은 `package.json` 하나를 같이 쓰므로 배포 전 `git pull`, 같은 버전이면 같은 태그 `v<버전>` 에 각자 파일을 올린다. 윈도우는 `Essay-Setup-<버전>.exe` · `.blockmap` · `latest.yml`, 맥은 `Essay-<버전>-mac-arm64.dmg` · `latest-mac.yml` (Intel 맥은 지원하지 않는다 — 사용자 결정 2026-10-09, x64 빌드 · 링크를 다시 만들지 말 것). 한쪽만 올라간 최신 릴리스가 있으면 다른 쪽 업데이트 확인은 잠시 '확인 실패'가 될 수 있다. 사이트 다운로드 버튼과 맥 업데이트는 그 운영체제 파일이 있는 가장 새 릴리스를 찾는다.
- 맥은 애플 개발자 서명이 없어 ad-hoc 서명만 한다(`scripts/after-pack.cjs`). electron-updater(Squirrel.Mac)는 서명이 없으면 업데이트를 거부하므로 맥은 직접 업데이트한다(1.7.0): `checkMacUpdate` 가 릴리스 목록에서 내 아키텍처 dmg 를 찾아 `userData/update` 로 받고 `latest-mac.yml` 의 sha512 로 확인 → [다시 시작] 또는 앱 종료 때 `MAC_SWAP_SCRIPT` 가 Essay 종료를 기다렸다가 dmg 를 마운트해 `Essay.app` 을 통째로 바꾼다(실패하면 원래 앱 복구, 로그 `logs/update-last.log`). 앱이 받은 파일엔 quarantine 이 없어 Gatekeeper 창이 다시 안 뜬다. 응용 프로그램 폴더에 쓸 수 없으면 다운로드 안내로. 시험은 `ESSAY_UPDATE_FEED=<릴리스 JSON 주소>` 로 로컬 피드를 줄 수 있다. 처음 열 때 Gatekeeper 안내가 뜨는 건 정상(시스템 설정 → 개인정보 보호 및 보안 → 그래도 열기).
- 토큰: `gh auth token`, 없으면 Git Credential Manager (`"protocol=https\nhost=github.com\n\n" | git credential-manager get`).

## 검증할 때
- 사용자 실제 데이터(문서/Essay/Essay-데이터.json)는 건드리지 않는다. 시험은 `ESSAY_DATA_DIR=<시험 폴더>` 와 별도 `--user-data-dir` 로 띄운다 (사용자 Essay 가 켜져 있어도 단일 실행 잠금에 안 걸림).
- 화면 확인은 `--remote-debugging-port` + CDP 로 버튼을 누르고 캡처한다.
- 사이트용 스크린샷에는 예시 데이터만, 사용자 경로가 보이지 않게(가짜 AI 도구 경로 등) 찍는다.

## AI 도구에서 알아 둔 것
- 유료 API 로 결제되지 않게 `ANTHROPIC_*`, `GEMINI_API_KEY` 등 키 환경 변수를 지우고 실행한다 (`aiEnv`).
- Claude Code: 요청문은 stdin, `--output-format stream-json`. 웹 작업은 빠른 모델(Sonnet).
- agy: 요청문은 인자(윈도우는 30,000자 제한, 맥은 200,000자), 파이프 stdin 을 읽지 않는다. 로그인 코드는 콘솔 입력으로만 받는다 (윈도우는 C# `WriteConsoleInputW`, 맥은 `/usr/bin/expect` 가상 터미널로 agy 를 띄우고 Essay 가 파이프로 넣은 줄을 터미널 입력으로 넘긴다 — `startGeminiLoginMac`. macOS 의 `script` 는 stdin 이 파이프면 실패해서 못 쓴다). 검색 결과에 공고 주소가 안 보여서 맞춤 공고는 사람인 · 잡코리아 공고 주소 안 `site:` 검색으로 찾게 한다. 링크는 `vertexaisearch…/grounding-api-redirect/…` 중간 주소라 `net:resolve-urls` 로 실제 주소로 바꾼다. 결과의 `usage` 에 토큰 수가 있다.
- Codex CLI(GPT, 윈도우 1.9.3 · 맥 1.9.6): 설치는 공식 `irm https://chatgpt.com/codex/install.ps1 | iex`(`CODEX_NON_INTERACTIVE=1` 이면 묻지 않음, `%LOCALAPPDATA%\Programs\OpenAI\Codex\bin\codex.exe`), 맥은 `curl -fsSL https://chatgpt.com/codex/install.sh | CODEX_NON_INTERACTIVE=1 sh`(`~/.local/bin/codex` → `~/.codex/packages/standalone/current/bin/codex` 링크, brew · npm 설치도 찾음; ChatGPT 데스크톱 앱이 이미 로그인해 둔 `~/.codex/auth.json` 을 같이 써서 설치만 하면 로그인돼 있을 수 있음), 로그인은 1.9.5 부터 앱 안에서 창 없이 `codex login` 을 띄운다(`ai:gpt-login`, 브라우저 ChatGPT 로그인, 코드 입력 없음, 출력의 `https://auth.openai.com/…` 주소를 [로그인 페이지 다시 열기]로 — 기록엔 안 남김, API 키 로그인이면 먼저 `codex logout`, 실패하면 PowerShell 창 방식 `login-codex`). **시험 때 실제 codex 로 `codex login` 을 돌리지 말 것 — 사용자 브라우저에 OpenAI 로그인 창이 뜬다**(가짜 codex 로). 로그인 확인은 `codex login status` 의 종료 코드(문구는 stderr, "API key" 면 API 요금이 나가므로 로그인 안 된 것으로 보고 막음). 실행은 `codex exec --json --ephemeral --skip-git-repo-check --ignore-user-config --ignore-rules -s read-only -c web_search=disabled|live -c features.shell_tool=false …(CODEX_OFF_FEATURES) -`, 요청문(시스템 지시를 앞에 붙임)은 stdin. 기능 끄기는 꼭 `-c features.X=false`(모르는 이름은 경고만) — `--disable X` 는 모르는 이름이면 실행이 실패한다. 답은 마지막 `item.completed` agent_message, 토큰은 `turn.completed.usage`. 401 이 오면 20초 재시도를 기다리지 않고 끊는다. 모델은 요금제 · 시기마다 바뀌어 `~/.codex/models_cache.json` 에서 읽는다. `OPENAI_*` · `CODEX_API_KEY` 는 지우고 실행. 홈 폴더가 Temp 안이면 codex 가 경고를 stderr 로 내서 설치 검사가 실패하니 설치 시험은 Temp 밖 폴더로. 2026-10-10 맥 실제 GPT 시험(기본 모델): 초안 639/700 · 659/700 · 714/800(13~56초), 피드백 11초, 대화 고치기 682/700(21초), 맞춤 공고 3건 모두 실제 접수 중(36초). GPT 는 대화에서 분량이 모자라게 고치는 일이 있어 1.9.6 부터 대화도 "짧게 · 줄여" 같은 말이 없으면 88~100% 로 맞추고, 맞춤 공고 검색어는 Gemini 처럼 공고 주소 안 검색(site:)을 쓴다(평범한 검색어로는 공고 한 건 페이지가 거의 안 나왔음)
- 맥에서 CLI 찾기: 앱은 터미널 PATH 를 못 받으므로 `zsh -lc` 로 로그인 셸 PATH 를 한 번 읽어(`loginShellPath`) `~/.local/bin` · `/opt/homebrew/bin` 등과 함께 쓴다. 자식 프로세스는 `detached: true` 로 띄워 `process.kill(-pid)` 로 묶음 종료한다. 설치 · 터미널 작업은 `.command` 파일을 만들어 터미널 앱으로 연다.
- 공고 마감 확인(`checkPosting`): 화면의 '마감일:' → 캐치 `ApplyEndDatetime` → 본문 "접수기간 ~" → `validThrough`(반년 넘게 남았으면 상시로 봄) 순.

## 남은 일 (사용자가 나중에 다시 알려 달라고 한 것)
1. 맥 서명 · 공증 (Apple Developer Program 가입 뒤 — 그러면 Gatekeeper 안내가 사라지고 맥 자동 업데이트도 켤 수 있다) — `guides/맥-작업-안내.md`
2. 유료 판매(개당 990원): 사업자 등록, PG(나이스체크아웃 검토: 가입비 면제 프로모션, 수수료 1.9~3.4%, 코드 NICE27 시 2.7%, 결제 후 키 자동 발송 없음), 통신판매업 신고, 환불 제한 표시 + 체험판, 사이트 하단 사업자 정보 표시(익명 유지와 충돌하니 상호로)
3. (완료 1.6.0) AI별 토큰 사용량 표시 — `ai-usage.json`(userData), 설정의 [AI 사용량]
4. 요금제별 CLI 사용 가능 여부 주기적 재확인 — 결과는 `docs/app-config.json`(앱이 하루 한 번 받아 설정 · 처음 안내에 표시, 기본값은 `app/electron/app-config-default.json`)만 고쳐 push 하면 앱 재배포 없이 바뀐다. 2026-10-09 기준: Claude Code 는 Pro · Max(무료 불가), Antigravity CLI 는 무료 Google 계정도 가능(한도 작음), Gemini CLI 는 2026-06-18부터 개인 계정 불가. agy 를 다른 앱에서 실행하는 것이 Antigravity 약관상 괜찮은지는 Google 공식 답이 없음. 2026-10-10: OpenAI 도움말(help.openai.com/en/articles/11369540)상 Codex 는 Free · Go 포함 모든 ChatGPT 요금제에 들어 있고 CLI 도 ChatGPT 로그인 가능(Free · Go 는 한도 작음, 빠지는 건 Codex Cloud 뿐 — Essay 는 안 씀). 요금제 표(learn.chatgpt.com/docs/pricing)엔 Free · Go 가 데스크톱 앱만 적혀 있어 실제 무료 계정 CLI 동작은 아직 직접 확인 못 함. 다른 앱이 ChatGPT 로그인한 Codex CLI 를 실행하는 것에 대한 OpenAI 공식 답도 없음
5. (완료 1.6.0) 앱 안 의견 보내기 — 도움말 메뉴 · 설정 · F1 도움말. GitHub 이슈 작성 화면을 내용이 채워진 채로 열고, `app-config.json` 의 `feedback.formUrl` 에 Google 설문지 주소를 넣으면 [설문지로 보내기]도 생긴다. 유료 판매 땐 Cloudflare Workers 로 피드백 · 결제 확인 · 라이선스 키를 함께 → `server/` 에 서버를 만들어 `https://api.essay.win` 에 배포하고(2026-10-10, workers.dev 주소는 끔, 운영 비밀 값은 맥의 `server/.prod.vars`) `docs/app-config.json` 의 `api.baseUrl` 로 1.8.x 앱에서 켬
