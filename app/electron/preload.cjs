// 화면 코드(window.desktop)에 허용한 기능만 노출한다
const { contextBridge, ipcRenderer } = require('electron')

const on = (channel) => (fn) => {
  const listener = (_e, payload) => fn(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('desktop', {
  dataPath: ipcRenderer.sendSync('app:data-path'),
  info: ipcRenderer.sendSync('app:info'),
  pickImportFiles: () => ipcRenderer.invoke('import:pick-files'),
  onAbout: on('app:about'),
  onImport: on('app:import'),
  onWelcome: on('app:welcome'),
  onHelp: on('app:help'),
  onFeedback: on('app:feedback'),
  appConfig: () => ipcRenderer.invoke('app:config'),
  /** 개선 돕기: 의견 보내기 · 익명 통계 · 오류 보고 · 문항 모음 (서버 주소가 없거나 동의하지 않으면 보내지 않음) */
  community: {
    state: () => ipcRenderer.invoke('community:state'),
    setConsent: (c) => ipcRenderer.invoke('community:set-consent', c),
    track: (name) => ipcRenderer.send('community:track', name),
    setContext: (ctx) => ipcRenderer.send('community:context', ctx),
    reportError: (e) => ipcRenderer.send('community:error', e),
    sendFeedback: (f) => ipcRenderer.invoke('community:feedback', f),
    findQuestions: (q) => ipcRenderer.invoke('community:find-questions', q),
    shareQuestions: (info) => ipcRenderer.send('community:share-questions', info),
    lookupPosting: (url) => ipcRenderer.invoke('community:posting-lookup', url),
    sharePosting: (info) => ipcRenderer.send('community:posting-share', info),
    insights: (q) => ipcRenderer.invoke('community:insights', q),
  },
  loadData: () => ipcRenderer.sendSync('data:load'),
  saveData: (json) => ipcRenderer.invoke('data:save', json),
  saveDataSync: (json) => ipcRenderer.sendSync('data:save-sync', json),
  copyText: (text) => ipcRenderer.invoke('clipboard:write', text),
  openDataFolder: () => ipcRenderer.invoke('app:open-data-folder'),
  openLogsFolder: () => ipcRenderer.invoke('app:open-logs-folder'),
  confirm: (message, options = {}) => ipcRenderer.invoke('dialog:confirm', { message, ...options }),
  exportBackup: (json, filename) => ipcRenderer.invoke('backup:export', { json, filename }),
  importBackup: () => ipcRenderer.invoke('backup:import'),
  backups: {
    list: () => ipcRenderer.invoke('backup:list'),
    read: (name) => ipcRenderer.invoke('backup:read', name),
    snapshot: (label) => ipcRenderer.invoke('backup:snapshot', label),
  },
  /** 화면이 준비됐을 때 한 번 호출 → 쌓여 있던 이동·새 자소서 명령을 받는다 */
  ready: () => ipcRenderer.send('app:ready'),
  relaunch: () => ipcRenderer.invoke('app:relaunch'),
  onNavigate: on('app:navigate'),
  onFullscreen: on('app:fullscreen'),
  onNewProject: on('app:new-project'),
  update: {
    status: () => ipcRenderer.invoke('update:status'),
    check: () => ipcRenderer.invoke('update:check'),
    install: () => ipcRenderer.invoke('update:install'),
    onStatus: on('update:status'),
  },
  theme: {
    get: () => ipcRenderer.invoke('theme:get'),
    set: (source) => ipcRenderer.invoke('theme:set', source),
    onChanged: on('theme:changed'),
  },
  billing: {
    state: () => ipcRenderer.invoke('billing:state'),
    activate: (key) => ipcRenderer.invoke('billing:activate', key),
    buy: () => ipcRenderer.invoke('billing:buy'),
    cancel: () => ipcRenderer.invoke('billing:cancel'),
    openTerms: () => ipcRenderer.invoke('billing:open-terms'),
    onChanged: on('billing:changed'),
  },
  ai: {
    status: (opts) => ipcRenderer.invoke('ai:status', opts),
    run: (prompt, model, options = {}) =>
      ipcRenderer.invoke('ai:run', { prompt, model, web: !!options.web, provider: options.provider || 'claude' }),
    geminiAllowWeb: () => ipcRenderer.invoke('ai:gemini-allow-web'),
    resolveUrls: (urls) => ipcRenderer.invoke('net:resolve-urls', urls),
    checkPostings: (urls, today) => ipcRenderer.invoke('net:check-postings', urls, today),
    openTerminal: (action) => ipcRenderer.invoke('ai:open-terminal', action),
    install: (action) => ipcRenderer.invoke('ai:install', action),
    installCancel: () => ipcRenderer.invoke('ai:install-cancel'),
    onInstallProgress: on('ai:install-progress'),
    onInstallDone: on('ai:install-done'),
    geminiLogin: () => ipcRenderer.invoke('ai:gemini-login'),
    geminiLoginStatus: () => ipcRenderer.invoke('ai:gemini-login-status'),
    sendAuthCode: (code) => ipcRenderer.invoke('ai:auth-code', code),
    gptLogin: () => ipcRenderer.invoke('ai:gpt-login'),
    gptLoginCancel: () => ipcRenderer.invoke('ai:gpt-login-cancel'),
    onGptLogin: on('ai:gpt-login'),
    cancel: () => ipcRenderer.invoke('ai:cancel'),
    usage: () => ipcRenderer.invoke('ai:usage'),
    usageReset: () => ipcRenderer.invoke('ai:usage-reset'),
    models: (provider) => ipcRenderer.sendSync('ai:models', provider),
    onProgress: on('ai:progress'),
  },
})
