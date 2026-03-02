#!/usr/bin/env node

/**
 * Launch the Ava IDE Electron app.
 *
 * Unsets ELECTRON_RUN_AS_NODE before spawning — VSCode and Claude Code set this
 * variable which forces Electron to behave as plain Node.js, breaking
 * require('electron') in the main process.
 */

const { spawn } = require('child_process');
const path = require('path');

const ideRoot = path.join(__dirname, '..');

// Build clean env — remove ELECTRON_RUN_AS_NODE
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(
  'yarn',
  ['--cwd', 'electron-app', 'start'],
  {
    cwd: ideRoot,
    env,
    stdio: 'inherit',
    shell: true,
  },
);

child.on('exit', (code) => process.exit(code ?? 0));
