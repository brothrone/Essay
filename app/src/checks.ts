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
  kind: 'company' | 'similar' | 'check'
  text: string
}

/** 제출 전에 자주 하는 실수: 다른 회사 이름, 다른 자소서와 거의 같은 답변, AI가 남긴 확인 표시 */
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
      text: `다른 지원처 이름이 들어 있어요: ${[...others].join(', ')} — 다른 자소서에서 옮겨 온 문장인지 확인하세요.`,
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
        text: `'${best.company}' ${best.index + 1}번 답변과 ${Math.round(best.score * 100)}% 비슷해요 — 이 회사·직무에 맞게 바꿨는지 확인하세요.`,
      })
  }

  const marks = text.match(/\(확인 필요\)/g)?.length ?? 0
  if (marks) out.push({ kind: 'check', text: `AI가 표시한 '(확인 필요)'가 ${marks}군데 남아 있어요. 사실을 확인하고 지워 주세요.` })

  return out
}
