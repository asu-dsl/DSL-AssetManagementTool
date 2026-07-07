import { useState } from 'react';
import { X, FolderOpen, Link2, Trash2, RefreshCw } from 'lucide-react';
import './SettingsCard.css';

function fmtScan(info) {
  if (!info || !info.scannedAt) return 'not scanned yet';
  let out = 'scanned ' + new Date(info.scannedAt).toLocaleString();
  if (typeof info.assets === 'number') out += ' · ' + info.assets + ' assets';
  if (typeof info.changed === 'number' && info.changed > 0) out += ' · ' + info.changed + ' changed since';
  return out;
}

function SettingsCard({ open, onClose, libraries, onAddLibrary, onRelink, onRemove, onScan, scanning, scanInfo, p4, onTestPerforce }) {
  const [newName, setNewName] = useState('');
  const [newSide, setNewSide] = useState('resources');
  if (!open) return null;
  return (
    <div className="set-overlay" onClick={onClose}>
      <div className="set-card" onClick={(e) => e.stopPropagation()}>
        <div className="set-head">
          <span className="set-title">settings</span>
          <button className="set-x" type="button" onClick={onClose} aria-label="close"><X size={18} /></button>
        </div>

        <div className="set-section">
          <div className="set-h2">connections</div>
          <div className="set-conn">
            <span className="set-dot" style={{ background: p4 && p4.connected ? 'var(--success)' : 'var(--text-faint)' }} />
            <span className="set-conn-name">Perforce</span>
            <span className="set-conn-sub">{p4 && p4.connected ? ('connected · ' + (p4.user || '')) : 'not connected'}</span>
            <button className="set-btn" type="button" onClick={onTestPerforce}>test</button>
          </div>
          <div className="set-conn">
            <span className="set-dot" style={{ background: 'var(--text-faint)' }} />
            <span className="set-conn-name">Coda</span>
            <span className="set-conn-sub">production tracking</span>
            <button className="set-btn" type="button" disabled>soon</button>
          </div>
          <div className="set-conn">
            <span className="set-dot" style={{ background: 'var(--text-faint)' }} />
            <span className="set-conn-name">AI assistant</span>
            <span className="set-conn-sub">local model / API</span>
            <button className="set-btn" type="button" disabled>soon</button>
          </div>
        </div>

        <div className="set-section">
          <div className="set-libhead">
            <div className="set-h2">libraries</div>
            <button className={'set-scan' + (scanning ? ' spinning' : '')} type="button" onClick={() => onScan && onScan()} disabled={scanning}>
              <RefreshCw size={14} /> {scanning ? 'scanning…' : 'Scan Libraries'}
            </button>
          </div>
          <div className="set-libs">
            {(libraries || []).map((lib) => (
              <div className="set-lib" key={lib.id}>
                <div className="set-lib-info">
                  <div className="set-lib-name">{lib.name} <span className="set-lib-side">{(lib.side || 'resources') === 'assets' ? 'Assets' : 'Resources'}</span></div>
                  <div className="set-lib-path">{lib.root}</div>
                  <div className="set-lib-scan">{fmtScan(scanInfo && scanInfo[lib.root])}</div>
                </div>
                <button className="set-icon" type="button" title="relink folder" onClick={() => onRelink(lib.id)}><Link2 size={15} /></button>
                <button className="set-icon" type="button" title="remove" onClick={() => onRemove(lib.id)}><Trash2 size={15} /></button>
              </div>
            ))}
            {(!libraries || libraries.length === 0) && <div className="set-empty">no libraries yet.</div>}
          </div>

          <div className="set-add-side">
            <button type="button" className={`set-side${newSide === 'assets' ? ' active' : ''}`} onClick={() => setNewSide('assets')}>Assets</button>
            <button type="button" className={`set-side${newSide === 'resources' ? ' active' : ''}`} onClick={() => setNewSide('resources')}>Resources</button>
          </div>
          <div className="set-add">
            <input className="set-input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="library name (e.g. Megascans, Brushes, Characters)" />
            <button className="set-btn-primary" type="button" onClick={() => { onAddLibrary(newName, newSide); setNewName(''); }}>
              <FolderOpen size={15} /> choose folder &amp; add
            </button>
          </div>
          <div className="set-add-hint">new library will be filed under <strong>{newSide === 'assets' ? 'Assets' : 'Resources'}</strong></div>
        </div>
      </div>
    </div>
  );
}

export default SettingsCard;
