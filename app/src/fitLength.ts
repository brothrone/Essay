import { desktop, type AiProvider } from './desktop'
import { fitPrompt, lengthGoal, parseAiAnswer } from './prompts'
import type { Question } from './types'
import { countChars } from './utils'

/**
 * 글자수 범위(제한의 88~100%)에서 얼마나 벗어났는지. 0 이면 범위 안.
 * 넘친 것은 모자란 것보다 3배 무겁게 본다 (제출할 때 넘치면 아예 못 낸다).
 * overOnly 면 넘친 것만 본다 (대화에서 "더 짧게"처럼 일부러 줄인 경우)
 */
export function lengthMiss(text: string, q: Pick<Question, 'limit' | 'countMode'>, overOnly = false) {
  const g = lengthGoal(q)
  if (!g) return 0
  const n = countChars(text, q.countMode)
  if (n > g.max) return (n - g.max) * 3
  const floor = Math.round(g.max * 0.88)
  return !overOnly && n < floor ? floor - n : 0
}

/**
 * AI 가 쓴 답변이 글자수 범위를 벗어나면 앱이 직접 세어 보고 최대 2번 더 맞춰 달라고 한다.
 * AI 는 글자수를 잘 못 세서 요청문만으로는 자주 넘치거나 모자라기 때문.
 * 가장 범위에 가까운 답을 돌려준다 (멈추면 그때까지 가장 나은 것)
 */
export async function fitToLimit(
  text: string,
  q: Question,
  opts: { provider: AiProvider; model?: string; overOnly?: boolean; onFixing?: (round: number) => void },
) {
  let best = text
  let extraSeconds = 0
  let extraTokens = 0
  for (let round = 1; round <= 2 && lengthMiss(best, q, opts.overOnly) > 0; round++) {
    opts.onFixing?.(round)
    const r = await desktop.ai.run(fitPrompt(q, best, true), opts.model || undefined, { provider: opts.provider })
    if (!r.ok) break
    extraSeconds += r.seconds
    extraTokens += r.usage ? r.usage.input + r.usage.output : 0
    const candidate = parseAiAnswer(r.text).answer.trim()
    if (candidate && lengthMiss(candidate, q, opts.overOnly) < lengthMiss(best, q, opts.overOnly)) best = candidate
  }
  return { text: best, extraSeconds, extraTokens }
}
