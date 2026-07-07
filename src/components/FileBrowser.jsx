import React, { useState, useEffect } from 'react';
import { Folder, Star, Plus, ChevronRight, ChevronDown, ArrowLeft } from 'lucide-react';
import './FileBrowser.css';

const parentOf = (p) => {
  if (!p) return p;
  const sep = p.includes('/') ? '/' : '\\';
  const trimmed = p.replace(/[\\/]+$/, '');
  const idx = trimmed.lastIndexOf(sep);
  if (idx <= 0) return trimmed;
  return trimmed.slice(0, idx) || sep;
};

const baseName = (p) => {
  if (!p) return '';
  const parts = p.replace(/[\\/]+$/, '').split(/[\\/]/);
  return parts[parts.length - 1] || p;
};

// Navigable folder list for a single root section (External / Internal)
const FolderNav = ({ rootPath, currentPath, onSelectFolder }) => {
  const [dir, setDir] = useState(rootPath);
  const [items, setItems] = useState([]);
  const [error, setError] = useState(false);

  // Reset to root if the root path changes
  useEffect(() => {
    setDir(rootPath);
  }, [rootPath]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setError(false);
      try {
        if (!window.electron?.listFolderFiles || !dir) {
          if (!cancelled) { setItems([]); setError(true); }
          return;
        }
        const result = await window.electron.listFolderFiles(dir);
        if (cancelled) return;
        if (result?.success && Array.isArray(result.items)) {
          setItems(result.items.filter((it) => it && it.isDirectory === true));
        } else {
          setItems([]);
          setError(true);
        }
      } catch {
        if (!cancelled) { setItems([]); setError(true); }
      }
    };
    load();
    return () => { cancelled = true; };
  }, [dir]);

  const atRoot = !dir || dir === rootPath;

  const handleBack = () => {
    if (atRoot) return;
    setDir(parentOf(dir));
  };

  const handleOpen = (folder) => {
    if (!folder?.path) return;
    if (typeof onSelectFolder === 'function') onSelectFolder(folder.path);
    setDir(folder.path);
  };

  return (
    <div className="fb-nav">
      {!atRoot && (
        <div className="fb-breadcrumb">
          <button type="button" className="fb-back-btn" onClick={handleBack}>
            <ArrowLeft size={14} />
            <span>Back</span>
          </button>
          <span className="fb-crumb" title={dir}>{baseName(dir)}</span>
        </div>
      )}
      {error ? (
        <div className="fb-muted">Couldn't read folder</div>
      ) : items.length === 0 ? (
        <div className="fb-muted">No subfolders</div>
      ) : (
        items.map((it) => {
          const active = it.path === currentPath;
          return (
            <div
              key={it.path}
              className={`fb-row${active ? ' fb-row-active' : ''}`}
              onClick={() => handleOpen(it)}
            >
              <Folder size={16} className="fb-icon" />
              <span className="fb-row-name" title={it.path}>{it.name}</span>
            </div>
          );
        })
      )}
    </div>
  );
};

const FileBrowser = ({ roots, favorites, currentPath, onSelectFolder, onSetRoot }) => {
  const [open, setOpen] = useState({ external: true, internal: true, favorites: true });
  const safeRoots = roots || { external: null, internal: null };
  const safeFavorites = Array.isArray(favorites) ? favorites : [];

  const toggle = (key) => setOpen((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleSetRoot = (group) => {
    if (typeof onSetRoot === 'function') onSetRoot(group);
  };

  const handleFavorite = (fav) => {
    if (fav?.path && typeof onSelectFolder === 'function') onSelectFolder(fav.path);
  };

  const renderRootSection = (key, label) => {
    const rootPath = safeRoots[key];
    return (
      <section className="fb-section">
        <button type="button" className="fb-header" onClick={() => toggle(key)}>
          {open[key] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <span className="fb-header-label">{label}</span>
        </button>
        {open[key] && (
          <div className="fb-section-body">
            {rootPath ? (
              <FolderNav
                rootPath={rootPath}
                currentPath={currentPath}
                onSelectFolder={onSelectFolder}
              />
            ) : (
              <button
                type="button"
                className="fb-set-root"
                onClick={() => handleSetRoot(key)}
              >
                <Plus size={14} />
                <span>Set folder</span>
              </button>
            )}
          </div>
        )}
      </section>
    );
  };

  return (
    <div className="fb-card">
      {renderRootSection('external', 'External')}
      {renderRootSection('internal', 'Internal')}

      <section className="fb-section">
        <button type="button" className="fb-header" onClick={() => toggle('favorites')}>
          {open.favorites ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <span className="fb-header-label">Favorites</span>
        </button>
        {open.favorites && (
          <div className="fb-section-body">
            {safeFavorites.length === 0 ? (
              <div className="fb-muted">No favorites yet</div>
            ) : (
              safeFavorites.map((fav) => {
                const active = fav?.path === currentPath;
                return (
                  <div
                    key={fav.path}
                    className={`fb-row${active ? ' fb-row-active' : ''}`}
                    onClick={() => handleFavorite(fav)}
                  >
                    <Star size={16} className="fb-icon" />
                    <span className="fb-row-name" title={fav.path}>{fav.name}</span>
                  </div>
                );
              })
            )}
          </div>
        )}
      </section>
    </div>
  );
};

export default FileBrowser;
