import { createContext, useContext } from 'react'
import { STATUS_ORDER } from './constants'
import { desktop } from './desktop'
import { CATEGORY_MAP } from './specConfig'
import type {
  AppData,
  CountMode,
  Experience,
  ID,
  JobPosting,
  JobQuery,
  JobStatus,
  Profile,
  Project,
  ProjectStatus,
  Question,
  SpecCategory,
  SpecItem,
} from './types'
import { uid } from './utils'

export type SaveState = 'saved' | 'saving' | 'error'

export interface Actions {
  setProfile: (patch: Partial<Profile>) => void
  saveSpec: (item: SpecItem) => void
  deleteSpec: (id: ID) => void
  saveExperience: (exp: Experience) => void
  deleteExperience: (id: ID) => void
  addProject: (project: Project) => void
  updateProject: (id: ID, fn: (p: Project) => Project) => void
  touchProject: (id: ID) => void
  deleteProject: (id: ID) => void
  replaceAll: (data: AppData) => void
  mergeJobs: (found: JobPosting[], query: JobQuery) => void
  updateJob: (id: ID, patch: Partial<JobPosting>) => void
  setJobQuery: (patch: Partial<JobQuery>) => void
}

export interface Store extends Actions {
  data: AppData
  saveState: SaveState
}

export const StoreContext = createContext<Store | null>(null)

export function useStore() {
  const store = useContext(StoreContext)
  if (!store) throw new Error('StoreProvider가 필요해요')
  return store
}

/* ---------- 생성 헬퍼 ---------- */

export const emptyProfile = (): Profile => ({
  name: '',
  email: '',
  phone: '',
  birth: '',
  address: '',
  targetJob: '',
  links: '',
  skills: '',
})

export const emptyJobQuery = (): JobQuery => ({ keywords: '', career: '신입', region: '', count: 8 })

export const emptyData = (): AppData => ({
  version: 1,
  profile: emptyProfile(),
  specs: [],
  experiences: [],
  projects: [],
  jobs: [],
  jobQuery: emptyJobQuery(),
})

/**
 * 같은 공고인지: 주소가 같거나(주소가 없으면) 회사·제목이 같으면 같은 공고.
 * 사람인(?rec_idx=…)처럼 물음표 뒤가 공고 번호인 사이트가 있어서 주소 뒤쪽은 지우지 않고,
 * 추적용 값(utm_* · t_* · view_type 등)만 빼고 순서를 맞춰 비교한다.
 */
export function jobKey(j: Pick<JobPosting, 'url' | 'company' | 'title'>) {
  let key = ''
  try {
    const u = new URL(j.url.trim())
    const params = [...u.searchParams]
      .filter(([k]) => !/^(utm_|t_|view_type$|ref$|src$|gclid$|fbclid$|recommend_ids$|location$)/i.test(k))
      .sort(([a], [b]) => a.localeCompare(b))
    key = (
      u.host.replace(/^www\./, '') +
      u.pathname.replace(/\/+$/, '') +
      (params.length ? '?' + params.map(([k, v]) => `${k}=${v}`).join('&') : '')
    ).toLowerCase()
  } catch {
    /* 주소가 아니면 회사 · 제목으로 */
  }
  return key || `${j.company}|${j.title}`.replace(/\s+/g, '').toLowerCase()
}

export const isEmptyData = (d: AppData) =>
  !d.specs.length && !d.experiences.length && !d.projects.length && !Object.values(d.profile).some(Boolean)

export function newSpec(category: SpecCategory): SpecItem {
  const now = Date.now()
  return { id: uid(), category, data: {}, createdAt: now, updatedAt: now }
}

export function newExperience(): Experience {
  const now = Date.now()
  return {
    id: uid(),
    title: '',
    type: '프로젝트',
    org: '',
    role: '',
    start: '',
    end: '',
    summary: '',
    situation: '',
    task: '',
    action: '',
    result: '',
    learned: '',
    tags: [],
    createdAt: now,
    updatedAt: now,
  }
}

export function newQuestion(init: Partial<Question> = {}): Question {
  return {
    id: uid(),
    prompt: '',
    limit: null,
    countMode: 'with',
    answer: '',
    memo: '',
    experienceIds: [],
    done: false,
    ...init,
  }
}

export function newProject(init: Partial<Project> = {}): Project {
  const now = Date.now()
  return {
    id: uid(),
    company: '',
    position: '',
    jobUrl: '',
    deadline: '',
    deadlineTime: '',
    status: 'writing',
    notes: '',
    questions: [newQuestion()],
    createdAt: now,
    updatedAt: now,
    openedAt: now,
    ...init,
  }
}

/* ---------- 불러오기 · 검증 ---------- */

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
const objs = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter(isObj) : [])
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [])
const COUNT_MODES: CountMode[] = ['with', 'without', 'byte']

/** 저장된 값이나 백업 파일을 앱 데이터 형태로 정리 (빠진 필드는 기본값) */
export function normalize(raw: unknown): AppData {
  if (!isObj(raw) || !Array.isArray(raw.projects)) throw new Error('Essay 백업 파일이 아니에요')
  const now = Date.now()

  const profile = emptyProfile()
  const rawProfile = isObj(raw.profile) ? raw.profile : {}
  for (const k of Object.keys(profile) as (keyof Profile)[]) profile[k] = str(rawProfile[k])

  const specs: SpecItem[] = objs(raw.specs)
    .filter((s) => typeof s.category === 'string' && s.category in CATEGORY_MAP)
    .map((s) => ({
      id: str(s.id) || uid(),
      category: s.category as SpecCategory,
      data: Object.fromEntries(
        Object.entries(isObj(s.data) ? s.data : {}).filter(([, v]) => typeof v === 'string'),
      ) as Record<string, string>,
      createdAt: num(s.createdAt, now),
      updatedAt: num(s.updatedAt, now),
    }))

  const experiences: Experience[] = objs(raw.experiences).map((e) => {
    const base = newExperience()
    return {
      ...base,
      id: str(e.id) || base.id,
      title: str(e.title),
      type: str(e.type) || base.type,
      org: str(e.org),
      role: str(e.role),
      start: str(e.start),
      end: str(e.end),
      summary: str(e.summary),
      situation: str(e.situation),
      task: str(e.task),
      action: str(e.action),
      result: str(e.result),
      learned: str(e.learned),
      tags: strs(e.tags),
      createdAt: num(e.createdAt, now),
      updatedAt: num(e.updatedAt, now),
    }
  })

  const projects: Project[] = objs(raw.projects).map((p) => ({
    id: str(p.id) || uid(),
    company: str(p.company),
    position: str(p.position),
    jobUrl: str(p.jobUrl),
    deadline: str(p.deadline),
    deadlineTime: str(p.deadlineTime),
    status: STATUS_ORDER.includes(p.status as ProjectStatus) ? (p.status as ProjectStatus) : 'writing',
    notes: str(p.notes),
    questions: objs(p.questions).map((q) => ({
      id: str(q.id) || uid(),
      prompt: str(q.prompt),
      limit: typeof q.limit === 'number' && q.limit > 0 ? q.limit : null,
      countMode: COUNT_MODES.includes(q.countMode as CountMode) ? (q.countMode as CountMode) : 'with',
      answer: str(q.answer),
      memo: str(q.memo),
      experienceIds: strs(q.experienceIds),
      done: q.done === true,
    })),
    createdAt: num(p.createdAt, now),
    updatedAt: num(p.updatedAt, now),
    openedAt: num(p.openedAt, 0),
  }))

  const JOB_STATUSES: JobStatus[] = ['new', 'hidden', 'started']
  const jobs: JobPosting[] = objs(raw.jobs).map((j) => ({
    id: str(j.id) || uid(),
    company: str(j.company),
    title: str(j.title),
    kind: str(j.kind),
    location: str(j.location),
    deadline: str(j.deadline),
    url: str(j.url),
    source: str(j.source),
    summary: str(j.summary),
    matchScore: Math.max(0, Math.min(100, num(j.matchScore, 0))),
    matchReason: str(j.matchReason),
    foundAt: num(j.foundAt, now),
    // 예전 버전의 'saved' 상태는 '새 공고 + 저장됨'으로 옮긴다
    status: JOB_STATUSES.includes(j.status as JobStatus) ? (j.status as JobStatus) : 'new',
    projectId: str(j.projectId),
    saved: j.saved === true || j.status === 'saved',
  }))
  const q = isObj(raw.jobQuery) ? raw.jobQuery : {}
  const jobQuery: JobQuery = {
    ...emptyJobQuery(),
    keywords: str(q.keywords),
    career: str(q.career) || '신입',
    region: str(q.region),
    count: num(q.count, 8),
  }

  return { version: 1, profile, specs, experiences, projects, jobs, jobQuery }
}

/** 문서\Essay\Essay-데이터.json 을 읽어 온다 (없거나 깨졌으면 빈 데이터) */
export function loadData(): AppData {
  try {
    const raw = desktop.loadData()
    return raw ? normalize(JSON.parse(raw)) : emptyData()
  } catch {
    return emptyData()
  }
}
