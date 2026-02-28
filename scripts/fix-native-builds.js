#!/usr/bin/env node

/**
 * Fix native module builds on Windows.
 *
 * 1. Patches winpty.gyp to use .\\ prefix for batch files (Windows path issue)
 * 2. After node-gyp configure, patches ClangCL -> v143 in .vcxproj files
 *    (node-gyp on Node 24+ defaults to ClangCL which isn't always installed)
 * 3. Runs postinstall for @vscode/ripgrep to download the binary
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const nodeModules = path.join(__dirname, '..', 'node_modules');

function patchWinptyGyp() {
  const gypPath = path.join(nodeModules, 'node-pty', 'deps', 'winpty', 'src', 'winpty.gyp');
  if (!fs.existsSync(gypPath)) return;

  let content = fs.readFileSync(gypPath, 'utf8');
  if (content.includes('.\\\\GetCommitHash.bat')) return; // already patched

  content = content.replace(
    'cd shared && GetCommitHash.bat',
    'cd shared && .\\\\GetCommitHash.bat'
  );
  content = content.replace(
    'cd shared && UpdateGenVersion.bat',
    'cd shared && .\\\\UpdateGenVersion.bat'
  );
  fs.writeFileSync(gypPath, content);
  console.log('[fix-native] Patched winpty.gyp batch file paths');
}

function patchClangCL(modulePath) {
  const buildDir = path.join(modulePath, 'build');
  if (!fs.existsSync(buildDir)) return false;

  let patched = false;
  function walkDir(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.name.endsWith('.vcxproj')) {
        let content = fs.readFileSync(fullPath, 'utf8');
        if (content.includes('<PlatformToolset>ClangCL</PlatformToolset>')) {
          content = content.replace(
            /<PlatformToolset>ClangCL<\/PlatformToolset>/g,
            '<PlatformToolset>v143</PlatformToolset>'
          );
          fs.writeFileSync(fullPath, content);
          patched = true;
        }
      }
    }
  }
  walkDir(buildDir);
  return patched;
}

function buildNativeModule(modulePath, name) {
  try {
    console.log(`[fix-native] Building ${name}...`);
    // Configure
    execSync('npx node-gyp configure', { cwd: modulePath, stdio: 'pipe' });
    // Patch ClangCL
    if (patchClangCL(modulePath)) {
      console.log(`[fix-native] Patched ClangCL -> v143 for ${name}`);
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
    ['@vscode/windows-ca-certs', path.join(nodeModules, '@vscode', 'windows-ca-certs')],
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
