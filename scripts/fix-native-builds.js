#!/usr/bin/env node

/**
 * Fix native module builds on Windows.
 *
 * 1. Patches winpty.gyp to use .\\ prefix for batch files (Windows path issue)
 *    Uses double-backslash in the .gyp file so Python's gyp parser doesn't
 *    interpret \U in \UpdateGenVersion.bat as a unicode escape sequence.
 * 2. After node-gyp configure, patches ClangCL -> v143 in ALL .vcxproj files
 *    (node-gyp on Node 24+ defaults to ClangCL which isn't always installed)
 * 3. Patches C++20 requirement for Node 24+ headers into .vcxproj files
 * 4. Runs postinstall for @vscode/ripgrep to download the binary
 * 5. Builds all native modules: node-pty, drivelist, keytar, windows-ca-certs,
 *    native-keymap, @theia/ffmpeg
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const nodeModules = path.join(__dirname, '..', 'node_modules');

function patchWinptyGyp() {
  const gypPath = path.join(nodeModules, 'node-pty', 'deps', 'winpty', 'src', 'winpty.gyp');
  if (!fs.existsSync(gypPath)) return;

  let content = fs.readFileSync(gypPath, 'utf8');

  // Check if already has double-backslash (correct patch)
  if (content.includes('.\\\\GetCommitHash.bat')) return;

  // Replace bare or single-backslash variants with double-backslash.
  // The .gyp file is parsed by Python's eval(), and \U triggers unicode escape.
  // Double-backslash (\\) is read by Python as literal single backslash.
  const doubleBS = '\\\\';
  content = content.replace(
    /cd shared && (?:\.\\*)?GetCommitHash\.bat/g,
    'cd shared && .' + doubleBS + 'GetCommitHash.bat'
  );
  content = content.replace(
    /cd shared && (?:\.\\*)?UpdateGenVersion\.bat/g,
    'cd shared && .' + doubleBS + 'UpdateGenVersion.bat'
  );
  fs.writeFileSync(gypPath, content);
  console.log('[fix-native] Patched winpty.gyp batch file paths');
}

/**
 * Recursively patch all .vcxproj files under a directory:
 * - ClangCL -> v143 (MSVC toolset)
 * - Add C++20 language standard if missing (required by Node 24+ headers)
 */
function patchVcxprojFiles(rootDir) {
  if (!fs.existsSync(rootDir)) return false;

  let patched = false;
  function walkDir(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.name.endsWith('.vcxproj')) {
        let content = fs.readFileSync(fullPath, 'utf8');
        let changed = false;

        // Patch ClangCL to v143
        if (content.includes('<PlatformToolset>ClangCL</PlatformToolset>')) {
          content = content.replace(
            /<PlatformToolset>ClangCL<\/PlatformToolset>/g,
            '<PlatformToolset>v143</PlatformToolset>'
          );
          changed = true;
        }

        // Add C++20 standard if not present (Node 24 v8 headers require it)
        if (!content.includes('stdcpp20') && content.includes('<AdditionalOptions>')) {
          content = content.replace(
            /<AdditionalOptions>/g,
            '<LanguageStandard>stdcpp20</LanguageStandard><AdditionalOptions>'
          );
          changed = true;
        }

        // Disable Spectre mitigation (requires libs not always installed)
        if (content.includes('<SpectreMitigation>Spectre</SpectreMitigation>')) {
          content = content.replace(
            /<SpectreMitigation>Spectre<\/SpectreMitigation>/g,
            '<SpectreMitigation>false</SpectreMitigation>'
          );
          changed = true;
        }

        if (changed) {
          fs.writeFileSync(fullPath, content);
          patched = true;
        }
      }
    }
  }
  walkDir(rootDir);
  return patched;
}

function buildNativeModule(modulePath, name, electronVersion) {
  try {
    console.log(`[fix-native] Building ${name}${electronVersion ? ` (electron ${electronVersion})` : ''}...`);
    // Configure — optionally targeting Electron headers
    const configureArgs = electronVersion
      ? `npx node-gyp configure --target=${electronVersion} --arch=x64 --dist-url=https://www.electronjs.org/headers`
      : 'npx node-gyp configure';
    execSync(configureArgs, { cwd: modulePath, stdio: 'pipe' });
    // Patch vcxproj files (ClangCL + C++20 + Spectre) — search entire module dir
    // to catch node-addon-api subfolders too
    if (patchVcxprojFiles(modulePath)) {
      console.log(`[fix-native] Patched .vcxproj files for ${name}`);
    }
    // Also patch sibling @vscode/node-addon-api (used by @vscode/windows-ca-certs etc.)
    const nodeAddonApi = path.join(nodeModules, '@vscode', 'node-addon-api');
    if (fs.existsSync(nodeAddonApi) && patchVcxprojFiles(nodeAddonApi)) {
      console.log(`[fix-native] Patched .vcxproj files for @vscode/node-addon-api`);
    }
    // Build
    execSync('npx node-gyp build', { cwd: modulePath, stdio: 'pipe' });
    console.log(`[fix-native] ${name} built successfully`);
  } catch (err) {
    console.warn(`[fix-native] ${name} build failed (may be optional): ${err.message}`);
  }
}

function runRipgrepPostinstall() {
  const rgDir = path.join(nodeModules, '@vscode', 'ripgrep');
  const rgBin = path.join(rgDir, 'bin', process.platform === 'win32' ? 'rg.exe' : 'rg');
  if (fs.existsSync(rgBin)) return;

  try {
    console.log('[fix-native] Downloading ripgrep binary...');
    execSync('node ./lib/postinstall.js', { cwd: rgDir, stdio: 'pipe' });
    console.log('[fix-native] ripgrep binary downloaded');
  } catch (err) {
    console.warn(`[fix-native] ripgrep download failed: ${err.message}`);
  }
}

/**
 * Patch workspace trust race condition (all platforms).
 *
 * The vscode.git plugin activates on "*" and reads workspace.isTrusted before
 * Theia's async WorkspaceTrustService resolves. With trust disabled (our default),
 * the final value is always true — but the plugin sees undefined→false during the
 * race window, causing "No repository found" in the SCM view.
 *
 * Fix: initialize _trusted = true instead of undefined in the plugin-host code.
 */
function patchWorkspaceTrust() {
  const wsFile = path.join(nodeModules, '@theia', 'plugin-ext', 'lib', 'plugin', 'workspace.js');
  if (!fs.existsSync(wsFile)) return;

  let content = fs.readFileSync(wsFile, 'utf8');
  if (content.includes('this._trusted = true')) return; // Already patched

  if (content.includes('this._trusted = undefined')) {
    content = content.replace('this._trusted = undefined', 'this._trusted = true');
    fs.writeFileSync(wsFile, content);
    console.log('[fix-native] Patched workspace trust default (_trusted = true)');
  }
}

// Parse CLI args: --electron=<version> builds against Electron headers
const electronArg = process.argv.find(a => a.startsWith('--electron'));
const electronVersion = electronArg ? electronArg.split('=')[1] : null;

// Workspace trust patch applies to all platforms
patchWorkspaceTrust();

// Native module fixes are Windows-only
if (process.platform === 'win32') {
  console.log(`[fix-native] Fixing native module builds for Windows${electronVersion ? ` (electron ${electronVersion})` : ''}...`);

  patchWinptyGyp();
  if (!electronVersion) runRipgrepPostinstall();

  const nativeModules = [
    ['node-pty', path.join(nodeModules, 'node-pty')],
    ['drivelist', path.join(nodeModules, 'drivelist')],
    ['keytar', path.join(nodeModules, 'keytar')],
    ['native-keymap', path.join(nodeModules, 'native-keymap')],
    ['@vscode/windows-ca-certs', path.join(nodeModules, '@vscode', 'windows-ca-certs')],
    ['@theia/ffmpeg', path.join(nodeModules, '@theia', 'ffmpeg')],
  ];

  for (const [name, modPath] of nativeModules) {
    if (fs.existsSync(modPath)) {
      buildNativeModule(modPath, name, electronVersion);
    }
  }

  console.log('[fix-native] Done.');
} else {
  console.log('[fix-native] Not Windows, skipping native fixes.');
}
