import { emptyJobQuery, emptyProfile, newExperience, newProject, newQuestion, newSpec } from './store'
import type { AppData, SpecCategory } from './types'
import { toDateInput } from './utils'

/** 처음 둘러볼 때 쓰는 예시 데이터 (가상의 인물·회사) */
export function buildSample(): AppData {
  const day = (offset: number) => toDateInput(new Date(Date.now() + offset * 86_400_000))
  const spec = (category: SpecCategory, data: Record<string, string>) => ({ ...newSpec(category), data })

  const sns = {
    ...newExperience(),
    title: '대학생 마케팅 서포터즈 SNS 캠페인 기획',
    type: '대외활동',
    org: '○○식품 서포터즈 12기',
    role: '콘텐츠 기획 팀장',
    start: '2024-03',
    end: '2024-08',
    summary: '타깃 설문으로 콘텐츠 방향을 바꿔 캠페인 참여율을 3배로 높임',
    situation: '팀이 만든 SNS 콘텐츠의 참여율이 1%대로 서포터즈 중 하위권이었습니다.',
    task: '콘텐츠 기획 팀장으로서 남은 2개월 안에 참여율을 끌어올려야 했습니다.',
    action: '20대 120명을 대상으로 설문을 진행해 "레시피형 숏폼" 선호를 확인하고, 제작 프로세스를 주 2회 테스트 후 확대하는 방식으로 바꿨습니다.',
    result: '참여율이 1.2%에서 3.8%로 올랐고, 우수 서포터즈 팀으로 선정됐습니다.',
    learned: '감이 아닌 데이터로 고객을 이해하는 습관. 마케팅 직무의 가설-검증 사이클과 연결됩니다.',
    tags: ['분석력', '도전정신', '리더십'],
  }
  const cafe = {
    ...newExperience(),
    title: '카페 아르바이트 재고 관리 방식 개선',
    type: '아르바이트',
    org: '○○카페',
    role: '바리스타',
    start: '2023-01',
    end: '2023-12',
    summary: '재고 체크리스트를 만들어 폐기율을 절반으로 줄임',
    situation: '우유·디저트 재고가 자주 남아 매주 폐기 비용이 발생했습니다.',
    task: '정해진 업무는 아니었지만 폐기를 줄일 방법을 찾고 싶었습니다.',
    action: '요일·시간대별 판매량을 3주간 기록해 발주 기준표와 마감 체크리스트를 만들고 점장님께 제안했습니다.',
    result: '월 폐기 금액이 약 40만 원에서 18만 원으로 줄었습니다.',
    learned: '',
    tags: ['문제해결', '책임감', '주도성'],
  }
  const team = {
    ...newExperience(),
    title: '전공 팀 프로젝트 역할 갈등 조율',
    type: '학업·연구',
    org: '경영전략 수업',
    role: '팀원',
    start: '2024-09',
    end: '2024-12',
    summary: '',
    situation: '발표 2주 전, 자료 조사 분담을 두고 팀원 간 갈등이 생겼습니다.',
    task: '',
    action: '',
    result: '',
    learned: '',
    tags: ['협업', '갈등관리'],
  }

  const q1 = newQuestion({
    prompt: '지원 동기와 입사 후 포부를 작성해 주세요.',
    limit: 700,
    answer:
      '[데이터로 고객의 마음을 읽는 마케터]\n\n서포터즈 활동에서 참여율이 하위권이던 팀 콘텐츠를 설문 데이터로 다시 설계해 참여율을 3배로 높였습니다. 이 경험으로 고객을 숫자로 이해할 때 마케팅이 힘을 가진다는 것을 배웠습니다.',
    experienceIds: [sns.id],
    memo: '회사 최근 신제품 라인 + 데이터 기반 마케팅 강조',
  })
  const q2 = newQuestion({
    prompt: '공동의 목표를 위해 다른 사람과 협업했던 경험을 작성해 주세요.',
    limit: 800,
    experienceIds: [team.id],
  })

  const project1 = newProject({
    company: '한빛전자 (예시)',
    position: '브랜드 마케팅',
    deadline: day(5),
    deadlineTime: '18:00',
    jobUrl: 'https://example.com/job/123',
    notes: '- 인재상: 도전, 데이터, 고객\n- 우대: 콘텐츠 기획 경험, 데이터 분석 툴 활용',
    questions: [q1, q2],
  })

  const project2 = newProject({
    company: '새벽유통 (예시)',
    position: '영업관리',
    deadline: day(-12),
    deadlineTime: '23:59',
    status: 'docPass',
    questions: [
      newQuestion({
        prompt: '지원 직무와 관련된 역량을 쌓기 위해 노력한 경험을 작성해 주세요.',
        limit: 1000,
        countMode: 'without',
        done: true,
        answer:
          '[작은 매장에서 배운 재고의 숫자]\n\n카페에서 1년간 일하며 매주 버려지는 재고를 보고 요일·시간대별 판매량을 3주간 기록했습니다. 이를 바탕으로 발주 기준표를 만들어 월 폐기 금액을 절반 이하로 줄였습니다.',
        experienceIds: [cafe.id],
      }),
    ],
    openedAt: 0,
  })

  return {
    version: 1,
    profile: { ...emptyProfile(), name: '김취준', email: 'me@example.com', targetJob: '마케팅, 영업관리' },
    specs: [
      spec('education', {
        school: '한국대학교',
        degree: '학사',
        major: '경영학과',
        status: '졸업예정',
        start: '2021-03',
        end: '2027-02',
        gpa: '3.82',
        gpaMax: '4.5',
      }),
      spec('language', { test: 'TOEIC', score: '875', date: day(-680) }),
      spec('language', { test: 'OPIc', score: 'IH', date: day(-200) }),
      spec('certificate', { name: '컴퓨터활용능력 1급', issuer: '대한상공회의소', date: day(-400) }),
      spec('certificate', { name: 'ADsP', issuer: '한국데이터산업진흥원', date: day(-150) }),
      spec('award', { title: '교내 마케팅 공모전', rank: '우수상', organizer: '한국대학교 경영대학', date: day(-300).slice(0, 7) }),
      spec('activity', {
        name: '○○식품 대학생 서포터즈 12기',
        type: '서포터즈',
        role: '콘텐츠 기획 팀장',
        start: '2024-03',
        end: '2024-08',
      }),
    ],
    experiences: [sns, cafe, team],
    projects: [project1, project2],
    jobs: [],
    jobQuery: { ...emptyJobQuery(), keywords: '브랜드 마케팅' },
  }
}
