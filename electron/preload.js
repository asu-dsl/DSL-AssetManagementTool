const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  readDirectoryTree: (path) => ipcRenderer.invoke('read-directory-tree', path),
  saveJson: (data) => ipcRenderer.invoke('save-json', data),
  readFile: (path) => ipcRenderer.invoke('read-file', path),
  getCommonFolders: () => ipcRenderer.invoke('get-common-folders'),

  onFileSystemChanged: (callback) => {
    ipcRenderer.on('file-system-changed', (event, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('file-system-changed');
  },

  p4CheckAvailable: () => ipcRenderer.invoke('p4-check-available'),
  p4CheckConnection: () => ipcRenderer.invoke('p4-check-connection'),
  p4GetInfo: () => ipcRenderer.invoke('p4-get-info'),
  p4RefreshStatus: () => ipcRenderer.invoke('p4-refresh-status'),
  p4SetClient: (clientName) => ipcRenderer.invoke('p4-set-client', clientName),

  p4CheckFileStatus: (filePath) => ipcRenderer.invoke('p4-check-file-status', filePath),
  p4Fstat: (filePath) => ipcRenderer.invoke('p4-fstat', filePath),
  p4CheckoutFile: (filePath) => ipcRenderer.invoke('p4-checkout-file', filePath),
  p4CheckoutFiles: (data) => ipcRenderer.invoke('p4-checkout-files', data),
  p4RevertFile: (filePath) => ipcRenderer.invoke('p4-revert-file', filePath),
  p4AddFile: (data) => ipcRenderer.invoke('p4-add-file', data),

  p4GetOpened: (clientName) => ipcRenderer.invoke('p4-get-opened', clientName),
  p4Submit: (options) => ipcRenderer.invoke('p4-submit', options),
  p4RevertFiles: (options) => ipcRenderer.invoke('p4-revert-files', options),
  p4Sync: (options) => ipcRenderer.invoke('p4-sync', options),
  p4Diff: (filePath) => ipcRenderer.invoke('p4-diff', filePath),

  p4GetPendingChanges: (options) => ipcRenderer.invoke('p4-get-pending-changes', options),
  p4DescribeChange: (changeNumber) => ipcRenderer.invoke('p4-describe-change', changeNumber),
  p4Filelog: (filePath) => ipcRenderer.invoke('p4-filelog', filePath),

  p4GetStreams: () => ipcRenderer.invoke('p4-get-streams'),
  p4GetDepots: () => ipcRenderer.invoke('p4-get-depots'),
  p4GetDepotDirs: (path) => ipcRenderer.invoke('p4-get-depot-dirs', path),
  p4GetDepotFiles: (path) => ipcRenderer.invoke('p4-get-depot-files', path),

  p4AddFiles: (data) => ipcRenderer.invoke('p4-add-files', data),
  p4SearchFiles: (options) => ipcRenderer.invoke('p4-search-files', options),

  favoritesLoad: () => ipcRenderer.invoke('favorites-load'),
  favoritesSave: (favorites) => ipcRenderer.invoke('favorites-save', favorites),
  getPathInfo: (targetPath) => ipcRenderer.invoke('get-path-info', targetPath),

  listFolderFiles: (folderPath) => ipcRenderer.invoke('list-folder-files', folderPath),
  renameFile: (data) => ipcRenderer.invoke('rename-file', data),
  openInExplorer: (targetPath) => ipcRenderer.invoke('open-in-explorer', targetPath),
  profileLoad: () => ipcRenderer.invoke('profile-load'),
  profileSave: (profile) => ipcRenderer.invoke('profile-save', profile),
  scanAssetLibrary: (rootPath) => ipcRenderer.invoke('scan-asset-library', rootPath),
  listLibraryEntries: (dirPath) => ipcRenderer.invoke('list-library-entries', dirPath),
  scanAssets: (rootPath) => ipcRenderer.invoke('scan-assets', rootPath),
  indexLoad: () => ipcRenderer.invoke('index-load'),
  scanLibraries: (roots) => ipcRenderer.invoke('scan-libraries', roots),
  indexCheck: (roots) => ipcRenderer.invoke('index-check', roots),
  readZipPreview: (zipPath) => ipcRenderer.invoke('read-zip-preview', zipPath),
  readZipMetadata: (zipPath) => ipcRenderer.invoke('read-zip-metadata', zipPath),
  sidecarLoad: (assetPath) => ipcRenderer.invoke('sidecar-load', assetPath),
  sidecarSave: (data) => ipcRenderer.invoke('sidecar-save', data),
  settingsLoad: () => ipcRenderer.invoke('settings-load'),
  settingsSave: (settings) => ipcRenderer.invoke('settings-save', settings),
  selectImage: () => ipcRenderer.invoke('select-image'),
});
