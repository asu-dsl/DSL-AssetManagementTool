# Asset Metadata Tool

A professional desktop application for managing metadata of asset files (3D models, images, videos, etc.). Built with React and Electron as a standalone Windows executable.

## ✨ Features

### File Management
- **Built-in File Explorer**: Browse and navigate your file system
- **Expandable Folder Tree**: Navigate nested folder structures
- **Multi-File Selection**: Select multiple files with checkboxes
- **File Search**: Search and filter files by name
- **Real-time File Count**: Track selected files

### Asset Preview
- **3D Model Viewer**: Preview OBJ, GLTF, and GLB files with Three.js
  - Orbit controls (rotate, zoom, pan)
  - Professional lighting setup
  - Grid floor for reference
  - Auto-scaling and centering
- **Image Viewer**: Preview images with proper aspect ratio
- **Supported File Types**:
  - Images: .jpg, .jpeg, .png, .gif, .bmp, .webp
  - 3D Models: .obj, .gltf, .glb, .fbx, .dae, .stl
  - Videos: .mp4, .mov, .avi, .mkv
  - Audio: .mp3, .wav, .ogg
  - Documents: .pdf, .txt, .doc, .docx

### Metadata Management
- **Batch Editing**: Apply metadata to multiple files at once
- **Individual Editing**: Edit one file at a time
- **Standard Fields**:
  - Title
  - Author
  - Tags (comma-separated)
  - Version
  - Notes
- **Custom Fields**: Add unlimited custom key-value pairs
- **Live Updates**: Changes apply immediately

### Export
- **JSON Export**: Export all metadata to JSON format
- **Complete File Information**: Includes file paths, sizes, and dates
- **Formatted Output**: Pretty-printed JSON for readability

## 🚀 Quick Start

### Automated Installation (Recommended for End Users)

**Just run the installer - it does everything!**

1. **Download** the project from GitHub
2. **Extract** to a folder (e.g., `C:\AssetMetadataTool`)
3. **Right-click** `install.bat` → **"Run as administrator"**
4. **Wait** for automatic setup (5-10 minutes):
   - ✅ Checks for Node.js
   - ✅ Downloads Node.js if needed
   - ✅ Installs dependencies
   - ✅ Builds the app
   - ✅ Creates the executable
   - ✅ Launches the app
5. **Done!** Application starts automatically

**Note:** After first installation, just double-click `install.bat` anytime to launch the app.

---

### Manual Build from Source (For Developers)

```bash
# Clone the repository
git clone https://github.com/MaharshiPatel2274/DSL-AssetManagementTool
cd DSL-AssetManagementTool

# Install dependencies
npm install

# Build React app
npm run build

# Package as standalone .exe
npm run package
```

Output location: `dist-packaged\AssetMetadataTool-win32-x64\AssetMetadataTool.exe`

### Development Mode

```bash
# Install dependencies
npm install

# Start Vite development server (Terminal 1)
npm run dev

# Start Electron app (Terminal 2)
npm run electron:dev
```

## 📖 How to Use

### Basic Workflow

**Step 1: Load Your Assets**
1. Click the green **"BROWSE FOLDER"** button
2. Select folder with your assets
3. Folder structure loads automatically

**Step 2: Select Files**
1. Click folders to expand/collapse
2. Check boxes next to files you want to edit
3. File count updates: "X files selected"

**Step 3: Preview (Optional)**
1. Double-click any image or 3D model
2. Preview appears in center panel
3. For 3D models:
   - Left-click + drag to rotate
   - Right-click + drag to pan
   - Scroll to zoom

**Step 4: Edit Metadata**

*Batch Mode (default):*
1. Select multiple files with checkboxes
2. Enter metadata values
3. Click individual "Apply" buttons or "Apply All"
4. Metadata applies to all selected files

*Single File Mode:*
1. Click the "SINGLE FILE" tab
2. Double-click a file to select it
3. Edit metadata for that specific file
4. Changes apply only to the selected file

**Step 5: Add Custom Fields**
1. Click **"+ Add Field"** in the Custom Fields section
2. Enter a key name and value
3. Click "Apply" to save
4. Remove fields with the red "X" button

**Step 6: Export Metadata**
1. Select files you want to export
2. Click **"EXPORT TO JSON"** in the top-right
3. Choose a save location
4. JSON file includes all metadata and file information

### Tips & Tricks

**Organize Your Assets:**
- Use the search box to filter files
- Tags support comma-separated values: `3d, character, rigged`
- Version field helps track iterations

**Custom Metadata:**
- Add any metadata you need: "License", "Creator", "Project", "Status"
- Each file can have different custom fields

**Batch Editing Power:**
- Select 100+ files at once
- Apply the same author to all
- Add project tags to entire folders
- Update versions across multiple assets

**Panel Resizing:**
- Drag the dividers between panels to resize
- Customize your workspace layout
- Changes persist during the session

## 🎨 UI Features

- **Color Scheme**: Clean white with Lincoln green (#3D8B1F) accents
- **Layout**: Three resizable panels (Explorer | Viewer | Metadata)
- **Resizable Panels**: Drag dividers to customize workspace
- **Multi-file Grid View**: Preview multiple assets side-by-side
- **Professional**: Modern, intuitive interface
- **Responsive**: Smooth interactions and transitions

## 📁 Project Structure

```
DSL Asset Management/
├── electron/
│   ├── main.js          # Electron main process
│   └── preload.js       # IPC bridge (CommonJS)
├── src/
│   ├── components/
│   │   ├── FileExplorer.jsx     # File browsing UI
│   │   ├── FileExplorer.css
│   │   ├── AssetViewer.jsx      # Preview panel
│   │   ├── AssetViewer.css
│   │   ├── Model3D.jsx          # 3D model renderer
│   │   ├── MetadataPanel.jsx    # Metadata editor
│   │   └── MetadataPanel.css
│   ├── App.jsx          # Main application
│   ├── App.css
│   ├── main.jsx         # React entry point
│   └── index.css
├── dist/                # Vite build output
├── dist-packaged/       # Electron packaged app
│   └── AssetMetadataTool-win32-x64/
│       └── AssetMetadataTool.exe   # ⭐ STANDALONE EXECUTABLE
├── public/
│   └── icon.svg
├── package.json
├── vite.config.js
└── README.md
```

## 🛠 Technical Stack

- **Frontend**: React 18+
- **Build Tool**: Vite
- **Desktop**: Electron 28+
- **3D Rendering**: Three.js with @react-three/fiber
- **Icons**: Lucide React
- **Packaging**: electron-packager

## 📦 Dependencies

```json
{
  "react": "^18.3.1",
  "react-dom": "^18.3.1",
  "@react-three/fiber": "^8.15.0",
  "@react-three/drei": "^9.92.0",
  "three": "^0.160.0",
  "lucide-react": "^0.300.0"
}
```

## 🔧 Configuration

### Electron Main Process
- IPC handlers for file operations
- Native folder/file dialogs
- Directory tree reading
- JSON export with save dialog

### Vite Config
- React plugin enabled
- Base path set to `./` for Electron
- Output to `dist/` directory

### Package Scripts
- `dev`: Start Vite dev server
- `electron:dev`: Run Electron in development mode
- `build`: Build React app for production
- `package`: Create standalone .exe

## 📝 JSON Export Format

```json
{
  "exportDate": "2024-11-10T13:45:00.000Z",
  "totalFiles": 5,
  "files": [
    {
      "fileName": "model.fbx",
      "filePath": "C:/Assets/Models/model.fbx",
      "fileSize": 2457600,
      "lastModified": "2024-11-09T10:30:00.000Z",
      "fileType": "3d",
      "metadata": {
        "title": "Character Model",
        "author": "John Doe",
        "tags": ["3d", "character", "rigged"],
        "version": "1.0",
        "notes": "Final version",
        "customField1": "value1"
      }
    }
  ]
}
```

## ⚠️ Notes

- **File Sizes**: Large files may take time to load
- **3D Models**: Complex models may affect performance
- **Permissions**: May need admin rights for certain folders
- **Cache**: Electron may create cache files (safe to delete)

## 🐛 Troubleshooting

### Application won't start
- Check if any antivirus is blocking the .exe
- Try running as administrator

### 3D models not loading
- Ensure file is valid OBJ, GLTF, or GLB format
- Check file isn't corrupted
- Look for errors in DevTools (F12)

### Files not showing
- Verify folder permissions
- Check if folder contains supported file types
- Try a different directory

## 📄 License

This project is for asset management purposes.

## 🎯 Success Criteria

✅ Working file explorer with expandable folder tree  
✅ Multi-file selection with checkboxes  
✅ 3D model preview for .obj, .gltf, .glb, .fbx files  
✅ Multi-file grid preview (side-by-side)  
✅ Image preview  
✅ Batch metadata editing  
✅ Single file metadata editing  
✅ Custom metadata fields (add/remove)  
✅ Resizable panels with draggable dividers  
✅ JSON export with all data  
✅ Standalone .exe with automated installer  
✅ Professional UI with Lincoln green accents  
✅ Smooth performance  

## 🚀 Version

**Version 1.0.0** - Initial Release

### Latest Features:
- ✨ FBX file support for 3D models
- ✨ Multi-file grid preview
- ✨ Resizable panels
- ✨ Lincoln green color scheme
- ✨ Automated installer script

Built with ❤️ using React and Electron

