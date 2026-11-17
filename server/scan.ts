// Scan gratuit d'un projet (LBA-8) : 0 token, aucune lecture de secret.
// Il écrit la fiche .lba/projet.yaml, dont se servent les règles (commandes de preuve, fichiers sensibles).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

export interface ProjectProfile {
  scannedAt: string;
  name: string;
  languages: { name: string; files: number }[];
  frameworks: string[];
  commands: { test?: string; check?: string; build?: string; dev?: string };
  sensitive: string[]; // chemins seulement : le contenu n'est jamais lu
  git: { branch?: string; remote?: string };
  files: number;
}

const SKIP = new Set(['node_modules', 'dist', 'build', '.git', '.lba', '.next', 'coverage', '.venv', '__pycache__']);
const LANG: Record<string, string> = {
  '.ts': 'TypeScript', '.tsx': 'TypeScript', '.js': 'JavaScript', '.jsx': 'JavaScript', '.mjs': 'JavaScript', '.css': 'CSS',
  '.py': 'Python', '.go': 'Go', '.rs': 'Rust', '.java': 'Java', '.cs': 'C#', '.php': 'PHP', '.rb': 'Ruby', '.md': 'Markdown', '.html': 'HTML',
};
const FRAMEWORKS: [string, string][] = [
  ['react', 'React'], ['vite', 'Vite'], ['next', 'Next.js'], ['fastify', 'Fastify'], ['express', 'Express'], ['astro', 'Astro'],
  ['@prisma/client', 'Prisma'], ['stripe', 'Stripe'], ['vitest', 'Vitest'], ['jest', 'Jest'], ['@playwright/test', 'Playwright'], ['typescript', 'TypeScript'],
];
const SENSITIVE = /(^|\/)(\.env(\..+)?|.*\.pem|.*\.key|id_rsa.*|credentials.*\.json|\.npmrc)$|^\.github\/workflows\//i;

function walk(root: string, dir: string, out: string[], max = 20_000): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (out.length >= max) return;
    if (e.isDirectory()) { if (!SKIP.has(e.name)) walk(root, join(dir, e.name), out, max); }
    else out.push(relative(root, join(dir, e.name)).replaceAll('\\', '/'));
  }
}

const git = (cwd: string, args: string[]) => {
  try { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).trim() || undefined; }
  catch { return undefined; }
};

export function scanProject(root: string): ProjectProfile {
  const files: string[] = [];
  walk(root, root, files);
  const counts = new Map<string, number>();
  for (const f of files) { const l = LANG[extname(f).toLowerCase()]; if (l) counts.set(l, (counts.get(l) ?? 0) + 1); }

  let pkg: { name?: string; scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> } = {};
  if (existsSync(join(root, 'package.json'))) pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const s = pkg.scripts ?? {};
  const run = (k: string) => (s[k] ? (k === 'test' ? 'npm test' : `npm run ${k}`) : undefined);

  return {
    scannedAt: new Date().toISOString(),
    name: pkg.name ?? root.split(/[\\/]/).pop() ?? 'projet',
    languages: [...counts].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, files: n })),
    frameworks: FRAMEWORKS.filter(([d]) => d in deps).map(([, n]) => n),
    commands: {
      test: run('test'),
      check: run('check') ?? (existsSync(join(root, 'tsconfig.json')) ? 'npx tsc --noEmit' : undefined),
      build: run('build'),
      dev: run('dev'),
    },
    sensitive: files.filter((f) => SENSITIVE.test(f)),
    git: { branch: git(root, ['branch', '--show-current']), remote: git(root, ['remote', 'get-url', 'origin'])?.replace(/\/\/[^@/]+@/, '//') },
    files: files.length,
  };
}

// YAML écrit à la main : la fiche reste lisible et modifiable, sans dépendance.
export function toYaml(p: ProjectProfile): string {
  const q = (v: string) => JSON.stringify(v);
  const lines = [
    '# Fiche du projet, écrite par le scan gratuit du Bon Architecte. Vous pouvez la corriger.',
    `nom: ${q(p.name)}`,
    `scanne_le: ${q(p.scannedAt)}`,
    `fichiers: ${p.files}`,
    'langages:', ...p.languages.map((l) => `  - { nom: ${q(l.name)}, fichiers: ${l.files} }`),
    `outils: [${p.frameworks.map(q).join(', ')}]`,
    'commandes:', ...Object.entries(p.commands).filter(([, v]) => v).map(([k, v]) => `  ${k}: ${q(v!)}`),
    '# Fichiers sensibles : leur contenu n’est jamais lu ni envoyé à un agent.',
    'sensibles:', ...(p.sensitive.length ? p.sensitive.map((f) => `  - ${q(f)}`) : ['  []']),
    'git:', `  branche: ${q(p.git.branch ?? '')}`, `  depot: ${q(p.git.remote ?? '')}`,
  ];
  return lines.join('\n') + '\n';
}

export function writeProfile(root: string): ProjectProfile {
  const p = scanProject(root);
  mkdirSync(join(root, '.lba'), { recursive: true });
  writeFileSync(join(root, '.lba', 'projet.yaml'), toYaml(p));
  return p;
}
