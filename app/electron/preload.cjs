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
  loadData: () => ipcRenderer.sendSync('data:load'),
  saveData: (json) => ipcRenderer.invoke('data:save', json),
  saveDataSync: (json) => ipcRenderer.sendSync('data:save-sync', json),
  copyText: (text) => ipcRenderer.invoke('clipboard:write', text),
  openDataFolder: () => ipcRenderer.invoke('app:open-data-folder'),
  openLogsFolder: () => ipcRenderer.invoke('app:open-logs-folder'),
  confirm: (message, options = {}) => ipcRenderer.invoke('dialog:confirm', { message, ...options }),
  exportBackup: (json, filename) => ipcRenderer.invoke('backup:export', { json, filename }),
  importBackup: () => ipcRenderer.invoke('backup:import'),
  /** 화면이 준비됐을 때 한 번 호출 → 쌓여 있던 이동·새 자소서 명령을 받는다 */
  ready: () => ipcRenderer.send('app:ready'),
  relaunch: () => ipcRenderer.invoke('app:relaunch'),
  onNavigate: on('app:navigate'),
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
  ai: {
    status: () => ipcRenderer.invoke('ai:status'),
    run: (prompt, model, options = {}) =>
      ipcRenderer.invoke('ai:run', { prompt, model, web: !!options.web, provider: options.provider || 'claude' }),
    geminiAllowWeb: () => ipcRenderer.invoke('ai:gemini-allow-web'),
    resolveUrls: (urls) => ipcRenderer.invoke('net:resolve-urls', urls),
    openTerminal: (action) => ipcRenderer.invoke('ai:open-terminal', action),
    install: (action) => ipcRenderer.invoke('ai:install', action),
    installCancel: () => ipcRenderer.invoke('ai:install-cancel'),
    onInstallProgress: on('ai:install-progress'),
    onInstallDone: on('ai:install-done'),
    geminiLogin: () => ipcRenderer.invoke('ai:gemini-login'),
    geminiLoginStatus: () => ipcRenderer.invoke('ai:gemini-login-status'),
    sendAuthCode: (code) => ipcRenderer.invoke('ai:auth-code', code),
    cancel: () => ipcRenderer.invoke('ai:cancel'),
    onProgress: on('ai:progress'),
  },
})
