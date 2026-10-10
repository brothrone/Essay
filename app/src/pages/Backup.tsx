import { Download, FolderOpen, History, ShieldCheck, Upload } from 'lucide-react'
import { useEffect, useState } from 'react'
import { APP_NAME } from '../constants'
import { desktop, type BackupFile } from '../desktop'
import { normalize, useStore } from '../store'
import { toast } from '../toast'
import { fmtDateTime, toDateInput } from '../utils'

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
      await desktop.backups.snapshot('불러오기전')
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
        </div>
      </header>

      <section className="card setting-actions">
        <div className="setting-row">
          <div>
            <strong>백업 파일 저장</strong>
            <p className="muted small">{summary}</p>
          </div>
          <button type="button" className="btn primary" onClick={exportBackup}>
            <Download size={16} /> 백업하기
          </button>
        </div>
        <div className="setting-row">
          <div>
            <strong>백업 불러오기</strong>
            <p className="muted small">지금 데이터를 통째로 바꿔요</p>
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
          <span className="muted small">매일 자동 · 30일 보관</span>
        </header>
        <div className="btn-row">
          <button type="button" className="btn small" onClick={() => desktop.openDataFolder()}>
            <FolderOpen size={14} /> 데이터 폴더 열기
          </button>
        </div>
      </section>

      <BackupList summary={summary} />
    </div>
  )
}

/** 자동백업 폴더의 파일 목록. 고르면 그 상태로 되돌린다 (지금 데이터는 '복원전' 스냅샷으로 남긴다) */
function BackupList({ summary }: { summary: string }) {
  const { replaceAll } = useStore()
  const [files, setFiles] = useState<BackupFile[] | null>(null)
  const [busy, setBusy] = useState('')

  const refresh = () => desktop.backups.list().then(setFiles)
  useEffect(() => {
    let alive = true
    desktop.backups.list().then((f) => alive && setFiles(f))
    return () => {
      alive = false
    }
  }, [])

  const restore = async (f: BackupFile) => {
    try {
      const next = normalize(JSON.parse(await desktop.backups.read(f.name)))
      const ok = await desktop.confirm(`${fmtDateTime(f.at)} 백업으로 되돌릴까요?`, {
        detail: `백업 내용: 자소서 ${next.projects.length}개, 경험 ${next.experiences.length}개, 스펙 ${next.specs.length}개\n지금 데이터(${summary})는 '복원전' 스냅샷으로 남겨 둬요.`,
        ok: '되돌리기',
        danger: true,
      })
      if (!ok) return
      setBusy(f.name)
      await desktop.backups.snapshot('복원전')
      replaceAll(next)
      toast('백업으로 되돌렸어요')
      await refresh()
    } catch (err) {
      toast(err instanceof Error && err.message.includes('백업') ? err.message : '백업 파일을 읽을 수 없어요')
    } finally {
      setBusy('')
    }
  }

  const label = (name: string) => {
    const m = /^\d{4}-\d{2}-\d{2}-\d{6}-(.+)\.json$/.exec(name)
    if (m) return m[1]
    return /^\d{4}-\d{2}-\d{2}\.json$/.test(name) ? '일별 자동' : name
  }

  return (
    <section className="card">
      <header className="card-head">
        <h3>
          <History size={18} /> 자동백업에서 복원
        </h3>
      </header>
      {!files ? (
        <p className="muted small">불러오는 중…</p>
      ) : files.length ? (
        <ul className="backup-list">
          {files.slice(0, 12).map((f) => (
            <li key={f.name}>
              <div>
                <strong>{fmtDateTime(f.at)}</strong>
                <span className="badge tone-gray">{label(f.name)}</span>
                <span className="muted small">{Math.max(1, Math.round(f.size / 1024))}KB</span>
              </div>
              <button type="button" className="btn small" disabled={!!busy} onClick={() => restore(f)}>
                {busy === f.name ? '복원 중…' : '복원'}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">아직 백업이 없어요</p>
      )}
    </section>
  )
}
