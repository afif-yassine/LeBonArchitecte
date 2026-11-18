// Gardes de sécurité gratuites (décision 0016) : faites par le programme, 0 token, à chaque fin d'agent
// et encore juste avant chaque réunion dans main. Aucune valeur de secret n'est jamais gardée ni affichée :
// seulement le fichier et le genre de secret.
import { exec, execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { MAIN, branchOf } from './git.ts';

const git = (cwd: string, args: string[]): string => {
  try { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true, maxBuffer: 50_000_000 }); } catch { return ''; }
};
const gitOk = (cwd: string, args: string[]): boolean => {
  try { execFileSync('git', args, { cwd, stdio: 'ignore', windowsHide: true }); return true; } catch { return false; }
};

// Genres de secrets reconnus. Les formats exacts des fournisseurs, plus les mots de passe écrits en dur.
export const SECRET_RULES: { name: string; re: RegExp; generic?: boolean }[] = [
  { name: 'clé Anthropic', re: /sk-ant-[\w-]{10,}/ },
  { name: 'clé OpenAI', re: /\bsk-(?!ant-)(?:proj-)?[A-Za-z0-9_-]{32,}/ },
  { name: 'jeton GitHub', re: /\bgh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}/ },
  { name: 'clé AWS', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'clé Google', re: /\bAIza[0-9A-Za-z_-]{35}/ },
  { name: 'jeton Slack', re: /\bxox[abpr]-[A-Za-z0-9-]{10,}/ },
  { name: 'clé Stripe', re: /\b[sr]k_live_[A-Za-z0-9]{20,}/ },
  { name: 'clé privée', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'mot de passe ou clé écrit en dur', generic: true, re: /\b(password|passwd|pwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|mot_?de_?passe)\b["']?\s*[:=]\s*["'](?=[^"']*\d)[^"'\s$<{]{8,}["']/i },
  // Au moins un chiffre dans la valeur : sinon « 'Aucun secret': 'non-verifie' » (un libellé) passerait pour un mot de passe.
];
// Une fausse valeur de test peut être marquée sur sa ligne. Le marqueur ne vaut que pour la règle générale :
// une vraie clé d'un fournisseur (format exact) est toujours refusée.
export const NOT_A_SECRET = 'lba:pas-un-secret';

// Fichiers qui ne doivent jamais entrer dans git, même effacés ensuite (l'historique les garde).
export function forbiddenFile(path: string): boolean {
  const b = basename(path).toLowerCase();
  if (/^\.env(\..+)?$/.test(b)) return !/\.(example|sample|template|exemple)$/.test(b);
  return /\.(pem|key|p12|pfx|jks|keystore)$/.test(b) || /^id_(rsa|dsa|ecdsa|ed25519)$/.test(b) || b === 'credentials.json';
}

// Lignes ajoutées par un « git log -p » : chaque commit compte, pas seulement le résultat final.
export function findSecrets(patch: string): { file: string; kind: string }[] {
  const found = new Map<string, { file: string; kind: string }>();
  let file = '';
  for (const line of patch.split('\n')) {
    if (line.startsWith('+++ ')) { file = line.replace(/^\+\+\+ (b\/)?/, '').trim(); continue; }
    if (!line.startsWith('+') || line.startsWith('+++')) continue;
    for (const r of SECRET_RULES) {
      if (r.generic && line.includes(NOT_A_SECRET)) continue;
      if (r.re.test(line)) found.set(`${file}|${r.name}`, { file, kind: r.name });
    }
  }
  return [...found.values()];
}

// Zones où une faille de logique coûte cher (le contournement d'un quota, une connexion…).
// Aucun outil ne trouve ces failles : le programme les repère pour demander un test d'abus et une relecture.
const ZONES: { zone: string; path: RegExp; code: RegExp }[] = [
  { zone: 'connexion et droits', path: /auth|login|logout|session|passw|jwt|oauth|permission|acl|acteur/i, code: /\b(jwt|oauth|bcrypt|argon2|setCookie|sessionId|isAdmin|permissions?\s*[:=])/i },
  { zone: 'quotas et limites', path: /quota|rate.?limit|throttl|credit/i, code: /\b(quota|rateLimit|rate_limit|throttle)\w*/i },
  { zone: 'paiement', path: /pay|stripe|billing|invoice|checkout|factur|paiement/i, code: /\b(stripe|paypal|checkout|invoice|billing)\b/i },
  { zone: 'envoi de fichiers', path: /upload|televers/i, code: /\b(multer|multipart|formidable|upload\w*)\b/i },
  { zone: 'chiffrement et secrets', path: /crypto|encrypt|secret|token|cors|csrf/i, code: /\b(createCipher\w*|createHash|csrf|Access-Control-Allow-Origin)\b/i },
];
const isTestFile = (p: string) => /(^|\/)(tests?|__tests__)\/|\.(test|spec)\.[jt]sx?$/.test(p);

export function sensitiveZones(files: string[], patch: string): string[] {
  const zones = new Set<string>();
  for (const z of ZONES) if (files.some((f) => !isTestFile(f) && z.path.test(f))) zones.add(z.zone);
  let file = '';
  for (const line of patch.split('\n')) {
    if (line.startsWith('+++ ')) { file = line.replace(/^\+\+\+ (b\/)?/, '').trim(); continue; }
    if (!line.startsWith('+') || isTestFile(file) || /\.(md|html|txt)$/.test(file)) continue;
    for (const z of ZONES) if (z.code.test(line)) zones.add(z.zone);
  }
  return [...zones];
}

export const hasAbuseTest = (criteria: { text: string }[]) => criteria.some((c) => /test d.abus/i.test(c.text));

// gitleaks (outil gratuit, spécialisé) s'il est installé dans .lba/outils/gitleaks ; sinon nos règles seules.
const GITLEAKS = join(process.cwd(), '.lba', 'outils', 'gitleaks', process.platform === 'win32' ? 'gitleaks.exe' : 'gitleaks');
export const gitleaksInstalled = () => existsSync(GITLEAKS);

function gitleaks(repo: string, range: string): { file: string; kind: string }[] | undefined {
  if (!gitleaksInstalled()) return undefined;
  const report = join(tmpdir(), `lba-gitleaks-${process.pid}-${Date.now()}.json`);
  try {
    try {
      execFileSync(GITLEAKS, ['git', repo, '--log-opts', range, '--redact', '--no-banner', '--report-format', 'json', '--report-path', report], { stdio: 'ignore', windowsHide: true, timeout: 60_000 });
    } catch (e) { if ((e as { status?: number }).status !== 1) return undefined; } // 1 = secrets trouvés
    const rows = JSON.parse(readFileSync(report, 'utf8')) as { File?: string; RuleID?: string }[];
    return rows.map((r) => ({ file: r.File ?? '?', kind: `gitleaks : ${r.RuleID ?? 'secret'}` }));
  } catch { return undefined; } finally { rmSync(report, { force: true }); }
}

export interface QuickScan { secrets: { file: string; kind: string }[]; forbidden: string[]; tool: string; blocked: boolean; cause?: string }

// Contrôle rapide, sans réseau : fait à la fin de l'agent et juste avant la réunion.
export function quickScan(repo: string, id: string): QuickScan {
  const range = `${MAIN}..${branchOf(id)}`;
  const patch = git(repo, ['-c', 'core.quotepath=off', 'log', '-p', '--no-color', '--unified=0', '--format=', range]);
  const ours = findSecrets(patch);
  const leaks = gitleaks(repo, range);
  const secrets = [...ours, ...(leaks ?? []).filter((l) => !ours.some((o) => o.file === l.file))];
  const added = git(repo, ['-c', 'core.quotepath=off', 'log', '--name-only', '--diff-filter=A', '--format=', range]).split('\n').map((s) => s.trim()).filter(Boolean);
  const forbidden = [...new Set(added.filter(forbiddenFile))];
  const parts = [
    ...(secrets.length ? [`secret possible (${secrets.map((s) => `${s.kind} dans ${s.file}`).join(' ; ')})`] : []),
    ...(forbidden.length ? [`fichier interdit dans git (${forbidden.join(', ')})`] : []),
  ];
  return {
    secrets, forbidden, tool: leaks ? 'gitleaks et règles du programme' : 'règles du programme (gitleaks pas installé)', blocked: parts.length > 0,
    ...(parts.length ? { cause: `Réunion bloquée : ${parts.join(' ; ')}. Même effacé plus tard, il resterait dans l’historique copié dans main. Si c’est une vraie clé, changez-la chez son fournisseur.` } : {}),
  };
}

// Fichiers .env du projet qui ne sont pas ignorés par git dans la branche du ticket (noms seulement, jamais lus).
export function envNotIgnored(repo: string, wt: string): string[] {
  let names: string[] = [];
  try { names = readdirSync(repo).filter((n) => /^\.env(\..+)?$/i.test(n) && forbiddenFile(n)); } catch { /* dossier illisible */ }
  return names.filter((n) => !gitOk(wt, ['check-ignore', '-q', '--no-index', n]));
}

// Paquets à risque : seulement si la liste des paquets a changé. Compare la branche à main :
// on ne signale que les failles nouvelles, graves ou critiques. Hors ligne : « non vérifié ».
const audit = (cwd: string) => new Promise<Record<string, string> | undefined>((resolve) => {
  exec('npm audit --json', { cwd, windowsHide: true, timeout: 90_000, maxBuffer: 20_000_000 }, (_err, stdout) => {
    try {
      const v = (JSON.parse(stdout) as { vulnerabilities?: Record<string, { severity: string }> }).vulnerabilities;
      resolve(v ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x.severity])) : undefined);
    } catch { resolve(undefined); }
  });
});

export async function newRiskyPackages(repo: string, wt: string, files: string[]): Promise<{ ran: boolean; risky: string[]; why?: string }> {
  if (!files.some((f) => /(^|\/)(package\.json|package-lock\.json)$/.test(f))) return { ran: false, risky: [], why: 'liste des paquets inchangée' };
  if (!existsSync(join(wt, 'package-lock.json'))) return { ran: false, risky: [], why: 'pas de package-lock.json' };
  const [after, before] = await Promise.all([audit(wt), audit(repo)]);
  if (!after) return { ran: false, risky: [], why: 'npm audit n’a pas répondu (hors ligne ?)' };
  const grave = (s: string) => s === 'high' || s === 'critical';
  return { ran: true, risky: Object.entries(after).filter(([k, s]) => grave(s) && !grave(before?.[k] ?? '')).map(([k, s]) => `${k} (${s === 'critical' ? 'critique' : 'grave'})`) };
}
