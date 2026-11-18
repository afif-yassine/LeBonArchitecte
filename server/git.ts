// Un worktree par ticket, réuni dans main seulement après des tests verts (décision 0006).
// Le moteur fait ces opérations lui-même ; un agent n'a jamais le droit de faire merge ni push.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { Refused } from './tickets.ts';

const run = (cwd: string, args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }).trim();

const tryRun = (cwd: string, args: string[]): { ok: boolean; out: string } => {
  try { return { ok: true, out: run(cwd, args) }; } catch (e) {
    const err = e as { stderr?: string; stdout?: string; message: string };
    return { ok: false, out: `${err.stdout ?? ''}${err.stderr ?? ''}`.trim() || err.message };
  }
};

export const branchOf = (id: string) => `ticket/${id}`;
export const worktreeOf = (repo: string, id: string) => join(repo, '.lba', 'worktrees', id);

// Crée (ou retrouve) l'espace de travail du ticket. node_modules est partagé par une jonction Windows :
// rien à réinstaller, et la jonction est retirée avant toute suppression pour ne jamais toucher l'original.
export function ensureWorktree(repo: string, id: string): string {
  const dir = worktreeOf(repo, id);
  if (existsSync(join(dir, '.git'))) return dir;
  mkdirSync(join(repo, '.lba', 'worktrees'), { recursive: true });
  const exists = tryRun(repo, ['rev-parse', '--verify', '--quiet', branchOf(id)]).ok;
  const r = tryRun(repo, exists ? ['worktree', 'add', dir, branchOf(id)] : ['worktree', 'add', '-b', branchOf(id), dir, 'HEAD']);
  if (!r.ok) throw new Refused(`Impossible de créer l’espace de travail de ${id} : ${r.out.split('\n')[0]}`);
  const nm = join(repo, 'node_modules');
  if (existsSync(nm) && !existsSync(join(dir, 'node_modules'))) symlinkSync(nm, join(dir, 'node_modules'), 'junction');
  return dir;
}

// Enregistre le travail de l'agent dans la branche du ticket (jamais ailleurs).
export function commitWorktree(dir: string, message: string): string | undefined {
  run(dir, ['add', '-A']);
  if (!tryRun(dir, ['diff', '--cached', '--quiet']).ok) {
    const r = tryRun(dir, ['commit', '-m', message]);
    if (!r.ok) throw new Refused(`Commit refusé dans l’espace du ticket : ${r.out.split('\n')[0]}`);
  }
  return tryRun(dir, ['rev-parse', '--short', 'HEAD']).out || undefined;
}

export function diffOf(repo: string, id: string): string {
  return tryRun(repo, ['diff', `HEAD...${branchOf(id)}`]).out.slice(0, 2_000_000);
}

// Lecture d'un fichier tel qu'il est dans la branche du ticket (la branche reste après la réunion).
export function fileAt(repo: string, id: string, path: string): string | undefined {
  const r = tryRun(repo, ['show', `${branchOf(id)}:${path}`]);
  return r.ok ? r.out.slice(0, 300_000) : undefined;
}

// Même lecture, mais en octets (PDF, images) : jamais converti en texte.
export function fileBytesAt(repo: string, id: string, path: string): Buffer | undefined {
  try {
    return execFileSync('git', ['show', `${branchOf(id)}:${path}`], { cwd: repo, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true, maxBuffer: 30_000_000 });
  } catch { return undefined; }
}

export function diffFile(repo: string, id: string, path: string): string {
  const base = tryRun(repo, ['merge-base', 'main', branchOf(id)]).out || 'HEAD';
  // Après réunion, la base commune est la branche elle-même : on compare alors à son premier parent.
  const from = base === tryRun(repo, ['rev-parse', branchOf(id)]).out ? `${branchOf(id)}~1` : base;
  return tryRun(repo, ['diff', from, branchOf(id), '--', path]).out.slice(0, 300_000);
}

export function changedFiles(repo: string, id: string): { path: string; plus: number; minus: number }[] {
  const r = tryRun(repo, ['diff', '--numstat', `HEAD...${branchOf(id)}`]);
  if (!r.ok || !r.out) return [];
  return r.out.split('\n').map((l) => { const [p, m, path] = l.split('\t'); return { path, plus: Number(p) || 0, minus: Number(m) || 0 }; });
}

// Réunion dans main : appelée seulement après des tests verts dans le worktree.
// Point de retour = le commit de main avant la réunion. En cas de conflit, on annule tout et on explique.
export function mergeTicket(repo: string, id: string, title: string): { before: string; merge: string } {
  const before = run(repo, ['rev-parse', '--short', 'HEAD']);
  const r = tryRun(repo, ['merge', '--no-ff', branchOf(id), '-m', `${id} : ${title} (réuni après tests verts)`]);
  if (!r.ok) {
    tryRun(repo, ['merge', '--abort']);
    throw new Refused(`Réunion de ${id} dans main refusée, rien n’a changé : ${r.out.split('\n').find((l) => /conflict|conflit|overwritten|error/i.test(l)) ?? r.out.split('\n')[0]}`);
  }
  return { before, merge: run(repo, ['rev-parse', '--short', 'HEAD']) };
}

export function removeWorktree(repo: string, id: string): void {
  const dir = worktreeOf(repo, id);
  if (!existsSync(dir)) return;
  const nm = join(dir, 'node_modules');
  if (existsSync(nm)) rmdirSync(nm); // retire la jonction seule, jamais le dossier d'origine
  tryRun(repo, ['worktree', 'remove', dir]);
  // Windows garde parfois le dossier, vide : on le retire seulement s'il est vide (jamais récursif).
  try { if (existsSync(dir)) rmdirSync(dir); } catch { /* pas vide ou verrouillé : on le laisse */ }
}
