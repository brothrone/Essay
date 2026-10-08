import { COMPETENCY_TAGS, EXPERIENCE_TYPES } from './constants'
import { parseAiJson } from './prompts'
import { CATEGORY_MAP, SPEC_CATEGORIES } from './specConfig'
import { newExperience, newProject, newQuestion, newSpec } from './store'
import type { AppData, Experience, Project, SpecCategory, SpecItem } from './types'
import { similarity } from './utils'

/** 예전 자소서 한 편(또는 한 조각)에서 뽑아낼 것 */
export interface Extracted {
  profile: { targetJob: string; skills: string }
  specs: { category: SpecCategory; data: Record<string, string> }[]
  experiences: Partial<Experience>[]
  projects: { company: string; position: string; year: string; questions: { prompt: string; answer: string; limit: number | null }[] }[]
}

/** Antigravity CLI 는 요청문을 명령줄 인자로 넘겨서(약 3만 자 한도) 긴 자소서는 조각내서 보낸다 */
export const CHUNK_CHARS = 16000

export function splitForAi(text: string): string[] {
  const t = text.trim()
  if (t.length <= CHUNK_CHARS) return [t]
  const out: string[] = []
  let rest = t
  while (rest.length > CHUNK_CHARS) {
    // 문단 경계에서 자른다
    let cut = rest.lastIndexOf('\n\n', CHUNK_CHARS)
    if (cut < CHUNK_CHARS * 0.5) cut = rest.lastIndexOf('\n', CHUNK_CHARS)
    if (cut < CHUNK_CHARS * 0.5) cut = CHUNK_CHARS
    out.push(rest.slice(0, cut))
    rest = rest.slice(cut)
  }
  if (rest.trim()) out.push(rest)
  return out
}

const fieldList = SPEC_CATEGORIES.map((c) => `  - ${c.key} (${c.label}): ${c.fields.map((f) => f.key).join(', ')}`).join('\n')

export function extractPrompt(docName: string, text: string, part: { index: number; total: number }) {
  return `아래는 지원자가 예전에 쓴 자기소개서(또는 이력서) 원문입니다${part.total > 1 ? ` (${part.index + 1}/${part.total} 조각)` : ''}. 파일 이름: ${docName}
여기서 지원자의 **경험, 스펙(학력·어학·자격증·수상·경력·대외활동·교육), 희망 직무·보유 스킬, 그리고 자소서 문항과 답변**을 구조화해 주세요.

[원칙]
- 원문에 있는 사실만 쓰고 지어내지 마세요. 모르는 값은 빈 문자열("")로 두세요.
- 날짜는 YYYY-MM-DD 또는 YYYY-MM 형식. 연도만 알면 "YYYY-01" 처럼 쓰지 말고 알 수 있는 만큼만.
- 경험은 자소서 답변 속 에피소드 하나하나를 STAR(상황·과제·행동·결과)로 나눠 정리하세요. 같은 경험이 여러 문항에 나오면 하나로 합치세요.
- 경험 type 은 다음 중 하나: ${EXPERIENCE_TYPES.join(' | ')}
- 경험 tags 는 다음 중에서 1~3개: ${COMPETENCY_TAGS.join(', ')}
- 스펙 category 와 data 의 키는 아래 목록만 쓰세요(값은 문자열):
${fieldList}
- projects 는 자소서 한 편 = 지원 회사 하나. 문항(prompt)과 답변(answer)을 원문 그대로 옮기고, 글자수 제한이 적혀 있으면 limit(숫자), 없으면 null. 회사명·직무를 모르면 파일 이름에서 유추하되 확실치 않으면 빈 문자열.

[출력 형식]
<json>
{"profile":{"targetJob":"희망 직무(쉼표 구분)","skills":"보유 스킬(쉼표 구분)"},"specs":[{"category":"education","data":{"school":"","degree":"","major":"","status":"","start":"","end":"","gpa":"","gpaMax":""}}],"experiences":[{"title":"","type":"","org":"","role":"","start":"YYYY-MM","end":"YYYY-MM","summary":"한 줄 요약","situation":"","task":"","action":"","result":"","learned":"","tags":[]}],"projects":[{"company":"","position":"","year":"YYYY","questions":[{"prompt":"","answer":"","limit":null}]}]}
</json>
<json> 밖에는 아무것도 쓰지 마세요.

[원문]
${text}`
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export function parseExtracted(text: string): Extracted | null {
  const raw = parseAiJson<Record<string, unknown>>(text)
  if (!isObj(raw)) return null
  const profile = isObj(raw.profile) ? raw.profile : {}
  const specs = (Array.isArray(raw.specs) ? raw.specs : [])
    .filter(isObj)
    .filter((s) => typeof s.category === 'string' && s.category in CATEGORY_MAP)
    .map((s) => {
      const allowed = new Set(CATEGORY_MAP[s.category as SpecCategory].fields.map((f) => f.key))
      const data = Object.fromEntries(
        Object.entries(isObj(s.data) ? s.data : {})
          .filter(([k, v]) => allowed.has(k) && str(v))
          .map(([k, v]) => [k, str(v)]),
      )
      return { category: s.category as SpecCategory, data }
    })
    .filter((s) => Object.keys(s.data).length > 0)
  const experiences = (Array.isArray(raw.experiences) ? raw.experiences : []).filter(isObj).map((e) => ({
    title: str(e.title),
    type: EXPERIENCE_TYPES.includes(str(e.type)) ? str(e.type) : '기타',
    org: str(e.org),
    role: str(e.role),
    start: str(e.start).slice(0, 7),
    end: str(e.end).slice(0, 7),
    summary: str(e.summary),
    situation: str(e.situation),
    task: str(e.task),
    action: str(e.action),
    result: str(e.result),
    learned: str(e.learned),
    tags: (Array.isArray(e.tags) ? e.tags : []).map(str).filter((t) => COMPETENCY_TAGS.includes(t)).slice(0, 3),
  }))
  const projects = (Array.isArray(raw.projects) ? raw.projects : []).filter(isObj).map((p) => ({
    company: str(p.company),
    position: str(p.position),
    year: str(p.year),
    questions: (Array.isArray(p.questions) ? p.questions : [])
      .filter(isObj)
      .map((q) => ({ prompt: str(q.prompt), answer: str(q.answer), limit: typeof q.limit === 'number' && q.limit > 0 ? Math.round(q.limit) : null }))
      .filter((q) => q.prompt || q.answer),
  }))
  return { profile: { targetJob: str(profile.targetJob), skills: str(profile.skills) }, specs, experiences, projects }
}

/** 여러 조각·여러 파일에서 나온 결과를 합치고, 이미 있는 데이터와 겹치는 것은 뺀다 */
export interface MergePlan {
  profile: Partial<{ targetJob: string; skills: string }>
  specs: SpecItem[]
  experiences: Experience[]
  projects: Project[]
  skipped: { experiences: number; specs: number; projects: number }
}

const specTitle = (s: { category: SpecCategory; data: Record<string, string> }) => CATEGORY_MAP[s.category].title(s.data).toLowerCase()
const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase()

export function planMerge(data: AppData, parts: Extracted[]): MergePlan {
  const plan: MergePlan = { profile: {}, specs: [], experiences: [], projects: [], skipped: { experiences: 0, specs: 0, projects: 0 } }

  // 기본 정보는 비어 있을 때만 채운다
  const targetJob = parts.map((p) => p.profile.targetJob).find(Boolean)
  const skills = [...new Set(parts.flatMap((p) => p.profile.skills.split(/[,·/]/).map((s) => s.trim()).filter(Boolean)))].join(', ')
  if (targetJob && !data.profile.targetJob) plan.profile.targetJob = targetJob
  if (skills && !data.profile.skills) plan.profile.skills = skills

  const seenSpec = new Set(data.specs.map(specTitle))
  for (const s of parts.flatMap((p) => p.specs)) {
    const key = `${s.category}:${specTitle(s)}`
    if (!specTitle(s) || seenSpec.has(specTitle(s)) || seenSpec.has(key)) {
      plan.skipped.specs++
      continue
    }
    seenSpec.add(specTitle(s))
    seenSpec.add(key)
    plan.specs.push({ ...newSpec(s.category), data: s.data })
  }

  const existingExp = data.experiences.map((e) => `${e.title} ${e.summary}`)
  for (const e of parts.flatMap((p) => p.experiences)) {
    if (!e.title && !e.summary && !e.action) continue
    const text = `${e.title} ${e.summary}`
    const dup = [...existingExp, ...plan.experiences.map((x) => `${x.title} ${x.summary}`)].some((t) => similarity(t, text) >= 0.6)
    if (dup) {
      plan.skipped.experiences++
      continue
    }
    plan.experiences.push({ ...newExperience(), ...e, title: e.title || e.summary?.slice(0, 30) || '제목 없는 경험', tags: e.tags ?? [] })
  }

  const existingProj = new Set(data.projects.map((p) => norm(`${p.company}|${p.position}`)))
  for (const p of parts.flatMap((x) => x.projects)) {
    if (!p.questions.length) continue
    const key = norm(`${p.company}|${p.position}`)
    if (key !== '|' && existingProj.has(key)) {
      plan.skipped.projects++
      continue
    }
    existingProj.add(key)
    plan.projects.push(
      newProject({
        company: p.company || '(회사 미확인)',
        position: p.position,
        status: 'submitted',
        notes: p.year ? `${p.year}년 지원 · 예전 자소서에서 가져옴` : '예전 자소서에서 가져옴',
        questions: p.questions.map((q) => newQuestion({ prompt: q.prompt, answer: q.answer, limit: q.limit, done: !!q.answer })),
        openedAt: 0,
      }),
    )
  }
  return plan
}

/** 가져온 학력·직무로 맞춤 공고 검색 조건을 만든다 */
export function suggestJobQuery(data: AppData, plan: MergePlan) {
  const edu = [...plan.specs, ...data.specs].find((s) => s.category === 'education')
  const major = edu?.data.major || ''
  const targetJob = plan.profile.targetJob || data.profile.targetJob
  const skills = (plan.profile.skills || data.profile.skills || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3)
  const keywords = [...new Set([targetJob, major, ...skills].filter(Boolean))].join(', ')
  const status = edu?.data.status || ''
  const hasCareer = [...plan.specs, ...data.specs].some((s) => s.category === 'career' && s.data.type === '정규직')
  const career = hasCareer ? '경력 무관' : /재학|휴학/.test(status) ? '신입·인턴' : '신입'
  return { keywords, career, region: data.jobQuery.region, count: data.jobQuery.count || 8 }
}
