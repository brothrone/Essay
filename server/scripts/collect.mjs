#!/usr/bin/env node
// 공고 모으기: 주요 기업의 지금 공고를 공식 채용 페이지에서 읽어(자소서 문항 · 업무 · 자격 · 우대), 직무 · 기업 · 문항 분석까지 만들어
// 서버에 '확인 대기(pending)'로 올린다. 확인 · 공개는 scripts/review.mjs.
// AI 는 이 맥에 로그인된 Gemini CLI(Antigravity CLI · agy, 구독)로 돌린다 (사용자 지시 2026-10-11). --ai claude 로 Claude Code 도 가능.
// 유료 API 키 환경 변수는 지우고 실행한다.
//
// 쓰는 법 (server 폴더에서):
//   node scripts/collect.mjs                       data/companies.json 전부
//   node scripts/collect.mjs --only 삼성전자,LG전자  일부만
//   node scripts/collect.mjs --limit 5              앞에서 5곳만
//   node scripts/collect.mjs --rotate 8             가장 오래전에 모은 8곳만 (예약 실행용, 기록은 .collect/state.json)
//   node scripts/collect.mjs --dry                  서버에 올리지 않고 결과만 .collect/ 에 저장
//   node scripts/collect.mjs --no-insights          공고만
//   ESSAY_API=http://localhost:8787 node scripts/collect.mjs   로컬 서버로
//   node scripts/collect.mjs --ai claude            Claude Code 로 (기본은 agy)
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const flag = (n) => args.includes(n)
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : '')
const API = (process.env.ESSAY_API || 'https://api.essay.win').replace(/\/$/, '')
const VARS = API.startsWith('http://localhost') ? '.dev.vars' : '.prod.vars'
const TOKEN = (/ADMIN_TOKEN=(.+)/.exec(readFileSync(join(ROOT, VARS), 'utf8')) || [])[1]?.trim()
if (!TOKEN && !flag('--dry')) {
  console.error(`server/${VARS} 에 ADMIN_TOKEN 이 없어요`)
  process.exit(1)
}
const today = new Date().toISOString().slice(0, 10)
const season = `${today.slice(0, 4)} ${Number(today.slice(5, 7)) <= 6 ? '상반기' : '하반기'}`
const OUT = join(ROOT, '.collect', today)
mkdirSync(OUT, { recursive: true })

// ---------- AI 실행: 기본 Gemini CLI(agy), --ai claude 면 Claude Code. 둘 다 구독 로그인 · 웹 검색 · 페이지 읽기만
const AI = opt('--ai') || 'agy'
const findBin = (name) =>
  [join(homedir(), '.local/bin', name), `/opt/homebrew/bin/${name}`, `/usr/local/bin/${name}`].find((p) => {
    try {
      return readFileSync(p) && true
    } catch {
      return false
    }
  }) || name
const AI_BIN = findBin(AI === 'claude' ? 'claude' : 'agy')
// agy 가 만지는 작업 폴더는 저장소 밖 임시 폴더로 (파일을 고칠 일이 없지만 혹시 몰라)
const WORK = join(tmpdir(), 'essay-collect')
mkdirSync(WORK, { recursive: true })
function cleanEnv() {
  const env = { ...process.env }
  for (const k of Object.keys(env)) if (/^(ANTHROPIC_|CLAUDE_CODE_USE_|AWS_BEARER|GOOGLE_API_KEY|GEMINI_API_KEY|GOOGLE_GENAI_|OPENAI_|CODEX_API_KEY)/.test(k)) delete env[k]
  return env
}
function spawnText(bin, a, stdin, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(bin, a, { env: cleanEnv(), cwd: WORK, stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs)
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (err += d))
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ out, err, code })
    })
    child.stdin.end(stdin || '')
  })
}
async function runClaude(prompt, { web = true, timeoutMs = 9.5 * 60_000 } = {}) {
  if (AI === 'claude') {
    const tools = web ? 'WebSearch,WebFetch' : ''
    const a = ['-p', '--output-format', 'json', '--model', 'sonnet', '--tools', tools, '--no-session-persistence', '--strict-mcp-config', '--disable-slash-commands']
    if (web) a.push('--allowedTools', tools)
    const { out, err } = await spawnText(AI_BIN, a, prompt, timeoutMs)
    try {
      const j = JSON.parse(out)
      return j.is_error ? { ok: false, error: String(j.result || err).slice(0, 300) } : { ok: true, text: String(j.result || '') }
    } catch {
      return { ok: false, error: (err || out).slice(0, 300) || '결과 없음' }
    }
  }
  // agy: 요청문은 인자로 (맥 20만 자까지). 웹을 쓰는 일만 도구 허용 없이도 되게 권한 묻기를 끈다
  const full = (web ? '' : '[웹 검색 · 페이지 읽기는 하지 마세요]\n') + prompt
  const a = ['-p', full, '--output-format', 'text', '--disable-slash-commands', '--dangerously-skip-permissions', '--effort', 'high', '--print-timeout', `${Math.round(timeoutMs / 1000) - 10}s`]
  const { out, err, code } = await spawnText(AI_BIN, a, '', timeoutMs)
  return out.trim() && code === 0 ? { ok: true, text: out } : { ok: false, error: (err || out).slice(0, 300) || `종료 코드 ${code}` }
}
function jsonIn(text) {
  const m = /<json>([\s\S]*?)<\/json>/.exec(text) || /```(?:json)?\s*([\s\S]*?)```/.exec(text)
  try {
    return JSON.parse((m ? m[1] : text).trim())
  } catch {
    return null
  }
}

// ---------- 요청문
const postingsPrompt = (c) => `오늘은 ${today}입니다. "${c.company}"의 지금 접수 중인 대졸 신입 · 인턴 채용 공고를 찾아 정리해 주세요. 접수 중인 게 없으면 ${season} 공고 중 가장 최근 것.

[찾는 순서 — 검색 4번 · 페이지 읽기 6번 안에서]
1. 회사 공식 채용 홈페이지${c.careers ? `(${c.careers})` : ''}에서 공고를 찾으세요. 사람인 · 잡코리아 · 캐치는 공식 공고 주소와 문항을 찾는 데만 쓰세요.
2. 공고마다 페이지를 열어 자기소개서(에세이) 문항을 확인하세요. 문항은 한 글자도 바꾸지 말고 그대로, 글자수 제한은 숫자로. 공식 공고에 없으면 자소설닷컴 · 잡코리아에 올라온 이번 공고 문항을 찾고 questionsSource 에 그 사이트 이름을 적으세요.
3. 직무가 여러 개면 지원자가 많은 대표 직무 최대 3개까지.

[지켜야 할 것]
- 다른 회사 공고를 절대 섞지 마세요. 회사명이 "${c.company}"(또는 그 계열사 표기)인 공고만.
- 공고 문장을 통째로 옮기지 말고 notes 는 항목별로 짧게 요약: [주요 업무] [자격 요건] [우대 사항] [전형 절차] (800자 이내, 줄바꿈). 확인하지 못한 항목은 줄째 빼세요.
- 확인하지 못한 값은 빈 문자열 · 빈 배열. 지어내지 마세요.

[출력 형식]
<json>
[{"url":"공고 원문 주소(공식 홈페이지 우선)","company":"${c.company}","position":"직무","deadline":"YYYY-MM-DD","deadlineTime":"HH:mm","notes":"…","questions":[{"prompt":"문항 그대로","limit":700}],"questionsSource":"공고 페이지"}]
</json>
찾은 공고가 없으면 <json>[]</json>. <json> 밖에는 아무것도 쓰지 마세요.`

const FORMAT = `[출력 형식]
<json>
{"summary":"한 줄 요약","basis":"무엇을 기준으로 했는지 (예: 2025 사업보고서 · ${season} 공고)","sections":[{"title":"제목","items":["짧은 문장"]},{"title":"제목","text":"두세 문장"},{"title":"제목","table":{"head":["구분","내용"],"rows":[["…","…"]]}}],"sources":[{"title":"출처 이름","url":"https://…"}]}
</json>
- sections 는 4~6개. 한 항목은 한 줄(40자 안팎), 대학생이 바로 읽히게. 마크다운 기호(#, **)는 쓰지 마세요.
- 확인하지 못한 사실 · 수치는 쓰지 마세요. 숫자는 출처와 기준 연도가 있을 때만. 출처(sources)는 실제로 연 페이지만.
- 다른 회사 이야기가 섞이지 않았는지 마지막에 한 번 더 확인하세요.
<json> 밖에는 아무것도 쓰지 마세요.`

const companyPrompt = (company) => `오늘은 ${today}입니다. 취업 준비생이 자소서 · 면접을 준비할 수 있게 "${company}"를 분석해 주세요. 검색 3번 · 페이지 읽기 3번 안에서 회사 공식 홈페이지(회사 소개 · 인재상), 전자공시(DART) 최근 사업보고서, 최근 1년 기사 순으로 확인하세요.

[sections 순서]
1. 무슨 회사인가 (items 3~4: 주요 사업 · 대표 제품/서비스 · 고객)
2. 숫자로 보는 회사 (table: head ["항목","값","기준"], 매출 · 영업이익 · 사업 부문별 비중 — 출처가 확실한 것만, 없으면 이 섹션을 빼기)
3. 최근 1년 이슈 (items 3~4, 앞에 "2026.03"처럼 시기)
4. 인재상 · 핵심 가치 (items, 회사가 공식으로 쓰는 표현 그대로)
5. 자소서 · 면접에 연결할 포인트 (items 3)

${FORMAT}`

const jobPrompt = (p) => `오늘은 ${today}입니다. 아래 공고의 직무를 지원자 입장에서 분석해 주세요. 필요하면 검색 1~2번으로 같은 회사의 직무 소개(채용 홈페이지 · 직무 인터뷰)를 찾으세요.

회사: ${p.company}
직무: ${p.position}
공고 주소: ${p.url}
[공고 요약]
${p.notes}

[sections 순서]
1. 이 직무가 하는 일 (items 3~5, 쉬운 말로)
2. 요구 역량 (table: head ["구분","필수","우대"], 공고에 있는 것만)
3. 이 회사가 원하는 사람 (text 두 문장)
4. 자소서에 녹일 키워드 (items 6~8, 공고에 실제로 쓰인 단어 위주)
5. 면접에서 자주 묻는 것 (items 3)

${FORMAT}`

const questionsPrompt = (p) => `아래 공고의 자기소개서 문항을 하나씩 분석해 주세요. 웹은 쓰지 마세요.

회사: ${p.company} / 직무: ${p.position}
[공고 요약]
${p.notes}

[문항]
${p.questions.map((q, i) => `Q${i + 1}. ${q.prompt}${q.limit ? ` (${q.limit}자)` : ''}`).join('\n')}

[sections] 문항마다 하나씩, title 은 "Q1. 문항 앞부분(20자)…", items 는 4줄:
- "의도: …" / "평가 포인트: …" / "쓸 경험: …"(어떤 경험이 맞는지) / "주의: …"(흔한 실수)
summary 는 문항 전체를 관통하는 키워드 한 줄, sources 는 빈 배열, basis 는 "${season} 공고 문항".

${FORMAT}`

// ---------- 서버
async function admin(path, body) {
  const r = await fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(body) })
  return r.json().catch(() => ({ ok: false, error: `서버 응답 ${r.status}` }))
}

// ---------- 실행
const list = JSON.parse(readFileSync(join(ROOT, 'data/companies.json'), 'utf8')).companies
const only = opt('--only').split(',').map((s) => s.trim()).filter(Boolean)
const STATE = join(ROOT, '.collect', 'state.json')
let state = {}
try {
  state = JSON.parse(readFileSync(STATE, 'utf8'))
} catch {
  /* 처음 */
}
const rotate = Number(opt('--rotate')) || 0
const ordered = rotate ? [...list].sort((a, b) => (state[a.company] || '').localeCompare(state[b.company] || '')).slice(0, rotate) : list
const targets = (only.length ? list.filter((c) => only.includes(c.company)) : ordered).slice(0, Number(opt('--limit')) || undefined)
const report = { at: new Date().toISOString(), api: API, ai: AI, dry: flag('--dry'), companies: [] }
for (const c of targets) {
  const row = { company: c.company, postings: [], insights: [], errors: [] }
  report.companies.push(row)
  process.stdout.write(`\n■ ${c.company}: 공고 찾는 중… `)
  const r = await runClaude(postingsPrompt(c))
  const found = r.ok ? jsonIn(r.text) : null
  if (!Array.isArray(found)) {
    row.errors.push(r.ok ? '공고 결과 형식이 아님' : r.error)
    console.log('실패', r.error || '')
    continue
  }
  const postings = found.filter((p) => p && /^https?:\/\//.test(p.url || '') && (p.questions?.length || (p.notes || '').length > 30)).slice(0, 3)
  console.log(`${postings.length}건`)
  writeFileSync(join(OUT, `${c.company}-postings.json`), JSON.stringify(postings, null, 2))
  if (!flag('--dry')) {
    state[c.company] = today
    writeFileSync(STATE, JSON.stringify(state, null, 2))
  }
  if (!flag('--dry') && postings.length) {
    const up = await admin('/v1/admin/postings/import', { items: postings.map((p) => ({ url: p.url, info: { ...p, company: p.company || c.company } })) })
    row.postings = up.items || [{ error: up.error }]
  } else row.postings = postings.map((p) => ({ url: p.url, dry: true }))
  if (flag('--no-insights')) continue

  const insights = []
  process.stdout.write('  기업 분석… ')
  const ci = await runClaude(companyPrompt(c.company))
  const cj = ci.ok ? jsonIn(ci.text) : null
  console.log(cj ? 'ok' : `실패 ${ci.error || ''}`)
  if (cj) insights.push({ kind: 'company', company: c.company, period: season, content: cj })
  for (const p of postings) {
    process.stdout.write(`  ${p.position || '직무'}: 직무 분석… `)
    const ji = await runClaude(jobPrompt({ ...p, company: c.company }))
    const jj = ji.ok ? jsonIn(ji.text) : null
    process.stdout.write(jj ? 'ok' : 'x')
    if (jj) insights.push({ kind: 'job', company: c.company, position: p.position, period: season, content: jj })
    if (p.questions?.length) {
      process.stdout.write(' · 문항 분석… ')
      const qi = await runClaude(questionsPrompt({ ...p, company: c.company }), { web: false, timeoutMs: 4 * 60_000 })
      const qj = qi.ok ? jsonIn(qi.text) : null
      process.stdout.write(qj ? 'ok' : 'x')
      if (qj) insights.push({ kind: 'questions', company: c.company, position: p.position, postingUrl: p.url, period: season, content: qj })
    }
    console.log('')
  }
  writeFileSync(join(OUT, `${c.company}-insights.json`), JSON.stringify(insights, null, 2))
  if (!flag('--dry') && insights.length) {
    const up = await admin('/v1/admin/insights/import', { items: insights })
    row.insights = up.items || [{ error: up.error }]
  }
}
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2))
const n = (k) => report.companies.reduce((s, c) => s + c[k].filter((x) => x.id || x.dry).length, 0)
console.log(`\n끝: 공고 ${n('postings')}건 · 분석 ${n('insights')}건 ${flag('--dry') ? '(올리지 않음)' : '→ 확인 대기'} · 기록 ${OUT}`)
