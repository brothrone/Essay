// Essay 백엔드: 의견 받기 · 익명 사용 통계 · 오류 보고 · 회사별 자소서 문항 모음, 개발자용 관리 주소.
// 결제 확인 · 라이선스 키는 사업자 등록 · PG 가 정해지면 여기에 더한다 (CLAUDE.md 남은 일 2)
import { admin, isAdmin } from './admin'
import { postFeedback } from './feedback'
import { getQuestions, postQuestions } from './questions'
import { postErrors, postStats } from './telemetry'
import { CORS, fail, json, type Env } from './util'

export type { Env }

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    const path = url.pathname.replace(/\/+$/, '') || '/'
    const { method } = req
    try {
      if (path === '/' || path === '/health') return json({ ok: true, service: 'essay-api' })

      if (path === '/v1/feedback') {
        if (method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
        if (method === 'POST') return await postFeedback(req, env)
        return fail(405, 'POST 만 받아요', CORS)
      }
      if (path === '/v1/stats' && method === 'POST') return await postStats(req, env)
      if (path === '/v1/errors' && method === 'POST') return await postErrors(req, env)
      if (path === '/v1/questions') {
        if (method === 'GET') return await getQuestions(url, env)
        if (method === 'POST') return await postQuestions(req, env)
      }

      if (path.startsWith('/v1/admin/')) {
        if (!(await isAdmin(req, env))) return fail(401, '관리 열쇠가 필요해요')
        return await admin(path, req, url, env)
      }
      return fail(404, '없는 주소')
    } catch (e) {
      console.error('요청 처리 실패', path, e)
      return fail(500, '서버 오류')
    }
  },

  /** 매일 한 번: 횟수 제한 기록 정리, 400일 지난 통계 정리 */
  async scheduled(_c: ScheduledController, env: Env): Promise<void> {
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM rate WHERE substr(bucket, 3, 10) < date('now', '-2 days')`),
      env.DB.prepare(`DELETE FROM stats_daily WHERE day < date('now', '-400 days')`),
    ])
  },
} satisfies ExportedHandler<Env>
