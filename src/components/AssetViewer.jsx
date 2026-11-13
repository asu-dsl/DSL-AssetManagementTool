import React, { useState, useEffect } from 'react';
import { Box } from 'lucide-react';
import Model3D from './Model3D';
import { classifyAsset } from '../../shared/assetClassification.js';
import './AssetViewer.css';

const AssetViewer = ({ file, selectedFiles }) => {
  const [imageData, setImageData] = useState(null);

  useEffect(() => {
    if (file && isImageFile(file.name)) {
      loadImageData(file.path);
    } else {
      setImageData(null);
    }
  }, [file]);

  const loadImageData = async (filePath) => {
    try {
      const cls = classifyAsset(filePath);
      if (cls.nativeMime) {
        const result = await window.electron.readFile(filePath);
        if (result.success) setImageData(`data:${cls.nativeMime};base64,${result.data}`);
      } else if (cls.needsConversion && window.electron.convertImagePreview) {
        const result = await window.electron.convertImagePreview(filePath, cls.ext);
        if (result.success) setImageData(`data:${result.mime};base64,${result.data}`);
      }
    } catch (error) {
      console.error('Error loading image:', error);
    }
  };

  // "Previewable" here means the same thing LibraryGrid's thumbnails use:
  // natively browser-decodable, or convertible to PNG by the main process.
  // EXR is excluded until its HDR tone-mapping is designed (see
  // shared/assetClassification.js).
  const isImageFile = (fileName) => classifyAsset(fileName).previewable;

  const is3DFile = (fileName) => classifyAsset(fileName).category === 'model';

  const isMaterialFile = (fileName) => classifyAsset(fileName).category === 'material';

  // If multiple files are selected, show grid view
  if (selectedFiles && selectedFiles.length > 1) {
    const previewableFiles = selectedFiles.filter(f => 
      isImageFile(f.name) || is3DFile(f.name) || isMaterialFile(f.name)
    );

    if (previewableFiles.length === 0) {
      return (
        <div className="asset-viewer">
          <div className="viewer-placeholder">
            <Box size={64} color="#666666" />
            <h3>{selectedFiles.length} files selected</h3>
            <p>No previewable files (images or 3D models)</p>
          </div>
        </div>
      );
    }

    return (
      <div className="asset-viewer">
        <div className="multi-viewer-grid">
          {previewableFiles.map((f, index) => (
            <div key={f.path} className="grid-item">
              <div className="grid-preview">
                {isImageFile(f.name) ? (
                  <ImagePreview filePath={f.path} />
                ) : isMaterialFile(f.name) ? (
                  <MaterialPreview filePath={f.path} />
                ) : (
                  <Model3D filePath={f.path} />
                )}
              </div>
              <div className="grid-file-name">{f.name}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!file) {
    return (
      <div className="asset-viewer">
        <div className="viewer-placeholder">
          <Box size={64} color="#666666" />
          <h3>Double-click a file to preview</h3>
          <p>Supports images and 3D models</p>
        </div>
      </div>
    );
  }

  if (isImageFile(file.name)) {
    return (
      <div className="asset-viewer">
        <div className="viewer-content">
          {imageData ? (
            <img src={imageData} alt={file.name} className="image-preview" />
          ) : (
            <div className="loading">Loading image...</div>
          )}
        </div>
        <div className="viewer-info">
          <span className="file-name">{file.name}</span>
        </div>
      </div>
    );
  }

  if (is3DFile(file.name)) {
    return (
      <div className="asset-viewer">
        <div className="viewer-content">
          <Model3D filePath={file.path} />
        </div>
        <div className="viewer-info">
          <span className="file-name">{file.name}</span>
        </div>
      </div>
    );
  }

  if (isMaterialFile(file.name)) {
    return (
      <div className="asset-viewer">
        <div className="viewer-content">
          <MaterialPreview filePath={file.path} fullView />
        </div>
        <div className="viewer-info">
          <span className="file-name">{file.name}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="asset-viewer">
      <div className="viewer-placeholder">
        <Box size={64} color="#666666" />
        <h3>Preview not available</h3>
        <p>File type: {file.name.split('.').pop().toUpperCase()}</p>
      </div>
    </div>
  );
};

// Component to handle Unity .mat material file preview
const MaterialPreview = ({ filePath, fullView = false }) => {
  const [materialData, setMaterialData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadMaterial = async () => {
      try {
        const result = await window.electron.readFile(filePath);
        if (result.success) {
          // Decode base64 to text
          const text = atob(result.data);
          
          // Parse Unity .mat file (YAML format)
          const parsed = parseUnityMaterial(text);
          setMaterialData(parsed);
        } else {
          setError('Failed to load material');
        }
      } catch (err) {
        console.error('Error loading material:', err);
        setError(err.message);
      }
    };
    loadMaterial();
  }, [filePath]);

  // Parse Unity material YAML to extract color and properties
  const parseUnityMaterial = (text) => {
    const result = {
      name: 'Unknown',
      shader: 'Unknown',
      color: { r: 0.5, g: 0.5, b: 0.5, a: 1 },
      properties: {}
    };

    try {
      // Extract material name
      const nameMatch = text.match(/m_Name:\s*(.+)/i);
      if (nameMatch) result.name = nameMatch[1].trim();

      // Extract shader name
      const shaderMatch = text.match(/m_Shader:.*?name:\s*(.+)/is) || text.match(/m_ShaderKeywords:\s*(.+)/i);
      if (shaderMatch) result.shader = shaderMatch[1].trim();

      // Extract main color (_Color property)
      // Look for pattern like: _Color: {r: 0.5, g: 0.5, b: 0.5, a: 1}
      const colorMatch = text.match(/_Color:\s*\{\s*r:\s*([\d.]+),\s*g:\s*([\d.]+),\s*b:\s*([\d.]+),\s*a:\s*([\d.]+)\s*\}/i);
      if (colorMatch) {
        result.color = {
          r: parseFloat(colorMatch[1]),
          g: parseFloat(colorMatch[2]),
          b: parseFloat(colorMatch[3]),
          a: parseFloat(colorMatch[4])
        };
      }

      // Also try to find BaseColor for newer shaders
      const baseColorMatch = text.match(/_BaseColor:\s*\{\s*r:\s*([\d.]+),\s*g:\s*([\d.]+),\s*b:\s*([\d.]+),\s*a:\s*([\d.]+)\s*\}/i);
      if (baseColorMatch && !colorMatch) {
        result.color = {
          r: parseFloat(baseColorMatch[1]),
          g: parseFloat(baseColorMatch[2]),
          b: parseFloat(baseColorMatch[3]),
          a: parseFloat(baseColorMatch[4])
        };
      }

      // Extract metallic
      const metallicMatch = text.match(/_Metallic:\s*([\d.]+)/i) || text.match(/_MetallicScale:\s*([\d.]+)/i);
      if (metallicMatch) result.properties.metallic = parseFloat(metallicMatch[1]);

      // Extract smoothness/glossiness
      const glossMatch = text.match(/_Glossiness:\s*([\d.]+)/i) || text.match(/_Smoothness:\s*([\d.]+)/i);
      if (glossMatch) result.properties.smoothness = parseFloat(glossMatch[1]);

      // Extract emission
      const emissionMatch = text.match(/_EmissionColor:\s*\{\s*r:\s*([\d.]+),\s*g:\s*([\d.]+),\s*b:\s*([\d.]+)/i);
      if (emissionMatch) {
        result.properties.emission = {
          r: parseFloat(emissionMatch[1]),
          g: parseFloat(emissionMatch[2]),
          b: parseFloat(emissionMatch[3])
        };
      }
    } catch (e) {
      console.error('Error parsing material:', e);
    }

    return result;
  };

  if (error) {
    return (
      <div className="material-preview error">
        <span>⚠️ {error}</span>
      </div>
    );
  }

  if (!materialData) {
    return (
      <div className="material-preview loading">
        <span>Loading...</span>
      </div>
    );
  }

  const { color, name, shader, properties } = materialData;
  const rgbColor = `rgb(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)})`;
  const hexColor = `#${Math.round(color.r * 255).toString(16).padStart(2, '0')}${Math.round(color.g * 255).toString(16).padStart(2, '0')}${Math.round(color.b * 255).toString(16).padStart(2, '0')}`;

  if (fullView) {
    return (
      <div className="material-preview-full">
        <div className="material-sphere" style={{ background: `radial-gradient(circle at 30% 30%, ${rgbColor}, #111)` }}>
          <div className="material-highlight"></div>
        </div>
        <div className="material-info-panel">
          <h3>{name}</h3>
          <div className="material-detail">
            <span className="label">Shader:</span>
            <span className="value">{shader}</span>
          </div>
          <div className="material-detail">
            <span className="label">Color:</span>
            <div className="color-swatch" style={{ backgroundColor: rgbColor }}></div>
            <span className="value">{hexColor}</span>
          </div>
          {properties.metallic !== undefined && (
            <div className="material-detail">
              <span className="label">Metallic:</span>
              <span className="value">{(properties.metallic * 100).toFixed(0)}%</span>
            </div>
          )}
          {properties.smoothness !== undefined && (
            <div className="material-detail">
              <span className="label">Smoothness:</span>
              <span className="value">{(properties.smoothness * 100).toFixed(0)}%</span>
            </div>
          )}
          {properties.emission && (
            <div className="material-detail">
              <span className="label">Emission:</span>
              <div className="color-swatch" style={{ 
                backgroundColor: `rgb(${Math.round(properties.emission.r * 255)}, ${Math.round(properties.emission.g * 255)}, ${Math.round(properties.emission.b * 255)})` 
              }}></div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Grid view - compact
  return (
    <div className="material-preview-compact">
      <div className="material-orb" style={{ background: `radial-gradient(circle at 30% 30%, ${rgbColor}, #222)` }}>
        <div className="orb-highlight"></div>
      </div>
      <span className="material-name">{name}</span>
    </div>
  );
};

// Component to handle individual image loading in grid
const ImagePreview = ({ filePath }) => {
  const [imageData, setImageData] = useState(null);

  useEffect(() => {
    const loadImage = async () => {
      try {
        const cls = classifyAsset(filePath);
        if (cls.nativeMime) {
          const result = await window.electron.readFile(filePath);
          if (result.success) setImageData(`data:${cls.nativeMime};base64,${result.data}`);
        } else if (cls.needsConversion && window.electron.convertImagePreview) {
          const result = await window.electron.convertImagePreview(filePath, cls.ext);
          if (result.success) setImageData(`data:${result.mime};base64,${result.data}`);
        }
      } catch (error) {
        console.error('Error loading image:', error);
      }
    };
    loadImage();
  }, [filePath]);

  return imageData ? (
    <img src={imageData} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
  ) : (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
      Loading...
    </div>
  );
};

export default AssetViewer;
