// Transforme un rapport en PDF avec Microsoft Edge, déjà installé sur Windows. Rien à installer.
// Usage : npm run pdf -- docs/rapports/<nom>.md   (ou .html)  →  docs/rapports/<nom>.pdf
// Un rapport .md coûte moins de tokens à l'agent que du HTML : le programme fait la mise en page
// avec le style de docs/rapports/modele.html. Schémas : un bloc ```svg … ``` est inséré tel quel.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const src = process.argv[2];
// --compte-rendu : page de garde courte (l'essentiel tient en page 1), pas de sommaire.
const CR = process.argv.includes('--compte-rendu');
const CR_STYLE = '<style>.cover.is-cr{page:auto;height:auto;break-after:auto;grid-template-columns:6mm 1fr;margin-bottom:6mm}.cover.is-cr .cover__in{padding:10mm 4mm 4mm 10mm}.cover.is-cr .cover__title{font-size:20pt;margin:8mm 0 6pt}.cover.is-cr .cover__sum{margin-top:6mm}</style>';
if (!src || !/\.(html|md)$/.test(src) || !existsSync(src)) {
  console.error('Usage : npm run pdf -- <fichier>.md ou <fichier>.html (le fichier doit exister)');
  process.exit(1);
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s) => esc(s)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
  .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Style commun : celui de docs/rapports/modele.html (une seule source pour tous les PDF).
const STYLE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'rapports', 'modele.html'), 'utf8').match(/<style>[\s\S]*?<\/style>/)?.[0] ?? '';

// Markdown → page de rapport : page de garde (titre, date, résumé), sommaire, corps, numéros de page.
export function mdToHtml(md) {
  const L = md.split(/\r?\n/);
  const out = [];
  const toc = [];
  let title = 'Rapport';
  let meta = '';
  let summary = '';
  let seenH2 = false;
  for (let i = 0; i < L.length; i++) {
    const l = L[i];
    if (/^```svg/.test(l)) { const b = []; while (++i < L.length && !L[i].startsWith('```')) b.push(L[i]); out.push(`<figure>${b.join('\n')}</figure>`); }
    else if (l.startsWith('```')) { const b = []; while (++i < L.length && !L[i].startsWith('```')) b.push(esc(L[i])); out.push(`<pre>${b.join('\n')}</pre>`); }
    else if (/^# /.test(l)) title = l.slice(2).trim();
    else if (/^## /.test(l)) { seenH2 = true; const t = l.slice(3).trim(); toc.push(t); out.push(`<h2 id="${slug(t)}">${inline(t)}</h2>`); }
    else if (/^#{3,4} /.test(l)) { const n = l.match(/^#+/)[0].length; out.push(`<h${n}>${inline(l.slice(n + 1))}</h${n}>`); }
    else if (/^(-{3,}|\*{3,})\s*$/.test(l)) out.push('<hr>');
    else if (/^> ?/.test(l)) {
      const b = []; for (; i < L.length && /^> ?/.test(L[i]); i++) b.push(L[i].replace(/^> ?/, '')); i--;
      if (!seenH2 && !summary) summary = inline(b.join(' ').replace(/^\*\*En bref ?:?\*\* ?:? ?/i, ''));
      else out.push(`<blockquote>${inline(b.join(' '))}</blockquote>`);
    }
    else if (/^\|/.test(l.trim())) {
      const rows = []; for (; i < L.length && /^\|/.test(L[i].trim()); i++) rows.push(L[i]); i--;
      const cells = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const body = rows.filter((r) => !/^\|?[\s:|-]+\|?$/.test(r.trim()));
      out.push(`<table><thead><tr>${cells(body[0]).map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.slice(1).map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
    }
    else if (/^\s*([-*+]|\d+[.)]) /.test(l)) {
      const ol = /^\s*\d+[.)]/.test(l); const b = []; let check = false;
      for (; i < L.length && /^\s*([-*+]|\d+[.)]) /.test(L[i]); i++) {
        let t = L[i].replace(/^\s*([-*+]|\d+[.)]) /, ''); const c = t.match(/^\[( |x|X)\] /);
        if (c) { check = true; t = t.slice(4); }
        b.push(`<li${c && c[1] !== ' ' ? ' class="on"' : ''}>${inline(t)}</li>`);
      }
      i--; out.push(check ? `<ul class="check">${b.join('')}</ul>` : ol ? `<ol>${b.join('')}</ol>` : `<ul>${b.join('')}</ul>`);
    }
    else if (l.trim()) {
      if (!seenH2 && !meta && !summary && out.length === 0) { meta = inline(l.replace(/^\*|\*$/g, '')); continue; }
      out.push(`<p>${inline(l)}</p>`);
    }
  }
  const date = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const cover = `<section class="cover${CR ? ' is-cr' : ''}"><div class="cover__band"></div><div class="cover__in">
    <p class="cover__brand">Le Bon Architecte</p><p class="cover__kind">${CR ? 'Compte rendu' : 'Rapport'}</p>
    <h1 class="cover__title">${inline(title)}</h1><p class="cover__meta">${meta || date}</p>
    ${summary ? `<div class="cover__sum"><b>En bref</b>${summary}</div>` : ''}</div></section>`;
  const sommaire = !CR && toc.length >= 3 ? `<nav class="toc"><h2>Sommaire</h2><ol>${toc.map((t) => `<li><a href="#${slug(t)}">${inline(t)}</a></li>`).join('')}</ol></nav>` : '';
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(title)}</title>${STYLE}${CR ? CR_STYLE : ''}</head><body>${cover}${sommaire}${out.join('\n')}</body></html>`;
}

// Page à imprimer, écrite dans le dossier temporaire (rien d'ajouté au projet).
// Un rapport déjà en HTML reçoit lui aussi le style commun à jour.
const raw = readFileSync(src, 'utf8');
// Rapport HTML écrit par un agent : même page de garde et même sommaire qu'un rapport Markdown.
function dressHtml(h) {
  let x = h.includes('<style>') ? h.replace(/<style>[\s\S]*?<\/style>/, STYLE) : h.replace('</head>', `${STYLE}</head>`);
  if (x.includes('class="cover"')) return x;
  const strip = (s) => (s ?? '').replace(/<[^>]+>/g, '').trim();
  const title = strip(x.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1]) || 'Rapport';
  const meta = x.match(/<p class="meta">([\s\S]*?)<\/p>/)?.[1] ?? '';
  const sum = x.match(/<(p|blockquote) class="resume">([\s\S]*?)<\/\1>/)?.[2] ?? '';
  x = x.replace(/<h1[^>]*>[\s\S]*?<\/h1>/, '').replace(/<p class="meta">[\s\S]*?<\/p>/, '').replace(/<(p|blockquote) class="resume">[\s\S]*?<\/\1>/, '');
  const h2s = [...x.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => strip(m[1]));
  let n = 0;
  x = x.replace(/<h2(?![^>]*\bid=)([^>]*)>/g, (m, rest) => `<h2 id="s${n++}"${rest}>`);
  const cover = `<section class="cover"><div class="cover__band"></div><div class="cover__in">
    <p class="cover__brand">Le Bon Architecte</p><p class="cover__kind">Rapport</p>
    <h1 class="cover__title">${esc(title)}</h1><p class="cover__meta">${meta}</p>
    ${sum ? `<div class="cover__sum"><b>En bref</b>${sum.replace(/<strong>En bref ?:?<\/strong> ?:? ?/i, '')}</div>` : ''}</div></section>`;
  const sommaire = h2s.length >= 3 ? `<nav class="toc"><h2>Sommaire</h2><ol>${h2s.map((t, i) => `<li><a href="#s${i}">${esc(t)}</a></li>`).join('')}</ol></nav>` : '';
  return x.replace(/<body[^>]*>/, (b) => `${b}${cover}${sommaire}`);
}
const html = src.endsWith('.md') ? mdToHtml(raw) : dressHtml(raw);
const page = join(tmpdir(), `lba-pdf-${process.pid}.html`);
writeFileSync(page, html);
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

try { rmSync(page); } catch { /* fichier temporaire */ }
if (!existsSync(out) || statSync(out).size === 0) { console.error('Le PDF n’a pas été créé.'); process.exit(1); }
console.log(`PDF créé : ${out} (${Math.round(statSync(out).size / 1024)} Ko)`);
