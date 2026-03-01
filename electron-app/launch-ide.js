const { spawn } = require('child_process');
const path = require('path');

const electronBin = require(path.join(__dirname, '..', 'node_modules', 'electron'));
const mainScript = path.join(__dirname, 'src-gen', 'backend', 'electron-main.js');

// Remove ELECTRON_RUN_AS_NODE — it forces electron to act as plain Node.js
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

console.log('Launching Ava IDE...');

const child = spawn(electronBin, ['--remote-debugging-port=9222', mainScript], {
  stdio: 'inherit',
  windowsHide: false,
  cwd: __dirname,
  env,
  detached: true,
});

child.unref();
console.log('PID:', child.pid);
