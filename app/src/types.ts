export type ID = string

export interface Profile {
  name: string
  email: string
  phone: string
  birth: string
  address: string
  targetJob: string
  links: string
  skills: string
}

export type SpecCategory =
  | 'education'
  | 'language'
  | 'certificate'
  | 'award'
  | 'career'
  | 'activity'
  | 'training'

export interface SpecItem {
  id: ID
  category: SpecCategory
  data: Record<string, string>
  createdAt: number
  updatedAt: number
}

export interface Experience {
  id: ID
  title: string
  type: string
  org: string
  role: string
  start: string // YYYY-MM
  end: string // YYYY-MM, 비어 있으면 진행 중
  summary: string
  situation: string
  task: string
  action: string
  result: string
  learned: string
  tags: string[]
  createdAt: number
  updatedAt: number
}

export type CountMode = 'with' | 'without' | 'byte'

/** 답변의 이전 상태 (편집 기록) */
export interface AnswerSnapshot {
  at: number
  answer: string
  label?: string // AI 적용 전 · 되돌리기 전 · 직접 저장 (없으면 자동)
}

/** AI 대화 한 줄 (문항마다 따로 남는다) */
export interface ChatMessage {
  role: 'user' | 'ai'
  text: string
  at: number
  /** AI 가 제안한 고친 답변 전체 (있을 때만) */
  answer?: string
  /** 그 답변을 [답변에 적용] 했는지 */
  applied?: boolean
  model?: string
  seconds?: number
  tokens?: number
}

export interface Question {
  id: ID
  prompt: string
  limit: number | null
  countMode: CountMode
  answer: string
  memo: string
  experienceIds: ID[]
  done: boolean
  /** 답변을 고치기 직전 상태들 (최근 30개) */
  history: AnswerSnapshot[]
  /** AI 와 나눈 대화 (최근 60개). 예전 데이터엔 없다 */
  chat?: ChatMessage[]
}

export type ProjectStatus = 'writing' | 'submitted' | 'docPass' | 'interview' | 'finalPass' | 'failed'

export interface Project {
  id: ID
  company: string
  position: string
  jobUrl: string
  deadline: string // YYYY-MM-DD
  deadlineTime: string // HH:mm
  status: ProjectStatus
  notes: string
  /** 나만의 상황 · 지원 동기 메모 (전향 이유, 공백기, 지역 사정 등) — 초안 · 피드백 요청문에 들어간다 */
  personal: string
  questions: Question[]
  createdAt: number
  updatedAt: number
  openedAt: number
}

/** 새 공고 · 숨김 · 자소서 시작. 저장 여부는 따로(saved) 둔다 → 저장해도 새 공고 목록에 남는다 */
export type JobStatus = 'new' | 'hidden' | 'started'

/** AI가 웹에서 찾아온 공고 */
export interface JobPosting {
  id: ID
  company: string
  title: string
  kind: string // 신입 · 인턴 · 경력 · 기타
  location: string
  deadline: string // YYYY-MM-DD, 모르면 빈 값
  url: string
  source: string
  summary: string
  matchScore: number // 0~100
  matchReason: string
  foundAt: number
  status: JobStatus
  projectId: ID
  /** 저장한 공고 (사이드바 [저장된 공고]에 모인다) */
  saved: boolean
  /** 공고 페이지를 마지막으로 직접 열어 확인한 때 */
  checkedAt?: number
  /** 마감됐거나 접수 중인지 확인되지 않아 맞춤 공고에서 뺀 공고 (다시 찾아도 다시 넣지 않는다) */
  closed?: boolean
}

export interface JobQuery {
  keywords: string
  career: string // 신입 · 인턴 · 경력 무관
  region: string
  count: number
}

export interface AppData {
  version: 1
  profile: Profile
  specs: SpecItem[]
  experiences: Experience[]
  projects: Project[]
  jobs: JobPosting[]
  jobQuery: JobQuery
}
