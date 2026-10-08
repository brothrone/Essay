import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Electron이 dist/index.html을 파일로 열기 때문에 상대 경로로 빌드
  base: './',
  // npm run dev 에서 Electron이 붙는 포트
  server: { port: 5173, strictPort: true },
})
