import { useCallback, useEffect, useState } from 'react';
import { Upload, FilePlus, FileEdit, Trash2, X } from 'lucide-react';
import { P4_ART_DEPOT } from './LibraryNav';
import './UploadPanel.css';

function actionIcon(action) {
  if (action === 'add') return <FilePlus size={14} className="action-add" />;
  if (action === 'edit') return <FileEdit size={14} className="action-edit" />;
  if (action === 'delete') return <Trash2 size={14} className="action-delete" />;
  return <FilePlus size={14} />;
}

function UploadPanel({ currentPath }) {
  const [openedFiles, setOpenedFiles] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [description, setDescription] = useState('');
  const [statusMessage, setStatusMessage] = useState(null);

  // Always resolve the Art-depot workspace explicitly rather than trusting
  // the app's shared "active client" — other features (reconnecting
  // Perforce, switching workspaces elsewhere) reset that shared value for
  // reasons unrelated to this panel, which would otherwise show pending
  // changes for the wrong workspace or none at all.
  const refreshOpened = useCallback(async () => {
    if (!window.electron) return;
    try {
      const clientRes = await window.electron.p4ResolveArtClient();
      if (!clientRes || !clientRes.success) { setOpenedFiles([]); return; }
      const r = await window.electron.p4GetOpened(clientRes.client);
      if (r && r.success) setOpenedFiles(r.files || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { refreshOpened(); }, [refreshOpened]);

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
        await refreshOpened();
        setShowModal(true);
      } else {
        setStatusMessage({ type: 'error', text: (r && r.error) || 'Upload failed' });
      }
    } catch (e) {
      setStatusMessage({ type: 'error', text: e.message || 'Upload failed' });
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!description.trim()) {
      setStatusMessage({ type: 'error', text: 'Enter a changelist description before submitting.' });
      return;
    }
    setSubmitting(true);
    try {
      const clientRes = await window.electron.p4ResolveArtClient();
      if (!clientRes || !clientRes.success) {
        setStatusMessage({ type: 'error', text: (clientRes && clientRes.error) || 'Could not resolve the Art depot workspace.' });
        return;
      }
      const r = await window.electron.p4Submit({ description, client: clientRes.client });
      if (r && r.success) {
        setDescription('');
        setShowModal(false);
        setStatusMessage(null);
        await refreshOpened();
      } else {
        setStatusMessage({ type: 'error', text: (r && r.error) || 'Submit failed' });
      }
    } catch (e) {
      setStatusMessage({ type: 'error', text: e.message || 'Submit failed' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="up-host">
      <button className="up-btn" type="button" onClick={handleUploadClick} disabled={uploading}>
        <Upload size={14} />
        {uploading ? 'Uploading…' : 'Upload to Perforce'}
      </button>

      {openedFiles.length > 0 && (
        <button className="up-pending" type="button" onClick={() => setShowModal(true)}>
          {openedFiles.length} pending change{openedFiles.length === 1 ? '' : 's'}
        </button>
      )}

      {statusMessage && !showModal && (
        <div className={`up-status ${statusMessage.type}`}>{statusMessage.text}</div>
      )}

      {showModal && (
        <div className="up-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="up-modal" onClick={(e) => e.stopPropagation()}>
            <div className="up-modal-header">
              <span>Pending Changes ({openedFiles.length})</span>
              <button type="button" className="up-modal-close" onClick={() => setShowModal(false)} aria-label="close">
                <X size={16} />
              </button>
            </div>

            {statusMessage && <div className={`up-status ${statusMessage.type}`}>{statusMessage.text}</div>}

            <div className="up-file-list">
              {openedFiles.length === 0 && <div className="up-empty">No pending changes</div>}
              {openedFiles.map((f, i) => (
                <div key={i} className="up-file-row">
                  {actionIcon(f.action)}
                  <span className="up-file-name" title={f.depotFile}>{f.depotFile.split('/').pop()}</span>
                  <span className={`up-file-action ${f.action}`}>{f.action}</span>
                </div>
              ))}
            </div>

            <textarea
              className="up-desc"
              placeholder="Changelist description…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />

            <div className="up-modal-footer">
              <button type="button" className="up-draft-btn" onClick={() => setShowModal(false)}>Save as Draft</button>
              <button
                type="button"
                className="up-submit-btn"
                onClick={handleSubmit}
                disabled={submitting || openedFiles.length === 0 || !description.trim()}
              >
                {submitting ? 'Submitting…' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default UploadPanel;
