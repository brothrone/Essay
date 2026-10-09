import { COUNT_MODE_LABEL } from './constants'
import { experienceToText } from './format'
import { SPEC_CATEGORIES, sortSpecs } from './specConfig'
import type { AppData, Experience, Project, Question } from './types'
import { countChars } from './utils'

/* 자소서에 최적화한 AI 요청문.
   원칙(취준 커뮤니티에서 검증된 방법): 역할(인사담당자·채용 컨설턴트) + 맥락(공고·경험·스펙) + 조건(글자수·톤·금지 표현) + 출력 형식.
   초안은 '문항 의도 → 핵심 메시지 → 구성 → 작성' 순서로 생각하게 하고, 두괄식·수치·클리셰 금지를 강제한다.
   연락처·주소 같은 개인정보는 넣지 않는다. */

const NO_FAKE = '- 위 자료에 없는 사실, 수치, 회사 정보는 지어내지 마세요. 꼭 필요하면 (확인 필요)라고 표시해 주세요.'
const COUNT_LINE = '- 결과 뒤에 공백 포함 글자수를 적어 주세요.'

/** 인사담당자가 "AI가 썼다"고 느끼는 상투어. 초안·퇴고 모두에서 금지 */
export const CLICHES = ['함께 성장', '적극적으로 기여', '열정을 가지고', '시너지', '최선을 다해', '밑거름', '귀사', '글로벌 인재', '끊임없이 노력', '소통과 협업']

const STYLE_RULES = `[문체 규칙]
- 첫 문장은 결론(핵심 메시지)으로 시작하는 두괄식. 문항의 질문에 바로 답하세요.
- 추상적인 표현 대신 구체적인 상황·행동·수치로 쓰세요. "노력했다" 대신 "3주간 120명을 설문해"처럼.
- 다음 상투어는 쓰지 마세요: ${CLICHES.join(', ')}.
- 번역투·수동태("~되어졌다", "~에 의해")를 피하고 자연스러운 한국어 능동문으로 쓰세요.
- 한 문장에 핵심 하나. 한 문단에 메시지 하나. 문장은 60자 안팎으로 끊으세요.
- 겸손하되 성과는 분명히. 회사 칭찬보다 내가 무엇을 했고 무엇을 할 수 있는지에 집중하세요.`

/** 앱이 결과를 바로 받아 쓸 때: 본문과 설명을 태그로 나눠 받는다 */
const DIRECT_FORMAT = `[출력 형식]
<answer>
(답변 본문만. 문항 원문, 머리말, 글자수 표시는 넣지 마세요)
</answer>
<note>
(이 문항의 의도를 어떻게 읽었고, 왜 이 경험·구성을 골랐는지 3줄 이내. 자료가 부족해 (확인 필요)로 둔 곳이 있으면 알려 주세요)
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

/** 공고 메모에서 'AI 분석' 블록의 키워드 줄을 꺼낸다 (제출 전 검사·요청문에서 씀) */
export function postingKeywords(notes: string): string[] {
  const m = notes.match(/^\s*(?:자소서 반영 )?키워드\s*[:：]\s*(.+)$/m)
  if (!m) return []
  return m[1]
    .split(/[,،·]/)
    .map((s) => s.trim().replace(/^[-•]\s*/, ''))
    .filter((s) => s && s.length <= 20)
    .slice(0, 12)
}

function context(data: AppData, project: Project, q: Question, exps: Experience[]) {
  const limit = q.limit ? `${q.limit}${q.countMode === 'byte' ? 'byte' : '자'} (${COUNT_MODE_LABEL[q.countMode]})` : '제한 없음'
  const keywords = postingKeywords(project.notes)
  return `[지원 정보]
회사: ${project.company || '(미정)'}
직무: ${project.position || '(미정)'}
${project.notes.trim() ? `공고 메모(인재상·자격요건·우대사항·공고 분석):\n${project.notes.trim()}\n` : ''}${keywords.length ? `공고에서 뽑은 반영 키워드: ${keywords.join(', ')}\n` : ''}${project.personal?.trim() ? `\n[지원자가 직접 적은 상황 · 지원 동기 — 사실로 보고 자연스럽게 반영하되 그대로 옮겨 적지 말 것]\n${project.personal.trim()}\n` : ''}
[문항]
${q.prompt || '(문항 미입력)'}
글자수 제한: ${limit}
${q.memo.trim() ? `\n[내 메모 · 넣고 싶은 소재]\n${q.memo.trim()}\n` : ''}
[이 문항에 쓸 내 경험 (STAR)]
${exps.length ? exps.map((e, i) => `(${i + 1}) ${experienceToText(e)}`).join('\n\n') : '(연결된 경험 없음 — 아래 스펙에서 적절한 소재를 골라 주세요)'}

[내 스펙 요약]
${specSummary(data)}`
}

const persona = (project: Project) =>
  `당신은 ${project.company || '지원 회사'} ${project.position ? `${project.position} 직무` : ''} 채용을 10년 넘게 담당한 인사담당자이자 취업 컨설턴트입니다. 수천 장의 자기소개서를 읽어 봤고, 어떤 글이 서류를 통과하고 어떤 글이 AI가 쓴 티가 나서 걸러지는지 압니다.`

export function draftPrompt(data: AppData, project: Project, q: Question, exps: Experience[], direct = false) {
  const target = q.limit ? lengthRule(q) : '700~1000자 정도로 써 주세요.'
  return `${persona(project)}
아래 자료만 사용해서 자기소개서 문항의 답변 초안을 써 주세요. 지원자가 자기 말투로 다듬어 제출할 초안입니다.

${context(data, project, q, exps)}

[쓰기 전에 생각할 것 — 결과에는 쓰지 말고 반영만 하세요]
1. 문항 의도: 이 질문으로 회사가 확인하려는 역량·태도가 무엇인지 한 줄로 정리.
2. 핵심 메시지: 그 의도에 맞는 "나는 ~한 사람이다"를 한 문장으로.
3. 소재 선택: 연결된 경험 중 의도에 가장 맞는 것을 고르고, 공고 키워드·인재상과 자연스럽게 잇기(억지로 키워드를 나열하지 말 것).
4. 구성: 첫 줄 [소제목](핵심 메시지를 담은 12자 안팎) → 결론 한 문장 → 상황·과제 → 내 행동(가장 길게, 구체적으로) → 결과(수치) → 배운 점과 직무 연결 → 입사 후 어떻게 쓸지.

[작성 조건]
- ${target}
${STYLE_RULES.replace('[문체 규칙]\n', '')}
${direct ? '' : '- 초안 뒤에 문항 의도를 어떻게 읽었고 왜 이렇게 구성했는지 3줄로 설명해 주세요.\n'}
[지켜야 할 것]
${NO_FAKE}
- 경험에 수치가 없으면 지어내지 말고 "(확인 필요: 구체적 수치)"처럼 지원자가 채울 자리를 남기세요.
${direct ? DIRECT_FORMAT : COUNT_LINE}`
}

export function feedbackPrompt(data: AppData, project: Project, q: Question, exps: Experience[]) {
  return `${persona(project)} 아래 자기소개서 답변을 서류 심사 기준으로 평가하고 고칠 점을 알려 주세요.

${context(data, project, q, exps)}

[현재 답변] (${countChars(q.answer, 'with')}자, 공백 포함)
${q.answer || '(아직 비어 있음)'}

[평가 형식 — 번호 목록으로, 마크다운 표는 쓰지 마세요]
1. 점수: 100점 만점 점수와 한 줄 근거. (문항 의도 부합 30 · 구체성과 수치 25 · 직무·공고 연관성 20 · 구성과 가독성 15 · 진정성(AI 티 없음) 10)
2. 문항 의도: 이 문항이 묻는 역량이 무엇이고, 답변이 그 질문에 정면으로 답하고 있는지.
3. 고쳐야 할 문장: 추상적이거나 근거 없는 문장을 그대로 인용하고 → 어떻게 바꿀지 예시 문장으로. 최대 5개.
4. AI 티·상투어: ${CLICHES.slice(0, 5).join(', ')} 같은 표현, 번역투·수동태, 어디서나 쓸 수 있는 문장을 짚어 주세요.
5. 공고 연관성: 공고 메모·키워드 중 답변에 반영된 것과 빠진 것.
6. 첫 문장 대안 3개: 결론으로 시작하는 두괄식 문장으로.
7. 가장 먼저 고칠 3가지: 효과가 큰 순서로.

[지켜야 할 것]
${NO_FAKE}
- 지원자의 개성과 진정성은 유지하는 방향으로 제안하세요. 글을 통째로 다시 써 주지 말고 고칠 점만 알려 주세요.`
}

/**
 * 글자수 목표: 제한의 90~100% (공백 포함 · 제외 · 바이트 기준 그대로).
 * AI 는 글자수를 잘 못 세므로 범위를 숫자로 주고, 한국어 한 문장 길이로 문장 수를 어림해 준다
 */
export function lengthGoal(q: Pick<Question, 'limit' | 'countMode'>) {
  if (!q.limit) return null
  const unit = q.countMode === 'byte' ? 'byte' : '자'
  const perSentence = q.countMode === 'byte' ? 100 : q.countMode === 'without' ? 40 : 50
  return {
    min: Math.round(q.limit * 0.9),
    max: q.limit,
    unit,
    perSentence,
    sentences: Math.max(3, Math.round(q.limit / perSentence)),
    label: COUNT_MODE_LABEL[q.countMode],
  }
}

/** 초안 · 고쳐 쓰기 · 대화에 넣는 분량 규칙 한 줄 */
function lengthRule(q: Question) {
  const g = lengthGoal(q)
  if (!g) return ''
  return `분량은 ${g.label} 기준 ${g.min.toLocaleString()}~${g.max.toLocaleString()}${g.unit}입니다. ${g.max.toLocaleString()}${g.unit}을 절대 넘기지 마세요. 한국어 한 문장은 보통 ${g.perSentence}${g.unit} 안팎이라 약 ${g.sentences}문장 분량입니다. 다 쓴 뒤 직접 세어 보고 범위를 벗어나면 고쳐서 내세요.`
}

export function fitPrompt(q: Question, text = q.answer, direct = false) {
  const current = countChars(text, q.countMode)
  const g = lengthGoal(q)
  const unit = g?.unit ?? (q.countMode === 'byte' ? 'byte' : '자')
  // 목표 가운데(95%)까지 얼마나 줄이거나 늘려야 하는지 숫자로 알려 준다
  const center = g ? Math.round(g.max * 0.95) : current
  const diff = center - current
  const goal = g
    ? `${g.label} 기준 ${g.min.toLocaleString()}~${g.max.toLocaleString()}${unit}(${g.max.toLocaleString()}${unit} 초과 금지)`
    : '지금과 비슷한 분량'
  const move =
    g && Math.abs(diff) > 15
      ? ` 목표까지 약 ${Math.abs(diff).toLocaleString()}${unit}를 ${diff < 0 ? '줄여' : '늘려'} 주세요 — 한 문장이 보통 ${g.perSentence}${unit} 안팎이니 문장 약 ${Math.max(1, Math.round(Math.abs(diff) / g.perSentence))}개 분량입니다.`
      : ''
  return `당신은 자기소개서 퇴고 전문 컨설턴트입니다. 아래 답변을 내용과 말투는 유지하면서 ${goal}로 다듬어 주세요. 현재 ${current.toLocaleString()}${unit}입니다.${move}
- 다 고친 뒤 직접 세어 보고 범위를 벗어나면 한 번 더 고쳐서 내세요.
- 첫 줄의 [소제목]과 두괄식 첫 문장은 유지해 주세요.
- 핵심 경험과 수치는 남기고, 중복 표현·군더더기·상투어(${CLICHES.slice(0, 4).join(', ')} 등)를 먼저 줄이세요.
- 줄여야 하면 '배경 설명'부터, 늘려야 하면 '내 행동의 구체적 과정'을 자료 안에서 보강하세요.
- 새로운 사실은 넣지 마세요. 번역투·수동태는 능동문으로 고치세요.
${direct ? '' : COUNT_LINE}

[문항]
${q.prompt}

[현재 답변]
${text || '(아직 비어 있음)'}
${direct ? `\n${DIRECT_FORMAT}` : ''}`
}

/** AI 대화 요청문의 최대 길이. 윈도우에서 Antigravity CLI 는 요청문을 명령 인자로 받아 3만 자를 넘기면 실행되지 않는다 */
const CHAT_BUDGET = 24000

/**
 * AI 와 대화하며 답변 고치기. 지금 답변 · 공고 · 경험에 지난 대화(길이 안에서 최근 것부터)를 붙여 보낸다.
 * 답변을 고쳐 달라는 말이면 <answer> 에 고친 전체 답변, 아니면 <reply> 만.
 */
export function chatPrompt(
  data: AppData,
  project: Project,
  q: Question,
  exps: Experience[],
  history: { role: 'user' | 'ai'; text: string; answer?: string; applied?: boolean }[],
  message: string,
) {
  const unit = q.countMode === 'byte' ? 'byte' : '자'
  const goal = q.limit
    ? `지원자가 분량을 따로 말하지 않으면 이 범위로 맞추세요. ${lengthRule(q)}`
    : '지원자가 분량을 따로 말하지 않으면 지금과 비슷한 분량으로 쓰세요'
  const head = `${persona(project)}
지금 지원자와 대화하며 아래 문항의 자기소개서 답변을 함께 다듬고 있습니다. 지원자의 마지막 말에 답하세요.

${context(data, project, q, exps)}

[지금 답변] (${countChars(q.answer, q.countMode).toLocaleString()}${unit}${q.limit ? ` / 제한 ${q.limit.toLocaleString()}${unit}` : ''})
${q.answer.trim() || '(아직 비어 있음)'}
`
  const tail = `
[지원자의 말]
${message.trim().slice(0, 4000)}

[답하는 방식]
- 답변을 새로 쓰거나 고쳐 달라는 말이면, 고친 답변 전체를 <answer> 안에 넣고 <reply> 에는 무엇을 왜 바꿨는지 2~3문장으로만 적으세요.
- 질문하거나 의견을 물으면 <reply> 에만 짧게(5문장 안팎) 답하고 <answer> 는 쓰지 마세요.
- 지원자가 대화에서 새로 알려 준 경험 · 수치는 사실로 보고 써도 됩니다.
- 고친 답변의 분량: ${goal}
- 지원자의 말투와 경험은 살리세요.
${STYLE_RULES}

[지켜야 할 것]
${NO_FAKE}
- 마크다운 표나 제목(#)은 쓰지 말고 평범한 문장으로 답하세요.

[출력 형식]
<reply>
(지원자에게 하는 말)
</reply>
<answer>
(고친 답변 전체 — 고칠 때만. 문항 원문 · 글자수 표시는 넣지 마세요)
</answer>
이 태그 밖에는 아무것도 쓰지 마세요.`

  // 지난 대화: 최근 것부터 길이 안에서. 가장 최근에 제안했는데 아직 적용하지 않은 답변은 전문을 함께 넣는다 ("방금 그거에서 …" 같은 말을 알아듣게)
  const lastProposal = [...history].reverse().find((m) => m.role === 'ai' && m.answer)
  const lines: string[] = []
  let room = CHAT_BUDGET - head.length - tail.length - 200
  for (let i = history.length - 1; i >= 0 && room > 0; i--) {
    const m = history[i]
    let line =
      m.role === 'user'
        ? `지원자: ${m.text.trim().slice(0, 1500)}`
        : `나: ${m.text.trim().slice(0, 1500)}${
            m.answer
              ? m === lastProposal && !m.applied
                ? `\n(이때 제안한 고친 답변 — 아직 적용 안 함)\n${m.answer.slice(0, 3000)}`
                : `\n(고친 답변을 제안함${m.applied ? ' — 지원자가 적용해 지금 답변이 됨' : ''})`
              : ''
          }`
    if (line.length > room) {
      if (lines.length) break
      line = line.slice(0, Math.max(0, room))
    }
    lines.unshift(line)
    room -= line.length + 1
  }
  return `${head}
[지금까지 나눈 대화] (오래된 것부터)
${lines.length ? lines.join('\n') : '(처음 대화)'}
${tail}`
}

/** AI 대화 응답에서 말과 고친 답변을 나눈다. 태그가 없으면 전체를 말로 본다 */
export function parseChatReply(text: string) {
  const pick = (tag: string) => text.match(new RegExp(`<${tag}>\\s*([\\s\\S]*?)\\s*</${tag}>`))?.[1].trim()
  const answer = pick('answer') ?? ''
  const reply =
    pick('reply') ??
    text
      .replace(/<answer>[\s\S]*?(<\/answer>|$)/, '')
      .replace(/<\/?reply>/g, '')
      .trim()
  return { reply: reply || (answer ? '고친 답변이에요.' : ''), answer }
}

/** 앞서 받은 피드백을 반영해 다시 쓰기 (앱에서 바로 실행할 때) */
export function revisePrompt(data: AppData, project: Project, q: Question, exps: Experience[], feedback: string) {
  const goal = q.limit ? lengthRule(q) : '지금과 비슷한 분량으로 맞춰 주세요.'
  return `${persona(project)} 아래 피드백을 반영해 자기소개서 답변을 고쳐 주세요. 지원자의 경험과 말투는 살리고, 피드백이 짚은 곳만 정확히 고치세요.

${context(data, project, q, exps)}

[현재 답변]
${q.answer}

[받은 피드백]
${feedback}

[고쳐 쓰는 방식]
- 피드백의 '가장 먼저 고칠 3가지'와 '고쳐야 할 문장'을 우선 반영하세요.
- 첫 줄의 [소제목]은 유지하거나 더 좋게 바꾸고, 첫 문장은 결론으로 시작하세요.
- ${goal}
${STYLE_RULES.replace('[문체 규칙]\n', '')}

[지켜야 할 것]
${NO_FAKE}
${DIRECT_FORMAT}`
}

/** 이 답변으로 면접에서 나올 꼬리질문과 답변 방향 */
export function interviewPrompt(data: AppData, project: Project, q: Question, exps: Experience[]) {
  return `당신은 ${project.company || '지원 회사'} ${project.position || ''} 직무의 면접관입니다. 아래 자기소개서 답변을 읽고 면접에서 실제로 던질 꼬리질문을 만들어 주세요.

${context(data, project, q, exps)}

[자소서 답변]
${q.answer || '(아직 비어 있음)'}

[출력 — 번호 목록, 마크다운 표 금지]
- 꼬리질문 5개. 답변의 수치·결정·역할처럼 사실 확인이 필요한 곳과, "왜 그렇게 했는가"를 묻는 질문을 섞어 주세요.
- 각 질문 아래에 "답변 방향:" 한 줄 — 자료에 있는 경험으로 어떻게 답하면 좋은지. 자료에 없으면 "(준비 필요: ...)"로 표시.
- 마지막에 "답변에서 면접관이 의심할 만한 곳 1~2개"를 짚어 주세요.
${NO_FAKE}`
}

/** 스펙 비교: 공고 요건과 내 스펙 · 경험을 견줘 충족 · 부족과 보완 방법, 자소서에서 강조할 강점을 짚는다 */
export function specGapPrompt(data: AppData, project: Project) {
  const exps = data.experiences
    .slice(0, 20)
    .map((e) => `- ${e.title}${e.tags.length ? ` [${e.tags.join(', ')}]` : ''}${e.summary ? `: ${e.summary}` : ''}`)
    .join('\n')
  return `당신은 ${project.company || '지원 회사'} ${project.position || ''} 직무 채용 담당자입니다. 아래 공고 요건과 지원자의 스펙 · 경험을 견줘 주세요.

[지원 정보]
회사: ${project.company || '(미정)'}
직무: ${project.position || '(미정)'}
${project.notes.trim() ? `공고 메모(자격 요건 · 우대 사항 · 공고 분석):\n${project.notes.trim()}` : '공고 메모: (없음 — 이 회사 · 직무의 일반적인 요건으로 판단하고, 그렇다고 밝혀 주세요)'}
${project.personal?.trim() ? `\n[지원자가 직접 적은 상황]\n${project.personal.trim()}\n` : ''}
[내 스펙]
${specSummary(data)}

[내 경험 목록]
${exps || '- (없음)'}

[출력 — 번호 목록, 마크다운 표 금지, 짧게]
1. 요건별 비교: 공고의 자격 요건 · 우대 사항을 하나씩 "요건 → 내가 가진 것 → 충족 / 일부 / 부족"으로.
2. 부족한 점 보완 방법: 지원 전 · 면접 전에 할 수 있는 것 2~3개 (자격증 시험 일정처럼 구체적으로).
3. 자소서에서 강조할 강점 3개: 어떤 경험을 어느 문항에 쓰면 좋은지까지.
4. 서류에서 걸릴 수 있는 위험 1~2개와 대응 문장 방향.
${NO_FAKE}`
}

/* ---------- 웹: 맞춤 공고 찾기 · 공고 읽기 · 회사로 찾기 ---------- */

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
  provider: 'claude' | 'gemini' | 'gpt' = 'claude',
) {
  // Gemini(agy)의 검색 결과에는 공고 주소가 보이지 않아, 공고 페이지를 열어 봐야 실제 주소를 알 수 있다.
  // Claude · GPT 의 검색 결과에는 주소가 함께 나오므로 페이지를 열 필요가 없다 (앱이 따로 열어 확인한다)
  const career = query.career || '신입'
  const region = query.region ? ` ${query.region}` : ''
  // 검색어 모양도 엔진마다 다르게: Gemini 는 공고 주소 안 검색(site:)이 잘 되고, Claude 는 사이트 이름을 넣은 평범한 검색이 잘 된다
  const searchRule =
    provider === 'gemini'
      ? [
          '- 공고 한 건의 페이지가 바로 나오도록 채용 사이트의 공고 주소 안에서 검색하세요. 키워드는 한 번에 하나씩, 중요한 것부터:',
          `  · site:saramin.co.kr/zf_user/jobs/relay/view {키워드 하나} ${career}${region}`,
          `  · site:jobkorea.co.kr/Recruit/GI_Read {키워드 하나} ${career}${region}`,
          '  키워드 여러 개를 OR 로 묶거나 따옴표를 여러 개 섞은 긴 검색어는 결과가 거의 안 나오니 쓰지 마세요. 사람인과 잡코리아를 번갈아 검색하세요.',
        ].join('\n')
      : [
          `- 검색어는 "{키워드 하나} ${career} 채용 사람인", "{키워드 하나} ${career} 채용 잡코리아"처럼 키워드 하나와 채용 사이트 이름을 넣어 짧게 쓰세요${region ? ` (지역 "${query.region}"도 넣기)` : ''}. 키워드마다 한 번씩, 4~5번 검색하세요.`,
          '- site: · OR · 따옴표를 섞은 검색어는 결과가 거의 안 나오니 쓰지 마세요.',
        ].join('\n')
  const pageRule =
    provider === 'gemini'
      ? `- 공고 페이지는 꼭 필요할 때만 WebFetch로 여세요(최대 2번). 앱이 후보 공고 페이지를 하나씩 직접 열어 접수 중인지 · 마감일을 확인합니다.
- 검색은 최대 5번입니다. 끝나면 바로 답하세요.`
      : `- 공고 페이지는 열지 마세요(WebFetch 쓰지 않기). 앱이 후보 공고 페이지를 하나씩 직접 열어 접수 중인지 · 마감일을 확인합니다. 검색 결과에 보이는 정보만으로 후보를 고르세요.
- 검색은 최대 5번입니다. 끝나면 바로 답하세요.`
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
${searchRule}
- 검색 한 번에 나온 공고 중 조건에 맞는 것은 여러 개를 함께 후보로 담으세요. 공고 주소(url)는 검색 결과에 나온 주소를 그대로 쓰세요.
${pageRule}
- 뉴스 기사 · 블로그 · 카페 · 커뮤니티 글은 공고가 아닙니다. 그런 글에서 알게 된 공고는 사람인 · 잡코리아 · 원티드 · 기업 채용 페이지의 공고 주소를 찾았을 때만 넣으세요.

[넣는 기준]
- 지금 접수 중으로 보이는 공고만 후보로 넣으세요: 마감일이 오늘(${today}) 이후이거나, ${today.slice(0, 4)}년에 올라온 상시 채용 공고.
- 마감일이 지났거나, '마감' · '접수 마감' · '채용 종료' 표시가 보이거나, 작년 이전 공고로 보이면 넣지 마세요.
- 경력 구분 · 지역 · 직무가 조건과 맞지 않으면 넣지 마세요.
- 회사명을 확인하지 못한 공고(회사명을 가린 목록 · 헤드헌팅 익명 공고 등)는 넣지 마세요.
- url에는 그 공고로 가는 검색 결과 링크를 그대로 넣으세요. vertexaisearch.cloud.google.com/grounding-api-redirect/… 같은 중간 주소도 괜찮습니다. 사이트 첫 화면이나 채용 메인 주소(https://www.saramin.co.kr 등)밖에 없는 공고는 넣지 마세요.
- 후보는 최대 ${query.count + 4}개까지 넣으세요. 앱이 공고 페이지를 하나씩 직접 열어 마감 여부를 다시 확인하고, 확실한 것만 ${query.count}개 이하로 추립니다. 조건에 맞는 후보가 적으면 적은 대로 넣고, 개수를 채우려고 조건에 안 맞는 공고를 넣지 마세요.
- 여러 회사를 고르게 담고, 한 회사의 공고는 최대 2개까지만 넣으세요. 마감일을 모르면 deadline을 빈 문자열로 두세요.
- 지원자와 잘 맞는 순서로 고르고, matchReason에는 지원자의 어떤 경험·스펙이 공고의 어떤 요건과 맞는지 구체적으로 쓰세요.
- 확인하지 못한 값은 빈 문자열로 두고, 지어내지 마세요.

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
  url: string // 회사·직무로 찾았을 때 실제 공고 주소
}

/** AI 응답(JSON)을 PostingInfo로 정리. 형식이 아니면 null */
export function parsePosting(text: string): PostingInfo | null {
  const raw = parseAiJson<Partial<PostingInfo> & { analysis?: Record<string, unknown> }>(text)
  if (!raw || typeof raw !== 'object') return null
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const strs = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : [])
  let notes = str(raw.notes)
  // 공고 분석(핵심 역량·키워드·인재상)을 메모 끝에 정해진 형식으로 붙여 둔다 → 초안·검사에서 다시 읽는다
  const a = raw.analysis && typeof raw.analysis === 'object' ? raw.analysis : null
  if (a) {
    const comps = strs(a.competencies)
    const keys = strs(a.keywords)
    const talent = str(a.idealTalent)
    const block = [
      '[AI 공고 분석]',
      comps.length && `핵심 역량: ${comps.join(' / ')}`,
      keys.length && `키워드: ${keys.join(', ')}`,
      talent && `인재상 한 줄: ${talent}`,
    ]
      .filter(Boolean)
      .join('\n')
    if (block.includes('\n')) notes = notes ? `${notes}\n\n${block}` : block
  }
  const qs = (v: unknown) =>
    (Array.isArray(v) ? (v as { prompt?: unknown; limit?: unknown }[]) : [])
      .filter((q) => q && str(q.prompt))
      .map((q) => ({ prompt: str(q.prompt), limit: typeof q.limit === 'number' && q.limit > 0 ? q.limit : null }))
  const questions = qs(raw.questions)
  return {
    company: str(raw.company),
    position: str(raw.position),
    deadline: /^\d{4}-\d{2}-\d{2}$/.test(str(raw.deadline)) ? str(raw.deadline) : '',
    deadlineTime: /^\d{2}:\d{2}$/.test(str(raw.deadlineTime)) ? str(raw.deadlineTime) : '',
    isOpen: typeof raw.isOpen === 'boolean' ? raw.isOpen : null,
    notes,
    questions,
    questionsSource: str(raw.questionsSource),
    url: /^https?:\/\/\S+$/i.test(str(raw.url)) ? str(raw.url) : '',
  }
}

const POSTING_OUTPUT = `[시간 제한]
- 검색(WebSearch)은 최대 3번, 페이지 읽기(WebFetch)는 최대 3번입니다. 그 안에 못 찾은 값은 빈 값으로 두고 바로 결과를 내세요. 완벽보다 빠른 답이 낫습니다.

[자기소개서 문항 — 가장 중요]
- 공고 페이지에 자기소개서 문항이 있으면 한 글자도 바꾸지 말고 그대로 옮기고 questionsSource는 "공고 페이지"로 적으세요. 글자수 제한이 함께 있으면 limit에 숫자로 넣으세요.
- 페이지에 문항이 없으면 WebSearch 1~2번으로 "{회사명} {직무/전형} 자기소개서 문항 {연도}"를 검색하세요. 검색 결과 요약에 문항이 보이면 페이지를 열지 말고 그대로 쓰세요. 자소설닷컴, 링커리어, 캐치, 잡코리아 합격자소서에 자주 있습니다.
- 찾은 문항이 이번 공고 것인지 확실하지 않으면(지난 기수 등) questionsSource에 "사이트명 · 연도/기수 (이번 공고와 다를 수 있음)"처럼 적으세요.
- 끝내 못 찾으면 questions는 빈 배열, questionsSource는 빈 문자열입니다. 문항을 지어내지 마세요.

[공고 분석 — analysis]
- competencies: 공고 문장을 근거로 뽑은 핵심 역량 Top 3 (각각 "역량 (근거 문장 요약)" 형태, 20자 안팎)
- keywords: 자소서에 녹이면 좋은 키워드 8~10개 (공고에 실제로 쓰인 단어 위주, 각 10자 이내)
- idealTalent: 이 회사·직무가 원하는 사람을 한 줄로

[출력 형식]
<json>
{"company":"회사명","position":"지원 직무","url":"공고 원문 주소","deadline":"YYYY-MM-DD 또는 빈 문자열","deadlineTime":"HH:mm 또는 빈 문자열","isOpen":true,"notes":"주요 업무, 자격 요건, 우대 사항, 전형 절차, 근무 조건을 항목별로 짧게 정리한 글(줄바꿈 포함, 1000자 이내)","questions":[{"prompt":"자기소개서 문항","limit":700}],"questionsSource":"공고 페이지","analysis":{"competencies":["..."],"keywords":["..."],"idealTalent":"..."}}
</json>
- isOpen: 지금 접수 중이면 true, 마감됐으면 false, 알 수 없으면 null
- 페이지에서 확인되지 않은 값은 빈 값 또는 null로 두고 지어내지 마세요. limit은 글자수 제한(숫자), 없으면 null.
<json> 밖에는 아무것도 쓰지 마세요.`

/** 공고 내용 붙여넣기: 로그인해야 보이는 공고처럼 링크로 읽을 수 없을 때, 복사한 본문을 정리한다 */
export function postingTextPrompt(text: string, today: string) {
  // 웹을 쓰지 않는 작업이라 검색 · 페이지 읽기 규칙은 빼고, 분석 · 출력 형식만 그대로 쓴다
  const output = POSTING_OUTPUT.slice(POSTING_OUTPUT.indexOf('[공고 분석 — analysis]'))
  return `오늘은 ${today}입니다. 아래는 지원자가 채용 사이트에서 복사해 붙여넣은 공고 본문입니다. 이 본문만 보고 정리해 주세요. 웹 검색이나 페이지 열기는 하지 마세요.

[붙여넣은 공고 본문]
${text.slice(0, 15000)}

[자기소개서 문항 — 가장 중요]
- 본문에 자기소개서 문항이 있으면 한 글자도 바꾸지 말고 그대로 옮기고 questionsSource는 "공고 페이지"로 적으세요. 글자수 제한이 함께 있으면 limit에 숫자로 넣으세요.
- 본문에 문항이 없으면 questions는 빈 배열, questionsSource는 빈 문자열입니다. 문항을 지어내지 마세요.
- url은 본문에 공고 주소가 있을 때만 적고, 없으면 빈 문자열로 두세요.

${output}`
}

export function postingPrompt(url: string, today: string) {
  return `오늘은 ${today}입니다. 아래 채용 공고 페이지를 WebFetch로 한 번 열어 내용을 정리해 주세요.
페이지가 열리지 않거나(로그인 · 빈 화면) 내용이 부족할 때만 WebSearch로 같은 공고를 찾으세요.

URL: ${url}

${POSTING_OUTPUT}`
}

/** 공고 링크 없이 회사·직무만 알 때: 지금 진행 중인 공고와 자소서 문항을 웹에서 찾는다 */
export function companyLookupPrompt(company: string, position: string, today: string) {
  return `오늘은 ${today}입니다. "${company}" ${position ? `${position} 직무` : ''} 채용 정보를 웹에서 찾아 정리해 주세요.

[찾는 순서]
1. WebSearch 한 번으로 "${company} ${position || ''} 채용 공고 ${today.slice(0, 4)}"를 검색해 지금 접수 중인 공고(회사 채용 홈페이지, 사람인, 잡코리아, 원티드, 잡알리오)를 찾고, 찾으면 WebFetch로 열어 마감일·자격 요건·전형 절차를 확인하세요. url에 그 주소를 적으세요.
2. 접수 중인 공고가 없으면 가장 최근 공고를 기준으로 정리하고 isOpen은 false, 아예 못 찾으면 null로 두세요.
3. 자기소개서 문항은 아래 규칙대로 찾으세요.

${POSTING_OUTPUT}`
}
