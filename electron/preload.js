const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  downloadAsset: (data) => ipcRenderer.invoke('download-asset', data),
  downloadFolder: (data) => ipcRenderer.invoke('download-folder', data),
  readFile: (path) => ipcRenderer.invoke('read-file', path),

  p4CheckAvailable: () => ipcRenderer.invoke('p4-check-available'),
  p4CheckConnection: () => ipcRenderer.invoke('p4-check-connection'),
  p4CheckSession: () => ipcRenderer.invoke('p4-check-session'),
  p4GetConfiguredServer: () => ipcRenderer.invoke('p4-get-configured-server'),
  p4Login: (data) => ipcRenderer.invoke('p4-login', data),
  p4GetInfo: () => ipcRenderer.invoke('p4-get-info'),

  p4CheckFileStatus: (filePath) => ipcRenderer.invoke('p4-check-file-status', filePath),
  p4CheckoutFiles: (data) => ipcRenderer.invoke('p4-checkout-files', data),
  p4AddFile: (data) => ipcRenderer.invoke('p4-add-file', data),

  p4GetOpened: (clientName) => ipcRenderer.invoke('p4-get-opened', clientName),
  p4Submit: (options) => ipcRenderer.invoke('p4-submit', options),
  p4RevertFiles: (options) => ipcRenderer.invoke('p4-revert-files', options),
  p4Sync: (options) => ipcRenderer.invoke('p4-sync', options),
  p4Diff: (filePath) => ipcRenderer.invoke('p4-diff', filePath),

  p4GetDepotDirs: (path) => ipcRenderer.invoke('p4-get-depot-dirs', path),
  p4GetDepotFiles: (path) => ipcRenderer.invoke('p4-get-depot-files', path),
  p4PrintDepotFile: (depotPath) => ipcRenderer.invoke('p4-print-depot-file', depotPath),
  p4GetAssetMetadata: (depotPath) => ipcRenderer.invoke('p4-get-asset-metadata', depotPath),
  selectUploadFiles: () => ipcRenderer.invoke('select-upload-files'),
  p4UploadToDepot: (data) => ipcRenderer.invoke('p4-upload-to-depot', data),
  p4ResolveArtClient: () => ipcRenderer.invoke('p4-resolve-art-client'),

  listFolderFiles: (folderPath) => ipcRenderer.invoke('list-folder-files', folderPath),
  profileLoad: () => ipcRenderer.invoke('profile-load'),
  profileSave: (profile) => ipcRenderer.invoke('profile-save', profile),
  listLibraryEntries: (dirPath) => ipcRenderer.invoke('list-library-entries', dirPath),
  scanAssets: (rootPath) => ipcRenderer.invoke('scan-assets', rootPath),
  indexLoad: () => ipcRenderer.invoke('index-load'),
  scanLibraries: (roots) => ipcRenderer.invoke('scan-libraries', roots),
  readZipPreview: (zipPath) => ipcRenderer.invoke('read-zip-preview', zipPath),
  readZipMetadata: (zipPath) => ipcRenderer.invoke('read-zip-metadata', zipPath),
  convertImagePreview: (filePath, ext) => ipcRenderer.invoke('convert-image-preview', filePath, ext),
  settingsLoad: () => ipcRenderer.invoke('settings-load'),
  settingsSave: (settings) => ipcRenderer.invoke('settings-save', settings),
});
