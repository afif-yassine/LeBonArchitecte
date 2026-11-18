// Carte du code (décision 0015) : Graphify, logiciel gratuit, fait la carte du projet sans IA (0 token, environ 3 s).
// L'Architecte ne lit JAMAIS la carte entière (mesuré : 65 % plus cher). Il lui pose de petites questions
// (« où est X et qui l'utilise ? », environ 400 caractères) : mesuré sur 3 questions, 34 % moins cher que sans carte.
// La carte est refaite par le programme : après chaque réunion dans main, au scan du projet, et avec /graphify.
// Elle est rangée dans <projet>/graphify-out/, ignorée par git en local (.git/info/exclude) : aucun fichier suivi ne change.
import { execFile } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Installé à part dans LBA (.lba/outils/graphify), jamais dans le Python de l'ordinateur.
const BIN = join(process.cwd(), '.lba', 'outils', 'graphify', process.platform === 'win32' ? join('Scripts', 'graphify.exe') : join('bin', 'graphify'));
export const mapInstalled = () => existsSync(BIN);
const graphOf = (repo: string) => join(repo, 'graphify-out', 'graph.json');
const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}\n… (coupé)` : s);

function ignoreLocally(repo: string): void {
  if (!existsSync(join(repo, '.git'))) return;
  const f = join(repo, '.git', 'info', 'exclude');
  try {
    if (existsSync(f) && /^graphify-out\/?\s*$/m.test(readFileSync(f, 'utf8'))) return;
    mkdirSync(dirname(f), { recursive: true });
    appendFileSync(f, '\n# Carte du code (graphify), refaite par LBA\ngraphify-out/\n');
  } catch { /* sans exclude, la carte apparaît seulement dans git status */ }
}

const NOT_INSTALLED = 'La carte du code n’est pas installée (Graphify manque dans .lba/outils/graphify).';
const building = new Set<string>();

export function refreshMap(repo: string): Promise<{ ok: boolean; text: string }> {
  if (!mapInstalled()) return Promise.resolve({ ok: false, text: NOT_INSTALLED });
  if (building.has(repo)) return Promise.resolve({ ok: true, text: 'La carte est déjà en train d’être refaite.' });
  ignoreLocally(repo);
  building.add(repo);
  const started = Date.now();
  // « update » = code seulement, sans IA ; « --no-cluster » = pas de regroupement nommé par une IA.
  return new Promise((done) => execFile(BIN, ['update', '.', '--no-cluster'], { cwd: repo, windowsHide: true, timeout: 120_000 }, (err, out, errOut) => {
    building.delete(repo);
    const text = `${out}\n${errOut}`;
    const m = text.match(/(\d+) nodes, (\d+) edges/);
    const s = Math.max(1, Math.round((Date.now() - started) / 1000));
    done(err
      ? { ok: false, text: `Carte impossible : ${short(String(errOut || err.message).trim(), 300)}` }
      : { ok: true, text: m ? `Carte du code refaite en ${s} s : ${m[1]} éléments, ${m[2]} liens, 0 token.` : `Carte du code refaite en ${s} s, 0 token.` });
  }));
}

export function mapStatus(repo: string): { installed: boolean; exists: boolean; at?: string; kb?: number } {
  const g = graphOf(repo);
  if (!existsSync(g)) return { installed: mapInstalled(), exists: false };
  const st = statSync(g);
  return { installed: mapInstalled(), exists: true, at: st.mtime.toISOString(), kb: Math.round(st.size / 1024) };
}

// Une petite question à la carte : un nom → où il est et qui l'utilise ; deux noms → le chemin entre eux.
export async function askMap(repo: string, name: string, to?: string): Promise<string> {
  if (!mapInstalled()) return NOT_INSTALLED;
  if (!name.trim()) return 'Donnez un nom : une fonction, un fichier ou un composant.';
  if (!existsSync(graphOf(repo))) { const r = await refreshMap(repo); if (!r.ok) return r.text; }
  const args = to ? ['path', name, to, '--graph', graphOf(repo)] : ['explain', name, '--graph', graphOf(repo)];
  return new Promise((done) => execFile(BIN, args, { cwd: repo, windowsHide: true, timeout: 30_000 }, (err, out, errOut) => {
    const text = String(out || errOut || '').trim();
    // Code 3 : le nom correspond à plusieurs éléments ; la réponse les liste, c'est utile tel quel.
    if (err && (err as { code?: number }).code !== 3 && !text) return done(`La carte n’a pas répondu : ${err.message}`);
    done(short(text || 'Rien trouvé dans la carte pour ce nom.', 3000));
  }));
}
