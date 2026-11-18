// Vraies données d'un projet pour les onglets (lot 1) : documents sur le disque et état git.
// Lecture seule. Aucun token : seulement des fichiers et des commandes git.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { Refused } from './tickets.ts';

export interface DocEntry { path: string; title: string; size: number; at: string }

const SENSITIVE = /(^|\/)\.env|\.pem$|\.key$|id_rsa/i;

// Tous les documents lisibles sous docs/ : Markdown, plus les PDF de rapports (listés, pas lus).
export function listDocs(repo: string): DocEntry[] {
  const out: DocEntry[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.(md|pdf)$/.test(e.name)) continue;
      const rel = relative(repo, p).split(sep).join('/');
      const st = statSync(p);
      const head = e.name.endsWith('.md') ? readFileSync(p, 'utf8').slice(0, 400).match(/^#\s+(.+)$/m)?.[1] : undefined;
      out.push({ path: rel, title: head?.trim() ?? e.name, size: st.size, at: st.mtime.toISOString() });
    }
  };
  try { walk(join(repo, 'docs')); } catch { /* pas de dossier docs */ }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

export function readDoc(repo: string, path: string): string {
  if (!/^docs\/[\w./ -]+\.md$/.test(path) || path.includes('..') || SENSITIVE.test(path)) throw new Refused('Seuls les fichiers Markdown du dossier docs/ s’affichent ici.');
  try { return readFileSync(join(repo, path), 'utf8').slice(0, 300_000); } catch { throw new Refused(`${path} n’existe pas.`); }
}

// Un PDF du dossier docs/, en octets, pour l'ouvrir directement dans le navigateur.
export function readPdf(repo: string, path: string): Buffer {
  if (!/^docs\/[\w./ -]+\.pdf$/.test(path) || path.includes('..')) throw new Refused('Seuls les PDF du dossier docs/ s’ouvrent ici.');
  try { return readFileSync(join(repo, path)); } catch { throw new Refused(`${path} n’existe pas.`); }
}

const git = (repo: string, args: string[]) => {
  try { return execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).trimEnd(); } catch { return ''; }
};

// ---------- Graphe Git (point 3) ----------
export interface GraphNode {
  hash: string; short: string; parents: string[]; subject: string; at: string;
  lane: number; ticket?: string; kind: 'main' | 'branche' | 'reunion' | 'annulation';
}
export interface GitGraph {
  nodes: GraphNode[]; lanes: { lane: number; ticket: string; branch: string; merged: boolean; worktree: boolean }[];
  dirty: string[]; head: string; branch: string;
}

const HASH = /^[0-9a-f]{7,40}$/;

// main sur la colonne 0 (sa suite de premiers parents) ; chaque branche de ticket sur sa colonne.
export function gitGraph(repo: string, limit = 60): GitGraph {
  const branch = git(repo, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const head = git(repo, ['rev-parse', '--short', 'HEAD']);
  const mainChain = git(repo, ['rev-list', '--first-parent', '-n', String(limit), 'main']).split('\n').filter(Boolean);
  const onMain = new Set(mainChain);
  const tickets = git(repo, ['branch', '--list', 'ticket/*', '--format=%(refname:short)']).split('\n').filter(Boolean);
  const merged = new Set(git(repo, ['branch', '--merged', 'main', '--format=%(refname:short)']).split('\n'));
  const wts = new Set(git(repo, ['worktree', 'list', '--porcelain']).split('\n').filter((l) => l.startsWith('branch ')).map((l) => l.replace('branch refs/heads/', '')));
  const laneOf = new Map<string, { lane: number; ticket: string }>();
  const lanes: GitGraph['lanes'] = [];
  // Les tickets les plus récents à gauche, près de main.
  const ordered = tickets.map((b) => ({ b, at: git(repo, ['log', '-1', '--format=%cI', b]) })).sort((x, y) => y.at.localeCompare(x.at));
  for (const { b } of ordered) {
    const own = git(repo, ['rev-list', '--first-parent', '-n', '40', b]).split('\n').filter(Boolean);
    const mine = own.slice(0, Math.max(0, own.findIndex((h) => onMain.has(h)))).filter((h) => !laneOf.has(h));
    if (!mine.length) continue;
    const lane = lanes.length + 1;
    const ticket = b.replace(/^ticket\//, '');
    lanes.push({ lane, ticket, branch: b, merged: merged.has(b), worktree: wts.has(b) });
    for (const h of mine) laneOf.set(h, { lane, ticket });
  }
  const wanted = new Set([...mainChain, ...laneOf.keys()]);
  const rows = git(repo, ['log', '--all', '--date-order', '-n', String(limit * 3), '--format=%H%x09%P%x09%cI%x09%s']).split('\n').filter(Boolean);
  const nodes: GraphNode[] = [];
  for (const r of rows) {
    const [hash, parents, at, ...s] = r.split('\t');
    if (!wanted.has(hash)) continue;
    const subject = s.join('\t');
    const p = parents ? parents.split(' ') : [];
    const l = laneOf.get(hash);
    const mergedTicket = p.length > 1 ? laneOf.get(p[1])?.ticket ?? subject.match(/^([A-Z]+-\d+)/)?.[1] : undefined;
    nodes.push({
      hash, short: hash.slice(0, 7), parents: p, subject, at,
      lane: l?.lane ?? 0, ticket: l?.ticket ?? mergedTicket ?? subject.match(/^Revert "([A-Z]+-\d+)/)?.[1],
      kind: l ? 'branche' : p.length > 1 ? 'reunion' : /^Revert /.test(subject) ? 'annulation' : 'main',
    });
  }
  const dirty = git(repo, ['status', '--porcelain']).split('\n').filter((x) => x.trim() && !x.slice(3).startsWith('.lba/')).slice(0, 40);
  return { nodes, lanes, dirty, head, branch };
}

export function commitInfo(repo: string, hash: string): { hash: string; body: string; files: { path: string; plus: number; minus: number }[] } {
  if (!HASH.test(hash)) throw new Refused('Identifiant de commit invalide.');
  const body = git(repo, ['show', '-s', '--format=%B', hash]);
  const parents = git(repo, ['rev-list', '--parents', '-n', '1', hash]).split(' ').slice(1);
  // Pour une réunion : ce que le ticket a apporté à main (comparé au premier parent).
  const range = parents.length > 1 ? [`${hash}^1`, hash] : parents.length ? [`${hash}^`, hash] : ['--root', hash];
  const files = git(repo, ['diff', '--numstat', ...range]).split('\n').filter(Boolean).slice(0, 60).map((l) => {
    const [p, m, path] = l.split('\t');
    return { path, plus: Number(p) || 0, minus: Number(m) || 0 };
  });
  return { hash, body, files };
}

// « Repartir d'ici » : une nouvelle branche part de ce point. main n'est jamais touché, rien n'est effacé.
export function branchFrom(repo: string, hash: string): string {
  if (!HASH.test(hash)) throw new Refused('Identifiant de commit invalide.');
  const short = hash.slice(0, 7);
  let name = `reprise/${short}`;
  for (let i = 2; git(repo, ['rev-parse', '--verify', '--quiet', name]); i++) name = `reprise/${short}-${i}`;
  try { execFileSync('git', ['branch', name, hash], { cwd: repo, stdio: 'pipe', windowsHide: true }); } catch (e) {
    throw new Refused(`Branche non créée : ${String((e as { stderr?: Buffer }).stderr ?? '').split('\n')[0]}`);
  }
  return `Branche ${name} créée à partir de ${short}. main n’a pas changé. Un ticket pourra repartir de ce point.`;
}

export interface GitInfo {
  branch: string; remote: string; ahead: number; behind: number; dirty: string[];
  commits: { hash: string; at: string; subject: string }[];
  tickets: { branch: string; merged: boolean; last: string; worktree: boolean }[];
}

export function gitInfo(repo: string): GitInfo {
  const branch = git(repo, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const [behind, ahead] = git(repo, ['rev-list', '--left-right', '--count', `origin/${branch}...HEAD`]).split(/\s+/).map(Number);
  const merged = new Set(git(repo, ['branch', '--merged', branch, '--format=%(refname:short)']).split('\n'));
  const wts = new Set(git(repo, ['worktree', 'list', '--porcelain']).split('\n').filter((l) => l.startsWith('branch ')).map((l) => l.replace('branch refs/heads/', '')));
  return {
    branch,
    remote: git(repo, ['remote', 'get-url', 'origin']).replace(/\/\/[^@/]+@/, '//'), // jamais l'identifiant
    ahead: ahead || 0, behind: behind || 0,
    dirty: git(repo, ['status', '--porcelain']).split('\n').filter(Boolean).slice(0, 30),
    commits: git(repo, ['log', '-20', '--format=%h%x09%cI%x09%s']).split('\n').filter(Boolean).map((l) => { const [hash, at, subject] = l.split('\t'); return { hash, at, subject }; }),
    tickets: git(repo, ['branch', '--list', 'ticket/*', '--format=%(refname:short)%09%(committerdate:iso-strict)']).split('\n').filter(Boolean).map((l) => {
      const [b, last] = l.split('\t');
      return { branch: b, merged: merged.has(b), last, worktree: wts.has(b) };
    }),
  };
}
