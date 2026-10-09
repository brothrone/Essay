import { desktop, type AiProvider, type AiResult } from './desktop'
import { isGroundingUrl, isPostingUrl } from './format'
import { companyLookupPrompt, postingPrompt } from './prompts'
import { noteAiResult } from './useAiStatus'
import { savedAiProvider } from './useAiTask'
import { toDateInput } from './utils'

/** 구글 중간 주소면 실제 공고 주소로 바꾼다. 못 바꾸면 빈 문자열 */
export async function realPostingUrl(url: string) {
  const u = url.trim()
  if (!isGroundingUrl(u)) return u
  try {
    return (await desktop.ai.resolveUrls([u]))[0] || ''
  } catch {
    return ''
  }
}

/**
 * 공고를 어떻게 읽을지 정한다.
 * - 공고 한 건을 가리키는 주소: 그 페이지를 읽는다 (가장 빠르고 정확)
 * - 사이트 첫 화면이거나 주소가 없으면: 회사명 · 공고 제목으로 공고를 찾아 읽는다
 */
export async function postingRequest(url: string, company: string, position: string) {
  const today = toDateInput(new Date())
  const real = await realPostingUrl(url)
  if (isPostingUrl(real)) return { url: real, kind: 'link' as const, prompt: postingPrompt(real, today) }
  return { url: '', kind: 'company' as const, prompt: companyLookupPrompt(company, position, today) }
}

/**
 * 웹 작업(공고 찾기 · 공고 읽기)은 글쓰기보다 '빨리 정확하게 옮겨 적기'가 중요해서 빠른 모델로 돌린다.
 * - Claude: Sonnet (Max 요금제의 기본 Opus 는 웹 작업에서 몇 배 느리다)
 * - Gemini(agy): 기본 모델이 이미 Flash 라 따로 지정하지 않는다
 * - GPT(Codex): 요금제마다 쓸 수 있는 모델이 달라 기본 모델 그대로, 대신 웹 작업은 생각을 짧게 한다(main.cjs)
 */
export function webModel(provider: AiProvider) {
  return provider === 'claude' ? 'sonnet' : ''
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * 웹 작업 하나를 실행한다. 다른 AI 작업이 돌고 있으면(앱은 한 번에 하나만 실행) 끝날 때까지 기다렸다가 시작한다.
 * - onState('waiting' | 'running'): 화면에 '기다리는 중' / '읽는 중'을 보여 주기 위함
 * - stopped(): true 를 돌려주면 기다리기를 그만두고 취소로 끝낸다
 */
export async function runWebTask(
  prompt: string,
  {
    onState,
    stopped,
    web = true,
  }: { onState?: (s: 'waiting' | 'running') => void; stopped?: () => boolean; web?: boolean } = {},
): Promise<AiResult> {
  const provider = savedAiProvider()
  for (;;) {
    if (stopped?.()) return { ok: false, error: '취소했어요', cancelled: true }
    onState?.('running')
    // 웹을 안 쓰는 정리 작업(붙여넣은 공고)도 빠른 모델로 충분하다
    const r = await desktop.ai.run(prompt, webModel(provider) || undefined, { web, provider })
    if (!r.ok && r.code === 'busy') {
      onState?.('waiting')
      await sleep(2500)
      continue
    }
    noteAiResult(provider, r)
    return r
  }
}
