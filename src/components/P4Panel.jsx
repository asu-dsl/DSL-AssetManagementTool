import React, { useState, useEffect } from 'react';
import {
  GitBranch, RefreshCw, Upload, RotateCcw, Download,
  FileText, FilePlus, FileEdit, Trash2, ChevronDown, ChevronRight,
  Server, User, FolderGit, AlertCircle, CheckCircle, Clock, X,
  Eye
} from 'lucide-react';
import './P4Panel.css';

const P4Panel = ({
  isOpen, onClose, currentFolder, p4, onRefreshConnection,
  artDepotClient, artDepotRoot, openedFiles, onRefreshOpened,
}) => {
  const connected = p4.connected;
  const files = openedFiles || [];
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [submitDescription, setSubmitDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [showDiff, setShowDiff] = useState(null);
  const [diffContent, setDiffContent] = useState('');
  const [expandedSections, setExpandedSections] = useState({
    connection: true,
    pending: true,
  });

  // Refresh the shared pending-files list (and the Art-depot workspace it's
  // resolved against) whenever the panel opens — App.jsx owns the actual
  // fetch, so a revert or submit made elsewhere is already reflected here.
  useEffect(() => {
    if (isOpen && onRefreshOpened) onRefreshOpened();
  }, [isOpen, onRefreshOpened]);

  // Auto-select everything whenever the shared list changes, matching the
  // panel's previous own-fetch behavior.
  useEffect(() => {
    setSelectedFiles(files.map((f) => f.depotFile));
  }, [openedFiles]);

  // Reflect the shared connection state in the status banner.
  useEffect(() => {
    if (!isOpen) return;
    if (!p4.connected) {
      setStatusMessage({ type: 'error', text: 'Not connected to Perforce server' });
    } else {
      setStatusMessage((prev) => (prev && prev.text === 'Not connected to Perforce server' ? null : prev));
    }
  }, [isOpen, p4.connected]);

  const handleRefresh = async () => {
    setIsLoading(true);
    try {
      if (onRefreshConnection) await onRefreshConnection();
      if (onRefreshOpened) await onRefreshOpened();
      setStatusMessage({ type: 'success', text: 'Refreshed' });
      setTimeout(() => setStatusMessage(null), 2000);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileSelect = (depotFile) => {
    setSelectedFiles(prev => {
      if (prev.includes(depotFile)) {
        return prev.filter(f => f !== depotFile);
      } else {
        return [...prev, depotFile];
      }
    });
  };

  const handleSelectAll = () => {
    if (selectedFiles.length === files.length) {
      setSelectedFiles([]);
    } else {
      setSelectedFiles(files.map(f => f.depotFile));
    }
  };

  const handleSubmit = async () => {
    if (!submitDescription.trim()) {
      setStatusMessage({ type: 'error', text: 'Please enter a description' });
      return;
    }
    
    if (files.length === 0) {
      setStatusMessage({ type: 'error', text: 'No files opened for submit' });
      return;
    }

    setIsSubmitting(true);
    setStatusMessage({ type: 'info', text: 'Submitting...' });

    try {
      // Always submit all opened files in default changelist
      // P4 submit -d works best without specifying files
      const result = await window.electron.p4Submit({
        description: submitDescription,
        files: null, // Submit all opened files
        client: artDepotClient,
      });

      if (result.success) {
        setStatusMessage({
          type: 'success',
          text: result.changelist
            ? `Submitted as changelist ${result.changelist}`
            : 'Changes submitted successfully'
        });
        setSubmitDescription('');
        if (onRefreshOpened) await onRefreshOpened();
      } else {
        setStatusMessage({ type: 'error', text: result.error || 'Submit failed' });
      }
    } catch (error) {
      setStatusMessage({ type: 'error', text: error.message || 'Submit failed' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevert = async (unchangedOnly = false) => {
    if (!unchangedOnly && selectedFiles.length === 0) {
      setStatusMessage({ type: 'error', text: 'No files selected' });
      return;
    }
    
    const confirmMsg = unchangedOnly 
      ? 'Revert all unchanged files?'
      : `Revert ${selectedFiles.length} selected file(s)? Changes will be lost.`;
    
    if (!confirm(confirmMsg)) return;
    
    setIsLoading(true);
    try {
      const result = await window.electron.p4RevertFiles({
        files: unchangedOnly ? null : selectedFiles,
        unchangedOnly,
        client: artDepotClient,
      });

      if (result.success) {
        setStatusMessage({ type: 'success', text: result.message });
        if (onRefreshOpened) await onRefreshOpened();
      } else {
        setStatusMessage({ type: 'error', text: result.error });
      }
    } catch (error) {
      setStatusMessage({ type: 'error', text: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSync = async () => {
    setIsLoading(true);
    setStatusMessage({ type: 'info', text: 'Syncing...' });
    
    try {
      const syncPath = currentFolder ? `${currentFolder}/...` : '//...';
      const result = await window.electron.p4Sync({
        path: syncPath,
        client: artDepotClient
      });
      
      if (result.success) {
        setStatusMessage({ type: 'success', text: result.message });
      } else {
        setStatusMessage({ type: 'error', text: result.error });
      }
    } catch (error) {
      setStatusMessage({ type: 'error', text: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewDiff = async (depotFile) => {
    if (showDiff === depotFile) {
      setShowDiff(null);
      setDiffContent('');
      return;
    }
    
    try {
      const result = await window.electron.p4Diff(depotFile);
      if (result.success) {
        setDiffContent(result.diff || 'No changes');
        setShowDiff(depotFile);
      }
    } catch (error) {
      setStatusMessage({ type: 'error', text: 'Failed to get diff' });
    }
  };

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const getActionIcon = (action) => {
    switch (action) {
      case 'add': return <FilePlus size={14} className="action-add" />;
      case 'edit': return <FileEdit size={14} className="action-edit" />;
      case 'delete': return <Trash2 size={14} className="action-delete" />;
      default: return <FileText size={14} />;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="p4-panel-overlay" onClick={onClose}>
      <div className="p4-panel" onClick={e => e.stopPropagation()}>
        <div className="p4-panel-header">
          <div className="p4-panel-title">
            <GitBranch size={20} />
            <span>Perforce</span>
            <span className={`connection-badge ${connected ? 'connected' : 'disconnected'}`}>
              {connected ? '● Connected' : '○ Disconnected'}
            </span>
          </div>
          <button className="p4-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Status Message */}
        {statusMessage && (
          <div className={`p4-status-message ${statusMessage.type}`}>
            {statusMessage.type === 'error' && <AlertCircle size={16} />}
            {statusMessage.type === 'success' && <CheckCircle size={16} />}
            {statusMessage.type === 'info' && <Clock size={16} />}
            <span>{statusMessage.text}</span>
          </div>
        )}

        <div className="p4-panel-content">
          {/* Connection Section */}
          <div className="p4-section">
            <div 
              className="p4-section-header" 
              onClick={() => toggleSection('connection')}
            >
              {expandedSections.connection ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              <span>Connection</span>
            </div>
            {expandedSections.connection && p4 && (
              <div className="p4-section-content">
                <div className="p4-info-row">
                  <User size={14} />
                  <span className="p4-info-label">User:</span>
                  <span className="p4-info-value">{p4.user}</span>
                </div>
                <div className="p4-info-row">
                  <FolderGit size={14} />
                  <span className="p4-info-label">Workspace:</span>
                  <span className="p4-info-value">{artDepotClient || p4.client}</span>
                </div>
                {artDepotRoot && (
                  <div className="p4-info-row p4-root-row">
                    <FolderGit size={14} />
                    <span className="p4-info-label">Root:</span>
                    <span className="p4-info-value p4-root-value">{artDepotRoot}</span>
                  </div>
                )}
                <div className="p4-info-row">
                  <Server size={14} />
                  <span className="p4-info-label">Server:</span>
                  <span className="p4-info-value p4-server-value">{p4.server}</span>
                </div>
              </div>
            )}
          </div>

          {/* Toolbar */}
          <div className="p4-toolbar">
            <button 
              className="p4-toolbar-btn" 
              onClick={handleRefresh}
              disabled={isLoading}
              title="Refresh"
            >
              <RefreshCw size={16} className={isLoading ? 'spinning' : ''} />
            </button>
            <button 
              className="p4-toolbar-btn" 
              onClick={handleSync}
              disabled={isLoading}
              title="Sync / Get Latest"
            >
              <Download size={16} />
              <span>Get Latest</span>
            </button>
            <button 
              className="p4-toolbar-btn" 
              onClick={() => handleRevert(true)}
              disabled={isLoading || files.length === 0}
              title="Revert Unchanged"
            >
              <RotateCcw size={16} />
              <span>Revert Unchanged</span>
            </button>
          </div>

          {/* Pending Changes Section */}
          <div className="p4-section">
            <div 
              className="p4-section-header" 
              onClick={() => toggleSection('pending')}
            >
              {expandedSections.pending ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              <span>Pending Changes ({files.length})</span>
            </div>
            {expandedSections.pending && (
              <div className="p4-section-content">
                {files.length === 0 ? (
                  <div className="p4-empty-state">
                    <FileText size={24} />
                    <span>No pending changes</span>
                  </div>
                ) : (
                  <>
                    <div className="p4-files-header">
                      <label className="p4-checkbox-label">
                        <input
                          type="checkbox"
                          checked={selectedFiles.length === files.length}
                          onChange={handleSelectAll}
                        />
                        <span>Select All</span>
                      </label>
                      {selectedFiles.length > 0 && (
                        <button
                          className="p4-revert-selected"
                          onClick={() => handleRevert(false)}
                          title="Revert Selected"
                        >
                          <RotateCcw size={14} />
                          Revert
                        </button>
                      )}
                    </div>
                    <div className="p4-files-list">
                      {files.map((file, index) => (
                        <div key={index} className="p4-file-item">
                          <div className="p4-file-row">
                            <label className="p4-file-checkbox">
                              <input 
                                type="checkbox"
                                checked={selectedFiles.includes(file.depotFile)}
                                onChange={() => handleFileSelect(file.depotFile)}
                              />
                            </label>
                            {getActionIcon(file.action)}
                            <span className="p4-file-name" title={file.depotFile}>
                              {file.depotFile.split('/').pop()}
                            </span>
                            <span className={`p4-file-action ${file.action}`}>
                              {file.action}
                            </span>
                            <button 
                              className="p4-diff-btn"
                              onClick={() => handleViewDiff(file.depotFile)}
                              title="View Diff"
                            >
                              <Eye size={14} />
                            </button>
                          </div>
                          <div className="p4-file-path">{file.depotFile}</div>
                          {showDiff === file.depotFile && (
                            <div className="p4-diff-view">
                              <pre>{diffContent}</pre>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Submit Section */}
          {files.length > 0 && (
            <div className="p4-submit-section">
              <h4>Submit Changes</h4>
              <textarea
                className="p4-submit-description"
                placeholder="Enter changelist description..."
                value={submitDescription}
                onChange={(e) => setSubmitDescription(e.target.value)}
                rows={3}
              />
              <div className="p4-submit-footer">
                <span className="p4-submit-count">
                  {selectedFiles.length} of {files.length} file(s) selected
                </span>
                <button 
                  className="p4-submit-btn"
                  onClick={handleSubmit}
                  disabled={isSubmitting || selectedFiles.length === 0 || !submitDescription.trim()}
                >
                  <Upload size={16} />
                  {isSubmitting ? 'Submitting...' : 'Submit'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default P4Panel;
