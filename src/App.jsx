import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import TopBar from './components/TopBar';
import LibraryNav, { P4_ART_DEPOT } from './components/LibraryNav';
import LibraryGrid from './components/LibraryGrid';
import UploadPanel from './components/UploadPanel';
import PerforceLoginModal from './components/PerforceLoginModal';
import FilterPanel from './components/FilterPanel';
import AssetViewer from './components/AssetViewer';
import MetadataPanel from './components/MetadataPanel';
import P4Panel from './components/P4Panel';
import ProfileCard from './components/ProfileCard';
import SettingsCard from './components/SettingsCard';
import { ChevronRight, Download } from 'lucide-react';
import { classifyAsset, extOf } from '../shared/assetClassification.js';
import './App.css';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('App crash caught by ErrorBoundary:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text)' }}>
          <h2>Something went wrong</h2>
          <p style={{ color: 'var(--text-muted)' }}>{this.state.error?.message}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{ marginTop: 20, padding: '10px 20px', background: 'var(--primary)', color: 'var(--primary-fg)', border: 'none', borderRadius: 6, cursor: 'pointer' }}
          >
            Reload view
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const APP_VERSION = 'v0.3.0';

function typeFromName(name) {
  return classifyAsset(name).category;
}

function toAsset(item) {
  return { name: item.name, path: item.path, ext: extOf(item.name), type: typeFromName(item.name) };
}

function ZipPreview({ path }) {
  const [src, setSrc] = useState(null);
  const [tried, setTried] = useState(false);
  useEffect(() => {
    let c = false;
    setSrc(null);
    setTried(false);
    (async () => {
      try {
        const r = await window.electron.readZipPreview(path);
        if (c) return;
        if (r && r.success && r.data) setSrc(`data:${r.mime || 'image/png'};base64,${r.data}`);
        setTried(true);
      } catch {
        if (!c) setTried(true);
      }
    })();
    return () => { c = true; };
  }, [path]);
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, boxSizing: 'border-box' }}>
      {src ? (
        <img src={src} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8 }} />
      ) : (
        <span style={{ color: 'var(--text-faint)', fontSize: 13 }}>{tried ? 'no preview in zip' : 'loading preview...'}</span>
      )}
    </div>
  );
}

function PackageInfo({ meta }) {
  const tags = (meta.autoTags || []).slice(0, 14);
  return (
    <div className="pkg-info">
      <div className="pkg-row"><span className="pkg-label">type</span><span className="pkg-val">{meta.type || 'unknown'}</span></div>
      {meta.categories && meta.categories.length > 0 && (
        <div className="pkg-row"><span className="pkg-label">category</span><span className="pkg-val">{meta.categories.join(' / ')}</span></div>
      )}
      {tags.length > 0 && (
        <div className="pkg-tags">
          {tags.map((t, i) => <span key={i} className="pkg-tag">{t}</span>)}
        </div>
      )}
    </div>
  );
}

function ConfirmDialog({ open, message, confirmLabel, confirmTone, showDontAskAgain, onConfirm, onCancel }) {
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const overlayMouseDownRef = useRef(false);

  useEffect(() => { if (open) setDontAskAgain(false); }, [open]);

  if (!open) return null;

  // Same fix as PerforceLoginModal: only close if both the press and the
  // release landed directly on the backdrop, so selecting text in the
  // message doesn't accidentally dismiss the dialog if the drag ends
  // outside it.
  const handleOverlayMouseDown = (e) => { overlayMouseDownRef.current = e.target === e.currentTarget; };
  const handleOverlayMouseUp = (e) => {
    if (overlayMouseDownRef.current && e.target === e.currentTarget) onCancel();
    overlayMouseDownRef.current = false;
  };

  return (
    <div className="confirm-overlay" onMouseDown={handleOverlayMouseDown} onMouseUp={handleOverlayMouseUp}>
      <div className="confirm-card" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-msg">{message}</div>
        {showDontAskAgain && (
          <label className="confirm-dontask">
            <input type="checkbox" checked={dontAskAgain} onChange={(e) => setDontAskAgain(e.target.checked)} />
            Don't show this again
          </label>
        )}
        <div className="confirm-actions">
          <button className="confirm-cancel" type="button" onClick={onCancel}>Cancel</button>
          <button className={`confirm-ok${confirmTone === 'primary' ? ' confirm-ok-primary' : ''}`} type="button" onClick={() => onConfirm(dontAskAgain)}>{confirmLabel || 'Confirm'}</button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [department, setDepartment] = useState('asset');
  const [search, setSearch] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState({ types: [], categories: [], tag: '' });
  const [libraries, setLibraries] = useState([]);
  const [librarySide, setLibrarySide] = useState('resources');
  const [lastLibBySide, setLastLibBySide] = useState({});
  const [settingsReady, setSettingsReady] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [suppressFolderDownloadWarning, setSuppressFolderDownloadWarning] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [currentPath, setCurrentPath] = useState(null);
  const [files, setFiles] = useState([]);
  const [catalog, setCatalog] = useState({});
  const [previewFile, setPreviewFile] = useState(null);
  const [fileMetadata, setFileMetadata] = useState({});
  const [showP4Panel, setShowP4Panel] = useState(false);
  const [profile, setProfile] = useState({ displayName: '', key: '' });
  const [p4, setP4] = useState({ available: false, connected: false, user: null, error: null, server: null, client: null, clients: [], root: null });
  const [p4LoginDismissed, setP4LoginDismissed] = useState(false);
  // Read independently of login state — p4 info omits the server address
  // when not authenticated, which is exactly when the login form needs it.
  const [p4ConfiguredServer, setP4ConfiguredServer] = useState(null);
  // The single Art-depot workspace (client + its local root) and its pending
  // files — shared by UploadPanel, P4Panel, and LibraryNav so a revert or
  // submit done through one of them is reflected in the others, instead of
  // each keeping its own copy that only updates after its own actions.
  const [artDepot, setArtDepot] = useState({ client: null, root: null });
  const [p4OpenedFiles, setP4OpenedFiles] = useState([]);
  const [leftW, setLeftW] = useState(320);
  const [rightW, setRightW] = useState(372);
  const [rightSplit, setRightSplit] = useState(0.4);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [libIndex, setLibIndex] = useState({ libraries: {} });
  const [scanning, setScanning] = useState(false);
  const [scanInfo, setScanInfo] = useState({});
  const dragRef = useRef(null);

  // The cached index entry whose root is the deepest prefix of a path.
  const indexEntryForPath = useCallback((pth) => {
    if (!pth) return null;
    const libs = libIndex.libraries || {};
    let best = null;
    for (const root of Object.keys(libs)) {
      if (pth === root || pth.startsWith(root + '\\') || pth.startsWith(root + '/')) {
        if (!best || root.length > best.root.length) best = libs[root];
      }
    }
    return best;
  }, [libIndex]);

  // Immediate category children of a folder — from index, else a single live read.
  const getChildren = useCallback(async (dir) => {
    if (dir.startsWith('//')) {
      try {
        const r = await window.electron.p4GetDepotDirs(dir);
        if (r && r.success) return (r.dirs || []).map((d) => ({ name: d.split('/').filter(Boolean).pop() || d, path: d }));
      } catch { /* ignore */ }
      return [];
    }
    const entry = indexEntryForPath(dir);
    if (entry) return (entry.folders || []).filter((f) => f.parent === dir).map((f) => ({ name: f.name, path: f.path }));
    try {
      const r = await window.electron.listLibraryEntries(dir);
      if (r && r.success) return (r.items || []).filter((i) => i.kind === 'category').map((i) => ({ name: i.name, path: i.path }));
    } catch { /* ignore */ }
    return [];
  }, [indexEntryForPath]);

  const handleScanLibraries = useCallback(async () => {
    if (!window.electron.scanLibraries) { alert('Restart the app to enable Scan Libraries.'); return; }
    setScanning(true);
    try {
      const roots = libraries.map((l) => l.root);
      const r = await window.electron.scanLibraries(roots);
      if (r && r.success) {
        setLibIndex(r.index);
        setScanInfo((prev) => {
          const info = { ...prev };
          (r.summary || []).forEach((x) => { info[x.root] = { scannedAt: x.scannedAt, assets: x.assets, changed: x.changed }; });
          return info;
        });
      } else {
        alert('Scan failed: ' + ((r && r.error) || 'unknown error'));
      }
    } catch (e) { alert('Scan failed: ' + (e && e.message ? e.message : e)); }
    finally { setScanning(false); }
  }, [libraries]);

  // Single source of truth for P4 connection/workspace info — pulls
  // client/clients/root into the same `p4` state the connection badge reads,
  // so P4Panel/MetadataPanel can consume it as a prop instead of each
  // re-fetching it themselves.
  const fetchP4Info = useCallback(async () => {
    const info = await window.electron.p4GetInfo();
    if (info && info.success) {
      setP4({
        available: true,
        connected: !!info.connected,
        user: info.user,
        error: info.sessionError || null,
        server: info.server || null,
        client: info.client || null,
        clients: info.clients || [],
        root: info.root || null,
      });
    }
    return info;
  }, []);

  // Resolves (or creates, on a machine that's never touched P4V) the one
  // workspace mapped to the Art depot, and refreshes its pending-files list.
  // This is the single place that call happens — UploadPanel, P4Panel, and
  // LibraryNav all read the results as props and call this after any action
  // that can change them (upload, revert, submit), instead of each keeping
  // an independent copy that only knows about its own actions.
  const refreshP4Opened = useCallback(async () => {
    if (!window.electron) return;
    try {
      const clientRes = await window.electron.p4ResolveArtClient();
      if (!clientRes || !clientRes.success) {
        setArtDepot({ client: null, root: null });
        setP4OpenedFiles([]);
        return;
      }
      setArtDepot({ client: clientRes.client, root: clientRes.root || null });
      const opened = await window.electron.p4GetOpened(clientRes.client);
      if (opened && opened.success) setP4OpenedFiles(opened.files || []);
    } catch { /* ignore — keep last known state */ }
  }, []);

  useEffect(() => { refreshP4Opened(); }, [refreshP4Opened]);

  useEffect(() => {
    (async () => {
      try {
        const res = await window.electron.profileLoad();
        if (res && res.success && res.profile) {
          setProfile(res.profile);
        }
      } catch (e) { console.error('profileLoad failed', e); }
      try {
        const s = await window.electron.settingsLoad();
        if (s && s.success && s.settings) {
          setLibraries(s.settings.libraries || []);
          if (s.settings.librarySide) setLibrarySide(s.settings.librarySide);
          if (s.settings.lastLibBySide) setLastLibBySide(s.settings.lastLibBySide);
          if (s.settings.suppressFolderDownloadWarning) setSuppressFolderDownloadWarning(true);
        }
      } catch (e) { console.error('settingsLoad failed', e); }
      finally { setSettingsReady(true); }
      try {
        if (window.electron.indexLoad) {
          const ix = await window.electron.indexLoad();
          if (ix && ix.success && ix.index) {
            setLibIndex(ix.index);
            const info = {};
            Object.values(ix.index.libraries || {}).forEach((L) => { info[L.root] = { scannedAt: L.scannedAt, assets: (L.assets || []).length }; });
            setScanInfo(info);
          }
        }
      } catch (e) { console.error('indexLoad failed', e); }
      try {
        const avail = await window.electron.p4CheckAvailable();
        if (avail && avail.available) {
          const info = await fetchP4Info();
          if (!info || !info.success) setP4({ available: true, connected: false, user: null, error: null, server: null, client: null, clients: [], root: null });
          const configuredServer = await window.electron.p4GetConfiguredServer();
          if (configuredServer && configuredServer.success) setP4ConfiguredServer(configuredServer.server);
        }
      } catch (e) { console.error('p4 init failed', e); }
    })();
  }, []);

  // Background session poll — cheap (p4 login -s, no client list refetch)
  // so it's safe to run periodically. Paused while the window isn't visible,
  // and re-checks immediately on refocus instead of waiting for the next tick.
  useEffect(() => {
    if (!p4.available) return;
    let active = true;
    const poll = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const r = await window.electron.p4CheckSession();
        if (active) setP4((prev) => ({ ...prev, connected: !!r.connected, error: r.error || null }));
      } catch { /* ignore — keep last known state */ }
    };
    const interval = setInterval(poll, 45000);
    document.addEventListener('visibilitychange', poll);
    return () => {
      active = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', poll);
    };
  }, [p4.available]);

  // Once reconnected, clear any earlier dismissal so the login modal shows
  // fresh the next time a disconnect is actually detected.
  useEffect(() => {
    if (p4.connected) setP4LoginDismissed(false);
  }, [p4.connected]);

  useEffect(() => {
    if (!currentPath) { setFiles([]); return; }
    let active = true;
    (async () => {
      if (currentPath.startsWith('//')) {
        try {
          const r = await window.electron.p4GetDepotFiles(currentPath);
          if (!active) return;
          const items = (r && r.success) ? (r.files || []) : [];
          setFiles(items.map((f) => ({
            name: f.name,
            path: f.depotFile,
            ext: extOf(f.name),
            type: typeFromName(f.name),
            isP4Depot: true,
            side: librarySide,
          })));
        } catch {
          if (active) setFiles([]);
        }
        return;
      }
      const toGrid = (it) => (it.kind === 'assetFolder')
        ? { name: it.name, path: it.path, ext: 'folder', type: 'folderAsset', preview: it.preview || null, side: librarySide }
        : { name: it.name, path: it.path, ext: 'zip', type: 'zipAsset', side: librarySide };
      // Prefer the cached index — no live disk walk.
      const entry = indexEntryForPath(currentPath);
      if (entry) {
        const sep = currentPath.includes('\\') ? '\\' : '/';
        const under = (entry.assets || []).filter((a) => a.path === currentPath || a.path.startsWith(currentPath + sep));
        if (under.length > 0) { setFiles(under.map(toGrid)); return; }
        // fall through: descended into a single asset — show its own files live
      }
      try {
        let assets = null;
        if (window.electron.scanAssets) {
          try { const r = await window.electron.scanAssets(currentPath); if (r && r.success) assets = r.items || []; } catch { assets = null; }
        }
        if (!active) return;
        if (assets && assets.length > 0) { setFiles(assets.map(toGrid)); return; }
        if (window.electron.listLibraryEntries) {
          const r = await window.electron.listLibraryEntries(currentPath);
          if (!active) return;
          const own = ((r && r.items) || []).filter((it) => it.kind !== 'category').map((it) => {
            if (it.kind === 'assetFolder' || it.kind === 'zipAsset') return toGrid(it);
            return { ...toAsset(it), side: librarySide };
          });
          setFiles(own);
        } else {
          setFiles([]);
        }
      } catch (e) {
        if (active) setFiles([]);
      }
    })();
    return () => { active = false; };
  }, [currentPath, librarySide, libIndex]);

  useEffect(() => {
    const zips = files.filter((f) => f.type === 'zipAsset');
    if (zips.length === 0) return;
    let active = true;
    const queue = zips.slice();
    async function worker() {
      while (active && queue.length) {
        const f = queue.shift();
        try {
          const r = await window.electron.readZipMetadata(f.path);
          if (!active) return;
          const meta = (r && r.success && r.metadata) ? r.metadata : { type: 'unknown', categories: [], autoTags: [] };
          setCatalog((prev) => (prev[f.path] ? prev : { ...prev, [f.path]: meta }));
        } catch {
          /* skip */
        }
      }
    }
    Promise.all(Array.from({ length: 6 }, worker));
    return () => { active = false; };
  }, [files]);

  // When the active side changes (or libraries load), scope to a library's top folder:
  // the last one opened on that side, otherwise the first library on that side.
  useEffect(() => {
    const sideLibs = libraries.filter((l) => (l.side || 'resources') === librarySide);
    if (sideLibs.length === 0) return;
    const inSide = currentPath && sideLibs.some((l) => currentPath === l.root || currentPath.startsWith(l.root));
    if (inSide) return;
    const last = lastLibBySide[librarySide];
    const target = (last && sideLibs.some((l) => l.root === last)) ? last : sideLibs[0].root;
    if (target) setCurrentPath(target);
  }, [librarySide, libraries, currentPath, lastLibBySide]);

  // Persist active side + last-opened library per side across restarts.
  useEffect(() => {
    if (!settingsReady) return;
    window.electron.settingsSave({ librarySide, lastLibBySide }).catch(() => {});
  }, [librarySide, lastLibBySide, settingsReady]);

  const handleSelectScope = useCallback((path) => {
    setCurrentPath(path);
    const lib = libraries.find((l) => l.root === path);
    if (lib) setLastLibBySide((prev) => ({ ...prev, [lib.side || 'resources']: path }));
  }, [libraries]);

  const handleSideChange = useCallback((sd) => {
    setLibrarySide(sd);
  }, []);

  const persistProfile = useCallback(async (partial) => {
    setProfile((prev) => ({ ...prev, ...partial }));
    try { await window.electron.profileSave({ key: profile.key, ...partial }); }
    catch (e) { console.error('profileSave failed', e); }
  }, [profile.key]);

  const saveLibraries = useCallback(async (libs) => {
    setLibraries(libs);
    try {
      const r = await window.electron.settingsSave({ libraries: libs });
      if (!r || !r.success) {
        alert('Could not save libraries: ' + ((r && r.error) || 'the settings backend is not loaded. Fully close and relaunch the app.'));
      }
    } catch (e) {
      alert('Could not save libraries: ' + (e && e.message ? e.message : e) + '. Fully close and relaunch the app so the settings backend loads.');
    }
  }, []);

  const handleAddLibrary = useCallback(async (name, side) => {
    try {
      const root = await window.electron.selectFolder();
      if (!root) return;
      const base = root.split(/[\\/]/).filter(Boolean).pop() || 'Library';
      const lib = { id: 'lib_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: (name && name.trim()) || base, root, side: side || 'resources' };
      saveLibraries([...libraries, lib]);
    } catch (e) { console.error('add library failed', e); }
  }, [libraries, saveLibraries]);

  const handleRelink = useCallback(async (id) => {
    try {
      const root = await window.electron.selectFolder();
      if (!root) return;
      saveLibraries(libraries.map((l) => (l.id === id ? { ...l, root } : l)));
    } catch (e) { console.error('relink failed', e); }
  }, [libraries, saveLibraries]);

  const handleRemoveLibrary = useCallback((id) => {
    saveLibraries(libraries.filter((l) => l.id !== id));
  }, [libraries, saveLibraries]);

  const handleMetadataUpdate = (metadata) => {
    if (!previewFile) return;
    // Depot previews use a fresh local temp path every single fetch (see
    // p4PrintDepotFile), so previewFile.path is never stable across repeat
    // views of the same asset — sourcePath (the real depot path) is the
    // only key that's actually reusable for these.
    const key = previewFile.sourcePath || previewFile.path;
    setFileMetadata((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || {}), ...metadata },
    }));
  };

  const facets = useMemo(() => {
    const types = new Set();
    const cats = new Set();
    Object.values(catalog).forEach((m) => {
      if (m.type && m.type !== 'unknown') types.add(m.type);
      (m.categories || []).forEach((c) => cats.add(c));
    });
    return { types: Array.from(types).sort(), categories: Array.from(cats).sort() };
  }, [catalog]);

  const q = search.trim().toLowerCase();
  const ftag = filters.tag.trim().toLowerCase();
  const visibleFiles = files.filter((f) => {
    const cm = catalog[f.path] || {};
    const um = fileMetadata[f.path] || {};
    const userTags = Array.isArray(um.tags) ? um.tags : (um.tags ? String(um.tags).split(',') : []);
    const auto = cm.autoTags || [];
    const cats = cm.categories || [];
    if (q) {
      const hay = [f.name, cm.name || '', um.title || '', um.notes || ''].concat(auto, userTags, cats).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (filters.types.length && !filters.types.includes(cm.type)) return false;
    if (filters.categories.length && !cats.some((c) => filters.categories.includes(c))) return false;
    if (ftag) {
      if (!auto.concat(userTags).join(' ').toLowerCase().includes(ftag)) return false;
    }
    return true;
  });

  const gridFiles = visibleFiles.map((f) => {
    const cm = catalog[f.path];
    return cm && cm.name ? { ...f, name: cm.name } : f;
  });

  const selMeta = previewFile ? catalog[previewFile.path] : null;

  useEffect(() => {
    const onMove = (e) => {
      const d = dragRef.current;
      if (!d) return;
      const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
      if (d.type === 'colL') {
        const target = d.val + (e.clientX - d.x);
        if (target < 320 - 60) setLeftCollapsed(true);
        else { setLeftCollapsed(false); setLeftW(clamp(target, 320, 560)); }
      } else if (d.type === 'colR') {
        const target = d.val - (e.clientX - d.x);
        if (target < 372 - 60) setRightCollapsed(true);
        else { setRightCollapsed(false); setRightW(clamp(target, 372, 640)); }
      }
      else if (d.type === 'splitR') setRightSplit(clamp(d.val + (e.clientY - d.y) / d.h, 0.15, 0.85));
    };
    const onUp = () => { dragRef.current = null; document.body.style.userSelect = ''; };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, []);

  const handleOpenAsset = useCallback((f) => {
    if (f && f.type === 'folderAsset') handleSelectScope(f.path);
  }, [handleSelectScope]);

  // Depot files aren't local paths — fetch their content via p4 print to a
  // temp file first, then preview that like any other local asset.
  const handleSelectAsset = useCallback(async (f) => {
    if (f && f.isP4Depot) {
      try {
        const r = await window.electron.p4PrintDepotFile(f.path);
        if (r && r.success) setPreviewFile({ name: r.name, path: r.localPath, sourcePath: f.path });
      } catch { /* ignore */ }
      return;
    }
    setPreviewFile(f);
  }, []);

  // By the time an asset is previewed, its full content already sits at
  // previewFile.path locally (for depot assets, that's the temp file p4
  // print already fetched for the preview itself) — so download is just
  // "ask where to save it, then copy," identical for local and depot assets.
  const performFolderDownload = useCallback(async () => {
    try {
      const r = await window.electron.downloadFolder({ folderPath: currentPath });
      if (r && r.success) {
        if (r.errors && r.errors.length > 0) {
          alert(`Downloaded ${r.downloaded} of ${r.total} file(s) to:\n${r.destFolder}\n\n${r.errors.length} file(s) failed:\n` + r.errors.join('\n'));
        }
      } else if (r && !r.canceled) {
        alert('Download failed: ' + (r.error || 'unknown error'));
      }
    } catch (e) {
      alert('Download failed: ' + (e && e.message ? e.message : e));
    }
  }, [currentPath]);

  const handleDownloadAsset = useCallback(async () => {
    if (previewFile) {
      try {
        const r = await window.electron.downloadAsset({ sourcePath: previewFile.path, suggestedName: previewFile.name });
        if (r && !r.success && !r.canceled) {
          alert('Download failed: ' + (r.error || 'unknown error'));
        }
      } catch (e) {
        alert('Download failed: ' + (e && e.message ? e.message : e));
      }
      return;
    }

    if (!currentPath) return;
    if (suppressFolderDownloadWarning) {
      performFolderDownload();
      return;
    }

    const folderName = currentPath.split(/[\\/]+/).filter(Boolean).pop() || currentPath;
    setConfirm({
      message: `You are about to download an entire folder ("${folderName}"). Are you sure you want to proceed?`,
      confirmLabel: 'Download Folder',
      confirmTone: 'primary',
      showDontAskAgain: true,
      onConfirm: (dontAskAgain) => {
        if (dontAskAgain) {
          setSuppressFolderDownloadWarning(true);
          window.electron.settingsSave({ suppressFolderDownloadWarning: true }).catch(() => {});
        }
        performFolderDownload();
      },
    });
  }, [previewFile, currentPath, suppressFolderDownloadWarning, performFolderDownload]);

  // Fetch a depot asset's .dslmeta.json sidecar on demand — only when it's
  // actually opened, never eagerly for a whole folder listing, matching how
  // this is meant to stay lightweight without a full depot clone. A missing
  // sidecar is normal (asset just has no metadata yet), not an error.
  useEffect(() => {
    if (!previewFile || !previewFile.isP4Depot || !previewFile.sourcePath) return;
    if (fileMetadata[previewFile.sourcePath]) return;
    let active = true;
    (async () => {
      try {
        const r = await window.electron.p4GetAssetMetadata(previewFile.sourcePath);
        if (active && r && r.success && r.record) {
          setFileMetadata((prev) => ({ ...prev, [previewFile.sourcePath]: r.record }));
        }
      } catch { /* ignore */ }
    })();
    return () => { active = false; };
  }, [previewFile, fileMetadata]);

  const activeLib = currentPath
    ? (currentPath.startsWith('//')
      ? P4_ART_DEPOT
      : libraries.find((l) => currentPath === l.root || currentPath.startsWith(l.root + '\\') || currentPath.startsWith(l.root + '/')))
    : null;
  const crumbs = (() => {
    if (!activeLib) return [];
    const sep = activeLib.root.includes('\\') ? '\\' : '/';
    const rest = currentPath.slice(activeLib.root.length).split(/[\\/]+/).filter(Boolean);
    const out = [{ name: activeLib.name, path: activeLib.root }];
    let acc = activeLib.root;
    rest.forEach((seg) => { acc = acc + sep + seg; out.push({ name: seg, path: acc }); });
    return out;
  })();

  const startCol = (type) => (e) => { e.preventDefault(); const cur = type === 'colL' ? (leftCollapsed ? 0 : leftW) : (rightCollapsed ? 0 : rightW); dragRef.current = { type, x: e.clientX, val: cur }; document.body.style.userSelect = 'none'; };
  const startSplit = (type) => (e) => { e.preventDefault(); const h = (e.currentTarget.parentElement && e.currentTarget.parentElement.clientHeight) || 1; dragRef.current = { type, y: e.clientY, val: rightSplit, h }; document.body.style.userSelect = 'none'; };

  return (
    <ErrorBoundary>
      <div className="app2" style={{ gridTemplateColumns: (leftCollapsed ? 0 : leftW) + 'px 6px minmax(0, 1fr) 6px ' + (rightCollapsed ? 0 : rightW) + 'px' }}>
        <div className="app2-top">
          <TopBar
            department={department}
            onDepartmentChange={setDepartment}
            search={search}
            onSearchChange={setSearch}
            filterOpen={filterOpen}
            onToggleFilter={() => setFilterOpen((o) => !o)}
          right={(
            <ProfileCard
              displayName={profile.displayName || profile.key || 'Artist'}
              p4User={p4.user}
              p4Connected={p4.connected}
              p4Error={p4.error}
              onOpenP4Login={() => setP4LoginDismissed(false)}
              // codaConnected={false}
              // TODO: add NAS connected 
              onEditDisplayName={(v) => persistProfile({ displayName: v })}
              onConnectPerforce={async () => {
                try {
                  const i = await fetchP4Info();
                  if (!i || !i.success) alert('Perforce not connected - check that p4 is configured for this workspace.');
                } catch (e) { alert('Perforce check failed.'); }
              }}
              onConnectCoda={() => alert('Coda connection - coming in a later pass.')}
              onOpenSettings={() => setShowSettings(true)}
            />
          )}
          />
        </div>

        <div className="app2-left">
          <div className="upload-host">
            <UploadPanel
              currentPath={currentPath}
              onOpenP4Panel={() => setShowP4Panel(true)}
              openedFiles={p4OpenedFiles}
              onRefreshOpened={refreshP4Opened}
              p4={p4}
              onRefreshConnection={fetchP4Info}
              artDepotClient={artDepot.client}
              artDepotRoot={artDepot.root}
            />
          </div>
          <div className="browser-host">
            <LibraryNav
              libraries={libraries}
              side={librarySide}
              onSideChange={handleSideChange}
              activeScope={currentPath}
              onSelectScope={handleSelectScope}
              onManage={() => setShowSettings(true)}
              getChildren={getChildren}
              onScan={handleScanLibraries}
              scanning={scanning}
            />
          </div>
          <div className="app-version">DSL Asset Manager {APP_VERSION}</div>
        </div>

        <div className="rz-col rz-col-left" onMouseDown={startCol('colL')} />
        <div className="app2-center app2-cell">
          <div className="center-stack">
            {filterOpen && (
              <FilterPanel
                facets={facets}
                active={filters}
                onToggleType={(t) => setFilters((s) => ({ ...s, types: s.types.includes(t) ? s.types.filter((x) => x !== t) : [...s.types, t] }))}
                onToggleCategory={(c) => setFilters((s) => ({ ...s, categories: s.categories.includes(c) ? s.categories.filter((x) => x !== c) : [...s.categories, c] }))}
                onTagChange={(v) => setFilters((s) => ({ ...s, tag: v }))}
                onClear={() => setFilters({ types: [], categories: [], tag: '' })}
              />
            )}
            {crumbs.length > 1 && (
              <div className="crumbs">
                {crumbs.map((c, i) => (
                  <span key={c.path} className="crumb">
                    {i > 0 && <ChevronRight size={12} className="crumb-sep" />}
                    <button type="button" className={'crumb-btn' + (i === crumbs.length - 1 ? ' crumb-cur' : '')} onClick={() => handleSelectScope(c.path)}>{c.name}</button>
                  </span>
                ))}
              </div>
            )}
            <div className="grid-host">
              <LibraryGrid
                files={gridFiles}
                selectedPath={previewFile ? (previewFile.sourcePath || previewFile.path) : null}
                onSelectAsset={handleSelectAsset}
                onOpenAsset={handleOpenAsset}
              />
            </div>
          </div>
        </div>

        <div className="rz-col rz-col-right" onMouseDown={startCol('colR')} />
        <div className="app2-right app2-cell">
          <div className="app2-right-stack">
            <div className="preview-host" style={{ flex: rightSplit + ' 1 0' }}>
              <div className="preview-content">
                {previewFile && previewFile.type === 'zipAsset'
                  ? <ZipPreview path={previewFile.path} />
                  : <AssetViewer file={previewFile} selectedFiles={[]} />}
              </div>
              <div className="preview-download-bar">
                <button
                  className="dl-btn"
                  type="button"
                  disabled={!previewFile && !currentPath}
                  onClick={handleDownloadAsset}
                >
                  <Download size={14} />
                  {previewFile ? 'Download Asset' : currentPath ? 'Download Folder' : 'Download a folder or asset'}
                </button>
              </div>
            </div>
            <div className="rz-row" onMouseDown={startSplit('splitR')} />
            <div className="meta-host" style={{ flex: (1 - rightSplit) + ' 1 0' }}>
              <div className="meta-stack">
                {previewFile && previewFile.type === 'zipAsset' && selMeta && <PackageInfo meta={selMeta} />}
                <div className="meta-inner">
                  <MetadataPanel
                    selectedFiles={previewFile ? [previewFile] : []}
                    currentFile={previewFile}
                    metadata={previewFile ? fileMetadata[previewFile.sourcePath || previewFile.path] : null}
                    onMetadataUpdate={handleMetadataUpdate}
                    p4={p4}
                    onRefreshOpened={refreshP4Opened}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <P4Panel
        isOpen={showP4Panel}
        onClose={() => setShowP4Panel(false)}
        currentFolder={currentPath}
        p4={p4}
        onRefreshConnection={fetchP4Info}
        artDepotClient={artDepot.client}
        artDepotRoot={artDepot.root}
        openedFiles={p4OpenedFiles}
        onRefreshOpened={refreshP4Opened}
      />
      <PerforceLoginModal
        open={p4.available && !p4.connected && !p4LoginDismissed}
        defaultServer={p4ConfiguredServer || p4.server}
        defaultUser={p4.user}
        onClose={() => setP4LoginDismissed(true)}
        onSuccess={async () => {
          try {
            const r = await window.electron.p4CheckSession();
            setP4((prev) => ({ ...prev, connected: !!r.connected, error: r.error || null }));
          } catch { /* ignore */ }
        }}
      />
      <SettingsCard
        open={showSettings}
        onClose={() => setShowSettings(false)}
        libraries={libraries}
        onAddLibrary={handleAddLibrary}
        onRelink={handleRelink}
        onRemove={handleRemoveLibrary}
        onScan={handleScanLibraries}
        scanning={scanning}
        scanInfo={scanInfo}
        p4={p4}
        onTestPerforce={async () => {
          try { await fetchP4Info(); } catch (e) { /* ignore */ }
        }}
        onOpenP4Login={() => setP4LoginDismissed(false)}
      />
      <ConfirmDialog
        open={!!confirm}
        message={confirm && confirm.message}
        confirmLabel={confirm && confirm.confirmLabel}
        confirmTone={confirm && confirm.confirmTone}
        showDontAskAgain={confirm && confirm.showDontAskAgain}
        onCancel={() => setConfirm(null)}
        onConfirm={(dontAskAgain) => { if (confirm && confirm.onConfirm) confirm.onConfirm(dontAskAgain); setConfirm(null); }}
      />
    </ErrorBoundary>
  );
}

export default App;
