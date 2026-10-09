import { STAR_FIELDS } from './constants'
import type { Experience, Project } from './types'
import { fmtPeriod } from './utils'

export function experienceToText(e: Experience) {
  const head = [e.title, [e.type, e.org, e.role, fmtPeriod(e.start, e.end)].filter(Boolean).join(' · ')]
  const body = [
    e.summary && `요약: ${e.summary}`,
    ...STAR_FIELDS.map((f) => e[f.key] && `[${f.short} ${f.label}] ${e[f.key]}`),
    e.learned && `[배운 점] ${e.learned}`,
  ]
  return [...head, ...body].filter(Boolean).join('\n')
}

export function projectToText(p: Project) {
  const title = [p.company, p.position].filter(Boolean).join(' - ')
  const qs = p.questions.map((q, i) => `${i + 1}. ${q.prompt}\n\n${q.answer}`)
  return [title, ...qs].join('\n\n\n')
}

export const isHttpUrl = (url: string) => /^https?:\/\/\S+$/i.test(url.trim())

/** Gemini 검색 결과에 붙는 구글 중간 주소 (며칠 뒤 사라진다) */
export const isGroundingUrl = (url: string) =>
  /^https:\/\/vertexaisearch\.cloud\.google\.com\/grounding-api-redirect\//i.test(url.trim())

/** 사이트 첫 화면(https://saramin.co.kr 등)이 아니라 공고 한 건을 가리키는 주소인지 */
export function isPostingUrl(url: string) {
  if (!isHttpUrl(url) || isGroundingUrl(url)) return false
  try {
    const u = new URL(url.trim())
    return u.pathname.replace(/\/+$/, '').length > 0 || u.search.length > 1
  } catch {
    return false
  }
}

/** 채용 공고가 아니라 기사 · 블로그 · 커뮤니티 글로 보이는 주소 (맞춤 공고에서 뺀다) */
const ARTICLE_HOST_PREFIXES = ['news.', 'm.news.', 'n.news.', 'blog.', 'm.blog.', 'cafe.', 'm.cafe.', 'post.']
const ARTICLE_DOMAINS = [
  // 블로그 · 커뮤니티 · SNS
  'tistory.com', 'brunch.co.kr', 'velog.io', 'medium.com', 'youtube.com', 'instagram.com', 'facebook.com',
  'dcinside.com', 'fmkorea.com', 'clien.net', 'theqoo.net',
  // 언론사
  'mk.co.kr', 'hankyung.com', 'chosun.com', 'joongang.co.kr', 'donga.com', 'yna.co.kr', 'newsis.com', 'edaily.co.kr',
  'mt.co.kr', 'etnews.com', 'zdnet.co.kr', 'sedaily.com', 'fnnews.com', 'asiae.co.kr', 'heraldcorp.com', 'hani.co.kr',
  'khan.co.kr', 'seoul.co.kr', 'kmib.co.kr', 'nocutnews.co.kr', 'news1.kr', 'newspim.com', 'dt.co.kr', 'ajunews.com',
  'inews24.com',
]
const ARTICLE_PATH_PARTS = ['news', 'article', 'articles', 'articleview', 'articleview.html', 'blog']

export function isArticleUrl(url: string) {
  try {
    const u = new URL(url.trim())
    const host = u.hostname.toLowerCase().replace(/^www\./, '')
    if (ARTICLE_HOST_PREFIXES.some((p) => host.startsWith(p))) return true
    if (ARTICLE_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`))) return true
    // 기사 주소 모양: /news/… · /article/… · articleView.html 등
    const parts = u.pathname.toLowerCase().split('/').filter(Boolean)
    return parts.some((part) => ARTICLE_PATH_PARTS.includes(part))
  } catch {
    return false
  }
}
