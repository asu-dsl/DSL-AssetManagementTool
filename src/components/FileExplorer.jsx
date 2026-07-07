import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Folder, File, ChevronRight, ChevronDown, Search, RefreshCw, Star, Plus, Unlock, GitBranch, Pin, X as XIcon, HardDrive, Database, Loader } from 'lucide-react';
import './FileExplorer.css';

const FileExplorer = ({ onSelectionChange, onFileDoubleClick, fileMetadata, onFolderChange }) => {
  const [rootPath, setRootPath] = useState(null);
  const [fileTree, setFileTree] = useState(null);
  const [expandedFolders, setExpandedFolders] = useState(new Set());
  const [selectedFiles, setSelectedFiles] = useState(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('files');
  const [favorites, setFavorites] = useState([]);  // Array of { path, type, name, size?, lastModified? }
  const [favoritesLoaded, setFavoritesLoaded] = useState(false);
  const [p4Available, setP4Available] = useState(false);
  const [p4Working, setP4Working] = useState(false);
  const [p4Clients, setP4Clients] = useState([]);
  const [selectedP4Client, setSelectedP4Client] = useState('');
  const cleanupRef = useRef(null);
  const [searchMode, setSearchMode] = useState('local'); // 'local' or 'p4'
  const [p4SearchResults, setP4SearchResults] = useState([]);
  const [p4Searching, setP4Searching] = useState(false);
  const searchTimerRef = useRef(null);

  // Check P4 availability and load workspaces
  useEffect(() => {
    const checkP4 = async () => {
      if (window.electron?.p4CheckAvailable) {
        const result = await window.electron.p4CheckAvailable();
        setP4Available(result.available);
        if (result.available && window.electron.p4GetInfo) {
          const info = await window.electron.p4GetInfo();
          if (info.success && info.clients) {
            setP4Clients(info.clients);
            if (info.client) setSelectedP4Client(info.client);
          }
        }
      }
    };
    checkP4();
  }, []);

  // Load favorites from file-based storage on mount
  useEffect(() => {
    const loadFavorites = async () => {
      try {
        if (window.electron?.favoritesLoad) {
          const result = await window.electron.favoritesLoad();
          if (result.success && Array.isArray(result.favorites)) {
            // Validate each favorite still exists
            const validFavs = [];
            for (const fav of result.favorites) {
              if (!fav || !fav.path) continue;
              try {
                const info = await window.electron.getPathInfo(fav.path);
                if (info.success) {
                  validFavs.push({
                    path: fav.path,
                    type: info.type,
                    name: info.name,
                    size: info.size,
                    lastModified: info.lastModified,
                  });
                }
              } catch {
                // Path no longer exists, skip it
              }
            }
            setFavorites(validFavs);
          }
        }
      } catch (err) {
        console.error('Failed to load favorites:', err);
      } finally {
        setFavoritesLoaded(true);
      }
    };
    loadFavorites();
  }, []);

  // Refresh the file tree
  const refreshFileTree = useCallback(async () => {
    if (!rootPath) return;
    
    setIsRefreshing(true);
    try {
      const tree = await window.electron.readDirectoryTree(rootPath);
      setFileTree(tree);
      
      // Clean up selections that no longer exist
      setSelectedFiles(prev => {
        const newSelected = new Set();
        const collectPaths = (node) => {
          if (node.type === 'file' && prev.has(node.path)) {
            newSelected.add(node.path);
          } else if (node.children) {
            node.children.forEach(collectPaths);
          }
        };
        if (tree) collectPaths(tree);
        return newSelected;
      });
    } catch (error) {
      console.error('Error refreshing file tree:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [rootPath]);

  // Listen for file system changes
  useEffect(() => {
    if (!window.electron?.onFileSystemChanged) return;
    
    // Set up listener
    cleanupRef.current = window.electron.onFileSystemChanged((data) => {
      console.log('File system changed:', data);
      refreshFileTree();
    });
    
    // Cleanup on unmount
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
      }
    };
  }, [refreshFileTree]);

  const handleBrowseFolder = async () => {
    const path = await window.electron.selectFolder();
    if (path) {
      setRootPath(path);
      if (onFolderChange) onFolderChange(path);
      const tree = await window.electron.readDirectoryTree(path);
      setFileTree(tree);
      setExpandedFolders(new Set([path]));
      setSelectedFiles(new Set());
    }
  };

  const toggleFolder = (path) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedFolders(newExpanded);
  };

  const toggleFileSelection = (file) => {
    const newSelected = new Set(selectedFiles);
    const fileKey = file.path;
    
    if (newSelected.has(fileKey)) {
      newSelected.delete(fileKey);
    } else {
      newSelected.add(fileKey);
    }
    
    setSelectedFiles(newSelected);
  };

  const handleFileDoubleClick = (file) => {
    onFileDoubleClick(file);
  };

  // Save favorites to file-based storage
  const saveFavorites = async (favs) => {
    try {
      if (window.electron?.favoritesSave) {
        await window.electron.favoritesSave(favs);
      }
    } catch (err) {
      console.error('Failed to save favorites:', err);
    }
  };

  // Check if a path is favorited
  const isFavorited = (itemPath) => favorites.some(f => f.path === itemPath);

  // Toggle favorite for files or folders
  const toggleFavorite = async (e, itemPath, itemType) => {
    e.stopPropagation();
    const already = isFavorited(itemPath);
    let newFavs;
    if (already) {
      newFavs = favorites.filter(f => f.path !== itemPath);
    } else {
      // Get info about the path
      let info = { name: itemPath.split(/[\\/]/).pop(), type: itemType || 'file' };
      try {
        if (window.electron?.getPathInfo) {
          const result = await window.electron.getPathInfo(itemPath);
          if (result.success) info = result;
        }
      } catch { /* use defaults */ }
      newFavs = [...favorites, {
        path: itemPath,
        type: info.type,
        name: info.name,
        size: info.size,
        lastModified: info.lastModified,
      }];
    }
    setFavorites(newFavs);
    saveFavorites(newFavs);
  };

  // Select All / Deselect All
  const handleSelectAll = () => {
    if (!fileTree) return;
    const allPaths = new Set();
    const tree = (searchTerm && fileTree) ? filterTree(fileTree, searchTerm) : fileTree;
    if (!tree) return;
    const collectAll = (node) => {
      if (node.type === 'file') allPaths.add(node.path);
      else if (node.children) node.children.forEach(collectAll);
    };
    collectAll(tree);
    if (selectedFiles.size > 0 && selectedFiles.size === allPaths.size) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(allPaths);
    }
  };

  // Get total file count for Select All state
  const getTotalFileCount = () => {
    if (!fileTree) return 0;
    let count = 0;
    const tree = (searchTerm && fileTree) ? filterTree(fileTree, searchTerm) : fileTree;
    if (!tree) return 0;
    const countFiles = (node) => {
      if (node.type === 'file') count++;
      else if (node.children) node.children.forEach(countFiles);
    };
    countFiles(tree);
    return count;
  };

  // P4 bulk add selected files (uses selected workspace)
  const handleP4AddSelected = async () => {
    if (selectedFiles.size === 0 || p4Working) return;
    if (!selectedP4Client) {
      alert('Please select a P4 workspace first from the dropdown below.');
      return;
    }
    setP4Working(true);
    try {
      const paths = Array.from(selectedFiles);
      const results = await window.electron.p4AddFiles({ filePaths: paths, client: selectedP4Client });
      const successes = results.filter(r => r.success).length;
      const failures = results.length - successes;
      if (successes > 0 && failures === 0) {
        alert(`Successfully added ${successes} file(s) to Perforce (workspace: ${selectedP4Client})`);
      } else if (successes > 0) {
        const firstErr = results.find(r => !r.success);
        alert(`Added ${successes} file(s), ${failures} failed.\nFirst error: ${firstErr?.error || 'Unknown'}`);
      } else {
        const firstErr = results[0];
        alert(`Failed to add files to Perforce.\nWorkspace: ${selectedP4Client}\nError: ${firstErr?.error || 'Files are not under this workspace root. Select the correct workspace.'}`);
      }
    } catch (err) {
      alert('P4 Add failed: ' + err.message);
    } finally {
      setP4Working(false);
    }
  };

  // P4 bulk checkout selected files (uses selected workspace)
  const handleP4CheckoutSelected = async () => {
    if (selectedFiles.size === 0 || p4Working) return;
    if (!selectedP4Client) {
      alert('Please select a P4 workspace first from the dropdown below.');
      return;
    }
    setP4Working(true);
    try {
      const paths = Array.from(selectedFiles);
      const results = await window.electron.p4CheckoutFiles({ filePaths: paths, client: selectedP4Client });
      const successes = results.filter(r => r.success).length;
      const failures = results.length - successes;
      if (successes > 0 && failures === 0) {
        alert(`Successfully checked out ${successes} file(s) (workspace: ${selectedP4Client})`);
      } else if (successes > 0) {
        const firstErr = results.find(r => !r.success);
        alert(`Checked out ${successes} file(s), ${failures} failed.\nFirst error: ${firstErr?.error || 'Unknown'}`);
      } else {
        const firstErr = results[0];
        alert(`Failed to checkout files.\nWorkspace: ${selectedP4Client}\nError: ${firstErr?.error || 'Files are not in depot under this workspace. Select the correct workspace.'}`);
      }
    } catch (err) {
      alert('P4 Checkout failed: ' + err.message);
    } finally {
      setP4Working(false);
    }
  };

  // Collect flat list of matching files from tree (for local search)
  const collectFlatSearchResults = (node, term) => {
    if (!node || !term) return [];
    const results = [];
    const lowerTerm = term.toLowerCase();
    const walk = (n) => {
      if (n.type === 'file') {
        let matches = n.name.toLowerCase().includes(lowerTerm);
        if (!matches) {
          const meta = fileMetadata?.[n.path];
          if (meta) {
            if (meta.title?.toLowerCase().includes(lowerTerm)) matches = true;
            else if (meta.author?.toLowerCase().includes(lowerTerm)) matches = true;
            else if (meta.notes?.toLowerCase().includes(lowerTerm)) matches = true;
            else if (Array.isArray(meta.tags) && meta.tags.some(t => t.toLowerCase().includes(lowerTerm))) matches = true;
            else {
              for (const [, value] of Object.entries(meta)) {
                if (typeof value === 'string' && value.toLowerCase().includes(lowerTerm)) { matches = true; break; }
              }
            }
          }
        }
        if (matches) results.push(n);
      } else if (n.children) {
        n.children.forEach(walk);
      }
    };
    walk(node);
    return results;
  };

  // Navigate to folder containing a file
  const navigateToFileFolder = async (filePath) => {
    // Get the parent directory
    const sep = filePath.includes('/') ? '/' : '\\';
    const parts = filePath.split(sep);
    parts.pop(); // remove filename
    const folderPath = parts.join(sep);
    
    setRootPath(folderPath);
    if (onFolderChange) onFolderChange(folderPath);
    const tree = await window.electron.readDirectoryTree(folderPath);
    setFileTree(tree);
    setExpandedFolders(new Set([folderPath]));
    setSelectedFiles(new Set());
    setSearchTerm('');
    setActiveTab('files');
  };

  // P4 search handler with debounce
  const handleP4Search = useCallback(async (term) => {
    if (!term || term.length < 2 || !selectedP4Client) {
      setP4SearchResults([]);
      return;
    }
    setP4Searching(true);
    try {
      const result = await window.electron.p4SearchFiles({ pattern: term, client: selectedP4Client });
      if (result.success) {
        setP4SearchResults(result.files);
      } else {
        setP4SearchResults([]);
      }
    } catch (err) {
      console.error('P4 search failed:', err);
      setP4SearchResults([]);
    } finally {
      setP4Searching(false);
    }
  }, [selectedP4Client]);

  // Handle search input with debounce for P4 mode
  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchTerm(value);
    if (searchMode === 'p4') {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      if (value.length >= 2) {
        searchTimerRef.current = setTimeout(() => handleP4Search(value), 500);
      } else {
        setP4SearchResults([]);
      }
    }
  };

  useEffect(() => {
    if (fileTree) {
      const files = [];
      const collectFiles = (node) => {
        if (node.type === 'file') {
          if (selectedFiles.has(node.path)) {
            files.push(node);
          }
        } else if (node.children) {
          node.children.forEach(collectFiles);
        }
      };
      collectFiles(fileTree);
      onSelectionChange(files);
    }
  }, [selectedFiles, fileTree]);

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  const getFileIcon = (fileName) => {
    const ext = fileName.toLowerCase().split('.').pop();
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'];
    const modelExts = ['obj', 'fbx', 'gltf', 'glb', 'dae', 'stl'];
    
    if (imageExts.includes(ext) || modelExts.includes(ext)) {
      return '🎨';
    }
    return '📄';
  };

  const filterTree = (node, search) => {
    if (!search) return node;
    const term = search.toLowerCase();

    if (node.type === 'file') {
      // Search file name
      if (node.name.toLowerCase().includes(term)) return node;
      // Search metadata (tags, title, author, notes, custom fields)
      const meta = fileMetadata?.[node.path];
      if (meta) {
        if (meta.title && meta.title.toLowerCase().includes(term)) return node;
        if (meta.author && meta.author.toLowerCase().includes(term)) return node;
        if (meta.notes && meta.notes.toLowerCase().includes(term)) return node;
        if (Array.isArray(meta.tags) && meta.tags.some(t => t.toLowerCase().includes(term))) return node;
        for (const [key, value] of Object.entries(meta)) {
          if (typeof value === 'string' && value.toLowerCase().includes(term)) return node;
        }
      }
      return null;
    }

    if (node.type === 'directory') {
      const filteredChildren = node.children
        .map(child => filterTree(child, search))
        .filter(child => child !== null);

      if (filteredChildren.length > 0 || node.name.toLowerCase().includes(term)) {
        return { ...node, children: filteredChildren };
      }
    }

    return null;
  };

  const renderTreeNode = (node, level = 0) => {
    if (!node) return null;

    if (node.type === 'file') {
      const isSelected = selectedFiles.has(node.path);
      const isFav = isFavorited(node.path);
      return (
        <div
          key={node.path}
          className={`tree-item file-item ${isSelected ? 'selected' : ''}`}
          style={{ paddingLeft: `${level * 20 + 10}px` }}
          onDoubleClick={() => handleFileDoubleClick(node)}
        >
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => toggleFileSelection(node)}
            onClick={(e) => e.stopPropagation()}
          />
          <span className="file-icon">{getFileIcon(node.name)}</span>
          <div className="file-info">
            <span className="file-name">{node.name}</span>
            <span className="file-meta">
              {formatFileSize(node.size)} • {new Date(node.lastModified).toLocaleDateString()}
            </span>
          </div>
          <button
            className={`favorite-btn ${isFav ? 'active' : ''}`}
            onClick={(e) => toggleFavorite(e, node.path, 'file')}
            title={isFav ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Star size={14} fill={isFav ? '#f5a623' : 'none'} color={isFav ? '#f5a623' : '#999'} />
          </button>
        </div>
      );
    }

    if (node.type === 'directory') {
      const isExpanded = expandedFolders.has(node.path);
      const isFav = isFavorited(node.path);
      return (
        <div key={node.path}>
          <div
            className="tree-item folder-item"
            style={{ paddingLeft: `${level * 20 + 10}px` }}
            onClick={() => toggleFolder(node.path)}
          >
            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            <Folder size={16} color="#00ff88" />
            <span className="folder-name">{node.name}</span>
            <button
              className={`favorite-btn ${isFav ? 'active' : ''}`}
              onClick={(e) => toggleFavorite(e, node.path, 'directory')}
              title={isFav ? 'Unpin folder' : 'Pin folder'}
            >
              <Pin size={14} fill={isFav ? '#f5a623' : 'none'} color={isFav ? '#f5a623' : '#999'} />
            </button>
          </div>
          {isExpanded && node.children && (
            <div className="folder-children">
              {node.children.map(child => renderTreeNode(child, level + 1))}
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  const displayTree = searchTerm && fileTree ? filterTree(fileTree, searchTerm) : fileTree;
  const totalFileCount = getTotalFileCount();
  const isAllSelected = totalFileCount > 0 && selectedFiles.size === totalFileCount;

  const renderFavoriteItem = (fav) => {
    const isFolder = fav.type === 'directory';
    const isSelected = !isFolder && selectedFiles.has(fav.path);
    return (
      <div
        key={fav.path}
        className={`tree-item file-item ${isSelected ? 'selected' : ''}`}
        style={{ paddingLeft: '10px' }}
        onDoubleClick={() => {
          if (isFolder) {
            // Navigate to pinned folder
            setRootPath(fav.path);
            if (onFolderChange) onFolderChange(fav.path);
            window.electron.readDirectoryTree(fav.path).then(tree => {
              setFileTree(tree);
              setExpandedFolders(new Set([fav.path]));
              setSelectedFiles(new Set());
              setActiveTab('files');
            });
          } else {
            handleFileDoubleClick(fav);
          }
        }}
      >
        {isFolder ? (
          <Folder size={16} color="#00ff88" />
        ) : (
          <>
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => toggleFileSelection(fav)}
              onClick={(e) => e.stopPropagation()}
            />
            <span className="file-icon">{getFileIcon(fav.name)}</span>
          </>
        )}
        <div className="file-info">
          <span className="file-name">{fav.name}</span>
          <span className="file-meta">
            {isFolder ? 'Pinned folder — double-click to open' : (
              `${fav.size ? formatFileSize(fav.size) : ''} ${fav.lastModified ? '• ' + new Date(fav.lastModified).toLocaleDateString() : ''}`
            )}
          </span>
        </div>
        <button
          className="favorite-btn active"
          onClick={(e) => toggleFavorite(e, fav.path, fav.type)}
          title={isFolder ? 'Unpin folder' : 'Remove from favorites'}
        >
          {isFolder ? <Pin size={14} fill="#f5a623" color="#f5a623" /> : <Star size={14} fill="#f5a623" color="#f5a623" />}
        </button>
      </div>
    );
  };

  return (
    <div className="file-explorer">
      <div className="explorer-header">
        <button className="browse-button" onClick={handleBrowseFolder}>
          BROWSE FOLDER
        </button>
        {rootPath && (
          <button 
            className="refresh-button" 
            onClick={refreshFileTree}
            disabled={isRefreshing}
            title="Refresh file list"
          >
            <RefreshCw size={16} className={isRefreshing ? 'spinning' : ''} />
          </button>
        )}
      </div>

      {rootPath && (
        <div className="current-path">
          <span className="path-label">CURRENT FOLDER</span>
          <span className="path-value">{rootPath}</span>
        </div>
      )}

      {/* Tabs: Files / Favorites */}
      <div className="explorer-tabs">
        <button
          className={`explorer-tab ${activeTab === 'files' ? 'active' : ''}`}
          onClick={() => setActiveTab('files')}
        >
          FILES
        </button>
        <button
          className={`explorer-tab ${activeTab === 'favorites' ? 'active' : ''}`}
          onClick={() => setActiveTab('favorites')}
        >
          ★ FAVORITES ({favorites.length})
        </button>
      </div>

      <div className="search-box">
        <Search size={16} />
        <input
          type="text"
          placeholder={searchMode === 'p4' ? 'Search P4 workspace files...' : 'Search files & tags...'}
          value={searchTerm}
          onChange={handleSearchChange}
        />
        {p4Available && (
          <div className="search-mode-toggle">
            <button
              className={`search-mode-btn ${searchMode === 'local' ? 'active' : ''}`}
              onClick={() => { setSearchMode('local'); setP4SearchResults([]); }}
              title="Search local folder"
            >
              <HardDrive size={14} />
            </button>
            <button
              className={`search-mode-btn ${searchMode === 'p4' ? 'active' : ''}`}
              onClick={() => { setSearchMode('p4'); }}
              title="Search P4 workspace"
            >
              <Database size={14} />
            </button>
          </div>
        )}
        {p4Searching && <Loader size={14} className="spinning" />}
      </div>

      {/* Toolbar: Select All + P4 Actions */}
      {rootPath && activeTab === 'files' && (
        <div className="explorer-toolbar">
          <label className="select-all-label">
            <input
              type="checkbox"
              checked={isAllSelected}
              onChange={handleSelectAll}
            />
            Select All ({totalFileCount})
          </label>
          {p4Available && (
            <div className="explorer-p4-section">
              <div className="explorer-p4-workspace">
                <GitBranch size={12} />
                <select
                  className="p4-workspace-select"
                  value={selectedP4Client}
                  onChange={(e) => setSelectedP4Client(e.target.value)}
                  title="Select P4 workspace for add/checkout"
                >
                  <option value="">Select Workspace...</option>
                  {p4Clients.map(c => (
                    <option key={c.name} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="explorer-p4-actions">
                <button
                  className="p4-action-btn add"
                  onClick={handleP4AddSelected}
                  disabled={selectedFiles.size === 0 || p4Working || !selectedP4Client}
                  title="Add selected files to Perforce"
                >
                  <Plus size={12} />
                  <span>Add to P4</span>
                </button>
                <button
                  className="p4-action-btn checkout"
                  onClick={handleP4CheckoutSelected}
                  disabled={selectedFiles.size === 0 || p4Working || !selectedP4Client}
                  title="Checkout selected files from Perforce"
                >
                  <Unlock size={12} />
                  <span>Checkout</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="tree-view">
        {activeTab === 'files' ? (
          // P4 search mode with results
          searchMode === 'p4' && searchTerm.length >= 2 ? (
            p4Searching ? (
              <div className="empty-state">
                <Loader size={32} className="spinning" color="var(--primary)" />
                <p>Searching P4 workspace...</p>
              </div>
            ) : p4SearchResults.length > 0 ? (
              <div className="flat-search-results">
                <div className="search-results-header">
                  {p4SearchResults.length} file{p4SearchResults.length !== 1 ? 's' : ''} found in P4
                </div>
                {p4SearchResults.map((file) => (
                  <div
                    key={file.depotFile}
                    className="tree-item file-item search-result-item"
                    style={{ paddingLeft: '10px' }}
                    onDoubleClick={() => {
                      if (file.localFile) {
                        handleFileDoubleClick({ path: file.localFile, name: file.name, type: 'file' });
                      }
                    }}
                  >
                    <span className="file-icon">{getFileIcon(file.name)}</span>
                    <div className="file-info">
                      <span className="file-name">{file.name}</span>
                      <span
                        className="file-path-link"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (file.localFile) {
                            navigateToFileFolder(file.localFile);
                          }
                        }}
                        title={file.localFile || file.depotFile}
                      >
                        {file.localFile || file.depotFile}
                      </span>
                    </div>
                    <span className="file-revision">#{file.revision}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <Search size={32} color="#cccccc" />
                <p>No files found</p>
                <p className="empty-hint">Try a different search term</p>
              </div>
            )
          ) : searchTerm && searchMode === 'local' && fileTree ? (
            // Local search — flat file results
            (() => {
              const flatResults = collectFlatSearchResults(fileTree, searchTerm);
              return flatResults.length > 0 ? (
                <div className="flat-search-results">
                  <div className="search-results-header">
                    {flatResults.length} file{flatResults.length !== 1 ? 's' : ''} found
                  </div>
                  {flatResults.map((node) => {
                    const isSelected = selectedFiles.has(node.path);
                    const isFav = isFavorited(node.path);
                    // Derive folder from path
                    const sep = node.path.includes('/') ? '/' : '\\';
                    const folderPath = node.path.split(sep).slice(0, -1).join(sep);
                    return (
                      <div
                        key={node.path}
                        className={`tree-item file-item search-result-item ${isSelected ? 'selected' : ''}`}
                        style={{ paddingLeft: '10px' }}
                        onDoubleClick={() => handleFileDoubleClick(node)}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleFileSelection(node)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <span className="file-icon">{getFileIcon(node.name)}</span>
                        <div className="file-info">
                          <span className="file-name">{node.name}</span>
                          <span
                            className="file-path-link"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigateToFileFolder(node.path);
                            }}
                            title={folderPath}
                          >
                            {folderPath}
                          </span>
                          <span className="file-meta">
                            {formatFileSize(node.size)} • {new Date(node.lastModified).toLocaleDateString()}
                          </span>
                        </div>
                        <button
                          className={`favorite-btn ${isFav ? 'active' : ''}`}
                          onClick={(e) => toggleFavorite(e, node.path, 'file')}
                          title={isFav ? 'Remove from favorites' : 'Add to favorites'}
                        >
                          <Star size={14} fill={isFav ? '#f5a623' : 'none'} color={isFav ? '#f5a623' : '#999'} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-state">
                  <Search size={32} color="#cccccc" />
                  <p>No matches found</p>
                  <p className="empty-hint">Try a different search term</p>
                </div>
              );
            })()
          ) : (
            // Default tree view (no search active)
            displayTree ? renderTreeNode(displayTree) : (
              <div className="empty-state">
                <Folder size={48} color="#cccccc" />
                <p>No folder selected</p>
                <p className="empty-hint">Click "Browse Folder" to start</p>
              </div>
            )
          )
        ) : (
          favorites.length > 0 ? (
            <div className="favorites-list">
              {favorites.map(fav => renderFavoriteItem(fav))}
            </div>
          ) : (
            <div className="empty-state">
              <Star size={48} color="#cccccc" />
              <p>No favorites yet</p>
              <p className="empty-hint">Click ★ on files or 📌 on folders to pin them</p>
            </div>
          )
        )}
      </div>

      <div className="file-count-footer">
        {selectedFiles.size} files selected
        {p4Working && <span className="p4-working-indicator"> • P4 working...</span>}
      </div>
    </div>
  );
};

export default FileExplorer;
