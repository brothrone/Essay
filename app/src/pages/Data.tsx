import { FileText, FileUp, FolderOpen, RotateCcw, Sparkles } from 'lucide-react'
import { openImportDialog } from '../components/ImportModal'
import { desktop } from '../desktop'
import { buildSample } from '../sample'
import { emptyData, isEmptyData, useStore } from '../store'
import { toast } from '../toast'

/** 데이터: 어디에 얼마나 있는지, 채우기 · 비우기 */
export function DataPage() {
  const { data, replaceAll } = useStore()
  const sizeKb = Math.ceil(new Blob([JSON.stringify(data)]).size / 1024)
  const summary = `자소서 ${data.projects.length}개, 경험 ${data.experiences.length}개, 스펙 ${data.specs.length}개`
  const totalQ = data.projects.reduce((n, p) => n + p.questions.length, 0)

  const loadSample = async () => {
    if (
      !isEmptyData(data) &&
      !(await desktop.confirm('예시 데이터로 바꿀까요?', { detail: `지금 데이터(${summary})는 사라져요.`, ok: '바꾸기', danger: true }))
    )
      return
    await desktop.backups.snapshot('예시전')
    replaceAll(buildSample())
    toast('예시 데이터를 불러왔어요')
  }

  const resetAll = async () => {
    if (!(await desktop.confirm(`모든 데이터(${summary})를 삭제할까요?`, { ok: '삭제', danger: true }))) return
    if (!(await desktop.confirm('정말 삭제할까요?', { detail: '백업 파일이 없으면 되돌릴 수 없어요.', ok: '모두 삭제', danger: true })))
      return
    await desktop.backups.snapshot('삭제전')
    replaceAll(emptyData())
    toast('모든 데이터를 지웠어요')
  }

  return (
    <div className="page narrow">
      <header className="page-head">
        <div>
          <h1>데이터</h1>
          <p className="muted">모든 데이터는 이 컴퓨터의 문서 폴더에 파일로 저장돼요. 인터넷으로 보내지 않아요. 바꾸기 전 상태는 [백업]의 자동백업에 남아요.</p>
        </div>
      </header>

      <section className="card">
        <header className="card-head">
          <h3>지금 저장된 데이터</h3>
          <span className="muted small">약 {sizeKb.toLocaleString()}KB</span>
        </header>
        <div className="data-stats">
          <div>
            <b>{data.projects.length}</b>
            <span>자소서</span>
          </div>
          <div>
            <b>{totalQ}</b>
            <span>문항</span>
          </div>
          <div>
            <b>{data.experiences.length}</b>
            <span>경험</span>
          </div>
          <div>
            <b>{data.specs.length}</b>
            <span>스펙</span>
          </div>
          <div>
            <b>{data.jobs.length}</b>
            <span>맞춤 공고</span>
          </div>
        </div>
        <p className="muted small data-path" title="데이터 파일 위치">
          {desktop.dataPath}
        </p>
        <div className="btn-row">
          <button type="button" className="btn small" onClick={() => desktop.openDataFolder()}>
            <FolderOpen size={14} /> 데이터 폴더 열기
          </button>
          <button type="button" className="btn small ghost" onClick={() => desktop.openLogsFolder()} title="AI 실행 기록(ai-last-run.json)이 있어요">
            <FileText size={14} /> 로그 폴더 열기
          </button>
        </div>
      </section>

      <section className="card setting-actions">
        <div className="setting-row">
          <div>
            <strong>예전 자소서로 한 번에 채우기</strong>
            <p className="muted small">지금까지 쓴 자소서 · 이력서 파일을 넣으면 AI가 경험 · 스펙 · 과거 답변을 뽑아 채우고 맞춤 공고 조건도 잡아요.</p>
          </div>
          <button type="button" className="btn primary" onClick={openImportDialog}>
            <FileUp size={16} /> 파일 넣기
          </button>
        </div>
        <div className="setting-row">
          <div>
            <strong>예시 데이터</strong>
            <p className="muted small">가상의 자소서 · 경험 · 스펙으로 기능을 둘러봐요. 지금 데이터가 있으면 먼저 백업해 두세요.</p>
          </div>
          <button type="button" className="btn" onClick={loadSample}>
            <Sparkles size={16} /> 불러오기
          </button>
        </div>
        <div className="setting-row">
          <div>
            <strong>전체 삭제</strong>
            <p className="muted small">모든 자소서, 경험, 스펙, 맞춤 공고를 지워요. 백업 파일은 그대로 남아요.</p>
          </div>
          <button type="button" className="btn ghost danger" onClick={resetAll} disabled={isEmptyData(data)}>
            <RotateCcw size={16} /> 초기화
          </button>
        </div>
      </section>
    </div>
  )
}
