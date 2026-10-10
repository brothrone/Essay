import { desktop } from './desktop'

/** 지금 맥에서 돌고 있는지. 화면 문구(단축키 표시 · 터미널 이름 · 폴더 경로)를 운영체제에 맞출 때 쓴다 */
export const IS_MAC = desktop.info.platform === 'darwin'

/** 단축키 표시: 맥은 ⌘N, 윈도우는 Ctrl+N */
export const kbd = (key: string) => (IS_MAC ? `⌘${key}` : `Ctrl+${key}`)

/** 명령을 치는 창 이름 */
export const TERMINAL = IS_MAC ? '터미널' : 'PowerShell'

/** 운영체제 이름 (앱 소개 문구용) */
export const OS_NAME = IS_MAC ? '맥' : '윈도우'

/** 데이터가 저장되는 폴더를 사람이 읽기 쉽게 */
export const DATA_FOLDER = IS_MAC ? '문서/Essay' : '문서\\Essay'

/** 붙여넣기 단축키 안내 */
export const PASTE_HINT = IS_MAC ? '⌘V' : '마우스 오른쪽 클릭'

/** GPT(Codex CLI)를 고를 수 있는지. 윈도우 1.9.3, 맥 1.9.6 부터 둘 다 */
export const HAS_GPT = true
