// Lance le moteur et l'interface ensemble : npm run dev
// Le moteur n'est plus relancé à chaque changement de son code (node --watch le coupait au milieu
// d'une validation, ex. LBA-17 le 18 nov.) : on attend qu'il soit libre (aucun agent, aucune validation).
import { spawn } from 'node:child_process';
import { watch } from 'node:fs';

const win = process.platform === 'win32';
const run = (name, cmd, args, shell = win) => {
  const p = spawn(cmd, args, { stdio: 'inherit', shell });
  p.on('exit', (code) => { if (code && !p.lbaRestart) console.error(`${name} s’est arrêté (code ${code}).`); });
  return p;
};

const startEngine = () => run('Moteur', process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.ts'], false);
let engine = startEngine();
const ui = run('Interface', 'npx', ['vite']);

// Code du moteur changé : redémarrage dès qu'il est libre.
let pending = false;
const onChange = (_e, file) => {
  if (!file || !/\.ts$/.test(file) || /\.test\.ts$/.test(file)) return;
  if (!pending) console.log(`Code du moteur modifié (${file}) : redémarrage dès qu’il sera libre.`);
  pending = true;
};
for (const dir of ['server', 'src/shared']) watch(dir, { recursive: true }, onChange);

setInterval(async () => {
  if (!pending) return;
  let busy = false;
  try {
    const r = await fetch('http://127.0.0.1:4317/api/busy');
    const b = await r.json();
    busy = b.busy;
    if (busy) return; // un agent ou une validation travaille : on réessaie plus tard
  } catch { /* moteur arrêté ou en panne : on le relance */ }
  pending = false;
  console.log('Moteur libre : redémarrage avec le nouveau code.');
  engine.lbaRestart = true;
  engine.once('exit', () => { engine = startEngine(); });
  engine.kill();
}, 3000);

const stop = () => { engine.kill(); ui.kill(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
