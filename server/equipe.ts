// Fiches de rôle (décision 0019, lots E1 à E3). Un rôle ne crée pas d'agent en plus : il règle l'agent unique
// du ticket (sa mission, son modèle par défaut, ses commandes et MCP permis, où il peut écrire, son budget)
// et dit QUAND il est appelé (mots du ticket). Rangées dans <projet>/.lba/equipe.json, suivi par git.
// Les agents n'ont pas le droit de modifier ce fichier : seul le propriétaire le change (écran Équipe).
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import type { Ticket } from '../src/shared/contract.ts';
import { RESEARCH_DIRS } from '../src/shared/plan.ts';
import { Refused } from './tickets.ts';

export interface Role {
  id: string; nom: string; mission: string; actif: boolean;
  modele?: 'Opus' | 'Sonnet' | 'Haiku';
  commandes?: string[]; // commandes permises en plus, ex. « docker build * »
  mcp?: { config: string; outils: string[] }; // fichier de config MCP (dans le projet) et SEULS outils permis
  ecrire?: string[]; // dossiers ou fichiers où il peut écrire ; vide = tout le projet
  mots?: string[]; // il est appelé quand le ticket parle de ces mots
  budgetUsd?: number;
  web?: boolean; // recherche sur Internet (éclaireur)
}

export const EQUIPE_FILE = join('.lba', 'equipe.json');

// Sans fichier : l'équipe de base, celle qui existait déjà dans le moteur.
export const DEFAULT_ROLES: Role[] = [
  { id: 'developpeur', nom: 'Développeur', actif: true, mission: 'Écrit le code et ses tests, en petits changements lisibles, puis lance les tests du projet.' },
  { id: 'eclaireur', nom: 'Éclaireur', actif: true, web: true, ecrire: RESEARCH_DIRS, mots: ['recherche', 'comparer', 'comparatif', 'état de l’art', 'sources', 'veille'],
    mission: 'Cherche sur Internet, compare et cite ses sources (lien et date). Écrit seulement un rapport.' },
  { id: 'securite', nom: 'Sécurité', actif: true, modele: 'Opus', mots: ['sécurité', 'securite', 'faille', 'authentification', 'connexion', 'mot de passe', 'quota', 'paiement', 'droits'],
    mission: 'Corrige ou renforce une zone sensible. Écrit un test d’abus qui essaie la triche et vérifie qu’elle échoue.' },
];

// Modèles prêts à ajouter depuis l'écran Équipe (ils restent inactifs tant que vous ne les activez pas).
export const ROLE_TEMPLATES: Role[] = [
  { id: 'devops', nom: 'DevOps', actif: false, modele: 'Sonnet', commandes: ['docker build *', 'docker compose config *'],
    ecrire: ['Dockerfile', 'docker-compose.yml', 'Jenkinsfile', '.github/workflows/', 'deploy/'], mots: ['docker', 'jenkins', 'pipeline', 'déploiement', 'deploiement', 'serveur', 'ci'],
    mission: 'Écrit le Dockerfile, le Jenkinsfile et les scripts de déploiement dans sa branche. Ne déploie jamais lui-même : le programme lance les builds, la mise en ligne attend votre oui. Ne voit jamais les mots de passe du serveur.' },
  { id: 'media', nom: 'Média', actif: false, modele: 'Sonnet', commandes: ['ffmpeg *'], ecrire: ['media/', 'public/'], mots: ['image', 'vidéo', 'video', 'visuel', 'illustration'],
    mission: 'Prépare images et vidéos avec les outils permis. Une génération qui coûte des crédits attend votre oui.' },
  { id: 'redacteur', nom: 'Rédacteur', actif: false, modele: 'Sonnet', ecrire: ['docs/', 'README.md'], mots: ['documentation', 'readme', 'guide', 'tutoriel'],
    mission: 'Écrit et tient à jour la documentation, en français simple.' },
];

// --- Garde-fous d'une fiche : ce qu'un rôle ne peut JAMAIS recevoir, même si le fichier le demande. ---
const NEVER = /^(git (push|merge|reset|checkout|-c|-C)|rm\b|del\b|rmdir\b|curl\b|wget\b|npx\b|npm (install|i|publish)\b|node\b|sudo\b|ssh\b|scp\b|powershell\b|pwsh\b|cmd\b|bash\b|sh\b|chmod\b|chown\b|eval\b)/i;
const safePath = (p: string) => { const n = normalize(p).replaceAll('\\', '/'); return n && !n.startsWith('..') && !/^[a-z]:|^\//i.test(n) && !n.includes('/../'); };

export function checkRole(r: Role): Role {
  const id = String(r.id ?? '').trim().toLowerCase();
  if (!/^[a-z][a-z0-9-]{1,30}$/.test(id)) throw new Refused(`Rôle « ${r.id} » : identifiant invalide (lettres, chiffres, tirets).`);
  const nom = String(r.nom ?? '').trim().slice(0, 40);
  if (!nom) throw new Refused(`Rôle ${id} : il faut un nom.`);
  if (r.modele && !['Opus', 'Sonnet', 'Haiku'].includes(r.modele)) throw new Refused(`Rôle ${id} : modèle Opus, Sonnet ou Haiku (jamais Fable).`);
  const commandes = (r.commandes ?? []).map((c) => String(c).trim()).filter(Boolean);
  for (const c of commandes) if (NEVER.test(c) || /[;&|`$<>]/.test(c)) throw new Refused(`Rôle ${id} : la commande « ${c} » est interdite (git push, suppression, téléchargement, interpréteur, enchaînement de commandes).`);
  const ecrire = (r.ecrire ?? []).map((p) => String(p).trim()).filter(Boolean);
  for (const p of ecrire) if (!safePath(p)) throw new Refused(`Rôle ${id} : « ${p} » doit être un chemin du projet.`);
  let mcp: Role['mcp'];
  if (r.mcp?.config) {
    if (!safePath(r.mcp.config) || !r.mcp.config.endsWith('.json')) throw new Refused(`Rôle ${id} : la config MCP doit être un fichier .json du projet.`);
    const outils = (r.mcp.outils ?? []).map((o) => String(o).trim()).filter(Boolean);
    if (!outils.length) throw new Refused(`Rôle ${id} : listez les outils MCP permis (seulement ceux-là sont chargés, pour ne pas payer tous les autres).`);
    for (const o of outils) if (!/^[\w-]+$/.test(o)) throw new Refused(`Rôle ${id} : nom d’outil MCP invalide « ${o} ».`);
    mcp = { config: r.mcp.config, outils };
  }
  const budget = r.budgetUsd === undefined || r.budgetUsd === null || (r.budgetUsd as unknown) === '' ? undefined : Number(r.budgetUsd);
  if (budget !== undefined && !(budget > 0 && budget <= 20)) throw new Refused(`Rôle ${id} : budget entre 0 et 20 $ par lancement.`);
  return {
    id, nom, mission: String(r.mission ?? '').trim().slice(0, 600), actif: r.actif !== false,
    ...(r.modele ? { modele: r.modele } : {}), ...(commandes.length ? { commandes } : {}), ...(mcp ? { mcp } : {}),
    ...(ecrire.length ? { ecrire } : {}), ...(r.mots?.length ? { mots: r.mots.map((m) => String(m).trim().toLowerCase()).filter(Boolean) } : {}),
    ...(budget !== undefined ? { budgetUsd: budget } : {}), ...(r.web ? { web: true } : {}),
  };
}

// --- Lecture et écriture : depuis le dossier PRINCIPAL du projet (main), jamais depuis la branche d'un ticket. ---
let DIRS: Record<string, string> = {};
export const setEquipeDirs = (dirs: Record<string, string>) => { DIRS = dirs; };
export const equipeRepo = (project: string): string | undefined => DIRS[project];

export function rolesOf(project: string, repo = DIRS[project]): { roles: Role[]; source: 'fichier' | 'defaut' } {
  const f = repo ? join(repo, EQUIPE_FILE) : '';
  if (!f || !existsSync(f)) return { roles: DEFAULT_ROLES, source: 'defaut' };
  try {
    const raw = JSON.parse(readFileSync(f, 'utf8')) as { roles?: Role[] };
    const roles = (raw.roles ?? []).flatMap((r) => { try { return [checkRole(r)]; } catch { return []; } }); // une fiche abîmée est ignorée
    if (!roles.some((r) => r.id === 'developpeur')) roles.unshift(DEFAULT_ROLES[0]);
    return { roles, source: 'fichier' };
  } catch { return { roles: DEFAULT_ROLES, source: 'defaut' }; }
}

export function saveRoles(project: string, roles: Role[], repo = DIRS[project]): Role[] {
  if (!repo) throw new Refused('Projet sans dossier : pas d’équipe à enregistrer.');
  const checked = roles.map(checkRole);
  const ids = checked.map((r) => r.id);
  if (new Set(ids).size !== ids.length) throw new Refused('Deux rôles ont le même identifiant.');
  if (!ids.includes('developpeur')) throw new Refused('Le rôle Développeur est obligatoire : c’est le rôle par défaut.');
  const f = join(repo, EQUIPE_FILE);
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, `${JSON.stringify({ note: 'Fiches de rôle de Le Bon Architecte (décision 0019). Modifiées depuis l’écran Équipe.', roles: checked }, null, 2)}\n`);
  return checked;
}

// --- Le rôle d'un ticket : celui choisi à la création, sinon l'éclaireur pour une recherche, sinon le premier rôle
// actif dont un mot apparaît dans le ticket, sinon Développeur. Calculé par le programme : 0 token. ---
const words = (t: Ticket) => ` ${t.title} ${t.description.context} ${t.description.expected} `.toLowerCase();
export function roleOf(t: Ticket, roles: Role[]): Role {
  const actifs = roles.filter((r) => r.actif);
  const chosen = t.role ? actifs.find((r) => r.id === t.role) : undefined;
  if (chosen) return chosen;
  if (t.steps.some((s) => s.role === 'eclaireur')) return actifs.find((r) => r.id === 'eclaireur') ?? { ...DEFAULT_ROLES[1] };
  const w = words(t);
  const hit = actifs.find((r) => r.id !== 'developpeur' && r.id !== 'eclaireur' && (r.mots ?? []).some((m) => new RegExp(`[^\\p{L}]${m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\\p{L}]`, 'iu').test(w)));
  return hit ?? actifs.find((r) => r.id === 'developpeur') ?? DEFAULT_ROLES[0];
}

// Fichiers modifiés hors des dossiers permis au rôle (vide si le rôle peut écrire partout).
export function outsideOf(role: Role, files: string[]): string[] {
  if (!role.ecrire?.length) return [];
  const ok = (f: string) => role.ecrire!.some((d) => f === d.replace(/\/$/, '') || f.startsWith(d.endsWith('/') ? d : `${d}/`));
  return files.filter((f) => !ok(f));
}

// Noms des serveurs d'une config MCP (seulement les clés : rien d'autre n'est lu ni affiché).
export function mcpServers(repo: string, role: Role): string[] {
  if (!role.mcp) return [];
  try { return Object.keys((JSON.parse(readFileSync(join(repo, role.mcp.config), 'utf8')) as { mcpServers?: object }).mcpServers ?? {}); } catch { return []; }
}

// --- E3 : équipe proposée à l'import, par le programme (0 token), d'après ce qui existe dans le projet. ---
export function proposeRoles(repo: string): { roles: Role[]; why: string[] } {
  const has = (p: string) => existsSync(join(repo, p));
  let deps = '';
  try { const pk = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8')); deps = Object.keys({ ...pk.dependencies, ...pk.devDependencies }).join(' '); } catch { /* pas de package.json */ }
  try { deps += ` ${readFileSync(join(repo, 'requirements.txt'), 'utf8')}`; } catch { /* pas de requirements.txt */ }
  const roles: Role[] = DEFAULT_ROLES.map((r) => ({ ...r }));
  const why = ['Développeur, Éclaireur et Sécurité : l’équipe de base.'];
  const add = (id: string, reason: string) => { const t = ROLE_TEMPLATES.find((x) => x.id === id)!; roles.push({ ...t, actif: true }); why.push(reason); };
  if (has('Dockerfile') || has('docker-compose.yml') || has('Jenkinsfile') || has('.github/workflows')) add('devops', 'DevOps : le projet a un Dockerfile, un Jenkinsfile ou une CI.');
  if (/\b(ffmpeg|fluent-ffmpeg|sharp|remotion|jimp|pillow|opencv)/i.test(deps)) add('media', 'Média : le projet traite des images ou des vidéos.');
  if (has('docs') || has('README.md')) add('redacteur', 'Rédacteur : le projet a une documentation à tenir à jour.');
  if (!/\b(passport|next-auth|bcrypt|argon2|jsonwebtoken|stripe|django|flask-login)/i.test(deps)) why.push('Sécurité reste utile : il est appelé seulement quand un ticket parle de connexion, de quota ou de paiement.');
  return { roles, why };
}
