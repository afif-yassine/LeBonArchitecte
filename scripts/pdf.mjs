// Transforme un rapport en PDF avec Microsoft Edge, déjà installé sur Windows. Rien à installer.
// Usage : npm run pdf -- docs/rapports/<nom>.md   (ou .html)  →  docs/rapports/<nom>.pdf
// Un rapport .md coûte moins de tokens à l'agent que du HTML : le programme fait la mise en page
// avec le style de docs/rapports/modele.html. Schémas : un bloc ```svg … ``` est inséré tel quel.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const src = process.argv[2];
if (!src || !/\.(html|md)$/.test(src) || !existsSync(src)) {
  console.error('Usage : npm run pdf -- <fichier>.md ou <fichier>.html (le fichier doit exister)');
  process.exit(1);
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s) => esc(s)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');

export function mdToHtml(md) {
  const L = md.split(/\r?\n/);
  const out = [];
  let title = 'Rapport';
  for (let i = 0; i < L.length; i++) {
    const l = L[i];
    if (/^```svg/.test(l)) { const b = []; while (++i < L.length && !L[i].startsWith('```')) b.push(L[i]); out.push(`<figure>${b.join('\n')}</figure>`); }
    else if (l.startsWith('```')) { const b = []; while (++i < L.length && !L[i].startsWith('```')) b.push(esc(L[i])); out.push(`<pre>${b.join('\n')}</pre>`); }
    else if (/^# /.test(l)) { title = l.slice(2).trim(); out.push(`<h1>${inline(title)}</h1>`); }
    else if (/^#{2,4} /.test(l)) { const n = l.match(/^#+/)[0].length; out.push(`<h${n}>${inline(l.slice(n + 1))}</h${n}>`); }
    else if (/^> /.test(l)) { const b = []; for (; i < L.length && /^> ?/.test(L[i]); i++) b.push(L[i].replace(/^> ?/, '')); i--; out.push(`<p class="resume">${inline(b.join(' '))}</p>`); }
    else if (/^\|/.test(l)) {
      const rows = []; for (; i < L.length && /^\|/.test(L[i]); i++) rows.push(L[i]); i--;
      const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const body = rows.filter((r) => !/^\|[\s:|-]+\|$/.test(r));
      out.push(`<table><tr>${cells(body[0]).map((c) => `<th>${inline(c)}</th>`).join('')}</tr>${body.slice(1).map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</table>`);
    }
    else if (/^\s*([-*]|\d+\.) /.test(l)) {
      const ol = /^\s*\d+\./.test(l); const b = [];
      for (; i < L.length && /^\s*([-*]|\d+\.) /.test(L[i]); i++) b.push(`<li>${inline(L[i].replace(/^\s*([-*]|\d+\.) /, ''))}</li>`);
      i--; out.push(ol ? `<ol>${b.join('')}</ol>` : `<ul>${b.join('')}</ul>`);
    }
    else if (l.trim()) out.push(`<p>${inline(l)}</p>`);
  }
  const model = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'rapports', 'modele.html'), 'utf8');
  const style = model.match(/<style>[\s\S]*?<\/style>/)?.[0] ?? '';
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(title)}</title>${style}</head><body>${out.join('\n')}</body></html>`;
}

let page = resolve(src);
if (src.endsWith('.md')) { page = resolve(src.replace(/\.md$/, '.html')); writeFileSync(page, mdToHtml(readFileSync(src, 'utf8'))); }
const out = resolve(src.replace(/\.(html|md)$/, '.pdf'));
const edge = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);
if (!edge) { console.error('Microsoft Edge introuvable : impossible de créer le PDF.'); process.exit(1); }

execFileSync(edge, [
  '--headless', '--disable-gpu', '--no-pdf-header-footer', '--no-first-run',
  `--print-to-pdf=${out}`, pathToFileURL(page).href,
], { stdio: 'ignore', windowsHide: true, timeout: 60_000 });

if (!existsSync(out) || statSync(out).size === 0) { console.error('Le PDF n’a pas été créé.'); process.exit(1); }
console.log(`PDF créé : ${out} (${Math.round(statSync(out).size / 1024)} Ko)`);
