import { useEffect, useState } from 'react';
import { FolderHeart, Plus, Check, X, ChevronRight, ChevronDown, FolderPlus, MoreVertical, Lock } from 'lucide-react';
import './CollectionsCard.css';

function readAsset(e) {
  try { const d = e.dataTransfer.getData('application/x-asset'); return d ? JSON.parse(d) : null; } catch { return null; }
}

function AssetTile({ member }) {
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

function CustomCover({ path }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let c = false;
    setSrc(null);
    if (!path) return;
    (async () => {
      try {
        const r = await window.electron.readFile(path);
        if (!c && r && r.success && r.data) {
          const ext = (path.split('.').pop() || 'png').toLowerCase();
          setSrc(`data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${r.data}`);
        }
      } catch { /* ignore */ }
    })();
    return () => { c = true; };
  }, [path]);
  return <div className="cc-montage">{src ? <div className="cc-tile"><img src={src} alt="" /></div> : null}</div>;
}

function CoverBg({ members, customPath }) {
  if (customPath) return <CustomCover path={customPath} />;
  const three = (members || []).slice(0, 3);
  return (
    <div className="cc-montage">
      {three.map((m, i) => <AssetTile key={(m && m.path) || i} member={m} />)}
    </div>
  );
}

function FolderCard({ col, folder, active, onSelectFolder, onDrop, locked }) {
  const [over, setOver] = useState(false);
  const members = (col.members || []).filter((m) => m.folder === folder.id);
  return (
    <div
      className={`cc-fcard${active ? ' cc-fcard-active' : ''}${over ? ' cc-drop' : ''}`}
      onClick={() => onSelectFolder(col.id, folder.id)}
      onDragOver={(e) => { if (locked) return; e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (locked) return; const a = readAsset(e); if (a) onDrop(col.id, folder.id, a); }}
    >
      <CoverBg members={members} />
      <div className="cc-overlay" />
      <div className="cc-fcontent">
        <span className={'cc-fname' + (String(folder.name || '').length > 20 ? ' cc-faded' : '')}>{String(folder.name || '').slice(0, 30)}</span>
        <button className="cc-iconbtn" type="button" onClick={(e) => { e.stopPropagation(); onSelectFolder(col.id, folder.id); }}><ChevronRight size={14} /></button>
      </div>
    </div>
  );
}

function CollectionCard({ col, activeId, activeFolder, onSelect, onSelectFolder, onDrop, onAddFolder, onSetCover, onToggleLock }) {
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [addingFolder, setAddingFolder] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const members = col.members || [];
  const isActive = col.id === activeId;
  const customPath = col.cover && col.cover.path;
  const locked = !!col.locked;
  const commitFolder = () => { const n = folderName.trim(); if (n) onAddFolder(col.id, n); setFolderName(''); setAddingFolder(false); };
  return (
    <div className="cc-wrap">
      <div
        className={`cc-card${isActive && !activeFolder ? ' cc-card-active' : ''}${dragOver ? ' cc-drop' : ''}${open ? ' cc-card-open' : ''}`}
        onClick={() => onSelect(col.id)}
        onDragOver={(e) => { if (locked) return; e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); if (locked) return; const a = readAsset(e); if (a) onDrop(col.id, null, a); }}
      >
        <CoverBg members={members} customPath={customPath} />
        <div className="cc-overlay" />
        <div className="cc-content">
          {locked && <Lock size={12} className="cc-lockicon" />}
          <span className={'cc-name' + (String(col.name || '').length > 20 ? ' cc-faded' : '')}>{String(col.name || '').slice(0, 30)}</span>
          <button className="cc-iconbtn" type="button" title="more" onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); }}><MoreVertical size={15} /></button>
          <button className="cc-iconbtn" type="button" title={open ? 'collapse' : 'expand'} onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}>{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button>
        </div>
      </div>
      {menuOpen && <div className="cc-menu-backdrop" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }} />}
      {menuOpen && (
        <div className="cc-menu" onClick={(e) => e.stopPropagation()}>
          <button type="button" onClick={() => { setMenuOpen(false); onSetCover(col.id); }}>Set cover image…</button>
          <button type="button" onClick={() => { setMenuOpen(false); onToggleLock(col.id); }}>{locked ? 'Unlock collection' : 'Lock collection'}</button>
        </div>
      )}
      {open && (
        <div className="cc-tray">
          {(col.folders || []).map((f) => (
            <FolderCard key={f.id} col={col} folder={f} active={isActive && activeFolder === f.id} onSelectFolder={onSelectFolder} onDrop={onDrop} locked={locked} />
          ))}
          {addingFolder ? (
            <div className="cc-fcreate">
              <input className="cc-finput" autoFocus value={folderName} placeholder="folder name" onChange={(e) => setFolderName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') commitFolder(); if (e.key === 'Escape') { setAddingFolder(false); setFolderName(''); } }} />
              <button className="cc-mini" type="button" onClick={commitFolder}><Check size={13} /></button>
              <button className="cc-mini" type="button" onClick={() => { setAddingFolder(false); setFolderName(''); }}><X size={13} /></button>
            </div>
          ) : (
            <button className="cc-addfolder" type="button" onClick={() => setAddingFolder(true)}><FolderPlus size={13} /> add folder</button>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, collections, activeId, activeFolder, onSelect, onSelectFolder, onDrop, onAddFolder, onSetCover, onToggleLock, onCreate }) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const commit = () => { const n = name.trim(); if (n) onCreate(n); setName(''); setCreating(false); };
  return (
    <div className="cc-section">
      <div className="cc-sectitle">{title}</div>
      {(collections || []).map((c) => (
        <CollectionCard key={c.id} col={c} activeId={activeId} activeFolder={activeFolder} onSelect={onSelect} onSelectFolder={onSelectFolder} onDrop={onDrop} onAddFolder={onAddFolder} onSetCover={onSetCover} onToggleLock={onToggleLock} />
      ))}
      {creating ? (
        <div className="cc-createcard">
          <input className="cc-input" autoFocus value={name} placeholder="collection name" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setCreating(false); setName(''); } }} />
          <button className="cc-mini" type="button" onClick={commit}><Check size={14} /></button>
          <button className="cc-mini" type="button" onClick={() => { setCreating(false); setName(''); }}><X size={14} /></button>
        </div>
      ) : (
        <button className="cc-addcol" type="button" onClick={() => setCreating(true)}>Add Collection <Plus size={14} /></button>
      )}
    </div>
  );
}

function CollectionsCard({ official, mine, activeId, activeFolder, sideFilter, onSideFilter, onSelect, onSelectFolder, onDrop, onAddFolder, onSetCover, onToggleLock, onCreateOfficial, onCreateMine }) {
  return (
    <div className="col-card">
      <div className="col-cardhead"><span className="col-cardtitle"><FolderHeart size={14} /> collections</span></div>
      {activeId && (
        <div className="col-sides">
          {['all', 'assets', 'resources'].map((s) => (
            <button key={s} type="button" className={`col-side${sideFilter === s ? ' active' : ''}`} onClick={() => onSideFilter(s)}>{s}</button>
          ))}
        </div>
      )}
      <div className="col-scroll">
        <Section title="Studio Collections" collections={official} activeId={activeId} activeFolder={activeFolder} onSelect={onSelect} onSelectFolder={onSelectFolder} onDrop={onDrop} onAddFolder={onAddFolder} onSetCover={onSetCover} onToggleLock={onToggleLock} onCreate={onCreateOfficial} />
        <Section title="My Collections" collections={mine} activeId={activeId} activeFolder={activeFolder} onSelect={onSelect} onSelectFolder={onSelectFolder} onDrop={onDrop} onAddFolder={onAddFolder} onSetCover={onSetCover} onToggleLock={onToggleLock} onCreate={onCreateMine} />
      </div>
    </div>
  );
}

export default CollectionsCard;
