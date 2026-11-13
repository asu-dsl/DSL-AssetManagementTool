import React, { useState, useEffect, useRef } from 'react';
import { Plus, X, Upload } from 'lucide-react';
import './MetadataPanel.css';

// The Perforce connection box that used to live here has moved to the
// Upload-to-Perforce panel — this editor only needs to know whether P4 is
// available/connected (to gate the Push button) and which workspace to push
// into, not display its own copy of the connection details.
const MetadataPanel = ({ selectedFiles, currentFile, metadata, onMetadataUpdate, p4, onRefreshOpened }) => {
  const [mode, setMode] = useState('batch'); // 'batch' or 'single'
  const [formData, setFormData] = useState({
    title: '',
    author: '',
    tags: '',
    version: '',
    notes: '',
  });
  const [customFields, setCustomFields] = useState([]);
  const p4Available = p4.available;
  const p4Connected = p4.connected;
  const [p4Status, setP4Status] = useState({});
  const [isPushing, setIsPushing] = useState(false);
  const [selectedP4Client, setSelectedP4Client] = useState('');
  // Fields now auto-apply on every change, which updates the `metadata`
  // prop right back — without this guard, the resync effect below would
  // immediately overwrite whatever the user is mid-typing with the value
  // it just applied (lossy for tags in particular, since trailing ", "
  // while starting a new tag gets dropped on the round trip through the
  // array it's stored as).
  const skipNextMetadataSync = useRef(false);

  // The app only works within the Art depot workspace — resolve (or create,
  // on a machine that's never touched P4V) that one workspace, the same way
  // the Upload feature already does, instead of offering a dropdown across
  // all of the user's workspaces.
  useEffect(() => {
    if (selectedP4Client || !p4Available) return;
    if (!window.electron?.p4ResolveArtClient) return;
    (async () => {
      const resolved = await window.electron.p4ResolveArtClient();
      if (resolved.success) setSelectedP4Client(resolved.client);
    })();
  }, [p4Available, selectedP4Client]);

  // Check P4 status for selected files
  useEffect(() => {
    const checkFilesStatus = async () => {
      if (!p4Available || selectedFiles.length === 0) return;
      
      const statusMap = {};
      for (const file of selectedFiles) {
        if (window.electron && window.electron.p4CheckFileStatus) {
          const status = await window.electron.p4CheckFileStatus(file.path);
          statusMap[file.path] = status;
        }
      }
      setP4Status(statusMap);
    };
    
    checkFilesStatus();
  }, [p4Available, selectedFiles]);

  useEffect(() => {
    if (skipNextMetadataSync.current) {
      skipNextMetadataSync.current = false;
      return;
    }
    if (mode === 'single' && metadata) {
      setFormData({
        title: metadata.title || '',
        author: metadata.author || '',
        tags: Array.isArray(metadata.tags) ? metadata.tags.join(', ') : metadata.tags || '',
        version: metadata.version || '',
        notes: metadata.notes || '',
      });
      
      const custom = Object.entries(metadata)
        .filter(([key]) => !['title', 'author', 'tags', 'version', 'notes'].includes(key))
        .map(([key, value]) => ({ key, value }));
      setCustomFields(custom);
    } else {
      setFormData({
        title: '',
        author: '',
        tags: '',
        version: '',
        notes: '',
      });
      setCustomFields([]);
    }
  }, [mode, currentFile, metadata]);

  // Edits apply immediately, field by field, instead of waiting for an
  // explicit "Apply" click — no button, no local draft state to lose track
  // of.
  const handleInputChange = (field, value) => {
    setFormData({ ...formData, [field]: value });
    skipNextMetadataSync.current = true;
    const metadataUpdate = {
      [field]: field === 'tags' ? value.split(',').map(t => t.trim()).filter(Boolean) : value,
    };
    onMetadataUpdate(metadataUpdate, mode === 'batch');
  };

  const handleAddCustomField = () => {
    setCustomFields([...customFields, { key: '', value: '' }]);
  };

  const handleRemoveCustomField = (index) => {
    setCustomFields(customFields.filter((_, i) => i !== index));
  };

  // A custom field only makes sense once both its key and value are
  // filled in, so (unlike the named fields above) it applies once that
  // becomes true rather than on every keystroke.
  const handleCustomFieldChange = (index, field, value) => {
    const newFields = [...customFields];
    newFields[index] = { ...newFields[index], [field]: value };
    setCustomFields(newFields);

    const updated = newFields[index];
    if (updated.key.trim() && updated.value.trim()) {
      skipNextMetadataSync.current = true;
      onMetadataUpdate({ [updated.key]: updated.value }, mode === 'batch');
    }
  };

  // Checks out files already tracked in the depot and adds files that
  // aren't, in one action — replaces the separate Checkout/Add buttons that
  // used to live in this panel's own Perforce box.
  const handlePushToPerforce = async () => {
    if (!p4Available || selectedFiles.length === 0) return;

    setIsPushing(true);
    try {
      const freshStatus = {};
      for (const file of selectedFiles) {
        if (window.electron && window.electron.p4CheckFileStatus) {
          freshStatus[file.path] = await window.electron.p4CheckFileStatus(file.path);
        }
      }

      const toCheckout = selectedFiles.filter((f) => freshStatus[f.path]?.inDepot && !freshStatus[f.path]?.checkedOut).map((f) => f.path);
      const toAdd = selectedFiles.filter((f) => !freshStatus[f.path]?.inDepot);

      let successCount = 0;
      let failCount = 0;
      const errors = [];

      if (toCheckout.length > 0) {
        const results = await window.electron.p4CheckoutFiles({ filePaths: toCheckout, client: selectedP4Client || null });
        results.forEach((r) => { if (r.success) successCount++; else { failCount++; errors.push(r.error); } });
      }
      for (const filePath of toAdd.map((f) => f.path)) {
        const result = await window.electron.p4AddFile({ filePath, client: selectedP4Client || null });
        if (result.success) successCount++; else { failCount++; errors.push(result.error); }
      }

      if (successCount === 0 && failCount === 0) {
        alert('Nothing to push — files are already up to date in Perforce.');
      } else if (failCount > 0) {
        alert(`Pushed ${successCount} file(s), ${failCount} failed.\n${errors[0] || 'Unknown error'}`);
      } else {
        console.log(`P4: pushed ${successCount} file(s) to Perforce`);
      }

      const refreshedStatus = {};
      for (const file of selectedFiles) {
        if (window.electron && window.electron.p4CheckFileStatus) {
          refreshedStatus[file.path] = await window.electron.p4CheckFileStatus(file.path);
        }
      }
      setP4Status(refreshedStatus);
      if (onRefreshOpened) await onRefreshOpened();
    } catch (error) {
      alert('P4 error: ' + error.message);
    } finally {
      setIsPushing(false);
    }
  };

  const targetCount = mode === 'batch' ? selectedFiles.length : (currentFile ? 1 : 0);

  return (
    <div className="metadata-panel">
      <div className="panel-header">
        <h2>METADATA EDITOR</h2>
      </div>

      <div className="mode-tabs">
        <button
          className={`tab ${mode === 'batch' ? 'active' : ''}`}
          onClick={() => setMode('batch')}
        >
          BATCH EDIT
        </button>
        <button
          className={`tab ${mode === 'single' ? 'active' : ''}`}
          onClick={() => setMode('single')}
        >
          SINGLE FILE
        </button>
      </div>

      <div className="panel-content">
        <div className="apply-info">
          {mode === 'batch' ? (
            <span>Apply metadata to {targetCount} selected files</span>
          ) : (
            <span>{currentFile ? `Editing: ${currentFile.name}` : 'No file selected'}</span>
          )}
        </div>

        <div className="metadata-section">
          <label className="field-label">TITLE</label>
          <div className="field-row">
            <input
              type="text"
              value={formData.title}
              onChange={(e) => handleInputChange('title', e.target.value)}
              placeholder="Enter title..."
            />
          </div>
        </div>

        <div className="metadata-section">
          <label className="field-label">AUTHOR</label>
          <div className="field-row">
            <input
              type="text"
              value={formData.author}
              onChange={(e) => handleInputChange('author', e.target.value)}
              placeholder="Enter author..."
            />
          </div>
        </div>

        <div className="metadata-section">
          <label className="field-label">TAGS</label>
          <div className="field-row">
            <input
              type="text"
              value={formData.tags}
              onChange={(e) => handleInputChange('tags', e.target.value)}
              placeholder="tag1, tag2, tag3..."
            />
          </div>
        </div>

        <div className="metadata-section">
          <label className="field-label">VERSION</label>
          <div className="field-row">
            <input
              type="text"
              value={formData.version}
              onChange={(e) => handleInputChange('version', e.target.value)}
              placeholder="Enter version..."
            />
          </div>
        </div>

        <div className="metadata-section">
          <label className="field-label">NOTES</label>
          <textarea
            value={formData.notes}
            onChange={(e) => handleInputChange('notes', e.target.value)}
            placeholder="Enter notes..."
            rows={4}
          />
        </div>

        <div className="custom-fields-section">
          <div className="section-header">
            <label className="field-label">CUSTOM FIELDS</label>
            <button className="add-field-btn" onClick={handleAddCustomField}>
              <Plus size={16} />
              Add Field
            </button>
          </div>

          {customFields.map((field, index) => (
            <div key={index} className="custom-field-row">
              <input
                type="text"
                placeholder="Key"
                value={field.key}
                onChange={(e) => handleCustomFieldChange(index, 'key', e.target.value)}
                className="custom-key"
              />
              <input
                type="text"
                placeholder="Value"
                value={field.value}
                onChange={(e) => handleCustomFieldChange(index, 'value', e.target.value)}
                className="custom-value"
              />
              <button
                className="remove-btn"
                onClick={() => handleRemoveCustomField(index)}
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>

        <button
          className="push-p4-btn"
          onClick={handlePushToPerforce}
          disabled={!p4Available || !p4Connected || selectedFiles.length === 0 || isPushing}
          title={!p4Connected ? 'Not connected to Perforce' : undefined}
        >
          <Upload size={16} />
          {isPushing ? 'Pushing...' : `Push to Perforce (${targetCount} file${targetCount !== 1 ? 's' : ''})`}
        </button>
      </div>
    </div>
  );
};

export default MetadataPanel;
