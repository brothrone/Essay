# Essay · 자소서 & 스펙 관리 (윈도우)

개인용 자소서/스펙 관리 **윈도우 데스크톱 앱**입니다.
데이터는 이 PC의 파일로만 저장됩니다. 유료 API를 쓰지 않습니다(AI는 이 PC에 로그인된 Claude Code 또는 Gemini CLI로 실행).

## 설치 · 실행

1. [GitHub Releases](https://github.com/brothrone/Essay/releases/latest)에서 `Essay-Setup-<버전>.exe` 를 받아 실행. 원클릭 설치라 바로 앱이 열리고, 바탕화면과 시작 메뉴에 **Essay**가 생깁니다.
2. 코드 서명이 없어서 처음 실행할 때 SmartScreen 경고가 뜹니다 → **추가 정보 → 실행**.
3. 처음 켜면 환영 안내가 AI 연결(CLI 설치 · 구독 로그인)을 단계별로 안내합니다. 막히면 **F1**.
4. 데이터 파일: `문서\Essay\Essay-데이터.json` · 자동 백업: 같은 폴더의 `자동백업\` (매일 첫 저장 직전 상태, 30일치)

## 자동 업데이트 · 배포

- 앱은 켜질 때와 6시간마다 GitHub Releases(`brothrone/Essay`)에서 새 버전을 확인하고(electron-updater), 조용히 내려받은 뒤 화면 아래 띠에서 **[지금 다시 시작]** 또는 다음에 끌 때 적용합니다. **설정 → 업데이트**에서 직접 확인할 수도 있습니다.
- 새 버전 올리기: `package.json` 의 `version` 을 올리고 `app\` 에서 `.\scripts\release.ps1`. 빌드 후 `Essay-Setup-<버전>.exe` · `latest.yml` · `.blockmap` 을 릴리스 `v<버전>` 에 올립니다. GitHub 토큰은 `GH_TOKEN` 또는 Git Credential Manager 에 저장된 로그인을 씁니다.

## 윈도우 전용으로 되어 있는 것

| | 내용 |
| --- | --- |
| 제목 표시줄 | 윈도우 11 식 커스텀 제목 표시줄(앱 이름 · 저장 상태 + 기본 최소화/최대화/닫기 버튼) |
| 테마 | 윈도우 설정(개인 설정 → 색)의 밝게/어둡게를 따라감. **설정 → 화면 테마**에서 고정 가능 |
| 단축키 | `Ctrl+N` 새 자소서 · `Ctrl+1~5` 화면 이동 · `Ctrl+6` 백업 · `Ctrl+7` 데이터 · `Ctrl+,` 설정 · `F11` 전체 화면 · `Ctrl+=/-` 확대/축소 |
| 작업 표시줄 | 아이콘 오른쪽 클릭 점프 목록(새 자소서 시작하기 · 맞춤 공고 보기), 7일 안 마감 개수 배지 |
| 알림 | 작성 중 자소서의 D-3 · D-1 · 당일에 윈도우 알림(누르면 해당 자소서로 이동) |
| 대화 상자 | 삭제·덮어쓰기 확인, 백업 저장/불러오기가 모두 윈도우 기본 대화 상자(버튼 이름 한글) |
| 창 | 크기·위치·최대화 상태 기억, 한 번에 하나만 실행(두 번째 실행은 기존 창을 앞으로) |
| AI 실행 | `claude.exe`/`.cmd`, `agy.exe`, `gemini.cmd` 자동 탐색(`where.exe` 포함), 취소 시 `taskkill /T`로 프로세스 트리 종료, UTF-8 스트림 |

## AI로 바로 쓰기 (구독 · 로그인 계정으로, API 키 없이)

**설정 → AI 설정**에서 고릅니다. 설치된 CLI를 로그인 세션으로 실행하고, API 키 환경변수는 넘기지 않아 **유료 API로 결제되지 않습니다.**

| | Claude | Gemini |
| --- | --- | --- |
| 쓰는 CLI | Claude Code (`claude`) | Antigravity CLI (`agy`) → 없으면 Gemini CLI (`gemini`) |
| 설치 (PowerShell) | `irm https://claude.ai/install.ps1 \| iex` | `irm https://antigravity.google/cli/install.ps1 \| iex` 또는 `npm install -g @google/gemini-cli` |
| 로그인 | `claude auth login --claudeai` (구독 계정, Console 아님) | `agy` 실행 → 브라우저 로그인 / `gemini` 실행 → Login with Google |
| 차감 | Claude Pro·Max 사용량 | Google AI Pro·Ultra 또는 Google 계정 무료 한도 |
| 웹 기능(맞춤 공고 · 공고 불러오기) | 바로 됨 | agy: AI 설정에서 **[웹 읽기 권한 허용]** 한 번 / gemini: 바로 됨 |

- 글쓰기는 도구를 끈 채, 웹 기능은 검색·페이지 읽기만 허용한 채 빈 임시 폴더(`%TEMP%\essay-ai`)에서 실행합니다. 내 파일을 읽거나 바꾸지 않습니다.
- 설치 경로가 특이하면 환경 변수 `ESSAY_CLAUDE_PATH` / `ESSAY_AGY_PATH` / `ESSAY_GEMINI_PATH`에 실행 파일 전체 경로를 넣어 주세요.
- 마지막 AI 실행 기록: **데이터 → 로그 폴더 열기** → `ai-last-run.json` (요청문·생성 글은 저장하지 않음)

## 기능

| 메뉴 | 내용 |
| --- | --- |
| 홈 | 회사명 입력으로 바로 시작, 다가오는 마감(D-day), 지원 현황, 역량별 경험 분포, 확인할 것(어학 만료·지난 마감) |
| 자소서 프로젝트 | 공고별 회사·직무·마감일·공고 링크·상태(작성중 → 제출 → 서류합격 → 면접 → 최종) 관리, 검색·정렬 |
| 자소서 편집기 | 문항별 답변 작성, 글자수 제한(공백 포함/제외/바이트), 초과 경고, 문항 순서 변경, 작성 완료 체크, 메모, 전체 복사 |
| ┗ 경험 패널 | 내 경험을 문항에 연결해 STAR 내용을 옆에 띄워 놓고 작성 (같은 경험 중복 사용 경고) |
| ┗ AI 도우미 | 초안 · 피드백 · 피드백 반영 · 글자수 맞추기 → 미리 보고 [답변에 적용] / 되돌리기. 요청문 복사로 다른 AI 채팅에 붙여넣기도 가능 |
| ┗ 다른 답변 패널 | 다른 자소서의 답변을 비슷한 문항 순으로 보여줘서 재활용 |
| 경험 관리 | STAR + 배운 점 + 역량 태그로 경험 정리, 어떤 문항에 쓰였는지 추적, **마인드맵**(확대·이동) |
| 맞춤 공고 | 내 스펙·경험을 바탕으로 AI가 웹을 검색해 접수 중인 공고를 매칭 점수·이유와 함께 가져옴 → [자소서 시작] |
| 공고 링크 | 새 자소서에서 링크 [불러오기] → 회사·직무·마감일·공고 내용·문항 자동 채움 / [공고 정보]에서 **공고 다시 확인** |
| 제출 전 검사 | 다른 지원처 이름, 다른 자소서와 거의 같은 답변, AI가 남긴 '(확인 필요)' 경고 |
| 스펙 관리 | 기본 정보·보유 스킬, 학력·어학·자격증·수상·경력·대외활동·교육 이수, 어학 유효기간 자동 계산, 지원서용 텍스트 복사 |
| 회사명으로 공고 찾기 | 새 자소서 창에서 링크 없이 회사명·직무만 넣고 **[링크 없이 AI로 공고 · 문항 찾기]** → 접수 중인 공고, 마감일, 자소서 문항, **공고 분석(핵심 역량 Top3 · 키워드 · 인재상)** 을 웹에서 찾아 채움 |
| 자소서 최적화 AI | 초안은 문항 의도 → 핵심 메시지 → 두괄식 구성, 수치·구체성 강제, 상투어·번역투 금지. 피드백은 100점 채점(의도·구체성·직무연관·구성·진정성) · 고칠 문장 인용과 대안 · 첫 문장 대안 3개 · 먼저 고칠 3가지. **면접 꼬리질문 5개**와 답변 방향도 뽑아 작성 메모에 저장 |
| 제출 전 검사 (힌트) | 공고 키워드 미반영, 상투어("함께 성장", "시너지" 등), 배경 설명으로 시작하는 첫 문장을 파란 힌트로 표시 |
| 예전 자소서 불러오기 | 지금까지 쓴 자소서·이력서(txt·md·docx 또는 붙여넣기)를 AI가 읽어 **경험(STAR) · 스펙 · 희망 직무/스킬 · 과거 자소서 답변**을 자동으로 채우고, 학력·직무로 **맞춤 공고 조건**을 잡아 바로 검색 |
| 백업 | 백업 파일 저장/불러오기, 자동 백업 안내 |
| 데이터 | 저장된 데이터 요약과 파일 위치, 데이터·로그 폴더 열기, 예전 자소서 불러오기, 예시 데이터, 전체 초기화 |
| 설정 | 화면 테마, AI 설정, 업데이트, Essay 정보 |

개발자: **brothrone** (제목 표시줄 ⓘ 또는 설정 맨 아래에서 볼 수 있어요)

## 개발 · 빌드 (Node.js 20 이상)

```powershell
npm install              # 처음 한 번
npm run dev              # Vite 개발 서버 + Electron 창 (저장하면 바로 반영)
npm run start            # 빌드 후 Electron으로 실행
npm run app:build        # release\Essay-Setup-<버전>.exe (NSIS 설치 파일)
npm run app:build:dir    # release\win-unpacked\Essay.exe (설치 없이 실행 확인용)
npm run installer:art    # 설치 화면 그림(build\installerSidebar.bmp, installerHeader.bmp) 다시 그리기
```

- 설치 파일 빌드 중 "Cannot create symbolic link" 오류가 나면 윈도우 **설정 → 개발자용 → 개발자 모드**를 켜거나 PowerShell을 관리자로 실행하세요(electron-builder가 서명 도구를 푸는 과정).
- 앱 이름(`productName`)은 영어로 유지해야 합니다. 한글 이름으로 패키징하면 실행 직후 종료됩니다.
- 아이콘을 바꾸려면 `build\icon-1024.png`를 바꾸고 `py scripts\make-ico.py`(Pillow 필요)로 `build\icon.ico`를 다시 만듭니다.

## 데이터 주의

- AI 도우미 요청문에는 **공고 메모**가 그대로 들어갑니다. 수험번호처럼 남에게 보이기 싫은 내용은 공고 메모 대신 다른 곳에 적어 두세요.
- 바이트 글자수는 한글 2byte, 영문·공백 1byte, 줄바꿈 2byte 기준입니다. 지원 사이트마다 기준이 다를 수 있습니다.
- `release/`(빌드 결과)는 `.gitignore`에 들어 있습니다.

## 구조

```
electron/
  main.cjs            창(커스텀 제목 표시줄 · 테마 · 창 상태 기억), 데이터 파일, 자동 백업, 윈도우 대화 상자,
                      AI CLI 실행(claude / agy / gemini), 마감 알림 · 작업 표시줄 배지, 메뉴 단축키, 점프 목록
  preload.cjs         화면 코드에 허용한 기능(window.desktop)만 노출
src/
  desktop.ts          window.desktop 타입 (앱은 Electron 안에서만 실행됨)
  useTheme.ts         윈도우 테마 → <html data-theme>
  store.ts / StoreProvider.tsx   저장소, 자동 저장(파일), 백업 검증(normalize)
  prompts.ts          AI 요청문
  components/         제목 표시줄, 사이드바, AI 패널, 모달, 공통 UI
  pages/              홈, 프로젝트, 편집기, 맞춤 공고, 경험, 스펙, 백업, 데이터, 설정
scripts/
  dev.mjs             개발 서버 + Electron
  make-installer-art.cjs   NSIS 설치 화면 그림 생성
  make-ico.py         아이콘 PNG → ICO
build/                아이콘, 설치 화면 그림
```
