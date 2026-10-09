import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Home } from './pages/Home'

// 홈 말고는 처음 열 때만 내려받아 첫 화면이 빨리 뜨게 한다
const Projects = lazy(() => import('./pages/Projects').then((m) => ({ default: m.Projects })))
const ProjectEditor = lazy(() => import('./pages/ProjectEditor').then((m) => ({ default: m.ProjectEditor })))
const Jobs = lazy(() => import('./pages/Jobs').then((m) => ({ default: m.Jobs })))
const CalendarPage = lazy(() => import('./pages/Calendar').then((m) => ({ default: m.Calendar })))
const SavedJobs = lazy(() => import('./pages/Jobs').then((m) => ({ default: m.SavedJobs })))
const Experiences = lazy(() => import('./pages/Experiences').then((m) => ({ default: m.Experiences })))
const Specs = lazy(() => import('./pages/Specs').then((m) => ({ default: m.Specs })))
const Backup = lazy(() => import('./pages/Backup').then((m) => ({ default: m.Backup })))
const DataPage = lazy(() => import('./pages/Data').then((m) => ({ default: m.DataPage })))
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })))

const page = (el: React.ReactNode) => <Suspense fallback={<div className="page-loading" />}>{el}</Suspense>

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="projects" element={page(<Projects />)} />
        <Route path="projects/:id" element={page(<ProjectEditor />)} />
        <Route path="calendar" element={page(<CalendarPage />)} />
        <Route path="jobs" element={page(<Jobs />)} />
        <Route path="jobs/saved" element={page(<SavedJobs />)} />
        <Route path="experiences" element={page(<Experiences />)} />
        <Route path="specs" element={page(<Specs />)} />
        <Route path="backup" element={page(<Backup />)} />
        <Route path="data" element={page(<DataPage />)} />
        <Route path="settings" element={page(<Settings />)} />
        <Route path="*" element={<Home />} />
      </Route>
    </Routes>
  )
}
