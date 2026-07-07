import { useEffect, useRef, useState } from 'react';
import {
  Image as ImageIcon,
  Box,
  Film,
  Music,
  FileText,
  Folder,
  File,
} from 'lucide-react';
import './LibraryGrid.css';

const TYPE_ICONS = {
  image: ImageIcon,
  model: Box,
  video: Film,
  audio: Music,
  doc: FileText,
  folder: Folder,
  folderAsset: Folder,
  zipAsset: Box,
};

function Thumb({ path, ext, type }) {
  const [src, setSrc] = useState(null);
  const [visible, setVisible] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { setVisible(true); io.disconnect(); }
      });
    }, { rootMargin: '250px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      try {
        if (!path || !window.electron) return;
        if (type === 'zipAsset' && window.electron.readZipPreview) {
          const res = await window.electron.readZipPreview(path);
          if (cancelled) return;
          if (res && res.success && res.data) setSrc(`data:${res.mime || 'image/png'};base64,${res.data}`);
        } else if (window.electron.readFile) {
          const res = await window.electron.readFile(path);
          if (cancelled) return;
          if (res && res.success && res.data) {
            const m = ext ? String(ext).replace(/^\./, '') : 'png';
            setSrc(`data:image/${m || 'png'};base64,${res.data}`);
          }
        }
      } catch {
        /* keep placeholder */
      }
    })();
    return () => { cancelled = true; };
  }, [visible, path, ext, type]);

  return (
    <div ref={ref} style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {src ? (
        <img className="lg-thumb-img" src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <ImageIcon size={30} color="var(--text-faint)" />
      )}
    </div>
  );
}

function AssetCard({ file, selected, onSelectAsset, onOpenAsset, onContext }) {
  const handleClick = () => {
    if (typeof onSelectAsset === 'function') onSelectAsset(file);
  };
  const handleOpen = () => {
    if (typeof onOpenAsset === 'function') onOpenAsset(file);
  };

  const renderThumb = () => {
    if (file && (file.type === 'image' || file.type === 'zipAsset')) {
      return <Thumb path={file.path} ext={file.ext} type={file.type} />;
    }
    if (file && file.type === 'folderAsset' && file.preview) {
      const pe = (String(file.preview).split('.').pop() || 'png');
      return <Thumb path={file.preview} ext={pe} type="image" />;
    }
    const Icon = TYPE_ICONS[file && file.type] || File;
    return <Icon size={30} color="var(--text-faint)" />;
  };

  return (
    <div
      className={`lg-card${selected ? ' lg-card-selected' : ''}`}
      onClick={handleClick}
      onDoubleClick={handleOpen}
      onContextMenu={(e) => { e.preventDefault(); if (typeof onContext === 'function') onContext(file); }}
      draggable
      onDragStart={(e) => { e.dataTransfer.setData('application/x-asset', JSON.stringify(file)); e.dataTransfer.effectAllowed = 'copy'; }}
      title={file && file.name}
    >
      <div className="lg-thumb">{renderThumb()}</div>
      <div className="lg-name">{file && file.name}</div>
    </div>
  );
}

function LibraryGrid({ files, selectedPath, onSelectAsset, onOpenAsset, onContext }) {
  if (!files || files.length === 0) {
    return (
      <div className="lg-container">
        <div className="lg-empty">
          <Box size={30} color="var(--text-faint)" />
          <span>no assets here yet — pick a folder on the left</span>
        </div>
      </div>
    );
  }

  return (
    <div className="lg-container">
      <div className="lg-grid">
        {files.map((file) => (
          <AssetCard
            key={file.path}
            file={file}
            selected={file.path === selectedPath}
            onSelectAsset={onSelectAsset}
            onOpenAsset={onOpenAsset}
            onContext={onContext}
          />
        ))}
      </div>
    </div>
  );
}

export default LibraryGrid;
