import { COUNT_MODE_LABEL } from './constants'
import { experienceToText } from './format'
import { SPEC_CATEGORIES, sortSpecs } from './specConfig'
import type { AppData, Experience, Project, Question } from './types'
import { countChars } from './utils'

/** 채팅 AI에 붙여넣을 요청문. 연락처·주소 같은 개인정보는 넣지 않는다 */

const NO_FAKE = '- 위 자료에 없는 사실, 수치, 회사 정보는 지어내지 마세요. 꼭 필요하면 (확인 필요)라고 표시해 주세요.'
const COUNT_LINE = '- 결과 뒤에 공백 포함 글자수를 적어 주세요.'

/** 앱이 결과를 바로 받아 쓸 때: 본문과 설명을 태그로 나눠 받는다 */
const DIRECT_FORMAT = `[출력 형식]
<answer>
(답변 본문만. 문항 원문, 머리말, 글자수 표시는 넣지 마세요)
</answer>
<note>
(왜 이렇게 구성했는지 3줄 이내)
</note>
이 두 태그 밖에는 아무것도 쓰지 마세요.`

export function parseAiAnswer(text: string) {
  const pick = (tag: string) => text.match(new RegExp(`<${tag}>\\s*([\\s\\S]*?)\\s*</${tag}>`))?.[1].trim()
  return { answer: pick('answer') ?? text.trim(), note: pick('note') ?? '' }
}

function specSummary({ profile, specs }: AppData) {
  const lines: string[] = []
  if (profile.targetJob) lines.push(`희망 직무: ${profile.targetJob}`)
  if (profile.skills) lines.push(`보유 스킬: ${profile.skills}`)
  for (const cat of SPEC_CATEGORIES) {
    const items = sortSpecs(specs.filter((s) => s.category === cat.key))
    if (!items.length) continue
    const text = items.map(({ data }) => [cat.title(data), cat.meta(data)].filter(Boolean).join(' / ')).join('; ')
    lines.push(`${cat.label}: ${text}`)
  }
  return lines.join('\n') || '(등록된 스펙 없음)'
}

function context(data: AppData, project: Project, q: Question, exps: Experience[]) {
  const limit = q.limit ? `${q.limit}${q.countMode === 'byte' ? 'byte' : '자'} (${COUNT_MODE_LABEL[q.countMode]})` : '제한 없음'
  return `[지원 정보]
회사: ${project.company || '(미정)'}
직무: ${project.position || '(미정)'}
${project.notes.trim() ? `공고 메모:\n${project.notes.trim()}\n` : ''}
[문항]
${q.prompt || '(문항 미입력)'}
글자수 제한: ${limit}
${q.memo.trim() ? `\n[내 메모]\n${q.memo.trim()}\n` : ''}
[이 문항에 쓸 내 경험]
${exps.length ? exps.map((e, i) => `(${i + 1}) ${experienceToText(e)}`).join('\n\n') : '(연결된 경험 없음 — 아래 스펙에서 적절한 소재를 골라 주세요)'}

[내 스펙 요약]
${specSummary(data)}`
}

export function draftPrompt(data: AppData, project: Project, q: Question, exps: Experience[], direct = false) {
  const target = q.limit ? `글자수 제한의 90~100% 분량으로 맞춰 주세요.` : '700~1000자 정도로 써 주세요.'
  return `아래 자료만 사용해서 자기소개서 문항의 답변 초안을 써 주세요.

${context(data, project, q, exps)}

[작성 방식]
- 첫 줄에 [소제목]을 달아 주세요.
- 두괄식으로, 경험은 상황 → 내 행동 → 결과 → 배운 점과 직무 연결 순서로 써 주세요.
- ${target}
${direct ? '' : '- 초안 뒤에 왜 이렇게 구성했는지 3줄로 설명해 주세요.\n'}
[지켜야 할 것]
${NO_FAKE}
${direct ? DIRECT_FORMAT : COUNT_LINE}`
}

export function feedbackPrompt(data: AppData, project: Project, q: Question, exps: Experience[]) {
  return `당신은 ${project.company || '지원 회사'}의 인사 담당자입니다. 아래 자기소개서 답변을 평가하고 고칠 점을 알려 주세요.

${context(data, project, q, exps)}

[현재 답변] (${countChars(q.answer, 'with')}자, 공백 포함)
${q.answer || '(아직 비어 있음)'}

[평가해 줄 것]
1. 문항 의도에 맞게 답했는지
2. 자료에 근거가 없거나 과장된 표현
3. 구체성이 부족한 문장 (어떻게 바꾸면 좋은지 예시와 함께)
4. 글자수 제한과 분량
5. 가장 먼저 고칠 3가지

[지켜야 할 것]
${NO_FAKE}
- 마크다운 표는 쓰지 말고 번호 목록으로 간결하게 써 주세요.`
}

export function fitPrompt(q: Question, text = q.answer, direct = false) {
  const current = countChars(text, q.countMode)
  const unit = q.countMode === 'byte' ? 'byte' : '자'
  const goal = q.limit
    ? `${q.limit}${unit} 이하 (${COUNT_MODE_LABEL[q.countMode]}, 목표 ${Math.round(q.limit * 0.9)}~${Math.round(q.limit * 0.98)}${unit})`
    : `지금과 비슷한 분량`
  return `아래 자기소개서 답변을 내용과 말투는 유지하면서 ${goal}로 다듬어 주세요. 현재 ${current}${unit}입니다.
- 첫 줄의 [소제목]은 유지해 주세요.
- 핵심 경험과 수치는 남기고, 중복 표현과 군더더기를 먼저 줄여 주세요.
- 새로운 사실은 넣지 마세요.
${direct ? '' : COUNT_LINE}

[문항]
${q.prompt}

[현재 답변]
${text || '(아직 비어 있음)'}
${direct ? `\n${DIRECT_FORMAT}` : ''}`
}

/** 앞서 받은 피드백을 반영해 다시 쓰기 (앱에서 바로 실행할 때) */
export function revisePrompt(data: AppData, project: Project, q: Question, exps: Experience[], feedback: string) {
  const goal = q.limit ? `글자수 제한(${q.limit}${q.countMode === 'byte' ? 'byte' : '자'})의 90~98% 분량` : '지금과 비슷한 분량'
  return `아래 피드백을 반영해 자기소개서 답변을 고쳐 주세요.

${context(data, project, q, exps)}

[현재 답변]
${q.answer}

[받은 피드백]
${feedback}

[고쳐 쓰는 방식]
- 첫 줄의 [소제목]은 유지하거나 더 좋게 바꿔 주세요.
- ${goal}으로 맞춰 주세요.

[지켜야 할 것]
${NO_FAKE}
${DIRECT_FORMAT}`
}

/* ---------- 웹: 맞춤 공고 찾기 · 공고 읽기 ---------- */

/** 응답의 <json>…</json>(또는 코드 블록)에서 JSON을 꺼낸다 */
export function parseAiJson<T>(text: string): T | null {
  const tagged = text.match(/<json>\s*([\s\S]*?)\s*<\/json>/)?.[1]
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1]
  const raw = (tagged ?? fenced ?? text).trim()
  try {
    return JSON.parse(raw) as T
  } catch {
    const start = raw.search(/[[{]/)
    const end = Math.max(raw.lastIndexOf(']'), raw.lastIndexOf('}'))
    if (start < 0 || end <= start) return null
    try {
      return JSON.parse(raw.slice(start, end + 1)) as T
    } catch {
      return null
    }
  }
}

/** 지원자 요약 (이름·연락처 없이 매칭에 필요한 것만) */
function candidateSummary(data: AppData) {
  const exps = data.experiences
    .slice(0, 15)
    .map((e) => `- ${e.title}${e.tags.length ? ` [${e.tags.join(', ')}]` : ''}${e.summary ? `: ${e.summary}` : ''}`)
    .join('\n')
  return `${specSummary(data)}\n주요 경험:\n${exps || '- (없음)'}`
}

export function jobSearchPrompt(
  data: AppData,
  query: { keywords: string; career: string; region: string; count: number },
  today: string,
) {
  const known = data.jobs
    .slice(0, 40)
    .map((j) => `- ${j.company} / ${j.title}`)
    .join('\n')
  return `오늘은 ${today}입니다. 한국 채용 공고 중에서 아래 지원자에게 맞고 지금 접수 중인 공고를 웹에서 찾아 주세요.

[찾는 조건]
- 키워드: ${query.keywords || '(지원자 요약에서 판단)'}
- 경력 구분: ${query.career || '무관'}
- 지역: ${query.region || '무관'}

[지원자 요약]
${candidateSummary(data)}

[이미 알고 있는 공고 — 다시 넣지 마세요]
${known || '- (없음)'}

[찾는 방법]
- WebSearch로 사람인, 잡코리아, 원티드, 잡알리오(공공기관), 기업 채용 홈페이지 등을 검색하세요.
- 마감일이나 자격 요건을 확인해야 하면 WebFetch로 공고 페이지를 열어 확인하세요.
- 마감일이 오늘보다 이전이거나 마감된 공고는 넣지 마세요.
- 여러 회사를 고르게 담고, 한 회사의 공고는 최대 2개까지만 넣으세요.
- 마감일을 확인한 공고를 우선하고, 상시 채용이면 deadline을 빈 문자열로 두세요.
- 지원자와 잘 맞는 순서로 최대 ${query.count}개를 고르세요.
- 확인하지 못한 값은 빈 문자열로 두고, 지어내지 마세요. url은 실제로 찾은 공고 주소만 쓰세요.

[출력 형식]
<json>
[{"company":"회사명","title":"공고 제목 또는 직무","kind":"신입|인턴|경력|기타","location":"근무지","deadline":"YYYY-MM-DD 또는 빈 문자열","url":"공고 원문 주소","source":"사람인 등 출처","summary":"주요 업무·자격 요건 1~2문장","matchScore":0,"matchReason":"지원자의 어떤 경험·스펙과 맞는지 1문장"}]
</json>
matchScore는 0~100 정수입니다. <json> 밖에는 아무것도 쓰지 마세요.`
}

export interface PostingInfo {
  company: string
  position: string
  deadline: string
  deadlineTime: string
  isOpen: boolean | null
  notes: string
  questions: { prompt: string; limit: number | null }[]
  questionsSource: string // 문항을 어디서 확인했는지 (공고 페이지가 아니면 사이트명 · 연도)
}

/** AI 응답(JSON)을 PostingInfo로 정리. 형식이 아니면 null */
export function parsePosting(text: string): PostingInfo | null {
  const raw = parseAiJson<Partial<PostingInfo>>(text)
  if (!raw || typeof raw !== 'object') return null
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  return {
    company: str(raw.company),
    position: str(raw.position),
    deadline: /^\d{4}-\d{2}-\d{2}$/.test(str(raw.deadline)) ? str(raw.deadline) : '',
    deadlineTime: /^\d{2}:\d{2}$/.test(str(raw.deadlineTime)) ? str(raw.deadlineTime) : '',
    isOpen: typeof raw.isOpen === 'boolean' ? raw.isOpen : null,
    notes: str(raw.notes),
    questions: (Array.isArray(raw.questions) ? raw.questions : [])
      .filter((q) => q && str(q.prompt))
      .map((q) => ({ prompt: str(q.prompt), limit: typeof q.limit === 'number' && q.limit > 0 ? q.limit : null })),
    questionsSource: str(raw.questionsSource),
  }
}

export function postingPrompt(url: string, today: string) {
  return `오늘은 ${today}입니다. 아래 채용 공고 페이지를 WebFetch로 열어 내용을 정리해 주세요.
페이지가 열리지 않거나 내용이 부족하면 WebSearch로 같은 공고를 찾아 확인해도 됩니다.

URL: ${url}

[자기소개서 문항]
- 공고 페이지에 자기소개서 문항이 있으면 그대로 옮기고 questionsSource는 "공고 페이지"로 적으세요.
- 페이지에 문항이 없으면 WebSearch로 "{회사명} {직무/전형} 자기소개서 문항", "{회사명} 자소서 항목 {연도}" 등을 검색해 같은 회사·같은 전형의 문항을 찾아 넣으세요. 자소설닷컴, 링커리어, 캐치, 잡코리아 합격자소서 페이지에 자주 있습니다.
- 찾은 문항이 이번 공고 것인지 확실하지 않으면(지난 기수 등) questionsSource에 "사이트명 · 연도/기수 (이번 공고와 다를 수 있음)"처럼 적으세요.
- 끝내 못 찾으면 questions는 빈 배열, questionsSource는 빈 문자열입니다. 문항을 지어내지 마세요.

[출력 형식]
<json>
{"company":"회사명","position":"지원 직무","deadline":"YYYY-MM-DD 또는 빈 문자열","deadlineTime":"HH:mm 또는 빈 문자열","isOpen":true,"notes":"주요 업무, 자격 요건, 우대 사항, 전형 절차, 근무 조건을 항목별로 정리한 글(줄바꿈 포함)","questions":[{"prompt":"자기소개서 문항","limit":700}],"questionsSource":"공고 페이지"}
</json>
- isOpen: 지금 접수 중이면 true, 마감됐으면 false, 알 수 없으면 null
- 페이지에서 확인되지 않은 값은 빈 값 또는 null로 두고 지어내지 마세요. limit은 글자수 제한(숫자), 없으면 null.
<json> 밖에는 아무것도 쓰지 마세요.`
}
