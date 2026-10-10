import { CLICHES, postingKeywords } from './prompts'
import type { AppData, Project, Question } from './types'
import { similarity } from './utils'

/** '한빛전자 (예시)' · 'Cultural Vistas · WEST' → 앞부분 회사 이름만 */
export function coreCompanyName(company: string) {
  return company
    .replace(/\(.*?\)/g, '')
    .split(/[·|/]/)[0]
    .trim()
}

export interface AnswerWarning {
  kind: 'company' | 'similar' | 'check' | 'keywords' | 'cliche' | 'lead'
  /** warn = 제출 전에 꼭 볼 것, tip = 더 좋게 만드는 힌트 */
  level: 'warn' | 'tip'
  text: string
}

/** 제출 전에 자주 하는 실수와 "더 좋은 자소서" 힌트: 다른 회사 이름, 다른 자소서와 거의 같은 답변, AI가 남긴 확인 표시,
 *  공고 키워드 미반영, 상투어, 두괄식 아님 */
export function answerWarnings(data: AppData, project: Project, q: Question): AnswerWarning[] {
  const text = q.answer
  if (!text.trim()) return []
  const out: AnswerWarning[] = []

  const mine = coreCompanyName(project.company)
  const others = new Set<string>()
  for (const p of data.projects) {
    if (p.id === project.id) continue
    const name = coreCompanyName(p.company)
    if ([...name].length < 2) continue
    if (mine && (mine.includes(name) || name.includes(mine))) continue
    if (text.includes(name)) others.add(name)
  }
  if (others.size)
    out.push({
      kind: 'company',
      level: 'warn',
      text: `다른 회사 이름이 있어요: ${[...others].join(', ')}`,
    })

  if ([...text].length >= 150) {
    let best = { score: 0, company: '', index: 0 }
    for (const p of data.projects) {
      if (p.id === project.id) continue
      p.questions.forEach((o, i) => {
        if ([...o.answer].length < 150) return
        const score = similarity(text, o.answer)
        if (score > best.score) best = { score, company: p.company || '이름 없는 자소서', index: i }
      })
    }
    if (best.score >= 0.55)
      out.push({
        kind: 'similar',
        level: 'warn',
        text: `'${best.company}' ${best.index + 1}번 답변과 ${Math.round(best.score * 100)}% 비슷해요`,
      })
  }

  const marks = text.match(/\(확인 필요[^)]*\)/g)?.length ?? 0
  if (marks) out.push({ kind: 'check', level: 'warn', text: `AI가 몰라서 비워 둔 '(확인 필요)'가 ${marks}군데 있어요` })

  // 공고 분석 키워드가 있으면 답변에 얼마나 녹였는지 (억지 나열이 아니라 '하나도 없음'만 알린다)
  const keywords = postingKeywords(project.notes)
  if (keywords.length >= 3 && [...text].length >= 200) {
    const lower = text.toLowerCase()
    const hit = keywords.filter((k) => lower.includes(k.toLowerCase()))
    if (hit.length === 0)
      out.push({
        kind: 'keywords',
        level: 'tip',
        text: `공고 키워드가 없어요: ${keywords.slice(0, 5).join(', ')}…`,
      })
  }

  const found = CLICHES.filter((c) => text.includes(c))
  if (found.length)
    out.push({
      kind: 'cliche',
      level: 'tip',
      text: `상투어가 있어요: ${found.join(', ')} — 구체적으로 바꿔 보세요`,
    })

  // 두괄식 점검: 첫 문단(소제목 제외)의 첫 문장이 질문·배경 설명으로 시작하면 힌트
  if ([...text].length >= 300) {
    const body = text.replace(/^\s*\[[^\]]{1,30}\]\s*/, '').trim()
    const first = body.split(/(?<=[.!?다요])\s/)[0] ?? ''
    if (/^(저는|나는)?\s*(어릴|어렸|고등학교|대학교|대학 시절|입학|처음)/.test(first) && !/[0-9%]/.test(first))
      out.push({
        kind: 'lead',
        level: 'tip',
        text: '결론을 첫 문장에 써 보세요',
      })
  }

  return out
}
