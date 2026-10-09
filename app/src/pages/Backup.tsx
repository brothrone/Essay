import { Download, FolderOpen, ShieldCheck, Upload } from 'lucide-react'
import { APP_NAME } from '../constants'
import { desktop } from '../desktop'
import { normalize, useStore } from '../store'
import { toast } from '../toast'
import { toDateInput } from '../utils'

/** 백업: 파일로 저장하고 되돌리기 */
export function Backup() {
  const { data, replaceAll } = useStore()
  const summary = `자소서 ${data.projects.length}개, 경험 ${data.experiences.length}개, 스펙 ${data.specs.length}개`

  const exportBackup = async () => {
    const stamp = toDateInput(new Date()).replaceAll('-', '')
    const r = await desktop.exportBackup(JSON.stringify(data, null, 2), `${APP_NAME}-백업-${stamp}.json`)
    if (r.ok) toast('백업 파일을 저장했어요')
  }

  const importBackup = async () => {
    const r = await desktop.importBackup()
    if (!r.ok || !r.text) return
    try {
      const next = normalize(JSON.parse(r.text))
      const ok = await desktop.confirm('백업 파일 내용으로 바꿀까요?', {
        detail: `불러올 데이터: 자소서 ${next.projects.length}개, 경험 ${next.experiences.length}개, 스펙 ${next.specs.length}개\n지금 데이터(${summary})는 사라져요.`,
        ok: '바꾸기',
        danger: true,
      })
      if (!ok) return
      replaceAll(next)
      toast('백업을 불러왔어요')
    } catch (err) {
      toast(err instanceof Error && err.message.includes('백업') ? err.message : '파일을 읽을 수 없어요')
    }
  }

  return (
    <div className="page narrow">
      <header className="page-head">
        <div>
          <h1>백업</h1>
          <p className="muted">전체 데이터를 파일 하나로 저장해 두면 다른 컴퓨터로 옮기거나 실수했을 때 되돌릴 수 있어요.</p>
        </div>
      </header>

      <section className="card setting-actions">
        <div className="setting-row">
          <div>
            <strong>백업 파일 저장</strong>
            <p className="muted small">
              지금 데이터({summary})를 JSON 파일 하나로 저장해요. 제출 전이나 큰 정리를 하기 전에 한 번 저장해 두세요.
            </p>
          </div>
          <button type="button" className="btn primary" onClick={exportBackup}>
            <Download size={16} /> 백업하기
          </button>
        </div>
        <div className="setting-row">
          <div>
            <strong>백업 불러오기</strong>
            <p className="muted small">저장해 둔 백업 파일로 지금 데이터를 통째로 바꿔요. 바꾸기 전에 내용을 한 번 더 확인해요.</p>
          </div>
          <button type="button" className="btn" onClick={importBackup}>
            <Upload size={16} /> 파일 선택
          </button>
        </div>
      </section>

      <section className="card">
        <header className="card-head">
          <h3>
            <ShieldCheck size={18} /> 자동 백업
          </h3>
          <span className="muted small">따로 켤 필요 없어요</span>
        </header>
        <p className="muted small">
          매일 처음 저장하기 직전 상태를 데이터 폴더 안 '자동백업'에 30일치 보관해요. 날짜가 붙은 파일을 [백업 불러오기]로 고르면 그날 상태로
          돌아가요.
        </p>
        <div className="btn-row">
          <button type="button" className="btn small" onClick={() => desktop.openDataFolder()}>
            <FolderOpen size={14} /> 데이터 폴더 열기
          </button>
        </div>
      </section>
    </div>
  )
}
