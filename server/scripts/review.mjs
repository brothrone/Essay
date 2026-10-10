#!/usr/bin/env node
// 공고 모음 · 분석 확인 (collect.mjs 가 올린 '확인 대기'를 보고 공개 · 숨김). 관리 열쇠는 server/.prod.vars (로컬이면 .dev.vars)
//   node scripts/review.mjs postings [pending|published|hidden]   공고 목록 (기본 pending)
//   node scripts/review.mjs posting <id>                          공고 한 건 자세히
//   node scripts/review.mjs publish <id…> | hide <id…>            공고 공개 · 숨김
//   node scripts/review.mjs insights [pending|published|hidden]   분석 목록
//   node scripts/review.mjs insight <id>                          분석 한 건 자세히
//   node scripts/review.mjs ipublish <id…> | ihide <id…>          분석 공개 · 숨김
//   ESSAY_API=http://localhost:8787 node scripts/review.mjs …     로컬 서버
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
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

const [cmd, ...rest] = process.argv.slice(2)
const status = ['pending', 'published', 'hidden'].includes(rest[0]) ? rest[0] : 'pending'
const ids = rest.map(Number).filter((n) => n > 0)

if (cmd === 'postings') {
  const r = await get(`/v1/admin/postings?status=${status}&limit=200`)
  for (const p of r.items || [])
    console.log(`#${p.id}\t${p.company}\t${p.position}\t마감 ${p.deadline || '-'}\t문항 ${p.info.questions.length}\t${p.source}${p.source === 'user' ? `(${p.agree}/${p.contributors})` : ''}\t${p.url}`)
  console.log(`${(r.items || []).length}건 (${status})`)
} else if (cmd === 'posting') {
  const r = await get(`/v1/admin/postings?limit=200`)
  const p = (r.items || []).find((x) => x.id === ids[0])
  if (!p) console.log('없는 번호')
  else {
    console.log(`#${p.id} ${p.company} · ${p.position} · ${p.status} · ${p.source}\n${p.url}\n마감 ${p.deadline} ${p.info.deadlineTime}\n\n${p.info.notes}\n`)
    p.info.questions.forEach((q, i) => console.log(`Q${i + 1}. ${q.prompt}${q.limit ? ` (${q.limit}자)` : ''}`))
    console.log(`\n문항 출처: ${p.info.questionsSource || '-'}`)
  }
} else if (cmd === 'publish' || cmd === 'hide') {
  for (const id of ids) console.log(`#${id}`, (await post(`/v1/admin/postings/${id}`, { status: cmd === 'publish' ? 'published' : 'hidden' })).ok ? '완료' : '실패')
} else if (cmd === 'insights') {
  const r = await get(`/v1/admin/insights?status=${status}&limit=200`)
  for (const x of r.items || []) console.log(`#${x.id}\t${x.kind}\t${x.company}\t${x.position || '-'}\t${x.period}\t${x.content.summary || ''}`)
  console.log(`${(r.items || []).length}건 (${status})`)
} else if (cmd === 'insight') {
  const r = await get(`/v1/admin/insights?limit=200`)
  const x = (r.items || []).find((i) => i.id === ids[0])
  if (!x) console.log('없는 번호')
  else {
    const c = x.content
    console.log(`#${x.id} ${x.kind} · ${x.company} ${x.position || ''} · ${x.status} · 기준 ${c.basis}\n\n${c.summary}\n`)
    for (const s of c.sections) {
      console.log(`[${s.title}]`)
      if (s.text) console.log(s.text)
      for (const it of s.items || []) console.log(`- ${it}`)
      if (s.table) for (const row of [s.table.head, ...s.table.rows]) console.log(row.join(' | '))
      console.log('')
    }
    for (const s of c.sources) console.log(`출처: ${s.title} ${s.url}`)
  }
} else if (cmd === 'ipublish' || cmd === 'ihide') {
  for (const id of ids) console.log(`#${id}`, (await post(`/v1/admin/insights/${id}`, { status: cmd === 'ipublish' ? 'published' : 'hidden' })).ok ? '완료' : '실패')
} else {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 10).join('\n'))
}
