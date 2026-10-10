#!/usr/bin/env node
// 확인 대기(pending) 공고 · 분석을 Gemini CLI(agy)가 하나씩 원문과 대조해 공개 · 숨김 · 대기로 정한다 (사용자 지시: 정기 작업은 Gemini CLI 가).
// agy 한 턴은 10분 안에 끝나야 해서 항목마다 따로 묻는다. 애매하면 공개하지 않는다.
//   node scripts/verify.mjs            운영 서버
//   node scripts/verify.mjs --dry      정하기만 하고 바꾸지 않음
//   ESSAY_API=http://localhost:8787 node scripts/verify.mjs
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DRY = process.argv.includes('--dry')
const API = (process.env.ESSAY_API || 'https://api.essay.win').replace(/\/$/, '')
const VARS = API.startsWith('http://localhost') ? '.dev.vars' : '.prod.vars'
const TOKEN = (/ADMIN_TOKEN=(.+)/.exec(readFileSync(join(ROOT, VARS), 'utf8')) || [])[1]?.trim()
if (!TOKEN) {
  console.error(`server/${VARS} 에 ADMIN_TOKEN 이 없어요`)
  process.exit(1)
}
const headers = { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }
const get = async (p) => (await fetch(API + p, { headers })).json()
const post = async (p, b) => (await fetch(API + p, { method: 'POST', headers, body: JSON.stringify(b) })).json()

const AGY = [join(homedir(), '.local/bin/agy'), '/opt/homebrew/bin/agy', '/usr/local/bin/agy'].find((p) => {
  try {
    return readFileSync(p) && true
  } catch {
    return false
  }
}) || 'agy'
const WORK = join(tmpdir(), 'essay-collect')
mkdirSync(WORK, { recursive: true })
function agy(prompt) {
  const env = { ...process.env }
  for (const k of Object.keys(env)) if (/^(GOOGLE_API_KEY|GEMINI_API_KEY|GOOGLE_GENAI_|ANTHROPIC_|OPENAI_)/.test(k)) delete env[k]
  return new Promise((resolve) => {
    const child = spawn(AGY, ['-p', prompt, '--output-format', 'text', '--disable-slash-commands', '--dangerously-skip-permissions', '--effort', 'high', '--print-timeout', '560s'], { env, cwd: WORK, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    const timer = setTimeout(() => child.kill('SIGTERM'), 580_000)
    child.stdout.on('data', (d) => (out += d))
    child.on('close', () => {
      clearTimeout(timer)
      const m = /<json>([\s\S]*?)<\/json>/.exec(out) || /\{[\s\S]*"decision"[\s\S]*\}/.exec(out)
      try {
        const j = JSON.parse(m ? m[1] ?? m[0] : '')
        resolve(['publish', 'hide', 'keep'].includes(j.decision) ? j : { decision: 'keep', reason: '판정 형식이 아님' })
      } catch {
        resolve({ decision: 'keep', reason: '판정을 읽지 못함' })
      }
    })
  })
}
const VERDICT = `[판정 — 마지막에 이것만]
<json>{"decision":"publish | hide | keep","reason":"한 줄 이유"}</json>
- publish: 원문과 맞고, 다른 회사 내용이 섞이지 않음
- hide: 다른 회사 내용이 섞였거나, 문항 · 사실이 원문과 다르거나 지어낸 것
- keep: 원문을 열지 못했거나 확실하지 않음 (틀린 정보를 보여 주는 것보다 안 보여 주는 게 낫다)`

const postings = (await get('/v1/admin/postings?status=pending&limit=100')).items || []
const published = new Set(((await get('/v1/admin/postings?status=published&limit=200')).items || []).map((p) => p.id))
let n = { publish: 0, hide: 0, keep: 0 }
for (const p of postings.filter((x) => x.source === 'curated')) {
  const i = p.info
  const prompt = `채용 공고 정리가 원문과 맞는지 확인해 주세요. 아래 주소를 직접 열어(페이지 읽기) 대조하세요. 필요하면 같은 공고를 검색해도 됩니다.

공고 주소: ${p.url}
회사: ${i.company} / 직무: ${i.position} / 마감: ${i.deadline} ${i.deadlineTime}
[요약]
${i.notes}
[자기소개서 문항] (문항 출처: ${i.questionsSource || '-'})
${i.questions.map((q, k) => `Q${k + 1}. ${q.prompt}${q.limit ? ` (${q.limit}자)` : ''}`).join('\n') || '(없음)'}

확인할 것: 회사명, 직무, 마감일, 문항이 원문과 한 글자도 다르지 않은지(띄어쓰기 · 문장부호 정도는 괜찮음), 요약에 원문에 없는 내용이 없는지.

${VERDICT}`
  const v = await agy(prompt)
  n[v.decision]++
  console.log(`공고 #${p.id} ${i.company} ${i.position.slice(0, 30)} → ${v.decision} (${v.reason})`)
  if (!DRY && v.decision !== 'keep') {
    await post(`/v1/admin/postings/${p.id}`, { status: v.decision === 'publish' ? 'published' : 'hidden' })
    if (v.decision === 'publish') published.add(p.id)
  }
}

const insights = (await get('/v1/admin/insights?status=pending&limit=100')).items || []
for (const x of insights) {
  if (x.kind === 'questions' && !published.has(x.posting_id)) {
    console.log(`분석 #${x.id} 문항 분석 → keep (공고가 아직 공개 전)`)
    n.keep++
    continue
  }
  const c = x.content
  const body = c.sections
    .map((s) => [`[${s.title}]`, s.text, ...(s.items || []).map((t) => `- ${t}`), ...(s.table ? [s.table.head, ...s.table.rows].map((r) => r.join(' | ')) : [])].filter(Boolean).join('\n'))
    .join('\n\n')
  const prompt = `취업 준비생에게 보여 줄 ${x.kind === 'company' ? '기업' : x.kind === 'job' ? '직무' : '자소서 문항'} 분석이 사실과 맞는지 확인해 주세요.${x.kind === 'questions' ? ' 문항 분석은 의견이라 사실 확인보다 회사 · 문항과 맞는 내용인지만 보세요.' : ' 아래 출처 주소를 직접 열어 보고, 숫자는 출처에 실제로 그 값이 있는지, 다른 회사 이야기가 섞이지 않았는지 확인하세요. 필요하면 검색해도 됩니다.'}

회사: ${x.company}${x.position ? ` / 직무: ${x.position}` : ''} / 기준: ${c.basis}
한 줄 요약: ${c.summary}

${body}

출처:
${c.sources.map((s) => `- ${s.title} ${s.url}`).join('\n') || '(없음)'}

${VERDICT}`
  const v = await agy(prompt)
  n[v.decision]++
  console.log(`분석 #${x.id} ${x.kind} ${x.company} → ${v.decision} (${v.reason})`)
  if (!DRY && v.decision !== 'keep') await post(`/v1/admin/insights/${x.id}`, { status: v.decision === 'publish' ? 'published' : 'hidden' })
}
console.log(`\n확인 끝: 공개 ${n.publish} · 숨김 ${n.hide} · 대기 ${n.keep}${DRY ? ' (바꾸지 않음)' : ''}`)
