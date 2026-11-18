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
