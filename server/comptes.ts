// Comptes Claude Code et leurs quotas (décision 0017, lots C3 et C4).
// - Un compte = un dossier de configuration de Claude Code (CLAUDE_CONFIG_DIR). Le compte de la machine
//   garde le dossier habituel ; les autres vivent dans .lba/comptes/<id>/, interdit en lecture aux agents.
// - Vous vous connectez vous-même (fenêtre « claude auth login ») : le programme ne voit jamais de mot de passe
//   ni de jeton. Il lit seulement « claude auth status --json » (connecté ? quel forfait ?).
// - Les quotas viennent du message officiel « rate_limit_event » que Claude Code envoie à chaque appel :
//   chaque agent qui tourne les met à jour gratuitement.
import { execFile, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Engine } from './engine.ts';
import { Refused } from './tickets.ts';

export interface Compte { id: string; name: string; dir?: string; on: boolean; projects: string[] }
export interface Fenetre { used: number; resetsAt?: string }
export interface Quota { five?: Fenetre; week?: Fenetre; status?: string; at: string }

export const COMPTES_DIR = join(process.cwd(), '.lba', 'comptes');
const MACHINE: Compte = { id: 'machine', name: 'Compte de la machine', on: true, projects: [] };
// Au-delà, un nouvel agent part sur le compte suivant de la liste (si vous n'avez pas fixé le compte).
export const SEUIL_BASCULE = 0.9;

export function comptes(engine: Engine): Compte[] {
  let list: Compte[] = [];
  try { list = JSON.parse(engine.setting('comptes') ?? '[]'); } catch { /* réglage abîmé : on repart du compte de la machine */ }
  if (!list.some((c) => c.id === 'machine')) list.unshift({ ...MACHINE });
  return list;
}
const save = (engine: Engine, list: Compte[]) => engine.setSetting('comptes', JSON.stringify(list));

export const configDir = (c: Compte) => c.dir ?? join(homedir(), '.claude');
export const envOf = (c: Compte): Record<string, string> => (c.dir ? { CLAUDE_CONFIG_DIR: c.dir } : {});

// Tous les dossiers où une conversation peut être rangée (pour retrouver son journal sans savoir son compte).
export function configDirs(): string[] {
  const dirs = [join(homedir(), '.claude')];
  try { for (const n of readdirSync(COMPTES_DIR)) dirs.push(join(COMPTES_DIR, n)); } catch { /* aucun compte ajouté */ }
  return dirs;
}

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'compte';

export function addCompte(engine: Engine, name: string): Compte {
  const n = name.trim().slice(0, 40);
  if (!n) throw new Refused('Donnez un nom au compte, par exemple « Compte perso ».');
  const list = comptes(engine);
  if (list.some((c) => c.name.toLowerCase() === n.toLowerCase())) throw new Refused(`Le compte « ${n} » existe déjà.`);
  let id = slug(n);
  for (let i = 2; list.some((c) => c.id === id) || existsSync(join(COMPTES_DIR, id)); i++) id = `${slug(n)}-${i}`;
  const dir = join(COMPTES_DIR, id);
  mkdirSync(dir, { recursive: true });
  const c: Compte = { id, name: n, dir, on: true, projects: [] };
  save(engine, [...list, c]);
  return c;
}

export function updateCompte(engine: Engine, id: string, patch: { name?: string; on?: boolean; projects?: string[]; move?: -1 | 1 }): Compte {
  const list = comptes(engine);
  const i = list.findIndex((c) => c.id === id);
  if (i < 0) throw new Refused('Compte inconnu.');
  const c = { ...list[i] };
  if (patch.name !== undefined) { const n = patch.name.trim().slice(0, 40); if (!n) throw new Refused('Le nom ne peut pas être vide.'); c.name = n; }
  if (patch.on !== undefined) {
    if (!patch.on && list.filter((x) => x.on && x.id !== id).length === 0) throw new Refused('Il faut garder au moins un compte actif.');
    c.on = patch.on;
  }
  if (patch.projects) c.projects = [...new Set(patch.projects.map(String))];
  list[i] = c;
  if (patch.move) { const j = i + patch.move; if (j >= 0 && j < list.length) [list[i], list[j]] = [list[j], list[i]]; }
  save(engine, list);
  return c;
}

// Retiré de la liste seulement : son dossier reste (rien n'est supprimé sans vous).
export function removeCompte(engine: Engine, id: string): string {
  if (id === 'machine') throw new Refused('Le compte de la machine ne se retire pas : c’est celui de Claude Code sur ce PC.');
  const list = comptes(engine);
  const c = list.find((x) => x.id === id);
  if (!c) throw new Refused('Compte inconnu.');
  if (list.filter((x) => x.on && x.id !== id).length === 0) throw new Refused('Il faut garder au moins un compte actif.');
  save(engine, list.filter((x) => x.id !== id));
  return `Compte « ${c.name} » retiré de la liste. Son dossier reste dans .lba/comptes/${c.id} : rien n’est effacé.`;
}

// Ouvre une fenêtre où VOUS vous connectez (navigateur de Claude). Le programme ne touche à rien d'autre.
export function openLogin(c: Compte): string {
  if (process.platform !== 'win32') throw new Refused(`Dans un terminal : ${c.dir ? `CLAUDE_CONFIG_DIR="${c.dir}" ` : ''}claude auth login`);
  spawn('cmd', ['/c', 'start', `Connexion ${c.name}`, 'cmd', '/k', 'claude auth login'], { env: { ...process.env, ...envOf(c) }, detached: true, stdio: 'ignore' }).unref();
  return `Une fenêtre s’ouvre : connectez-vous au compte « ${c.name} » dans le navigateur, puis fermez-la. LBA verra la connexion tout seul.`;
}

// Connecté ? Quel forfait ? Gardé 60 s pour ne pas relancer Claude Code à chaque affichage.
const statusCache = new Map<string, { at: number; v: { loggedIn: boolean; email?: string; plan?: string } }>();
export function authStatus(c: Compte, fresh = false): Promise<{ loggedIn: boolean; email?: string; plan?: string }> {
  const hit = statusCache.get(c.id);
  if (hit && !fresh && Date.now() - hit.at < 60_000) return Promise.resolve(hit.v);
  return new Promise((resolve) => {
    execFile('claude', ['auth', 'status', '--json'], { env: { ...process.env, ...envOf(c) }, windowsHide: true, timeout: 20_000 }, (_e, stdout) => {
      let v: { loggedIn: boolean; email?: string; plan?: string } = { loggedIn: false };
      try { const j = JSON.parse(stdout); v = { loggedIn: Boolean(j.loggedIn), email: j.email || undefined, plan: j.subscriptionType || undefined }; } catch { /* pas de réponse lisible */ }
      statusCache.set(c.id, { at: Date.now(), v });
      resolve(v);
    });
  });
}

// --- Quotas ---
export function quotaOf(engine: Engine, id: string): Quota | undefined {
  try { return JSON.parse(engine.setting(`quota:${id}`) ?? 'null') ?? undefined; } catch { return undefined; }
}
const iso = (s?: number) => (s ? new Date(s * 1000).toISOString() : undefined);
// rate_limit_info du flux de Claude Code → quota du compte. Renvoie true s'il a été lu.
export function recordQuota(engine: Engine, compteId: string, info: Record<string, any> | undefined): boolean {
  const w = info?.unifiedWindows;
  if (!w) return false;
  const win = (x: any): Fenetre | undefined => (x && typeof x.utilization === 'number' ? { used: x.utilization, resetsAt: iso(x.resetsAt) } : undefined);
  const q: Quota = { five: win(w.five_hour), week: win(w.seven_day), status: info.status, at: new Date().toISOString() };
  engine.setSetting(`quota:${compteId}`, JSON.stringify(q));
  return true;
}

// Usage prévu à la remise à zéro, au rythme actuel (« 11 % → 76 % »). Rien de prévu en tout début de fenêtre.
export function projection(f: Fenetre | undefined, hours: number, now = Date.now()): number | undefined {
  if (!f?.resetsAt) return undefined;
  const left = Date.parse(f.resetsAt) - now;
  const done = hours * 3600_000 - left;
  if (left <= 0 || done < hours * 3600_000 * 0.05) return undefined;
  return f.used * (hours * 3600_000) / done;
}

// Le compte d'un nouvel agent : celui que vous avez fixé, sinon le premier actif de la liste, permis pour ce
// projet, dont la fenêtre de 5 h est sous le seuil (et la semaine pas pleine). Sinon le premier permis.
export function pickCompte(engine: Engine, project: string, who: 'architecte' | 'agents'): Compte {
  const allowed = comptes(engine).filter((c) => c.on && (!c.projects.length || c.projects.includes(project)));
  const fixed = allowed.find((c) => c.id === engine.setting(`compte-${who}:${project}`));
  if (fixed) return fixed;
  const free = allowed.find((c) => { const q = quotaOf(engine, c.id); return (q?.five?.used ?? 0) < SEUIL_BASCULE && (q?.week?.used ?? 0) < 0.98; });
  return free ?? allowed[0] ?? MACHINE;
}

// Le compte qui a gardé une conversation (son journal est dans son dossier) : pour la reprendre sur le même.
export function compteOfDir(engine: Engine, dir: string | undefined): Compte | undefined {
  if (!dir) return undefined;
  return comptes(engine).find((c) => configDir(c).toLowerCase() === dir.toLowerCase());
}

// Lecture du quota sans attendre un vrai travail : un tout petit appel (Haiku, sans outils, « ok »).
// Mesuré le 19 nov. : environ 3 800 tokens, 0,0006 $. Fait seulement quand vous cliquez « Actualiser ».
export function probeQuota(engine: Engine, c: Compte): Promise<{ ok: boolean; tokens: number; costUsd: number; message?: string }> {
  return new Promise((resolve) => {
    const child = spawn('claude', ['-p', '--model', 'haiku', '--output-format', 'stream-json', '--verbose', '--tools', '', '--strict-mcp-config',
      '--disable-slash-commands', '--no-session-persistence', '--max-budget-usd', '0.05'], { windowsHide: true, env: { ...process.env, ...envOf(c), CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' } });
    let buf = ''; let got = false; let tokens = 0; let cost = 0; let err = '';
    child.stdout.on('data', (d) => {
      buf += d;
      let i: number;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        try {
          const m = JSON.parse(line);
          if (m.type === 'rate_limit_event') got = recordQuota(engine, c.id, m.rate_limit_info) || got;
          if (m.type === 'result') { const u = m.usage ?? {}; tokens = (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0); cost = m.total_cost_usd ?? 0; if (m.is_error) err = String(m.result ?? ''); }
        } catch { /* ligne non JSON */ }
      }
    });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => { err += e.message; });
    child.on('close', () => resolve({ ok: got, tokens, costUsd: cost, ...(got ? {} : { message: (err.trim().split('\n')[0] || 'Pas de quota renvoyé : ce compte est-il connecté ?').slice(0, 200) }) }));
    child.stdin.end('Réponds juste : ok');
  });
}
