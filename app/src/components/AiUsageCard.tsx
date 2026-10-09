import { BarChart3, RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { desktop, type AiProvider, type AiUsageSummary, type UsageRow } from '../desktop'
import { HAS_GPT } from '../platform'
import { toast } from '../toast'
import { fmtTokens } from '../utils'

const NAMES: Record<AiProvider, string> = { claude: 'Claude', gemini: 'Gemini', gpt: 'GPT' }
const LIMIT_LINKS: Record<AiProvider, { label: string; url: string }> = {
  claude: { label: 'Claude 사용량 보기', url: 'https://claude.ai/settings/usage' },
  gemini: { label: 'Google AI 요금제 보기', url: 'https://one.google.com/about/ai-premium' },
  gpt: { label: 'Codex 사용량 보기', url: 'https://chatgpt.com/codex/settings/usage' },
}
const tokens = (r: UsageRow | undefined) => (r ? r.input + r.output : 0)

const cell = (r: UsageRow) => (r.runs ? `${r.runs}회 · ${fmtTokens(r.input + r.output)}` : '—')

/** 설정: Essay 가 이 컴퓨터에서 쓴 AI 토큰. 구독 남은 한도는 각 서비스에서만 볼 수 있다 */
export function AiUsageCard() {
  const [u, setU] = useState<AiUsageSummary | null>(null)
  const load = () => desktop.ai.usage().then(setU)
  useEffect(() => {
    load()
  }, [])
  const reset = async () => {
    if (!(await desktop.confirm('AI 사용량 기록을 지울까요?', { detail: '앱에 쌓인 합계만 지워져요. 구독 사용량에는 영향이 없어요.', ok: '지우기' }))) return
    await desktop.ai.usageReset()
    await load()
    toast('사용량 기록을 지웠어요')
  }
  // GPT 는 고를 수 있는 운영체제이거나 쓴 기록이 있을 때만 보인다
  const providers: AiProvider[] = HAS_GPT || (u && u.month.gpt?.runs) ? ['claude', 'gemini', 'gpt'] : ['claude', 'gemini']
  const peak = u ? Math.max(1, ...u.recent.map((d) => tokens(d.claude) + tokens(d.gemini) + tokens(d.gpt))) : 1

  return (
    <section className="card">
      <header className="card-head">
        <h3>
          <BarChart3 size={18} /> AI 사용량
        </h3>
        <span className="muted small">이 컴퓨터에서 Essay가 쓴 것만 · 토큰</span>
      </header>
      {!u ? (
        <p className="muted small">불러오는 중…</p>
      ) : (
        <>
          <table className="usage-table">
            <thead>
              <tr>
                <th />
                <th>오늘</th>
                <th>최근 7일</th>
                <th>최근 30일</th>
              </tr>
            </thead>
            <tbody>
              {providers.map((p) => (
                <tr key={p}>
                  <th>{NAMES[p]}</th>
                  <td>{cell(u.today[p])}</td>
                  <td>{cell(u.week[p])}</td>
                  <td>{cell(u.month[p])}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="usage-bars" aria-label="최근 14일 토큰">
            {u.recent.map((d) => {
              const c = tokens(d.claude)
              const g = tokens(d.gemini)
              const o = tokens(d.gpt)
              return (
                <div
                  key={d.day}
                  className="usage-bar"
                  title={`${d.day} · Claude ${fmtTokens(c)} · Gemini ${fmtTokens(g)}${providers.includes('gpt') ? ` · GPT ${fmtTokens(o)}` : ''}`}
                >
                  {o > 0 && <i className="o" style={{ height: `${(o / peak) * 100}%` }} />}
                  <i className="g" style={{ height: `${(g / peak) * 100}%` }} />
                  <i className="c" style={{ height: `${(c / peak) * 100}%` }} />
                  <span>{Number(d.day.slice(8))}</span>
                </div>
              )
            })}
          </div>
          <p className="muted small usage-legend">
            <i className="c" /> Claude <i className="g" /> Gemini {providers.includes('gpt') && <><i className="o" /> GPT </>}· 입력(요청문 · 검색한 페이지)과 출력(생성한 글)을 합친 토큰이에요. 구독에서 남은 한도는 각 서비스가 정하고 Essay는 알 수 없어요:{' '}
            {providers.map((p) => (
              <a key={p} href={LIMIT_LINKS[p].url} target="_blank" rel="noreferrer" className="link-btn">
                {LIMIT_LINKS[p].label}
              </a>
            ))}
          </p>
          <div className="btn-row">
            <button type="button" className="btn small ghost" onClick={reset}>
              <RotateCcw size={14} /> 기록 지우기
            </button>
          </div>
        </>
      )}
    </section>
  )
}
