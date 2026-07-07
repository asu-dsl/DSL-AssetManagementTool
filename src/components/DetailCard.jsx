import { useState, useEffect } from 'react';
import {
  Box,
  Image,
  Film,
  Music,
  FileText,
  Folder,
  Pencil,
  X,
} from 'lucide-react';
import Model3D from './Model3D';
import './DetailCard.css';

const TYPE_ICONS = {
  image: Image,
  model: Box,
  video: Film,
  audio: Music,
  doc: FileText,
  folder: Folder,
};

function DetailCard({
  asset,
  description,
  tags,
  onRename,
  onChangeDescription,
  onChangeTags,
  onExport,
  onGoToFolder,
}) {
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [imageData, setImageData] = useState(null);

  const safeTags = Array.isArray(tags) ? tags : [];

  // Load image data when the asset changes
  useEffect(() => {
    let cancelled = false;
    setImageData(null);
    if (asset && asset.type === 'image' && asset.path && window.electron && window.electron.readFile) {
      window.electron
        .readFile(asset.path)
        .then((res) => {
          if (!cancelled && res && res.success) {
            setImageData(res.data);
          }
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [asset && asset.path, asset && asset.type]);

  // Reset editing state when the asset changes
  useEffect(() => {
    setEditingName(false);
    setNameValue('');
  }, [asset && asset.path]);

  if (!asset) {
    return (
      <div className="detail-card detail-card--empty">
        <div className="detail-card__empty-state">
          <Box size={40} strokeWidth={1.5} />
          <span>Select an asset to see its details</span>
        </div>
      </div>
    );
  }

  const startEdit = () => {
    setNameValue(asset.name || '');
    setEditingName(true);
  };

  const commitName = () => {
    const trimmed = (nameValue || '').trim();
    if (onRename && trimmed) {
      onRename(trimmed);
    }
    setEditingName(false);
  };

  const cancelEdit = () => {
    setEditingName(false);
    setNameValue('');
  };

  const handleNameKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitName();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  };

  const removeTag = (idx) => {
    if (onChangeTags) {
      onChangeTags(safeTags.filter((_, i) => i !== idx));
    }
  };

  const handleTagKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const value = tagInput.trim();
      if (value && !safeTags.includes(value)) {
        if (onChangeTags) {
          onChangeTags([...safeTags, value]);
        }
        setTagInput('');
      }
    }
  };

  const TypeIcon = TYPE_ICONS[asset.type] || FileText;

  const renderPreview = () => {
    if (asset.type === 'image') {
      if (imageData) {
        return (
          <img
            className="detail-card__preview-img"
            src={`data:image/${asset.ext || 'png'};base64,${imageData}`}
            alt={asset.name || ''}
          />
        );
      }
      return <Image size={64} strokeWidth={1.25} className="detail-card__preview-icon" />;
    }
    if (asset.type === 'model') {
      return (
        <div className="detail-card__preview-model">
          <Model3D filePath={asset.path} />
        </div>
      );
    }
    return <TypeIcon size={64} strokeWidth={1.25} className="detail-card__preview-icon" />;
  };

  return (
    <div className="detail-card">
      <div className="detail-card__preview">{renderPreview()}</div>

      <div className="detail-card__name-row">
        {editingName ? (
          <input
            className="detail-card__name-input"
            type="text"
            autoFocus
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onKeyDown={handleNameKeyDown}
            onBlur={commitName}
          />
        ) : (
          <>
            <span className="detail-card__name">{asset.name}</span>
            <button
              type="button"
              className="detail-card__pencil"
              onClick={startEdit}
              aria-label="Rename"
            >
              <Pencil size={15} />
            </button>
          </>
        )}
      </div>
      <span className="detail-card__hint">Renaming changes the file on disk</span>

      <div className="detail-card__field">
        <label className="detail-card__label">Description</label>
        <textarea
          className="detail-card__textarea"
          value={description || ''}
          onChange={(e) => onChangeDescription && onChangeDescription(e.target.value)}
          placeholder="What is this asset, and what's it best for"
        />
      </div>

      <div className="detail-card__field">
        <label className="detail-card__label">Tags</label>
        <div className="detail-card__tags">
          {safeTags.map((tag, idx) => (
            <span className="detail-card__chip" key={`${tag}-${idx}`}>
              {tag}
              <button
                type="button"
                className="detail-card__chip-remove"
                onClick={() => removeTag(idx)}
                aria-label={`Remove ${tag}`}
              >
                <X size={12} />
              </button>
            </span>
          ))}
          <input
            className="detail-card__tag-input"
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleTagKeyDown}
            placeholder="Add a tag"
          />
        </div>
      </div>

      <div className="detail-card__actions">
        <button
          type="button"
          className="detail-card__btn detail-card__btn--primary"
          onClick={() => onExport && onExport()}
        >
          Export
        </button>
        <button
          type="button"
          className="detail-card__btn detail-card__btn--ghost"
          onClick={() => onGoToFolder && onGoToFolder()}
        >
          Go to file folder
        </button>
      </div>

      <div className="detail-card__field">
        <label className="detail-card__label">Similar</label>
        <div className="detail-card__similar">
          <div className="detail-card__similar-square" />
          <div className="detail-card__similar-square" />
          <div className="detail-card__similar-square" />
        </div>
        <span className="detail-card__similar-note">Coming soon</span>
      </div>
    </div>
  );
}

export default DetailCard;
