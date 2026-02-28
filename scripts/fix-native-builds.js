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

function buildNativeModule(modulePath, name) {
  try {
    console.log(`[fix-native] Building ${name}...`);
    // Configure
    execSync('npx node-gyp configure', { cwd: modulePath, stdio: 'pipe' });
    // Patch vcxproj files (ClangCL + C++20) — search entire module dir
    // to catch node-addon-api subfolders too
    if (patchVcxprojFiles(modulePath)) {
      console.log(`[fix-native] Patched .vcxproj files for ${name}`);
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

// Only run on Windows where these issues occur
if (process.platform === 'win32') {
  console.log('[fix-native] Fixing native module builds for Windows...');

  patchWinptyGyp();
  runRipgrepPostinstall();

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
      buildNativeModule(modPath, name);
    }
  }

  console.log('[fix-native] Done.');
} else {
  console.log('[fix-native] Not Windows, skipping native fixes.');
}
