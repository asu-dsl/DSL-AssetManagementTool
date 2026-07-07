import { useState } from 'react';
import { Settings, Pencil } from 'lucide-react';
import './ProfileCard.css';

function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

function ProfileCard({ displayName, p4User, p4Connected, codaConnected, onEditDisplayName, onConnectPerforce, onConnectCoda, onOpenSettings }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const startEdit = () => { setName(displayName || ''); setEditing(true); };
  const commit = () => { const n = name.trim(); if (n && onEditDisplayName) onEditDisplayName(n); setEditing(false); };
  return (
    <div className="pf-bar">
      <div className="pf-conns">
        <button className="pf-conn" type="button" onClick={onConnectPerforce} title={p4Connected ? ('Perforce: ' + (p4User || 'connected')) : 'Perforce not connected'}>
          <span className="pf-dot" style={{ background: p4Connected ? 'var(--success)' : 'var(--text-faint)' }} />
          Perforce
        </button>
        <button className="pf-conn" type="button" onClick={onConnectCoda} title={codaConnected ? 'Coda connected' : 'Coda not connected'}>
          <span className="pf-dot" style={{ background: codaConnected ? 'var(--success)' : 'var(--text-faint)' }} />
          Coda
        </button>
      </div>

      <div className="pf-user">
        <div className="pf-avatar">{initialsOf(displayName)}</div>
        <div className="pf-namecol">
          {editing ? (
            <input
              className="pf-input"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
            />
          ) : (
            <div className="pf-nameline">
              <span className="pf-name">{displayName}</span>
              <button className="pf-edit" type="button" onClick={startEdit} aria-label="edit name"><Pencil size={12} /></button>
            </div>
          )}
          <span className="pf-p4">{p4User ? ('p4: ' + p4User) : 'not signed in'}</span>
        </div>
      </div>

      <button className="pf-gear" type="button" onClick={onOpenSettings} aria-label="settings"><Settings size={18} /></button>
    </div>
  );
}

export default ProfileCard;
