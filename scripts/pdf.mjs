// Transforme une page HTML (avec ses schémas SVG) en PDF, avec Microsoft Edge déjà installé sur Windows.
// Rien à installer. Usage : npm run pdf -- docs/rapports/mon-rapport.html  →  docs/rapports/mon-rapport.pdf
import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const src = process.argv[2];
if (!src || !src.endsWith('.html') || !existsSync(src)) {
  console.error('Usage : npm run pdf -- <fichier>.html (le fichier doit exister)');
  process.exit(1);
}
const out = resolve(src.replace(/\.html$/, '.pdf'));
const edge = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);
if (!edge) { console.error('Microsoft Edge introuvable : impossible de créer le PDF.'); process.exit(1); }

execFileSync(edge, [
  '--headless', '--disable-gpu', '--no-pdf-header-footer', '--no-first-run',
  `--print-to-pdf=${out}`, pathToFileURL(resolve(src)).href,
], { stdio: 'ignore', windowsHide: true, timeout: 60_000 });

if (!existsSync(out) || statSync(out).size === 0) { console.error('Le PDF n’a pas été créé.'); process.exit(1); }
console.log(`PDF créé : ${out} (${Math.round(statSync(out).size / 1024)} Ko)`);
