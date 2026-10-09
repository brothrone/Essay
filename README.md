# Essay · 자소서 & 스펙 관리 (윈도우 · 맥)

AI와 함께 자소서를 쓰는 데스크톱 앱이에요 (Windows 10/11 · macOS 12 이상). **추가 요금이 없어요.** 이미 쓰고 있는 AI 구독(Google AI 또는 Claude)에 로그인해서 그 사용량으로 돌아가요. 유료 API 키도, 월 요금도, 건당 결제도 없어요. 내 글은 내 PC의 파일로만 남아요.

## 설치

**[최신 설치 파일 받기](https://essay.win/)** — Windows 는 `Essay-Setup-x.y.z.exe`, Mac 은 `Essay-x.y.z-mac-arm64.dmg`(Apple Silicon 전용, Intel 맥 미지원) (GitHub Releases 에도 같은 파일이 있어요)

**Windows**
1. 받은 `Essay-Setup-x.y.z.exe` 를 더블클릭하세요.
2. 파란 **"Windows의 PC 보호"** 창이 뜨면 **추가 정보 → 실행**. (아직 코드 서명이 없어서 뜨는 안내예요.)
3. 작은 진행 창이 잠깐 떴다가 Essay가 바로 열려요. 처음 켜면 **환영 안내**가 AI 연결까지 단계별로 안내해요.
4. 새 버전이 나오면 앱이 스스로 내려받고, 다시 시작할 때 적용돼요.

**Mac**
1. 받은 `.dmg` 를 열고 Essay 를 **응용 프로그램** 폴더로 끌어다 놓으세요.
2. 처음 열 때 **"Apple이 확인할 수 없음"** 창이 뜨면 **완료**를 누르고 **시스템 설정 → 개인정보 보호 및 보안 → [그래도 열기]**. (아직 애플 서명이 없어서 뜨는 안내예요. 한 번만 하면 돼요. 그림 안내: https://essay.win/mac.html)
3. 기능은 윈도우와 같아요. 단축키는 Ctrl 대신 ⌘ 예요. 새 버전은 앱이 스스로 받아 두었다가 다시 켤 때 적용해요(1.7.0부터).

AI 계정은 셋 중 하나만 있으면 돼요: **Google AI Pro·Ultra 구독**(Antigravity CLI), **Claude Pro·Max 구독**(Claude Code), 또는 **무료 Google 계정**(Antigravity CLI, 작은 무료 한도).

- 자세한 설치 안내: [guides/사용자-설치-가이드.md](guides/사용자-설치-가이드.md)
- 막혔을 때: 앱에서 **F1**

## 왜 Essay인가

- **추가 비용 0원, 횟수 제한 없음.** 내 구독 한도만큼 써요.
- **최신 모델 그대로.** 내가 고른 Claude · Gemini 최신 모델로 써요.
- **내 글은 내 PC 밖으로 안 나가요.** 자소서·스펙·수험번호가 서버에 쌓이지 않아요.
- **경험이 바로 글이 돼요.** STAR로 정리한 경험이 문항 옆에 뜨고, 이전 답변을 재활용하고, 다른 회사 이름이 섞이면 잡아 줘요.
- **예전 자소서 하나로 시작.** 통째로 넣으면 경험·스펙·공고 조건까지 한 번에 채워져요.
- **공고는 웹 전체에서.** 사람인 · 잡코리아 · 원티드 · 공공기관을 한 번에 찾아요.

## 개발

```
Essay/
├─ app/                 앱 소스 (Electron + React + Vite)
│  ├─ electron/         메인 프로세스(main.cjs) · 화면과의 다리(preload.cjs) · 창 아이콘
│  ├─ src/              화면(React) · 요청문(prompts.ts) · 데이터(store.ts)
│  ├─ build/            설치 파일용 아이콘(윈도우 icon.ico · 맥 icon.icns) · 설치 화면 그림
│  ├─ scripts/          배포(release.ps1 · release.sh) · 아이콘 만들기 · 개발 실행
│  └─ package.json      버전 · 빌드 설정(electron-builder)
├─ docs/                소개 사이트 (GitHub Pages → https://essay.win/)
├─ guides/
│  ├─ 맥-작업-안내.md      맥북에서 이어서 작업하는 방법 · 맥 버전 만들 때 고칠 곳
│  ├─ 개발-노트.md         구조 · 기능 · 검증 기록 (윈도우)
│  └─ 사용자-설치-가이드.md  처음 쓰는 사람용 설치 안내
├─ 예시-자소서/          [예전 자소서로 채우기] 시험용 예시 파일
└─ CLAUDE.md            Claude Code 가 이 저장소에서 지킬 규칙
```

- 새 버전 배포: `app/package.json` 의 version 을 올리고 맥은 맥북에서 `app/scripts/release.sh`, 윈도우는 윈도우 PC에서 `app\scripts\release.ps1`. 각자 자기 운영체제 파일만 올린다(배포 전에 `git pull`).
- 맥북에서 작업: [guides/맥-작업-안내.md](guides/맥-작업-안내.md)
- 자세한 구조와 검증 기록: [guides/개발-노트.md](guides/개발-노트.md) · [app/README.md](app/README.md)
