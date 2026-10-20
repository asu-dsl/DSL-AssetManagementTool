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
import CollectionsCard from './components/CollectionsCard';
import { ChevronRight, Download } from 'lucide-react';
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

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'tga', 'tif', 'tiff', 'exr'];
const MODEL_EXTS = ['obj', 'gltf', 'glb', 'fbx', 'dae', 'stl'];
const VIDEO_EXTS = ['mp4', 'mov', 'avi', 'mkv', 'webm'];
const AUDIO_EXTS = ['mp3', 'wav', 'ogg', 'flac'];

const APP_VERSION = 'v0.3.0';

function extOf(name) {
  return (name.split('.').pop() || '').toLowerCase();
}

function typeFromName(name) {
  const ext = extOf(name);
  if (IMAGE_EXTS.includes(ext)) return 'image';
  if (MODEL_EXTS.includes(ext)) return 'model';
  if (VIDEO_EXTS.includes(ext)) return 'video';
  if (AUDIO_EXTS.includes(ext)) return 'audio';
  return 'doc';
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

function ConfirmDialog({ open, message, confirmLabel, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-card" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-msg">{message}</div>
        <div className="confirm-actions">
          <button className="confirm-cancel" type="button" onClick={onCancel}>Cancel</button>
          <button className="confirm-ok" type="button" onClick={onConfirm}>{confirmLabel || 'Confirm'}</button>
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
  const [officialCollections, setOfficialCollections] = useState([]);
  const [myCollections, setMyCollections] = useState([]);
  const [activeCollectionId, setActiveCollectionId] = useState(null);
  const [collectionSideFilter, setCollectionSideFilter] = useState('all');
  const [activeCollectionFolder, setActiveCollectionFolder] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [currentPath, setCurrentPath] = useState(null);
  const [files, setFiles] = useState([]);
  const [catalog, setCatalog] = useState({});
  const [previewFile, setPreviewFile] = useState(null);
  const [fileMetadata, setFileMetadata] = useState({});
  const [showP4Panel, setShowP4Panel] = useState(false);
  const [profile, setProfile] = useState({ displayName: '', key: '' });
  const [p4, setP4] = useState({ available: false, connected: false, user: null, error: null, server: null });
  const [p4LoginDismissed, setP4LoginDismissed] = useState(false);
  // Read independently of login state — p4 info omits the server address
  // when not authenticated, which is exactly when the login form needs it.
  const [p4ConfiguredServer, setP4ConfiguredServer] = useState(null);
  const [leftW, setLeftW] = useState(320);
  const [rightW, setRightW] = useState(372);
  const [leftSplit, setLeftSplit] = useState(0.5);
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

  useEffect(() => {
    (async () => {
      try {
        const res = await window.electron.profileLoad();
        if (res && res.success && res.profile) {
          setProfile(res.profile);
          if (Array.isArray(res.profile.myCollections)) setMyCollections(res.profile.myCollections);
        }
      } catch (e) { console.error('profileLoad failed', e); }
      try {
        const s = await window.electron.settingsLoad();
        if (s && s.success && s.settings) {
          setLibraries(s.settings.libraries || []);
          if (s.settings.librarySide) setLibrarySide(s.settings.librarySide);
          if (s.settings.lastLibBySide) setLastLibBySide(s.settings.lastLibBySide);
          if (Array.isArray(s.settings.officialCollections)) setOfficialCollections(s.settings.officialCollections);
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
          const info = await window.electron.p4GetInfo();
          if (info && info.success) setP4({ available: true, connected: !!info.connected, user: info.user, error: info.sessionError || null, server: info.server || null });
          else setP4({ available: true, connected: false, user: null, error: null, server: null });
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
    if (activeCollectionId) return;
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
  }, [currentPath, activeCollectionId, librarySide, libIndex]);

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
    if (activeCollectionId) return;
    const sideLibs = libraries.filter((l) => (l.side || 'resources') === librarySide);
    if (sideLibs.length === 0) return;
    const inSide = currentPath && sideLibs.some((l) => currentPath === l.root || currentPath.startsWith(l.root));
    if (inSide) return;
    const last = lastLibBySide[librarySide];
    const target = (last && sideLibs.some((l) => l.root === last)) ? last : sideLibs[0].root;
    if (target) setCurrentPath(target);
  }, [librarySide, libraries, currentPath, lastLibBySide, activeCollectionId]);

  // Persist active side + last-opened library per side across restarts.
  useEffect(() => {
    if (!settingsReady) return;
    window.electron.settingsSave({ librarySide, lastLibBySide }).catch(() => {});
  }, [librarySide, lastLibBySide, settingsReady]);

  useEffect(() => {
    if (!settingsReady) return;
    window.electron.settingsSave({ officialCollections }).catch(() => {});
  }, [officialCollections, settingsReady]);

  useEffect(() => {
    if (!settingsReady) return;
    window.electron.profileSave({ key: profile.key, myCollections }).catch(() => {});
  }, [myCollections, settingsReady, profile.key]);

  useEffect(() => {
    if (!activeCollectionId) return;
    const col = [...officialCollections, ...myCollections].find((c) => c.id === activeCollectionId);
    const members = (col && col.members) ? col.members : [];
    const bySide = collectionSideFilter === 'all' ? members : members.filter((m) => (m.side || 'resources') === collectionSideFilter);
    const byFolder = activeCollectionFolder ? bySide.filter((m) => m.folder === activeCollectionFolder) : bySide;
    setFiles(byFolder.map((m) => ({ name: m.name, path: m.path, ext: m.ext || 'zip', type: m.type || 'zipAsset', side: m.side })));
  }, [activeCollectionId, collectionSideFilter, activeCollectionFolder, officialCollections, myCollections]);

  const handleSelectScope = useCallback((path) => {
    setActiveCollectionId(null);
    setActiveCollectionFolder(null);
    setCurrentPath(path);
    const lib = libraries.find((l) => l.root === path);
    if (lib) setLastLibBySide((prev) => ({ ...prev, [lib.side || 'resources']: path }));
  }, [libraries]);

  const handleSideChange = useCallback((sd) => {
    setActiveCollectionId(null);
    setActiveCollectionFolder(null);
    setLibrarySide(sd);
  }, []);

  const newCol = (name) => ({ id: 'col_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name, members: [], folders: [] });
  const handleCreateOfficial = useCallback((name) => setOfficialCollections((prev) => [...prev, newCol(name)]), []);
  const handleCreateMine = useCallback((name) => setMyCollections((prev) => [...prev, newCol(name)]), []);
  const handleSelectCollection = useCallback((id) => { setActiveCollectionId(id); setActiveCollectionFolder(null); }, []);
  const handleSelectCollectionFolder = useCallback((colId, folderId) => { setActiveCollectionId(colId); setActiveCollectionFolder(folderId); }, []);
  const handleAddFolder = useCallback((colId, name) => {
    const fid = 'fld_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const upd = (list) => list.map((c) => (c.id === colId ? { ...c, folders: [...(c.folders || []), { id: fid, name }] } : c));
    setOfficialCollections((prev) => upd(prev));
    setMyCollections((prev) => upd(prev));
  }, []);
  const handleDropToCollection = useCallback((colId, folderId, asset) => {
    const member = { path: asset.path, name: asset.name, ext: asset.ext || 'zip', type: asset.type || 'zipAsset', side: asset.side || librarySide, folder: folderId || null };
    const upd = (list) => list.map((c) => {
      if (c.id !== colId) return c;
      const others = (c.members || []).filter((m) => m.path !== member.path);
      return { ...c, members: [...others, member] };
    });
    setOfficialCollections((prev) => upd(prev));
    setMyCollections((prev) => upd(prev));
  }, [librarySide]);

  const handleRemoveFromCollection = useCallback((colId, memberPath) => {
    const upd = (list) => list.map((c) => (c.id === colId ? { ...c, members: (c.members || []).filter((m) => m.path !== memberPath) } : c));
    setOfficialCollections((prev) => upd(prev));
    setMyCollections((prev) => upd(prev));
  }, []);

  const handleRemoveFromFolder = useCallback((colId, memberPath) => {
    const upd = (list) => list.map((c) => (c.id === colId ? { ...c, members: (c.members || []).map((m) => (m.path === memberPath ? { ...m, folder: null } : m)) } : c));
    setOfficialCollections((prev) => upd(prev));
    setMyCollections((prev) => upd(prev));
  }, []);

  const handleSetCover = useCallback(async (colId) => {
    try {
      if (!window.electron.selectImage) { alert('Restart the app to enable custom covers.'); return; }
      const path = await window.electron.selectImage();
      if (!path) return;
      const upd = (list) => list.map((c) => (c.id === colId ? { ...c, cover: { type: 'image', path } } : c));
      setOfficialCollections((prev) => upd(prev));
      setMyCollections((prev) => upd(prev));
    } catch (e) { console.error('set cover failed', e); }
  }, []);

  const handleToggleLock = useCallback((colId) => {
    const upd = (list) => list.map((c) => (c.id === colId ? { ...c, locked: !c.locked } : c));
    setOfficialCollections((prev) => upd(prev));
    setMyCollections((prev) => upd(prev));
  }, []);

  const handleAssetContext = useCallback((file) => {
    if (!activeCollectionId) return;
    const col = [...officialCollections, ...myCollections].find((c) => c.id === activeCollectionId);
    if (!col) return;
    if (col.locked) return;
    if (activeCollectionFolder) {
      const folder = (col.folders || []).find((f) => f.id === activeCollectionFolder);
      const fname = folder ? folder.name : 'this folder';
      setConfirm({
        message: 'Remove "' + file.name + '" from folder "' + fname + '"? It stays in the collection.',
        confirmLabel: 'Remove from folder',
        onConfirm: () => { handleRemoveFromFolder(activeCollectionId, file.path); },
      });
    } else {
      setConfirm({
        message: 'Remove "' + file.name + '" from "' + col.name + '"?',
        confirmLabel: 'Remove from collection',
        onConfirm: () => {
          handleRemoveFromCollection(activeCollectionId, file.path);
          if (previewFile && previewFile.path === file.path) setPreviewFile(null);
        },
      });
    }
  }, [activeCollectionId, activeCollectionFolder, officialCollections, myCollections, previewFile, handleRemoveFromCollection, handleRemoveFromFolder]);
  const handleAddToCollection = useCallback((colId) => {
    if (!previewFile) return;
    const member = { path: previewFile.path, name: previewFile.name, ext: previewFile.ext, type: previewFile.type, side: librarySide };
    const addTo = (list) => list.map((c) => (c.id === colId && !(c.members || []).some((m) => m.path === member.path) ? { ...c, members: [...(c.members || []), member] } : c));
    setOfficialCollections((prev) => addTo(prev));
    setMyCollections((prev) => addTo(prev));
  }, [previewFile, librarySide]);

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
      else if (d.type === 'splitL') setLeftSplit(clamp(d.val + (e.clientY - d.y) / d.h, 0.15, 0.85));
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
  const handleDownloadAsset = useCallback(async () => {
    if (!previewFile) return;
    try {
      const r = await window.electron.downloadAsset({ sourcePath: previewFile.path, suggestedName: previewFile.name });
      if (r && !r.success && !r.canceled) {
        alert('Download failed: ' + (r.error || 'unknown error'));
      }
    } catch (e) {
      alert('Download failed: ' + (e && e.message ? e.message : e));
    }
  }, [previewFile]);

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

  const activeLib = (!activeCollectionId && currentPath)
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
  const startSplit = (type) => (e) => { e.preventDefault(); const h = (e.currentTarget.parentElement && e.currentTarget.parentElement.clientHeight) || 1; dragRef.current = { type, y: e.clientY, val: type === 'splitL' ? leftSplit : rightSplit, h }; document.body.style.userSelect = 'none'; };

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
                  const i = await window.electron.p4GetInfo();
                  if (i && i.success) setP4({ available: true, connected: !!i.connected, user: i.user, error: i.sessionError || null, server: i.server || null });
                  else alert('Perforce not connected - check that p4 is configured for this workspace.');
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
            <UploadPanel currentPath={currentPath} />
          </div>
          <div className="browser-host" style={{ flex: leftSplit + ' 1 0' }}>
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
          <div className="rz-row" onMouseDown={startSplit('splitL')} />
          {/* <div className="collections-host" style={{ flex: (1 - leftSplit) + ' 1 0' }}> */}
            {/* TODO: Upload to p4 repo from local device */}

            {/* Temporarily Removed, will integrate UI into asset navigation panel */}
            {/* <CollectionsCard
              official={officialCollections}
              mine={myCollections}
              activeId={activeCollectionId}
              activeFolder={activeCollectionFolder}
              sideFilter={collectionSideFilter}
              onSideFilter={setCollectionSideFilter}
              onSelect={handleSelectCollection}
              onSelectFolder={handleSelectCollectionFolder}
              onDrop={handleDropToCollection}
              onAddFolder={handleAddFolder}
              onSetCover={handleSetCover}
              onToggleLock={handleToggleLock}
              onCreateOfficial={handleCreateOfficial}
              onCreateMine={handleCreateMine}
            /> */}
          {/* </div> */}
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
                onContext={handleAssetContext}
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
                  disabled={!previewFile}
                  onClick={handleDownloadAsset}
                >
                  <Download size={14} />
                  {previewFile ? 'Download Asset' : 'Select an asset to download'}
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
                    onOpenP4Panel={() => setShowP4Panel(true)}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <P4Panel isOpen={showP4Panel} onClose={() => setShowP4Panel(false)} currentFolder={currentPath} />
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
          try {
            const i = await window.electron.p4GetInfo();
            if (i && i.success) setP4({ available: true, connected: !!i.connected, user: i.user, error: i.sessionError || null, server: i.server || null });
          } catch (e) { /* ignore */ }
        }}
        onOpenP4Login={() => setP4LoginDismissed(false)}
      />
      <ConfirmDialog
        open={!!confirm}
        message={confirm && confirm.message}
        confirmLabel={confirm && confirm.confirmLabel}
        onCancel={() => setConfirm(null)}
        onConfirm={() => { if (confirm && confirm.onConfirm) confirm.onConfirm(); setConfirm(null); }}
      />
    </ErrorBoundary>
  );
}

export default App;
