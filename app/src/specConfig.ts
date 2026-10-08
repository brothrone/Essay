import type { AppData, SpecCategory, SpecItem } from './types'
import { addYears, fmtDate, fmtPeriod } from './utils'

export type FieldType = 'text' | 'number' | 'date' | 'month' | 'select' | 'textarea'

export interface FieldDef {
  key: string
  label: string
  type?: FieldType
  options?: string[]
  suggestions?: string[]
  placeholder?: string
  full?: boolean
  required?: boolean
}

type Data = Record<string, string>

export interface CategoryDef {
  key: SpecCategory
  label: string
  empty: string
  fields: FieldDef[]
  title: (d: Data) => string
  sub: (d: Data) => string
  meta: (d: Data) => string
  sortKey: (d: Data) => string
}

/** 응시일로부터 2년 유효한 시험 */
const TWO_YEAR_TESTS = ['TOEIC', 'TOEIC Speaking', 'OPIc', 'TEPS', 'TOEFL iBT', 'IELTS']

export function languageExpiry(d: Data) {
  if (d.expiry) return d.expiry
  return TWO_YEAR_TESTS.includes(d.test) ? addYears(d.date, 2) : ''
}

const join = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(' · ')
const periodSort = (d: Data) => (d.start && !d.end ? '9999' : d.end || d.start || '')

export const SPEC_CATEGORIES: CategoryDef[] = [
  {
    key: 'education',
    label: '학력',
    empty: '학교, 전공, 학점을 정리해 두세요',
    fields: [
      { key: 'school', label: '학교명', required: true, placeholder: '○○대학교' },
      { key: 'degree', label: '학위', type: 'select', options: ['고등학교', '전문학사', '학사', '석사', '박사'] },
      { key: 'major', label: '전공', placeholder: '기계공학부' },
      { key: 'minor', label: '복수·부전공' },
      { key: 'status', label: '상태', type: 'select', options: ['재학', '휴학', '졸업예정', '졸업', '수료', '중퇴'] },
      { key: 'start', label: '입학', type: 'month', placeholder: '2020-03' },
      { key: 'end', label: '졸업(예정)', type: 'month', placeholder: '2026-02' },
      { key: 'gpa', label: '전체 학점', type: 'number', placeholder: '3.85' },
      { key: 'gpaMax', label: '만점', type: 'select', options: ['4.5', '4.3', '4.0', '100'] },
      { key: 'majorGpa', label: '전공 학점', type: 'number' },
      { key: 'description', label: '비고', type: 'textarea', full: true, placeholder: '석차, 이수 학점 등' },
    ],
    title: (d) => join(d.school, d.degree),
    sub: (d) => join(d.major, d.minor && `복수·부전공 ${d.minor}`, d.status),
    meta: (d) => join(fmtPeriod(d.start, d.end), d.gpa && `학점 ${d.gpa}${d.gpaMax ? ` / ${d.gpaMax}` : ''}`),
    sortKey: periodSort,
  },
  {
    key: 'language',
    label: '어학',
    empty: '토익, 오픽 등 어학 점수와 유효기간을 관리해요',
    fields: [
      {
        key: 'test',
        label: '시험',
        required: true,
        suggestions: [...TWO_YEAR_TESTS, 'JLPT', 'JPT', 'HSK', 'G-TELP', 'FLEX', 'DELE', 'DELF'],
        placeholder: 'TOEIC',
      },
      { key: 'score', label: '점수·등급', placeholder: '900 / IH / N1' },
      { key: 'date', label: '응시일', type: 'date' },
      { key: 'expiry', label: '만료일', type: 'date', placeholder: '비우면 자동 계산' },
      { key: 'regNo', label: '수험번호', full: true },
    ],
    title: (d) => join(d.test, d.score),
    sub: (d) => (d.regNo ? `수험번호 ${d.regNo}` : ''),
    meta: (d) => join(d.date && `${fmtDate(d.date)} 응시`),
    sortKey: (d) => d.date || '',
  },
  {
    key: 'certificate',
    label: '자격증',
    empty: '취득한 자격증을 정리해요',
    fields: [
      {
        key: 'name',
        label: '자격증명',
        required: true,
        suggestions: [
          '정보처리기사',
          '컴퓨터활용능력 1급',
          '컴퓨터활용능력 2급',
          '한국사능력검정시험 심화',
          'ADsP',
          'SQLD',
          '빅데이터분석기사',
          '일반기계기사',
          '전기기사',
          '사회조사분석사 2급',
          'MOS Master',
          '운전면허 1종 보통',
          '운전면허 2종 보통',
        ],
      },
      { key: 'grade', label: '등급·점수' },
      { key: 'issuer', label: '발행기관', placeholder: '한국산업인력공단' },
      { key: 'date', label: '취득일', type: 'date' },
      { key: 'number', label: '자격번호', full: true },
    ],
    title: (d) => join(d.name, d.grade),
    sub: (d) => d.issuer,
    meta: (d) => (d.date ? `${fmtDate(d.date)} 취득` : ''),
    sortKey: (d) => d.date || '',
  },
  {
    key: 'award',
    label: '수상',
    empty: '공모전, 대회 수상 내역을 정리해요',
    fields: [
      { key: 'title', label: '수상명', required: true, placeholder: '○○ 공모전' },
      { key: 'rank', label: '등급·순위', placeholder: '최우수상' },
      { key: 'organizer', label: '수여기관' },
      { key: 'date', label: '수상 연월', type: 'month', placeholder: '2026-08' },
      { key: 'description', label: '내용', type: 'textarea', full: true },
    ],
    title: (d) => join(d.title, d.rank),
    sub: (d) => d.organizer,
    meta: (d) => fmtDate(d.date),
    sortKey: (d) => d.date || '',
  },
  {
    key: 'career',
    label: '경력·인턴',
    empty: '인턴, 아르바이트, 경력 사항을 정리해요',
    fields: [
      { key: 'company', label: '회사명', required: true },
      { key: 'type', label: '구분', type: 'select', options: ['인턴', '정규직', '계약직', '아르바이트', '프리랜서', '연구실', '군 복무'] },
      { key: 'dept', label: '부서' },
      { key: 'role', label: '직무·직위' },
      { key: 'start', label: '시작', type: 'month' },
      { key: 'end', label: '종료', type: 'month', placeholder: '비우면 재직 중' },
      { key: 'description', label: '주요 업무', type: 'textarea', full: true },
    ],
    title: (d) => join(d.company, d.type),
    sub: (d) => join(d.dept, d.role),
    meta: (d) => fmtPeriod(d.start, d.end),
    sortKey: periodSort,
  },
  {
    key: 'activity',
    label: '대외활동·동아리',
    empty: '동아리, 서포터즈, 봉사, 해외 경험 등을 정리해요',
    fields: [
      { key: 'name', label: '활동명', required: true },
      {
        key: 'type',
        label: '구분',
        type: 'select',
        options: ['동아리', '학회', '서포터즈', '봉사활동', '공모전', '해외경험', '학생회', '기타'],
      },
      { key: 'org', label: '기관·단체' },
      { key: 'role', label: '역할' },
      { key: 'start', label: '시작', type: 'month' },
      { key: 'end', label: '종료', type: 'month' },
      { key: 'description', label: '활동 내용', type: 'textarea', full: true },
    ],
    title: (d) => join(d.name, d.type),
    sub: (d) => join(d.org, d.role),
    meta: (d) => fmtPeriod(d.start, d.end),
    sortKey: periodSort,
  },
  {
    key: 'training',
    label: '교육 이수',
    empty: '부트캠프, 직무 교육, 온라인 강의 이수 내역',
    fields: [
      { key: 'name', label: '교육명', required: true },
      { key: 'org', label: '교육기관' },
      { key: 'start', label: '시작', type: 'month' },
      { key: 'end', label: '종료', type: 'month' },
      { key: 'hours', label: '이수 시간', type: 'number' },
      { key: 'description', label: '교육 내용', type: 'textarea', full: true },
    ],
    title: (d) => d.name,
    sub: (d) => d.org,
    meta: (d) => join(fmtPeriod(d.start, d.end), d.hours && `${d.hours}시간`),
    sortKey: periodSort,
  },
]

export const CATEGORY_MAP = Object.fromEntries(SPEC_CATEGORIES.map((c) => [c.key, c])) as Record<
  SpecCategory,
  CategoryDef
>

export function sortSpecs(items: SpecItem[]) {
  return [...items].sort((a, b) => {
    const ka = CATEGORY_MAP[a.category].sortKey(a.data)
    const kb = CATEGORY_MAP[b.category].sortKey(b.data)
    return kb.localeCompare(ka) || b.createdAt - a.createdAt
  })
}

/** 지원서 입력란에 붙여넣기 좋은 텍스트 */
export function specsToText({ profile, specs }: AppData) {
  const lines: string[] = []
  const info: [string, string][] = [
    ['이름', profile.name],
    ['생년월일', profile.birth],
    ['이메일', profile.email],
    ['연락처', profile.phone],
    ['주소', profile.address],
    ['희망 직무', profile.targetJob],
    ['포트폴리오', profile.links],
    ['보유 스킬', profile.skills],
  ]
  const filled = info.filter(([, v]) => v)
  if (filled.length) {
    lines.push('[기본 정보]', ...filled.map(([k, v]) => `${k}: ${v}`), '')
  }
  for (const cat of SPEC_CATEGORIES) {
    const items = sortSpecs(specs.filter((s) => s.category === cat.key))
    if (!items.length) continue
    lines.push(`[${cat.label}]`)
    for (const { data } of items) {
      const extra = [cat.sub(data), cat.meta(data)].filter(Boolean).join(' | ')
      lines.push(`- ${cat.title(data)}${extra ? ` (${extra})` : ''}`)
      if (data.description) lines.push(`  ${data.description.replace(/\n/g, '\n  ')}`)
    }
    lines.push('')
  }
  return lines.join('\n').trim()
}
