import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css'
import './index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { JobSearchProvider } from './JobSearchProvider'
import { PostingReaderProvider } from './PostingReaderProvider'
import { StoreProvider } from './StoreProvider'

const root = createRoot(document.getElementById('root')!)

// Electron 밖(브라우저)에서는 데이터 파일 · AI · 알림을 쓸 수 없으므로 실행하지 않는다
if (!window.desktop) {
  root.render(
    <div className="not-desktop">
      <h1>Essay는 데스크톱 앱으로 실행해 주세요</h1>
      <p>
        브라우저에서는 데이터 파일 저장, AI 실행, 마감 알림을 쓸 수 없어요. 설치한 <b>Essay</b> 앱을 실행하거나, 개발 중이라면{' '}
        <code>npm run dev</code>로 여세요.
      </p>
    </div>,
  )
} else {
  root.render(
    <StrictMode>
      <HashRouter>
        <StoreProvider>
          <JobSearchProvider>
            <PostingReaderProvider>
              <App />
            </PostingReaderProvider>
          </JobSearchProvider>
        </StoreProvider>
      </HashRouter>
    </StrictMode>,
  )
}
