import type { CountMode, ProjectStatus } from './types'

export const APP_NAME = 'Essay'
export const AUTHOR = '김형일'
/** 만든 사람의 개인 블로그 */
export const AUTHOR_BLOG = 'https://brothrone.org'

export const STATUS: Record<ProjectStatus, { label: string; tone: string }> = {
  writing: { label: '작성중', tone: 'blue' },
  submitted: { label: '제출완료', tone: 'violet' },
  docPass: { label: '서류합격', tone: 'teal' },
  interview: { label: '면접진행', tone: 'amber' },
  finalPass: { label: '최종합격', tone: 'green' },
  failed: { label: '불합격', tone: 'gray' },
}

export const STATUS_ORDER: ProjectStatus[] = ['writing', 'submitted', 'docPass', 'interview', 'finalPass', 'failed']

export const COUNT_MODE_LABEL: Record<CountMode, string> = {
  with: '공백 포함',
  without: '공백 제외',
  byte: '바이트',
}

export const EXPERIENCE_TYPES = [
  '프로젝트',
  '인턴·경력',
  '동아리·학회',
  '대외활동',
  '공모전',
  '아르바이트',
  '학업·연구',
  '봉사',
  '군 복무',
  '기타',
]

export const COMPETENCY_TAGS = [
  '리더십',
  '협업',
  '문제해결',
  '도전정신',
  '주도성',
  '창의성',
  '분석력',
  '커뮤니케이션',
  '책임감',
  '전문성',
  '고객지향',
  '갈등관리',
  '실패극복',
  '성실성',
]

export const QUESTION_PRESETS: { prompt: string; limit: number }[] = [
  { prompt: '지원 동기와 입사 후 포부를 작성해 주세요.', limit: 700 },
  { prompt: '지원 직무와 관련된 역량을 쌓기 위해 노력한 경험을 작성해 주세요.', limit: 1000 },
  { prompt: '공동의 목표를 위해 다른 사람과 협업했던 경험을 작성해 주세요.', limit: 800 },
  { prompt: '도전적인 목표를 세우고 이를 달성하기 위해 노력한 경험을 작성해 주세요.', limit: 800 },
  { prompt: '실패를 경험하고 이를 극복한 사례를 작성해 주세요.', limit: 800 },
  { prompt: '본인의 성장 과정과 가치관에 대해 작성해 주세요.', limit: 700 },
]

export const STAR_FIELDS = [
  { key: 'situation', short: 'S', label: '상황', hint: '언제, 어디서, 어떤 상황이었나요? 배경과 문제를 적어요.' },
  { key: 'task', short: 'T', label: '과제', hint: '내가 맡은 역할과 해결해야 했던 목표는 무엇이었나요?' },
  { key: 'action', short: 'A', label: '행동', hint: '구체적으로 어떤 행동을 했나요? 나만의 방법과 노력을 적어요.' },
  { key: 'result', short: 'R', label: '결과', hint: '결과는 어땠나요? 가능하면 숫자로 (예: 참여율 30% 증가).' },
] as const
