import { useEffect, useRef, useState } from 'react';
import { Upload, GitBranch, RefreshCw, Check } from 'lucide-react';
import { P4_ART_DEPOT } from './LibraryNav';
import './UploadPanel.css';

// `openedFiles` and `onRefreshOpened` come from App.jsx, which is the single
// place that resolves the Art-depot workspace and fetches its pending files
// — shared with P4Panel so a revert or submit done through the P4 panel is
// reflected here too, instead of this panel only knowing about its own
// uploads. `p4`/`onRefreshConnection`/`artDepotClient` back the connection
// control that used to live in the metadata editor — it fits better here,
// next to the actual Upload-to-Perforce action.
//
// The status/pending control is a single, always-rendered element that opens
// the Perforce panel on click, in every connection/pending state — it used
// to be two separate controls (a status header that only toggled an inline
// detail dropdown, and a "pending changes" button that only existed once
// something was pending), which left no way to open the Perforce panel at
// all with a clean workspace, and left the user unsure which of the two
// similar-looking rows actually opened it.
function UploadPanel({ currentPath, onOpenP4Panel, openedFiles, onRefreshOpened, p4, onRefreshConnection, artDepotClient, artDepotRoot }) {
  const [uploading, setUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [justRefreshed, setJustRefreshed] = useState(false);
  const refreshDoneTimer = useRef(null);

  const p4Available = p4 && p4.available;
  const p4Connected = p4 && p4.connected;
  const pendingCount = openedFiles ? openedFiles.length : 0;

  useEffect(() => () => clearTimeout(refreshDoneTimer.current), []);

  const handleRefreshConnection = async (e) => {
    e.stopPropagation();
    setIsRefreshing(true);
    try {
      if (onRefreshConnection) await onRefreshConnection();
      if (onRefreshOpened) await onRefreshOpened();
      setJustRefreshed(true);
      clearTimeout(refreshDoneTimer.current);
      refreshDoneTimer.current = setTimeout(() => setJustRefreshed(false), 2000);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleUploadClick = async () => {
    // Artists only ever upload into the Art depot — use wherever they're
    // currently browsing inside it, or fall back to its root.
    const depotFolder = (currentPath && currentPath.startsWith('//')) ? currentPath : P4_ART_DEPOT.root;

    const filePaths = await window.electron.selectUploadFiles();
    if (!filePaths || filePaths.length === 0) return;

    setUploading(true);
    setStatusMessage(null);
    try {
      const r = await window.electron.p4UploadToDepot({ depotFolder, filePaths });
      if (r && r.success) {
        const failed = (r.results || []).filter((x) => !x.success);
        setStatusMessage(failed.length > 0
          ? { type: 'error', text: `${failed.length} file(s) failed: ${failed.map((f) => `${f.file} (${f.error})`).join('; ')}` }
          : null);
        if (onRefreshOpened) await onRefreshOpened();
        // Review and submit the upload through the P4 panel — it already
        // shows the same pending-changes list, so there's no need for a
        // second, separate "pending changes" window here.
        if (onOpenP4Panel) onOpenP4Panel();
      } else {
        setStatusMessage({ type: 'error', text: (r && r.error) || 'Upload failed' });
      }
    } catch (e) {
      setStatusMessage({ type: 'error', text: e.message || 'Upload failed' });
    } finally {
      setUploading(false);
    }
  };

  const badgeText = p4Connected ? '● Connected' : '○ Disconnected';

  const secondaryText = !p4Connected
    ? 'Click to reconnect'
    : pendingCount > 0
      ? `${pendingCount} pending change${pendingCount === 1 ? '' : 's'}`
      : 'Up to date';

  const ariaStatus = !p4Connected
    ? 'Disconnected'
    : pendingCount > 0
      ? `Connected, ${pendingCount} pending change${pendingCount === 1 ? '' : 's'}`
      : 'Connected, up to date';

  const tooltip = p4Available
    ? `User: ${p4.user}\nWorkspace: ${artDepotClient || p4.client}\nRoot: ${artDepotRoot || '—'}\nServer: ${p4.server}`
    : undefined;

  return (
    <div className="up-host">
      {p4Available && (
        <div
          className={`up-p4-control ${p4Connected ? 'connected' : 'disconnected'}`}
          role="button"
          tabIndex={0}
          onClick={onOpenP4Panel}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              if (onOpenP4Panel) onOpenP4Panel();
            }
          }}
          title={tooltip}
          aria-label={`Perforce: ${ariaStatus} — open Perforce panel`}
        >
          <GitBranch size={14} />
          <div className="up-p4-text-stack">
            <div className="up-p4-line1">
              <span className="up-p4-label-text">Perforce</span>
              <span className={`up-p4-badge ${p4Connected ? 'connected' : 'disconnected'}`}>{badgeText}</span>
            </div>
            <span className="up-p4-control-text">{secondaryText}</span>
          </div>
          <button
            type="button"
            className="up-p4-refresh"
            onClick={handleRefreshConnection}
            disabled={isRefreshing}
            aria-label="Refresh Perforce connection"
            title="Refresh connection"
          >
            {justRefreshed ? <Check size={12} /> : <RefreshCw size={12} className={isRefreshing ? 'spinning' : ''} />}
          </button>
        </div>
      )}

      <button className="up-btn" type="button" onClick={handleUploadClick} disabled={uploading}>
        <Upload size={14} />
        {uploading ? 'Uploading…' : 'Upload'}
      </button>

      {statusMessage && (
        <div className={`up-status ${statusMessage.type}`}>{statusMessage.text}</div>
      )}
    </div>
  );
}

export default UploadPanel;
