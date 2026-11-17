// Lance le moteur et l'interface ensemble : npm run dev
import { spawn } from 'node:child_process';

const win = process.platform === 'win32';
const run = (name, cmd, args) => {
  const p = spawn(cmd, args, { stdio: 'inherit', shell: win });
  p.on('exit', (code) => { if (code) console.error(`${name} s’est arrêté (code ${code}).`); });
  return p;
};

const procs = [
  run('Moteur', 'node', ['--watch', '--disable-warning=ExperimentalWarning', 'server/index.ts']),
  run('Interface', 'npx', ['vite']),
];
const stop = () => { procs.forEach((p) => p.kill()); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
