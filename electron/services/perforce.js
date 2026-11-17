import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

const execAsync = promisify(exec);

export function buildCommand(args, { user, client, tagged = true } = {}) {
  let cmd = 'p4';
  if (user) cmd += ` -u "${user}"`;
  if (client) cmd += ` -c "${client}"`;
  if (tagged) cmd += ' -Ztag';
  return `${cmd} ${args}`;
}

// Parses `-Ztag` output into one plain object per record. Records are
// "... field value" lines, separated by a blank line between records —
// this is what makes parsing unambiguous even when a value itself
// contains spaces (unlike plain-text p4 output, which has no such
// guarantee and breaks on real-world filenames).
export function parseTaggedRecords(stdout) {
  const records = [];
  let current = null;
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) {
      if (current) { records.push(current); current = null; }
      continue;
    }
    const m = line.match(/^\.\.\.\s+(\S+)\s?(.*)$/);
    if (!m) continue;
    if (!current) current = {};
    current[m[1]] = m[2];
  }
  if (current) records.push(current);
  return records;
}

/**
 * Checks whether the current Perforce session ticket is valid, without
 * requiring any workspace. A single `p4 login -s` call — cheap enough to
 * poll periodically, unlike a full `p4 info` + client-list refresh.
 */
export async function checkSession() {
  try {
    const { stdout, stderr } = await execAsync('p4 login -s', { encoding: 'utf8', timeout: 5000 });
    const output = (stdout + stderr).trim();
    if (/session has expired|please login again|not logged in/i.test(output)) {
      return { connected: false, error: output };
    }
    return { connected: true, error: null };
  } catch (error) {
    const output = ((error.stdout || '') + (error.stderr || '') + (error.message || '')).trim();
    return { connected: false, error: output || 'Perforce connection check failed' };
  }
}

/**
 * Reads the configured server address straight from local config/env
 * (`p4 set`), never from the live server. This matters specifically for
 * prefilling the login form: `p4 info` omits the server address when the
 * session isn't authenticated — which is exactly when this form is shown —
 * so it can never be the source for this value.
 */
export async function getConfiguredServer() {
  try {
    const { stdout } = await execAsync('p4 set -q P4PORT', { encoding: 'utf8', timeout: 5000 });
    const match = stdout.match(/^P4PORT=(.+)$/m);
    return { success: true, server: match ? match[1].trim() : null };
  } catch (error) {
    return { success: false, server: null, error: error.message };
  }
}

/**
 * Authenticates against a Perforce server and lets `p4 login` write a
 * session ticket to the OS's standard ticket file. The password is piped
 * to the child process's stdin only — never passed as a command-line
 * argument (visible in process listings) and never stored by this app.
 */
// Perforce intentionally returns the identical "Password invalid." message
// for both a wrong password AND a nonexistent/wrong username — a standard
// security practice so a login attempt can't be used to enumerate valid
// usernames. That means "credentials" is the most precise field-level
// blame this can ever assign for that case; "server" is distinguishable
// because connection-level failures have genuinely different wording.
export function classifyLoginError(message) {
  if (/connect to server failed|tcp connect to|unknown host|couldn't resolve|class was not found/i.test(message)) {
    return 'server';
  }
  if (/password invalid|not logged in|authentication failed/i.test(message)) {
    return 'credentials';
  }
  return 'unknown';
}

export async function login({ server, user, password }) {
  if (!server || !user || !password) {
    return { success: false, error: 'Server, user, and password are all required.', field: null };
  }
  try {
    const promise = execAsync(`p4 -p "${server}" -u "${user}" login`, { encoding: 'utf8', timeout: 15000 });
    promise.child.stdin.write(`${password}\n`);
    promise.child.stdin.end();
    const { stdout, stderr } = await promise;
    const output = (stdout + stderr).trim();
    return { success: true, message: output || 'Logged in successfully.' };
  } catch (error) {
    if (error.killed) {
      return { success: false, error: 'Connection to the server timed out.', field: 'server' };
    }
    // Prefer the server's actual response over Node's "Command failed: ..."
    // wrapper, and drop the echoed "Enter password:" prompt line.
    const raw = ((error.stdout || '') + '\n' + (error.stderr || '')).trim();
    const cleaned = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !/^Enter password:/i.test(line))
      .join(' ');
    const message = cleaned || error.message || 'Login failed.';
    return { success: false, error: message, field: classifyLoginError(message) };
  }
}

/**
 * List immediate subfolders of a depot path (`p4 dirs`) — walks the tree
 * without ever syncing anything to disk.
 */
export async function listDepotDirs(depotPath, { user } = {}) {
  const search = depotPath.endsWith('/') ? `${depotPath}*` : `${depotPath}/*`;
  try {
    const { stdout } = await execAsync(buildCommand(`dirs "${search}"`, { user }), { encoding: 'utf8', timeout: 15000 });
    return { success: true, dirs: parseTaggedRecords(stdout).map((r) => r.dir).filter(Boolean) };
  } catch (error) {
    const output = ((error.stdout || '') + (error.stderr || '')).trim();
    if (/no such file/i.test(output)) return { success: true, dirs: [] };
    return { success: false, dirs: [], error: output || error.message };
  }
}

/**
 * List files directly inside a depot path (`p4 files`), excluding deleted
 * revisions — same no-sync guarantee as listDepotDirs.
 */
export async function listDepotFiles(depotPath, { user } = {}) {
  const search = depotPath.endsWith('/') ? `${depotPath}*` : `${depotPath}/*`;
  try {
    const { stdout } = await execAsync(buildCommand(`files "${search}"`, { user }), { encoding: 'utf8', timeout: 15000 });
    const files = parseTaggedRecords(stdout)
      .filter((r) => r.depotFile && r.action !== 'delete')
      .map((r) => ({
        depotFile: r.depotFile,
        revision: parseInt(r.rev, 10) || 0,
        action: r.action,
        type: r.type,
        name: r.depotFile.split('/').pop(),
      }));
    return { success: true, files };
  } catch (error) {
    const output = ((error.stdout || '') + (error.stderr || '')).trim();
    if (/no such file/i.test(output)) return { success: true, files: [] };
    return { success: false, files: [], error: output || error.message };
  }
}

/**
 * List every file under a depot folder, at any depth (`p4 files foo/...`),
 * for a whole-folder download — one command instead of walking the tree
 * folder by folder.
 */
export async function listDepotFilesRecursive(depotPath, { user } = {}) {
  const search = depotPath.endsWith('/') ? `${depotPath}...` : `${depotPath}/...`;
  try {
    const { stdout } = await execAsync(buildCommand(`files "${search}"`, { user }), { encoding: 'utf8', timeout: 30000 });
    const files = parseTaggedRecords(stdout)
      .filter((r) => r.depotFile && r.action !== 'delete')
      .map((r) => r.depotFile);
    return { success: true, files };
  } catch (error) {
    const output = ((error.stdout || '') + (error.stderr || '')).trim();
    if (/no such file/i.test(output)) return { success: true, files: [] };
    return { success: false, files: [], error: output || error.message };
  }
}

/**
 * Fetch a depot file's raw bytes to a local temp file via `p4 print`, with
 * no workspace involved at all — used both for full-asset preview/download
 * and for fetching a small sidecar metadata file.
 */
export async function printToTempFile(depotPath, { user } = {}) {
  const tempDir = path.join(os.tmpdir(), 'dsl-p4-cache');
  await fs.mkdir(tempDir, { recursive: true });
  const safeName = depotPath.split('/').pop() || 'file';
  const localPath = path.join(tempDir, `${Date.now()}_${safeName}`);
  try {
    const { stdout, stderr } = await execAsync(
      buildCommand(`print -q -o "${localPath}" "${depotPath}"`, { user, tagged: false }),
      { encoding: 'utf8', timeout: 20000 },
    );
    if (/no such file/i.test(stdout + stderr)) return { success: false, error: 'File not found in depot' };
    return { success: true, localPath, name: safeName };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Fetch an asset's `.dslmeta.json` sidecar from the depot, if one exists.
 * Mirrors the existing local-library sidecar convention (sidecar-load in
 * main.js) exactly, just sourced via p4 print instead of local disk. No
 * sidecar present is a normal, non-error outcome — a brand-new asset
 * simply hasn't had descriptive metadata written for it yet.
 */
export async function getAssetMetadata(depotPath, { user } = {}) {
  const result = await printToTempFile(`${depotPath}.dslmeta.json`, { user });
  if (!result.success) return { success: true, record: null };
  try {
    const raw = await fs.readFile(result.localPath, 'utf-8');
    return { success: true, record: JSON.parse(raw) };
  } catch {
    return { success: true, record: null };
  } finally {
    fs.unlink(result.localPath).catch(() => {});
  }
}

/**
 * Try a list of candidate workspaces (in order) for one whose view maps
 * the given depot path, returning its resolved local destination.
 */
export async function resolveLocalPathForDepot(depotPath, candidateClients, { user } = {}) {
  for (const name of candidateClients) {
    try {
      const { stdout } = await execAsync(buildCommand(`where "${depotPath}"`, { user, client: name }), { encoding: 'utf8', timeout: 10000 });
      const line = stdout.split(/\r?\n/).find((l) => l.startsWith('... path '));
      if (!line) continue;
      const localPath = line.slice('... path '.length).trim();
      if (!localPath) continue;
      return { client: name, localPath };
    } catch {
      // This client doesn't exist or doesn't map this path — try the next one.
    }
  }
  return null;
}

/**
 * Create a minimal Perforce workspace mapped to a depot root, with nothing
 * synced — just a view mapping. This is what lets a brand-new machine with
 * no prior P4V setup still add/submit through the app: Perforce always
 * needs *some* client spec to track file state against, but that spec
 * doesn't require any files to actually be synced to disk.
 */
export async function createMinimalClient({ user, depotRoot, localRoot, clientName }) {
  const depotLeaf = depotRoot.replace(/^\/\//, '');
  const spec = [
    `Client: ${clientName}`,
    `Owner: ${user}`,
    `Root: ${localRoot}`,
    'Options: noallwrite noclobber nocompress unlocked nomodtime normdir noaltsync',
    'SubmitOptions: submitunchanged',
    'LineEnd: local',
    'View:',
    `\t${depotRoot}/... //${clientName}/${depotLeaf}/...`,
    '',
  ].join('\n');

  try {
    const promise = execAsync(`p4 -u "${user}" client -i`, { encoding: 'utf8', timeout: 15000 });
    promise.child.stdin.write(spec);
    promise.child.stdin.end();
    const { stdout, stderr } = await promise;
    const output = (stdout + stderr).trim();
    if (!/saved/i.test(output)) return { success: false, error: output || 'Failed to create workspace.' };
    return { success: true, client: clientName };
  } catch (error) {
    const output = ((error.stdout || '') + (error.stderr || '')).trim();
    return { success: false, error: output || error.message };
  }
}

// Check out an existing depot file for edit. Success is read from the
// tagged record (action: 'edit') instead of matching the string "opened
// for edit" in plain text. Error text is unaffected by -Ztag — only
// successful output gets tagged, errors still print as plain text — so
// the existing error-string checks carry over unchanged.
export async function checkoutFile(filePath, { client, user } = {}) {
  try {
    const { stdout, stderr } = await execAsync(buildCommand(`edit "${filePath}"`, { user, client }), { encoding: 'utf8', timeout: 15000 });
    const record = parseTaggedRecords(stdout)[0];
    if (record && record.action === 'edit') {
      return { success: true, message: 'Checked out' };
    }
    const output = (stdout + stderr).trim();
    if (output.includes('not on client') || output.includes('not under client') || output.includes('not in client view')) {
      return { success: false, error: `File is not under workspace "${client}" root. Select a workspace whose root covers this file.` };
    }
    return { success: false, error: output || 'Failed to checkout' };
  } catch (error) {
    const output = ((error.stdout || '') + (error.stderr || '')).trim();
    if (output.includes('not on client') || output.includes('not under client') || output.includes('not in client view')) {
      return { success: false, error: `File is not under workspace "${client}" root. Select a workspace whose root covers this file.` };
    }
    return { success: false, error: output || error.message || 'Failed to checkout' };
  }
}

// Mark a local file for add. Same success-detection swap as checkoutFile.
export async function addFile(filePath, { client, user } = {}) {
  try {
    const { stdout, stderr } = await execAsync(buildCommand(`add "${filePath}"`, { user, client }), { encoding: 'utf8', timeout: 15000 });
    const record = parseTaggedRecords(stdout)[0];
    if (record && record.action === 'add') {
      return { success: true, message: 'File marked for add' };
    }
    const output = (stdout + stderr).trim();
    if (output.includes('not on client') || output.includes('not under client')) {
      return { success: false, error: `File is outside workspace "${client}". The file must be under the workspace root folder.` };
    }
    if (output.includes('file(s) not in client view')) {
      return { success: false, error: `File path not mapped in workspace "${client}" view. Select a different workspace or update your workspace mapping.` };
    }
    return { success: false, error: output || 'Failed to add file' };
  } catch (error) {
    const output = ((error.stdout || '') + (error.stderr || '')).trim();
    if (output.includes('not on client') || output.includes('not under client') || output.includes('not in client view')) {
      return { success: false, error: 'File is outside the selected P4 workspace. Select a workspace whose root covers this file location.' };
    }
    return { success: false, error: output || error.message || 'Failed to add file' };
  }
}

// Revert files — a batch command, not per-file, matching the existing
// handler's behavior exactly (it never parsed per-file revert results).
export async function revertFiles({ files = null, unchangedOnly = false, client, user } = {}) {
  let command;
  if (unchangedOnly) {
    command = files && files.length > 0
      ? `revert -a ${files.map((f) => `"${f}"`).join(' ')}`
      : 'revert -a //...';
  } else {
    command = files && files.length > 0
      ? `revert ${files.map((f) => `"${f}"`).join(' ')}`
      : 'revert //...';
  }
  try {
    const { stdout, stderr } = await execAsync(buildCommand(command, { user, client }), { encoding: 'utf8', timeout: 20000 });
    const output = (stdout + stderr).trim();
    return { success: true, message: unchangedOnly ? 'Unchanged files reverted' : 'Files reverted', output };
  } catch (error) {
    const output = ((error.stdout || '') + (error.stderr || '')).trim();
    return { success: false, error: output || error.message };
  }
}

// Pending/opened files for a workspace. This is the exact site of a real
// shipped bug: the old plain-text regex required the type field to match
// \w+ only, but Perforce's real type strings include modifiers like
// "binary+l" — the '+' silently failed the match and dropped every binary
// file from the result. Tagged output gives `type` as one clean field,
// with no regex over it at all.
export async function getOpened({ client, user } = {}) {
  try {
    const { stdout } = await execAsync(buildCommand('opened', { user, client }), { encoding: 'utf8', timeout: 15000 });
    if (stdout.includes('File(s) not opened')) {
      return { success: true, files: [] };
    }
    const files = parseTaggedRecords(stdout)
      .filter((r) => r.depotFile)
      .map((r) => ({
        depotFile: r.depotFile,
        revision: parseInt(r.rev, 10) || 0,
        action: r.action,
        change: r.change,
        type: r.type,
      }));
    return { success: true, files };
  } catch (error) {
    const output = ((error.stdout || '') + (error.stderr || '')).trim();
    if (/not opened/i.test(output)) {
      return { success: true, files: [] };
    }
    return { success: false, error: output || error.message, files: [] };
  }
}

// Submit is deliberately NOT migrated to -Ztag: it has no file-path
// ambiguity risk (the only thing extracted is a changelist number), and
// its success path can't be safely dry-run against a real shared depot
// the way every other function here was verified live. Kept on its
// already-working plain-text parsing rather than trusting an untested
// rewrite of the one path that can't be tested.
export async function submit({ description, client, user } = {}) {
  if (!description || !description.trim()) {
    return { success: false, error: 'Description is required' };
  }
  const escapedDesc = description.replace(/"/g, "'");
  const command = `submit -d "${escapedDesc}"`;

  let output = '';
  try {
    const { stdout, stderr } = await execAsync(buildCommand(command, { user, client, tagged: false }), { encoding: 'utf8', timeout: 30000 });
    output = (stdout || '') + (stderr || '');
  } catch (execError) {
    output = (execError.stdout || '') + (execError.stderr || '') + (execError.message || '');
  }

  const submittedMatch = output.match(/Change\s+(\d+)\s+submitted/i);
  if (submittedMatch) {
    return { success: true, message: 'Changes submitted successfully', changelist: parseInt(submittedMatch[1], 10), output };
  }
  if (output.toLowerCase().includes('submitted')) {
    const changeNum = output.match(/Change\s+(\d+)/i);
    return { success: true, message: 'Changes submitted successfully', changelist: changeNum ? parseInt(changeNum[1], 10) : null, output };
  }
  const createdMatch = output.match(/Change\s+(\d+)\s+created/i);
  if (createdMatch) {
    return { success: false, error: `Changelist ${createdMatch[1]} was created but not submitted. Click "Get Latest" and try again.`, output };
  }
  if (output.includes('No files to submit') || output.includes('File(s) not opened')) {
    return { success: false, error: 'No files to submit. Check out some files first.' };
  }
  if (output.includes('out of date') || output.includes('must sync') || output.includes('must resolve')) {
    return { success: false, error: 'Files are out of date. Click "Get Latest" first, then try again.' };
  }
  return { success: false, error: output || 'Submit failed - no output from P4' };
}

// Search files under the active workspace's view by name fragment. Reuses
// the same -Ztag files + -Ztag where pattern already proven for depot
// browsing and upload path resolution — which also fixes a second instance
// of the same space-in-filename bug class in the local-path resolution
// here, matching the one already found and fixed in the upload flow.
export async function searchFiles({ pattern, client, user } = {}) {
  if (!client) {
    return { success: false, error: 'No P4 workspace selected', files: [] };
  }
  const searchPattern = `//.../*${pattern}*`;
  try {
    const { stdout } = await execAsync(buildCommand(`files "${searchPattern}"`, { user, client }), { encoding: 'utf8', timeout: 20000 });
    const files = parseTaggedRecords(stdout)
      .filter((r) => r.depotFile && r.action !== 'delete')
      .map((r) => ({
        depotFile: r.depotFile,
        revision: parseInt(r.rev, 10) || 0,
        action: r.action,
        name: r.depotFile.split('/').pop(),
      }));

    for (const file of files.slice(0, 200)) {
      try {
        const { stdout: whereOut } = await execAsync(buildCommand(`where "${file.depotFile}"`, { user, client }), { encoding: 'utf8', timeout: 10000 });
        const line = whereOut.split(/\r?\n/).find((l) => l.startsWith('... path '));
        if (line) file.localFile = line.slice('... path '.length).trim();
      } catch { /* no local mapping */ }
    }
    return { success: true, files };
  } catch (error) {
    const output = ((error.stdout || '') + (error.stderr || '')).trim();
    if (/no such file/i.test(output)) return { success: true, files: [] };
    return { success: false, files: [], error: output || error.message };
  }
}
