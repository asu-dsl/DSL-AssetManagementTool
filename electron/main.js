import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import * as perforceService from './services/perforce.js';
import * as zipService from './services/zip.js';
import * as imageConvertService from './services/imageConvert.js';
import { classifyAsset } from '../shared/assetClassification.js';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

console.log('[DSL main] ready — folder classify rule: sidecar/subdir=category/leaf=asset');
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC Handlers
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  
  if (result.canceled) {
    return null;
  }
  
  return result.filePaths[0];
});

// Targeted download: by the time an asset is being previewed, its full
// content already exists locally at sourcePath — for a depot asset, that's
// the temp file p4 print already fetched for the preview itself. So
// "download" is just "ask where to save it, then copy" — no second fetch,
// no workspace, works identically for local and depot assets.
ipcMain.handle('download-asset', async (event, { sourcePath, suggestedName }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Download Asset',
    defaultPath: suggestedName || path.basename(sourcePath),
  });
  if (result.canceled || !result.filePath) return { success: false, canceled: true };
  try {
    await fs.copyFile(sourcePath, result.filePath);
    return { success: true, path: result.filePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

async function copyDirRecursive(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) await copyDirRecursive(srcPath, destPath);
    else await fs.copyFile(srcPath, destPath);
  }
}

// Whole-folder download: for a local folder, a plain recursive copy. For a
// depot folder, list every file under it in one call (p4 files foo/...)
// and p4 print each one to the matching relative path — still no
// workspace, still no full depot clone, just more files than the
// single-asset case.
ipcMain.handle('download-folder', async (event, { folderPath }) => {
  const isDepot = folderPath.startsWith('//');
  const folderName = folderPath.split(/[\\/]+/).filter(Boolean).pop() || 'download';

  const picked = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose a destination folder',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (picked.canceled || !picked.filePaths || picked.filePaths.length === 0) return { success: false, canceled: true };
  const destFolder = path.join(picked.filePaths[0], folderName);

  if (!isDepot) {
    try {
      await copyDirRecursive(folderPath, destFolder);
      return { success: true, destFolder };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  const listed = await perforceService.listDepotFilesRecursive(folderPath, { user: p4Config.user });
  if (!listed.success) return { success: false, error: listed.error };
  if (listed.files.length === 0) return { success: false, error: 'This folder has no files to download.' };

  const prefix = folderPath.replace(/\/+$/, '');
  let downloaded = 0;
  const errors = [];
  for (const depotFile of listed.files) {
    const relative = depotFile.slice(prefix.length).replace(/^\/+/, '');
    const destPath = path.join(destFolder, ...relative.split('/'));
    try {
      const printed = await perforceService.printToTempFile(depotFile, { user: p4Config.user });
      if (!printed.success) { errors.push(`${depotFile}: ${printed.error}`); continue; }
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      await fs.copyFile(printed.localPath, destPath);
      fs.unlink(printed.localPath).catch(() => {});
      downloaded++;
    } catch (error) {
      errors.push(`${depotFile}: ${error.message}`);
    }
  }
  return { success: true, destFolder, downloaded, total: listed.files.length, errors };
});

ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const buffer = await fs.readFile(filePath);
    return {
      success: true,
      data: buffer.toString('base64'),
      path: filePath,
    };
  } catch (error) {
    console.error('Error reading file:', error);
    return { success: false, error: error.message };
  }
});

// Perforce (P4) Integration - Full Implementation
let p4Config = {
  user: null,
  client: null,
  port: null,
  clients: [], // List of available workspaces
  connected: false,
  lastCheck: null,
  artDepotClient: null, // Workspace resolved to map //Art/... — see resolveLocalPathForDepot
};

// P4 Class wrapper for clean command execution
class P4 {
  constructor({ p4Path = 'p4', port, user, client, cwd }) {
    this.p4Path = p4Path;
    this.env = {
      ...process.env,
      ...(port ? { P4PORT: port } : {}),
      ...(user ? { P4USER: user } : {}),
      ...(client ? { P4CLIENT: client } : {}),
    };
    this.cwd = cwd;
  }

  async run(args, { input, timeout = 30000 } = {}) {
    return new Promise((resolve, reject) => {
      const options = {
        env: this.env,
        cwd: this.cwd,
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024,
        timeout,
      };

      let p4Args = [...args];
      
      // Build command line for exec
      let cmdLine = this.p4Path;
      if (this.env.P4USER && !process.env.P4USER) cmdLine += ` -u "${this.env.P4USER}"`;
      if (this.env.P4CLIENT && !process.env.P4CLIENT) cmdLine += ` -c "${this.env.P4CLIENT}"`;
      cmdLine += ' ' + args.map(a => a.includes(' ') ? `"${a}"` : a).join(' ');
      
      console.log('P4 Command:', cmdLine);
      
      exec(cmdLine, options, (error, stdout, stderr) => {
        if (error && !stdout && !stderr) {
          reject(error);
        } else {
          resolve({ stdout: stdout || '', stderr: stderr || '' });
        }
      });
    });
  }

  async info() { return this.run(['info']); }
  async login(password) { return this.run(['login'], { input: password + '\n' }); }
  async sync(path = '//...') { return this.run(['sync', path]); }
  async edit(filePath) { return this.run(['edit', filePath]); }
  async add(filePath) { return this.run(['add', filePath]); }
  async revert(filePath) { return this.run(['revert', filePath]); }
  async opened(client = null) { 
    const args = ['opened'];
    if (client) args.push('-c', 'default');
    return this.run(args);
  }
  async submit(desc) { return this.run(['submit', '-d', desc]); }
  async fstat(filePath, fields = null) {
    const args = ['fstat'];
    if (fields) args.push('-T', fields);
    args.push(filePath);
    return this.run(args);
  }
  async changes(options = {}) {
    const args = ['changes'];
    if (options.pending) args.push('-s', 'pending');
    if (options.client) args.push('-c', options.client);
    if (options.user) args.push('-u', options.user);
    if (options.max) args.push('-m', options.max.toString());
    return this.run(args);
  }
  async describe(changelist) {
    return this.run(['describe', '-s', changelist.toString()]);
  }
  async diff(filePath) {
    return this.run(['diff', '-du', filePath]);
  }
  async revertUnchanged(filePath = '//...') {
    return this.run(['revert', '-a', filePath]);
  }
}

// Global P4 instance - will be recreated when config changes
let p4Instance = null;

function getP4Instance(clientOverride = null) {
  const client = clientOverride || p4Config.client;
  return new P4({
    user: p4Config.user,
    client: client,
  });
}

// Helper function to run P4 commands with proper config (legacy compatibility)
async function runP4Command(command, clientOverride = null) {
  let p4Cmd = 'p4';
  if (p4Config.user) p4Cmd += ` -u "${p4Config.user}"`;
  
  const client = clientOverride || p4Config.client;
  if (client) p4Cmd += ` -c "${client}"`;
  
  const fullCommand = `${p4Cmd} ${command}`;
  console.log('Running P4 command:', fullCommand);
  return await execAsync(fullCommand, { encoding: 'utf8' });
}

// Find the best matching workspace for a file path
function findClientForPath(filePath) {
  if (!p4Config.clients || p4Config.clients.length === 0) {
    console.log('No clients available, using default:', p4Config.client);
    return p4Config.client;
  }
  
  const normalizedPath = filePath.toLowerCase().replace(/\\/g, '/');
  console.log('Looking for client for path:', normalizedPath);
  console.log('Available clients:', p4Config.clients);
  
  // Find workspace whose root contains this file
  for (const client of p4Config.clients) {
    const normalizedRoot = client.root.toLowerCase().replace(/\\/g, '/');
    // Ensure root ends with / for proper prefix matching
    const rootWithSlash = normalizedRoot.endsWith('/') ? normalizedRoot : normalizedRoot + '/';
    const pathForMatch = normalizedPath.endsWith('/') ? normalizedPath : normalizedPath + '/';
    
    if (normalizedPath.startsWith(normalizedRoot + '/') || normalizedPath === normalizedRoot) {
      console.log(`Found matching client "${client.name}" for path: ${filePath}`);
      return client.name;
    }
  }
  
  console.log('No matching client found, using default:', p4Config.client);
  return p4Config.client;
}

ipcMain.handle('p4-check-available', async () => {
  try {
    const { stdout } = await execAsync('p4 -V', { timeout: 5000 });
    return { 
      available: true, 
      version: stdout.trim().split('\n')[0] 
    };
  } catch (error) {
    return { available: false, error: error.message };
  }
});

// Live connection check - actually tests server connectivity
ipcMain.handle('p4-check-connection', async () => {
  try {
    const { stdout, stderr } = await execAsync('p4 info', { encoding: 'utf8', timeout: 10000 });
    
    // Check for connection errors in output
    const output = stdout + stderr;
    if (output.includes('Connect to server failed') || 
        output.includes('TCP connect to') ||
        output.includes('Perforce client error')) {
      p4Config.connected = false;
      return { connected: false, error: 'Cannot connect to Perforce server' };
    }
    
    // Parse to verify we got real info
    const hasServer = output.includes('Server address:');
    const hasUser = output.includes('User name:');
    
    p4Config.connected = hasServer && hasUser;
    p4Config.lastCheck = Date.now();
    
    return { 
      connected: p4Config.connected,
      timestamp: p4Config.lastCheck
    };
  } catch (error) {
    p4Config.connected = false;
    return { connected: false, error: error.message };
  }
});

// Lightweight check for background polling — deliberately does NOT refetch
// the client list (that's p4-get-info's job, reserved for explicit user
// actions) so this stays cheap enough to poll frequently.
ipcMain.handle('p4-check-session', () => perforceService.checkSession());
ipcMain.handle('p4-get-configured-server', () => perforceService.getConfiguredServer());

// Explicit login flow: server + user + password in, a session ticket
// written to disk by `p4` itself out. See services/perforce.js for the
// security rationale (password never touches argv, never stored by us).
ipcMain.handle('p4-login', (event, data) => perforceService.login(data));

ipcMain.handle('p4-get-info', async () => {
  try {
    const { stdout, stderr } = await execAsync('p4 info', { encoding: 'utf8', timeout: 10000 });
    
    // Check for connection errors
    const fullOutput = stdout + stderr;
    if (fullOutput.includes('Connect to server failed') || 
        fullOutput.includes('Perforce client error')) {
      p4Config.connected = false;
      return { success: false, error: 'Cannot connect to Perforce server', connected: false };
    }
    
    // Parse p4 info output
    const info = {};
    stdout.split('\n').forEach(line => {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex).trim().toLowerCase().replace(/\s+/g, '_');
        const value = line.substring(colonIndex + 1).trim();
        if (value) {
          info[key] = value;
        }
      }
    });
    
    // Store basic config
    p4Config.user = info.user_name;
    p4Config.port = info.server_address;
    p4Config.connected = !!(info.server_address && info.user_name);
    p4Config.lastCheck = Date.now();
    
    // Fetch list of user's workspaces with their roots
    let sessionError = null;
    try {
      const { stdout: clientsOutput } = await execAsync(`p4 clients -u "${info.user_name}"`, { encoding: 'utf8' });
      const clients = [];

      clientsOutput.split('\n').forEach(line => {
        // Format: Client NAME DATE root PATH 'description'
        // Find "root " and then extract path up to " '" (space before description quote)
        const rootIndex = line.indexOf(' root ');
        if (rootIndex > 0) {
          const nameMatch = line.match(/^Client\s+(\S+)/);
          if (nameMatch) {
            const afterRoot = line.substring(rootIndex + 6); // Skip " root "
            // Find the space before the description quote
            const descStart = afterRoot.indexOf(" '");
            const rootPath = descStart > 0 ? afterRoot.substring(0, descStart) : afterRoot.trim();

            clients.push({
              name: nameMatch[1],
              root: rootPath,
            });
          }
        }
      });

      p4Config.clients = clients;
      console.log('Found P4 clients:', JSON.stringify(clients.slice(0, 5), null, 2), `... and ${clients.length - 5} more`);

      // Set default client from info
      p4Config.client = info.client_name;
    } catch (e) {
      console.error('Failed to fetch P4 clients:', e);
      p4Config.clients = [];
      sessionError = (e.stderr || e.stdout || e.message || '').toString().trim() || null;
    }

    console.log('P4 Config stored:', p4Config);

    // Connected if we have server address, user name, and a valid (non-expired) session
    const isConnected = !!(info.server_address && info.user_name) && !sessionError;
    p4Config.connected = isConnected;

    return {
      success: true,
      user: info.user_name || null,
      client: info.client_name || null,
      server: info.server_address || null,
      root: info.client_root || null,
      connected: isConnected,
      sessionError,
      clients: p4Config.clients || [], // Return available workspaces
    };
  } catch (error) {
    console.error('P4 info error:', error);
    return { success: false, error: error.message, connected: false };
  }
});

ipcMain.handle('p4-check-file-status', async (event, filePath) => {
  try {
    const client = findClientForPath(filePath);
    const { stdout } = await runP4Command(`fstat "${filePath}"`, client);
    
    // Parse p4 fstat output
    const isInDepot = stdout.includes('depotFile');
    const isCheckedOut = stdout.includes('action edit') || stdout.includes('action add');
    const otherOpen = stdout.includes('otherOpen');
    
    return {
      success: true,
      inDepot: isInDepot,
      checkedOut: isCheckedOut,
      otherOpen: otherOpen,
      canEdit: isInDepot && !otherOpen,
      client: client,
    };
  } catch (error) {
    // File not in Perforce
    const errMsg = error.message || '';
    if (errMsg.includes('no such file') || errMsg.includes('not on client') || errMsg.includes('not under')) {
      return {
        success: true,
        inDepot: false,
        checkedOut: false,
        otherOpen: false,
        canEdit: false,
      };
    }
    return { success: false, error: error.message };
  }
});

ipcMain.handle('p4-checkout-files', async (event, data) => {
  // Support both old format (array of paths) and new format ({ filePaths, client })
  const filePaths = Array.isArray(data) ? data : data.filePaths;
  const clientOverride = Array.isArray(data) ? null : data.client;
  const results = [];

  for (const filePath of filePaths) {
    const client = clientOverride || findClientForPath(filePath);
    const result = await perforceService.checkoutFile(filePath, { client, user: p4Config.user });
    results.push({ file: filePath, ...result });
  }

  return results;
});

ipcMain.handle('p4-add-file', async (event, data) => {
  // Support both old format (string path) and new format ({ filePath, client })
  const filePath = typeof data === 'string' ? data : data.filePath;
  const clientOverride = typeof data === 'string' ? null : data.client;
  try {
    const client = clientOverride || findClientForPath(filePath);
    console.log(`Adding file to P4 with client "${client}":`, filePath);
    const { stdout, stderr } = await runP4Command(`add "${filePath}"`, client);
    const output = stdout + stderr;
    
    if (output.includes('opened for add') || output.includes('currently opened')) {
      return { success: true, message: 'File marked for add' };
    }
    
    if (output.includes('not on client') || output.includes('not under client')) {
      return { success: false, error: `File is outside workspace "${client}". The file must be under the workspace root folder.` };
    }
    if (output.includes('file(s) not in client view')) {
      return { success: false, error: `File path not mapped in workspace "${client}" view. Select a different workspace or update your workspace mapping.` };
    }
    
    return { success: false, error: output || 'Failed to add file' };
  } catch (error) {
    const errMsg = error.message || error.stderr || 'Unknown error';
    if (errMsg.includes('not on client') || errMsg.includes('not under client') || errMsg.includes('not in client view')) {
      return { success: false, error: 'File is outside the selected P4 workspace. Select a workspace whose root covers this file location.' };
    }
    return { success: false, error: errMsg };
  }
});

// Get all opened/pending files for a workspace
ipcMain.handle('p4-get-opened', (event, clientName = null) =>
  perforceService.getOpened({ client: clientName || p4Config.client, user: p4Config.user })
);

// Submit changes with description
ipcMain.handle('p4-submit', (event, { description, files = null, client = null }) =>
  perforceService.submit({ description, client: client || p4Config.client, user: p4Config.user })
);

// Revert files (with option to revert unchanged only)
ipcMain.handle('p4-revert-files', (event, { files = null, unchangedOnly = false, client = null }) =>
  perforceService.revertFiles({ files, unchangedOnly, client: client || p4Config.client, user: p4Config.user })
);

// Sync files from depot
ipcMain.handle('p4-sync', async (event, { path = '//...', force = false, client = null }) => {
  try {
    const useClient = client || p4Config.client;
    const command = force ? `sync -f "${path}"` : `sync "${path}"`;
    
    const { stdout, stderr } = await runP4Command(command, useClient);
    const output = stdout + stderr;
    
    // Count synced files
    const syncedMatch = output.match(/(\d+)\s+files?\s+/);
    const fileCount = syncedMatch ? parseInt(syncedMatch[1]) : 0;
    
    return { 
      success: true, 
      message: `Synced ${fileCount} file(s)`,
      fileCount,
      output 
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Get diff for a file
ipcMain.handle('p4-diff', async (event, filePath) => {
  try {
    const client = findClientForPath(filePath);
    const { stdout, stderr } = await runP4Command(`diff -du "${filePath}"`, client);
    
    return { 
      success: true, 
      diff: stdout,
      hasDiff: stdout.trim().length > 0
    };
  } catch (error) {
    // No diff means file is unchanged
    if (error.message?.includes('file(s) not opened') || error.stdout === '') {
      return { success: true, diff: '', hasDiff: false };
    }
    return { success: false, error: error.message };
  }
});

// Browse depot directories
ipcMain.handle('p4-get-depot-dirs', (event, depotPath) => perforceService.listDepotDirs(depotPath, { user: p4Config.user }));
ipcMain.handle('p4-get-depot-files', (event, depotPath) => perforceService.listDepotFiles(depotPath, { user: p4Config.user }));

// Fetch a depot file's content directly (p4 print), without syncing it to a
// workspace, so it can be previewed even outside any client's view mapping.
ipcMain.handle('p4-print-depot-file', (event, depotPath) => perforceService.printToTempFile(depotPath, { user: p4Config.user }));

// Depot-sourced sidecar metadata (title/author/tags/notes) — see
// services/perforce.js for why "no sidecar yet" is success, not an error.
ipcMain.handle('p4-get-asset-metadata', (event, depotPath) => perforceService.getAssetMetadata(depotPath, { user: p4Config.user }));

// Pick one or more arbitrary local files to upload into the depot (no
// extension restriction — P4 tracks any file type).
ipcMain.handle('select-upload-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
  });
  if (result.canceled || !result.filePaths || result.filePaths.length === 0) return [];
  return result.filePaths;
});

// Find (or, failing that, create) a workspace mapped to the Art depot, so
// the app works on a machine that has never touched P4V. The app-wide
// "active client" is frequently just the machine's default placeholder
// (e.g. "OEC1605"), which may not be a real, mapped workspace — so this
// always tries real candidates first and only creates one as a last resort.
async function ensureArtDepotClient() {
  const candidates = [];
  if (p4Config.artDepotClient) candidates.push(p4Config.artDepotClient);
  if (p4Config.client) candidates.push(p4Config.client);
  for (const c of (p4Config.clients || [])) {
    if (!candidates.includes(c.name)) candidates.push(c.name);
  }

  let resolved = await perforceService.resolveLocalPathForDepot('//Art/...', candidates, { user: p4Config.user });
  if (!resolved) {
    if (!p4Config.user) return { success: false, error: 'Not logged in to Perforce.' };
    const clientName = `ams-${p4Config.user.replace(/[^\w.-]/g, '_')}-art`;
    const localRoot = path.join(app.getPath('userData'), 'p4-workspace');
    await fs.mkdir(localRoot, { recursive: true });
    const created = await perforceService.createMinimalClient({ user: p4Config.user, depotRoot: '//Art', localRoot, clientName });
    if (!created.success) return { success: false, error: created.error };
    resolved = await perforceService.resolveLocalPathForDepot('//Art/...', [clientName], { user: p4Config.user });
    if (!resolved) return { success: false, error: 'Workspace was created but could not be resolved.' };
  }
  p4Config.artDepotClient = resolved.client;
  const root = resolved.localPath.replace(/[\\/]?\.\.\.$/, '');
  return { success: true, client: resolved.client, root };
}

// The Art-depot workspace, cached separately from the app's general-purpose
// "active client" (which other features overwrite for unrelated reasons —
// e.g. reconnecting Perforce resets it to the machine's default placeholder).
// The upload feature should never silently start pointing at the wrong
// workspace just because something else touched that shared value.
ipcMain.handle('p4-resolve-art-client', () => ensureArtDepotClient());

// Copy picked local file(s) into a workspace's local folder for a given
// depot folder (resolved via `p4 where`), then `p4 add` each one.
ipcMain.handle('p4-upload-to-depot', async (event, { depotFolder, filePaths }) => {
  const ensured = await ensureArtDepotClient();
  if (!ensured.success) {
    return { success: true, results: filePaths.map((p) => ({ file: path.basename(p), success: false, error: ensured.error })) };
  }
  const client = ensured.client;

  const results = [];
  for (const srcPath of filePaths) {
    const baseName = path.basename(srcPath);
    const depotTarget = `${depotFolder.replace(/\/+$/, '')}/${baseName}`;
    try {
      const resolved = await perforceService.resolveLocalPathForDepot(depotTarget, [client], { user: p4Config.user });
      if (!resolved) throw new Error('Could not resolve a local path for this depot location in the workspace.');
      const { localPath } = resolved;

      await fs.mkdir(path.dirname(localPath), { recursive: true });
      await fs.copyFile(srcPath, localPath);

      const { stdout: addOut, stderr: addErr } = await runP4Command(`add "${localPath}"`, client);
      const addOutput = addOut + addErr;
      if (addOutput.includes('opened for add') || addOutput.includes('currently opened')) {
        results.push({ file: baseName, success: true, localPath, depotTarget, client });
      } else {
        results.push({ file: baseName, success: false, error: addOutput.trim() || 'p4 add failed' });
      }
    } catch (error) {
      results.push({ file: baseName, success: false, error: error.message });
    }
  }
  return { success: true, results };
});

// ---------- Profiles (per-user, keyed on Perforce user, OS-user fallback) ----------

function getProfilesDir() {
  return path.join(app.getPath('userData'), 'profiles');
}

function getActiveProfileKey() {
  const p4User = (typeof p4Config !== 'undefined' && p4Config && p4Config.user) ? p4Config.user : null;
  let osUser = 'default';
  try { osUser = os.userInfo().username || 'default'; } catch {}
  return String(p4User || osUser || 'default').replace(/[^\w.-]/g, '_');
}

function profileFilePath(key) {
  return path.join(getProfilesDir(), `${key}.json`);
}

async function readProfile() {
  const key = getActiveProfileKey();
  await fs.mkdir(getProfilesDir(), { recursive: true });
  try {
    const data = await fs.readFile(profileFilePath(key), 'utf-8');
    const p = JSON.parse(data);
    return {
      displayName: p.displayName || key,
      favorites: Array.isArray(p.favorites) ? p.favorites : [],
      connections: p.connections || {},
      ...p,
      key,
    };
  } catch {
    let favorites = [];
    try {
      const legacy = await fs.readFile(path.join(app.getPath('userData'), 'favorites.json'), 'utf-8');
      const parsed = JSON.parse(legacy);
      if (Array.isArray(parsed)) favorites = parsed;
    } catch {}
    const profile = { key, displayName: key, favorites, connections: {}, createdAt: new Date().toISOString() };
    try { await fs.writeFile(profileFilePath(key), JSON.stringify(profile, null, 2), 'utf-8'); } catch {}
    return profile;
  }
}

async function writeProfile(partial) {
  const key = (partial && partial.key) || getActiveProfileKey();
  await fs.mkdir(getProfilesDir(), { recursive: true });
  let existing = {};
  try { existing = JSON.parse(await fs.readFile(profileFilePath(key), 'utf-8')); } catch {}
  const merged = { ...existing, ...partial, key };
  await fs.writeFile(profileFilePath(key), JSON.stringify(merged, null, 2), 'utf-8');
  return merged;
}

ipcMain.handle('profile-load', async () => {
  try { return { success: true, profile: await readProfile() }; }
  catch (error) { return { success: false, error: error.message }; }
});

ipcMain.handle('profile-save', async (event, profile) => {
  try { return { success: true, profile: await writeProfile(profile) }; }
  catch (error) { return { success: false, error: error.message }; }
});

// ---------- 2.0 library helpers ----------

ipcMain.handle('list-folder-files', async (event, dirPath) => {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const items = [];
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(dirPath, e.name);
      try {
        const stats = await fs.stat(full);
        items.push({
          name: e.name,
          path: full,
          isDirectory: e.isDirectory(),
          size: stats.size,
          lastModified: stats.mtime.toISOString(),
        });
      } catch {}
    }
    return { success: true, items };
  } catch (error) {
    return { success: false, error: error.message, items: [] };
  }
});

// ---------- 2.0 asset library: recursive zip scan + embedded preview extraction ----------

const zipPreviewCache = new Map();
const PREVIEW_IMG_RE = /\.(png|jpe?g|webp)$/i;

async function findAndExtractPreview(zipPath) {
  const result = await zipService.readZipEntry(zipPath, (entries) => {
    const imgs = entries.filter((e) => PREVIEW_IMG_RE.test(e.name));
    if (imgs.length === 0) return null;
    return (
      imgs.find((e) => /preview/i.test(e.name)) ||
      imgs.find((e) => /thumb/i.test(e.name)) ||
      imgs.slice().sort((a, b) => a.compSize - b.compSize)[0]
    );
  });
  if (!result) return null;
  const ext = (result.entry.name.split('.').pop() || 'png').toLowerCase();
  const mime = (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' : (ext === 'webp' ? 'image/webp' : 'image/png');
  return { data: result.data.toString('base64'), mime };
}

ipcMain.handle('read-zip-preview', async (event, zipPath) => {
  try {
    if (zipPreviewCache.has(zipPath)) return zipPreviewCache.get(zipPath);
    const r = await findAndExtractPreview(zipPath);
    const out = r ? { success: true, data: r.data, mime: r.mime } : { success: false };
    zipPreviewCache.set(zipPath, out);
    return out;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Decode formats with no native browser preview (TGA, TIFF) and hand back a
// PNG the renderer can show through its existing <img> path. See
// services/imageConvert.js for why no row-flip is needed and why EXR isn't
// included yet.
const imageConvertCache = new Map();
ipcMain.handle('convert-image-preview', async (event, filePath, ext) => {
  try {
    const key = `${filePath}::${ext}`;
    if (imageConvertCache.has(key)) return imageConvertCache.get(key);
    const out = await imageConvertService.convertToPngPreview(filePath, ext);
    imageConvertCache.set(key, out);
    return out;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Peek one level into a directory: does it hold files (=> asset), and a preview image.
// Resolve real directory-ness. OneDrive/cloud placeholders and junctions can be
// reparse points that readdir reports as non-directories; stat sees through them.
async function resolveIsDir(full, e) {
  if (e.isDirectory()) return true;
  if (e.isFile()) return false;
  try { const st = await fs.stat(full); return st.isDirectory(); } catch { return false; }
}

async function classifyDir(dirPath) {
  let entries;
  try { entries = await fs.readdir(dirPath, { withFileTypes: true }); } catch { return { hasSidecar: false, hasSubdir: false, hasFiles: false, hasZip: false, firstImage: null }; }
  let hasSidecar = false;
  let hasSubdir = false;
  let hasFiles = false;
  let hasZip = false;
  let firstImage = null;
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dirPath, e.name);
    if (await resolveIsDir(full, e)) { hasSubdir = true; continue; }
    hasFiles = true;
    const lower = e.name.toLowerCase();
    if (lower.endsWith('.dslmeta.json')) hasSidecar = true;
    if (lower.endsWith('.zip')) hasZip = true;
    if (!firstImage && classifyAsset(e.name).category === 'image') firstImage = full;
  }
  return { hasSidecar, hasSubdir, hasFiles, hasZip, firstImage };
}

// List immediate children of a folder, classifying each subfolder as an asset
// (contains files) or a category (only subfolders). Files map to file/zip assets.
ipcMain.handle('list-library-entries', async (event, dirPath) => {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const items = [];
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(dirPath, e.name);
      if (await resolveIsDir(full, e)) {
        const c = await classifyDir(full);
        // JSON present => asset (even if it also nests sub-folders, e.g. LODs).
        // No JSON but has sub-folders => category (stays browsable in the nav).
        // No JSON, no sub-folders, just files => bare asset. Empty => category.
        // Sidecar => asset (handles ingested assets that nest variant sub-folders).
        // Otherwise any folder that contains sub-folders is a category.
        // A leaf folder (files, no sub-folders) is a bare asset. Empty => category.
        // Sidecar => single ingested asset (may nest variant sub-folders).
        // Sub-folders OR zip files => a browsable category (the zips are its assets).
        // A leaf with only component files (mesh/textures) => a single extracted asset.
        if (c.hasSidecar) items.push({ name: e.name, path: full, kind: 'assetFolder', preview: c.firstImage });
        else if (c.hasSubdir || c.hasZip) items.push({ name: e.name, path: full, kind: 'category' });
        else if (c.hasFiles) items.push({ name: e.name, path: full, kind: 'assetFolder', preview: c.firstImage });
        else items.push({ name: e.name, path: full, kind: 'category' });
      } else {
        if (e.name.endsWith('.dslmeta.json')) continue;
        const lower = e.name.toLowerCase();
        if (lower.endsWith('.zip')) items.push({ name: e.name.replace(/\.zip$/i, ''), path: full, kind: 'zipAsset' });
        else items.push({ name: e.name, path: full, kind: 'file' });
      }
    }
    return { success: true, items };
  } catch (error) {
    return { success: false, error: error.message, items: [] };
  }
});

// Recursively collect ASSETS beneath a folder: descend through categories
// (folders with sub-folders and no sidecar); emit leaf/sidecar folders and zips.
async function collectAssets(dir, maxDepth, cap, acc, depth) {
  if (acc.length >= cap || depth > maxDepth) return;
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (acc.length >= cap) return;
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (await resolveIsDir(full, e)) {
      const c = await classifyDir(full);
      if (c.hasSidecar) {
        acc.push({ name: e.name, path: full, kind: 'assetFolder', preview: c.firstImage });
      } else if (c.hasSubdir || c.hasZip) {
        await collectAssets(full, maxDepth, cap, acc, depth + 1);
      } else if (c.hasFiles) {
        acc.push({ name: e.name, path: full, kind: 'assetFolder', preview: c.firstImage });
      }
    } else if (e.name.toLowerCase().endsWith('.zip')) {
      acc.push({ name: e.name.replace(/\.zip$/i, ''), path: full, kind: 'zipAsset' });
    }
  }
}

ipcMain.handle('scan-assets', async (event, rootPath) => {
  try { const acc = []; await collectAssets(rootPath, 8, 5000, acc, 0); return { success: true, items: acc }; }
  catch (error) { return { success: false, error: error.message, items: [] }; }
});

// ---------- Library index (network-drive-aware caching) ----------
// Persist a scanned snapshot per library so the UI reads from cache instead of
// walking the (often network/Dropbox) tree on every click. Rebuilt on demand.

function indexFilePath() { return path.join(app.getPath('userData'), 'library-index.json'); }

async function loadIndex() {
  try { return JSON.parse(await fs.readFile(indexFilePath(), 'utf-8')); } catch { return { libraries: {} }; }
}
async function saveIndex(idx) {
  try { await fs.writeFile(indexFilePath(), JSON.stringify(idx), 'utf-8'); return true; } catch { return false; }
}

// Full walk of one library: categories (folders), flat asset list, and dir mtimes.
async function buildLibraryIndex(root, maxDepth = 12, cap = 100000) {
  const folders = [];
  const assets = [];
  const mtimes = {};
  let count = 0;
  async function walk(dir, depth) {
    if (count >= cap || depth > maxDepth) return;
    let entries;
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    try { const st = await fs.stat(dir); mtimes[dir] = st.mtimeMs; } catch {}
    for (const e of entries) {
      if (count >= cap) return;
      if (e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (await resolveIsDir(full, e)) {
        const c = await classifyDir(full);
        if (c.hasSidecar) { assets.push({ path: full, parent: dir, name: e.name, kind: 'assetFolder', preview: c.firstImage }); count++; }
        else if (c.hasSubdir || c.hasZip) { folders.push({ path: full, parent: dir, name: e.name, kind: 'category' }); await walk(full, depth + 1); }
        else if (c.hasFiles) { assets.push({ path: full, parent: dir, name: e.name, kind: 'assetFolder', preview: c.firstImage }); count++; }
        else { folders.push({ path: full, parent: dir, name: e.name, kind: 'category' }); }
      } else if (e.name.toLowerCase().endsWith('.zip')) {
        assets.push({ path: full, parent: dir, name: e.name.replace(/\.zip$/i, ''), kind: 'zipAsset' }); count++;
      }
    }
  }
  await walk(root, 0);
  return { root, scannedAt: new Date().toISOString(), folders, assets, mtimes };
}

// Lightweight change probe: dir mtimes only (no per-file classification).
async function collectDirMtimes(root, maxDepth, out, depth) {
  if (depth > maxDepth) return out;
  let entries;
  try { entries = await fs.readdir(root, { withFileTypes: true }); } catch { return out; }
  try { const st = await fs.stat(root); out[root] = st.mtimeMs; } catch {}
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(root, e.name);
    if (await resolveIsDir(full, e)) await collectDirMtimes(full, maxDepth, out, depth + 1);
  }
  return out;
}

function countChanged(prevMtimes, nowMtimes) {
  const keys = new Set([...Object.keys(prevMtimes || {}), ...Object.keys(nowMtimes || {})]);
  let changed = 0;
  for (const k of keys) { if ((prevMtimes || {})[k] !== (nowMtimes || {})[k]) changed++; }
  return changed;
}

ipcMain.handle('index-load', async () => {
  return { success: true, index: await loadIndex() };
});

ipcMain.handle('scan-libraries', async (event, roots) => {
  const idx = await loadIndex();
  const summary = [];
  for (const root of (roots || [])) {
    const prev = idx.libraries[root];
    const built = await buildLibraryIndex(root);
    const changed = prev ? countChanged(prev.mtimes, built.mtimes) : 0;
    idx.libraries[root] = built;
    summary.push({ root, folders: built.folders.length, assets: built.assets.length, scannedAt: built.scannedAt, changed });
  }
  await saveIndex(idx);
  return { success: true, summary, index: idx };
});

// ---------- 2.0 catalog: per-asset sidecars + Megascans JSON extraction ----------

const zipMetaCache = new Map();

function normalizeMegascans(j) {
  const autoTags = []
    .concat(Array.isArray(j.tags) ? j.tags : [])
    .concat(j.semanticTags && Array.isArray(j.semanticTags.tags) ? j.semanticTags.tags : []);
  const categories = Array.isArray(j.categories) ? j.categories.map(String) : [];
  const cat = categories.map((c) => c.toLowerCase());
  let type = 'unknown';
  if (cat.includes('surface')) type = 'surface';
  else if (cat.includes('3dplant') || cat.includes('plant')) type = 'model';
  else if (cat.includes('3d')) type = 'model';
  else if (cat.includes('atlas')) type = 'texture';
  else if (cat.includes('decal')) type = 'texture';
  else if (cat.includes('brush')) type = 'brush';
  return {
    name: j.name || null,
    originalId: j.id || j._id || null,
    autoTags: Array.from(new Set(autoTags.map(String))),
    categories,
    type,
    physicalSize: j.physicalSize || null,
  };
}

async function readZipJson(zipPath) {
  const result = await zipService.readZipEntry(zipPath, (entries) => {
    const jsons = entries.filter((e) => /\.json$/i.test(e.name));
    if (jsons.length === 0) return null;
    return jsons.slice().sort((a, b) => b.compSize - a.compSize)[0];
  });
  if (!result) return null;
  return JSON.parse(result.data.toString('utf8'));
}

ipcMain.handle('read-zip-metadata', async (event, zipPath) => {
  try {
    if (zipMetaCache.has(zipPath)) return zipMetaCache.get(zipPath);
    const j = await readZipJson(zipPath);
    const out = j ? { success: true, metadata: normalizeMegascans(j) } : { success: false };
    zipMetaCache.set(zipPath, out);
    return out;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ---------- 2.0 app settings (libraries + connections), persistent ----------

function settingsFilePath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

ipcMain.handle('settings-load', async () => {
  try {
    const d = await fs.readFile(settingsFilePath(), 'utf-8');
    const s = JSON.parse(d);
    return { success: true, settings: { libraries: Array.isArray(s.libraries) ? s.libraries : [], connections: s.connections || {}, ...s } };
  } catch {
    return { success: true, settings: { libraries: [], connections: {} } };
  }
});

ipcMain.handle('settings-save', async (event, settings) => {
  try {
    let existing = {};
    try { existing = JSON.parse(await fs.readFile(settingsFilePath(), 'utf-8')); } catch {}
    const merged = { ...existing, ...settings };
    await fs.writeFile(settingsFilePath(), JSON.stringify(merged, null, 2), 'utf-8');
    return { success: true, settings: merged };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
