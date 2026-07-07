import { useEffect, useState } from 'react';
import { Library, ChevronRight, ChevronDown, Plus, RefreshCw } from 'lucide-react';
import './LibraryNav.css';

const coverCache = new Map();
const IMG_RE = /\.(png|jpe?g|webp|gif|bmp|tga|tif|tiff|exr)$/;

async function sampleCovers(root) {
  if (coverCache.has(root)) return coverCache.get(root);
  const out = [];
  const queue = [root];
  let visited = 0;
  while (queue.length && out.length < 3 && visited < 40) {
    const dir = queue.shift();
    visited += 1;
    let items = [];
    try { const r = await window.electron.listFolderFiles(dir); items = (r && r.items) ? r.items : []; } catch { items = []; }
    for (const it of items) {
      if (out.length >= 3) break;
      if (it.isDirectory) { queue.push(it.path); continue; }
      const n = it.name.toLowerCase();
      if (n.endsWith('.zip')) out.push({ path: it.path, type: 'zipAsset' });
      else if (IMG_RE.test(n)) out.push({ path: it.path, type: 'image', ext: n.split('.').pop() });
    }
  }
  coverCache.set(root, out);
  return out;
}

function useCover(path) {
  const [covers, setCovers] = useState(coverCache.get(path) || []);
  useEffect(() => {
    let c = false;
    if (coverCache.has(path)) { setCovers(coverCache.get(path)); return; }
    sampleCovers(path).then((cv) => { if (!c) setCovers(cv); });
    return () => { c = true; };
  }, [path]);
  return covers;
}

function Tile({ member }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let c = false;
    setSrc(null);
    if (!member) return;
    (async () => {
      try {
        if (member.type === 'zipAsset') {
          const r = await window.electron.readZipPreview(member.path);
          if (!c && r && r.success && r.data) setSrc(`data:${r.mime || 'image/png'};base64,${r.data}`);
        } else {
          const r = await window.electron.readFile(member.path);
          if (!c && r && r.success && r.data) setSrc(`data:image/${member.ext || 'png'};base64,${r.data}`);
        }
      } catch { /* ignore */ }
    })();
    return () => { c = true; };
  }, [member && member.path]);
  return <div className="cc-tile">{src ? <img src={src} alt="" /> : null}</div>;
}

function CoverBg({ members }) {
  const three = (members || []).slice(0, 3);
  return <div className="cc-montage">{three.map((m, i) => <Tile key={(m && m.path) || i} member={m} />)}</div>;
}

function FolderCardNav({ node, activeScope, onSelectScope, getChildren }) {
  const [open, setOpen] = useState(false);
  const [subs, setSubs] = useState(null);
  const covers = useCover(node.path);
  const active = node.path === activeScope;
  const toggle = async (e) => {
    e.stopPropagation();
    const n = !open;
    setOpen(n);
    if (n && subs === null) { const list = await getChildren(node.path); setSubs(list); }
  };
  return (
    <div className="cc-wrap">
      <div className={`cc-fcard${active ? ' cc-fcard-active' : ''}`} onClick={() => onSelectScope(node.path)}>
        <CoverBg members={covers} />
        <div className="cc-overlay" />
        <div className="cc-fcontent">
          <span className={'cc-fname' + (String(node.name || '').length > 20 ? ' cc-faded' : '')}>{String(node.name || '').slice(0, 30)}</span>
          <button className="cc-iconbtn" type="button" onClick={toggle}>{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</button>
        </div>
      </div>
      {open && subs && subs.length > 0 && (
        <div className="cc-tray">
          {subs.map((s) => <FolderCardNav key={s.path} node={s} activeScope={activeScope} onSelectScope={onSelectScope} getChildren={getChildren} />)}
        </div>
      )}
    </div>
  );
}

function LibraryCard({ lib, activeScope, onSelectScope, getChildren }) {
  const [open, setOpen] = useState(false);
  const [subs, setSubs] = useState(null);
  const covers = useCover(lib.root);
  const active = lib.root === activeScope;
  const toggle = async (e) => {
    e.stopPropagation();
    const n = !open;
    setOpen(n);
    if (n && subs === null) { const list = await getChildren(lib.root); setSubs(list); }
  };
  return (
    <div className="cc-wrap">
      <div className={`cc-card${active ? ' cc-card-active' : ''}${open ? ' cc-card-open' : ''}`} onClick={() => onSelectScope(lib.root)}>
        <CoverBg members={covers} />
        <div className="cc-overlay" />
        <div className="cc-content">
          <span className={'cc-name' + (String(lib.name || '').length > 20 ? ' cc-faded' : '')}>{String(lib.name || '').slice(0, 30)}</span>
          <button className="cc-iconbtn" type="button" onClick={toggle}>{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button>
        </div>
      </div>
      {open && subs && (
        <div className="cc-tray">
          {subs.length === 0 && <div className="ln-empty">no subfolders</div>}
          {subs.map((s) => <FolderCardNav key={s.path} node={s} activeScope={activeScope} onSelectScope={onSelectScope} getChildren={getChildren} />)}
        </div>
      )}
    </div>
  );
}

function LibraryNav({ libraries, side, onSideChange, activeScope, onSelectScope, onManage, getChildren, onScan, scanning }) {
  const currentSide = side || 'resources';
  const shown = (libraries || []).filter((l) => (l.side || 'resources') === currentSide);
  return (
    <div className="ln-card">
      <div className="ln-sides">
        <button type="button" className={`ln-side${currentSide === 'assets' ? ' active' : ''}`} onClick={() => onSideChange && onSideChange('assets')}>Assets</button>
        <button type="button" className={`ln-side${currentSide === 'resources' ? ' active' : ''}`} onClick={() => onSideChange && onSideChange('resources')}>Resources</button>
      </div>
      <div className="ln-head">
        <span className="ln-title"><Library size={14} /> {currentSide === 'resources' ? 'resource libraries' : 'asset libraries'}</span>
        <button className="ln-manage" type="button" onClick={onManage} aria-label="manage libraries"><Plus size={16} /></button>
      </div>
      <div className="ln-list">
        {shown.length === 0 && (
          <div className="ln-empty">no {currentSide} libraries yet — click + to add one in settings.</div>
        )}
        {shown.map((lib) => (
          <LibraryCard key={lib.id} lib={lib} activeScope={activeScope} onSelectScope={onSelectScope} getChildren={getChildren} />
        ))}
      </div>
      <button
        className={'ln-scan' + (scanning ? ' spinning' : '')}
        type="button"
        onClick={() => onScan && onScan()}
        disabled={scanning}
        title={scanning ? 'Scanning libraries…' : 'Scan libraries'}
        aria-label="Scan libraries"
      >
        <RefreshCw size={15} />
      </button>
    </div>
  );
}

export default LibraryNav;
