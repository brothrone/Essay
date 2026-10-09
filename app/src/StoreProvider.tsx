import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { desktop } from './desktop'
import { jobKey, loadData, StoreContext, type Actions, type SaveState } from './store'
import type { AppData } from './types'

function upsert<T extends { id: string }>(list: T[], item: T) {
  return list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [item, ...list]
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(loadData)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const latest = useRef(data)
  const dirty = useRef(false)
  const version = useRef(0)

  // 문서\Essay\Essay-데이터.json 에 저장
  const persist = useCallback((d: AppData) => {
    const v = version.current
    desktop.saveData(JSON.stringify(d)).then(
      () => {
        if (v !== version.current) return
        dirty.current = false
        setSaveState('saved')
      },
      () => setSaveState('error'),
    )
  }, [])

  // 입력이 멈추고 0.4초 뒤 파일에 저장
  useEffect(() => {
    latest.current = data
    if (!dirty.current) return
    const t = setTimeout(() => persist(data), 400)
    return () => clearTimeout(t)
  }, [data, persist])

  // 창을 닫기 직전 저장 못 한 변경 사항을 동기로 저장
  useEffect(() => {
    const flush = () => {
      if (dirty.current) desktop.saveDataSync(JSON.stringify(latest.current))
    }
    window.addEventListener('pagehide', flush)
    window.addEventListener('beforeunload', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      window.removeEventListener('beforeunload', flush)
    }
  }, [])

  const mutate = useCallback((fn: (d: AppData) => AppData) => {
    dirty.current = true
    version.current++
    setSaveState('saving')
    setData(fn)
  }, [])

  const actions = useMemo<Actions>(() => {
    const now = () => Date.now()
    return {
      // 새로 찾은 공고를 앞에 붙이고, 이미 있던 공고(저장·숨김·시작)는 상태를 유지한다
      mergeJobs: (found, query) =>
        mutate((d) => {
          // 마감 · 확인 안 됨으로 뺐던 공고라도 이번 검색에서 접수 중으로 다시 확인되면 새 것으로 바꿔 넣는다
          const known = new Set(d.jobs.filter((j) => !j.closed).map(jobKey))
          const fresh = found.filter((j) => {
            const k = jobKey(j)
            if (known.has(k)) return false
            known.add(k)
            return true
          })
          const reopened = new Set(fresh.map(jobKey))
          const jobs = d.jobs.filter((j) => !(j.closed && reopened.has(jobKey(j))))
          // 저장하지 않은 오래된 '새 공고'는 최근 40개만 남긴다 (저장 · 숨김 · 시작한 공고는 그대로)
          const keep = jobs.filter((j) => j.status !== 'new' || j.saved)
          const olderNew = jobs.filter((j) => j.status === 'new' && !j.saved)
          return { ...d, jobQuery: query, jobs: [...fresh, ...olderNew].slice(0, 40).concat(keep) }
        }),
      updateJob: (id, patch) =>
        mutate((d) => ({ ...d, jobs: d.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)) })),
      setJobQuery: (patch) => mutate((d) => ({ ...d, jobQuery: { ...d.jobQuery, ...patch } })),
      setProfile: (patch) => mutate((d) => ({ ...d, profile: { ...d.profile, ...patch } })),
      saveSpec: (item) => mutate((d) => ({ ...d, specs: upsert(d.specs, { ...item, updatedAt: now() }) })),
      deleteSpec: (id) => mutate((d) => ({ ...d, specs: d.specs.filter((s) => s.id !== id) })),
      saveExperience: (exp) =>
        mutate((d) => ({ ...d, experiences: upsert(d.experiences, { ...exp, updatedAt: now() }) })),
      deleteExperience: (id) =>
        mutate((d) => ({
          ...d,
          experiences: d.experiences.filter((e) => e.id !== id),
          projects: d.projects.map((p) =>
            p.questions.some((q) => q.experienceIds.includes(id))
              ? {
                  ...p,
                  questions: p.questions.map((q) => ({
                    ...q,
                    experienceIds: q.experienceIds.filter((x) => x !== id),
                  })),
                }
              : p,
          ),
        })),
      addProject: (project) => mutate((d) => ({ ...d, projects: [project, ...d.projects] })),
      updateProject: (id, fn) =>
        mutate((d) => ({
          ...d,
          projects: d.projects.map((p) => (p.id === id ? { ...fn(p), updatedAt: now() } : p)),
        })),
      touchProject: (id) =>
        mutate((d) => ({
          ...d,
          projects: d.projects.map((p) => (p.id === id ? { ...p, openedAt: now() } : p)),
        })),
      deleteProject: (id) => mutate((d) => ({ ...d, projects: d.projects.filter((p) => p.id !== id) })),
      replaceAll: (next) => mutate(() => next),
    }
  }, [mutate])

  const store = useMemo(() => ({ data, saveState, ...actions }), [data, saveState, actions])

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
}
