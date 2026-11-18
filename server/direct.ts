// Mode direct : pour une tâche simple de texte, pas d'agent qui explore.
// Le programme prépare le contexte (0 token), fait UN appel à Claude Code sans outils,
// puis écrit lui-même les fichiers rendus, seulement dans le worktree du ticket.
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, normalize, sep } from 'node:path';
import type { Ticket } from '../src/shared/contract.ts';
import type { Engine } from './engine.ts';
import type { ProjectProfile } from './scan.ts';
import type { RunOutcome } from './claude.ts';

const SYSTEM = [
  'Tu écris des fichiers de texte pour un projet logiciel, en français simple, sans jargon.',
  'Rends UNIQUEMENT les fichiers demandés, chacun dans ce format exact, sans rien avant ni après :',
  '=== FICHIER: chemin/relatif ===',
  '(contenu complet du fichier)',
  '=== FIN ===',
  'N’invente rien : utilise seulement les faits donnés. Si une information manque, ne l’écris pas.',
].join('\n');

const SENSITIVE = /(^|\/)(\.env|.*\.pem|.*\.key|id_rsa)|^\.github\/|^\.git\//i;
const MAX_FILE = 6_000; // au-delà, seulement le début : on ne paie pas pour un journal entier

// Contexte préparé par le programme : la fiche du projet, la liste des docs, et les fichiers cités par le ticket.
export function buildContext(t: Ticket, dir: string, prof: ProjectProfile): { prompt: string; files: string[] } {
  const text = `${t.title} ${t.description.context} ${t.description.expected} ${t.criteria.map((c) => c.text).join(' ')}`;
  const named = [...new Set(text.match(/[\w./-]+\.(md|txt|json|ts|tsx|css|html|yaml)\b/gi) ?? [])]
    .map((p) => p.replace(/^\.\//, '')).filter((p) => !SENSITIVE.test(p) && existsSync(join(dir, p)));
  const docs = existsSync(join(dir, 'docs'))
    ? readdirSync(join(dir, 'docs'), { recursive: true }).map(String).filter((f) => f.endsWith('.md')).map((f) => `docs/${f.replaceAll('\\', '/')}`)
    : [];
  const show = (p: string) => {
    const c = readFileSync(join(dir, p), 'utf8');
    // Gros fichier (un journal) : seulement son début, assez pour savoir ce qu'il contient.
    return `--- ${p} ---\n${c.length > MAX_FILE ? `${c.slice(0, 1_500)}\n[… début seulement : ${c.length} caractères au total]` : c}`;
  };
  const prompt = [
    `TICKET ${t.id} : ${t.title}`,
    `Pourquoi : ${t.description.context}`,
    `Attendu : ${t.description.expected}`,
    'Critères :', ...t.criteria.map((c) => `- ${c.text}`),
    '',
    'FAITS DU PROJET (scan du programme) :',
    `- Nom : ${prof.name}`,
    `- Langages : ${prof.languages.slice(0, 4).map((l) => l.name).join(', ')}`,
    `- Outils : ${prof.frameworks.join(', ')}`,
    `- Commandes : ${Object.entries(prof.commands).filter(([, v]) => v).map(([k, v]) => `${k} = ${v}`).join(' ; ')}`,
    `- Dépôt : ${prof.git.remote ?? 'inconnu'}`,
    `- Documents : ${docs.join(', ')}`,
    '',
    ...(named.length ? ['FICHIERS ACTUELS :', ...named.map(show)] : []),
  ].join('\n');
  return { prompt, files: named };
}

// Lit la réponse et n'écrit que des fichiers sûrs, dans le worktree.
export function parseFiles(answer: string, dir: string): { path: string; content: string }[] {
  const out: { path: string; content: string }[] = [];
  const re = /=== FICHIER: (.+?) ===\r?\n([\s\S]*?)\r?\n=== FIN ===/g;
  for (const m of answer.matchAll(re)) {
    const p = normalize(m[1].trim()).replaceAll('\\', '/').replace(/^\.\//, '');
    const abs = join(dir, p);
    if (p.startsWith('..') || !abs.startsWith(dir + sep) || SENSITIVE.test(p) || out.length >= 3) continue;
    out.push({ path: p, content: m[2].endsWith('\n') ? m[2] : `${m[2]}\n` });
  }
  return out;
}

export function runDirect(engine: Engine, t: Ticket, dir: string, prof: ProjectProfile, complaint: string | undefined, onEnd: (o: RunOutcome) => void): ChildProcess {
  const who = 'claude-haiku (direct)';
  const ctx = buildContext(t, dir, prof);
  const prompt = (complaint ? `RÉCLAMATION du propriétaire : « ${complaint} ».\n\n` : '') + ctx.prompt;
  engine.live(t.id, { kind: 'agent', text: 'Mode direct : un seul appel, sans outils (tâche simple)', detail: `Contexte préparé par le programme : ${ctx.files.length} fichier(s) cité(s), ${prompt.length.toLocaleString('fr-FR')} caractères` }, 'programme');

  const args = ['-p', '--model', 'haiku', '--output-format', 'json', '--system-prompt', SYSTEM, '--tools', '',
    '--strict-mcp-config', '--disable-slash-commands', '--effort', 'low', '--max-budget-usd', '0.5'];
  const child = spawn('claude', args, { cwd: dir, windowsHide: true, env: { ...process.env } });
  child.stdin.end(prompt);
  let out = '';
  let err = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { err += d; });
  child.on('error', (e) => { err += e.message; });
  child.on('close', (code) => {
    let j: Record<string, any>;
    try { j = JSON.parse(out); } catch {
      onEnd({ ok: false, reason: `Claude Code s’est arrêté (code ${code}) : ${(err || out).slice(0, 200)}`, read: ctx.files, tokens: 0 });
      return;
    }
    const u = j.usage ?? {};
    const tokens = (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
    engine.tokens(t.id, { used: tokens, cacheRead: u.cache_read_input_tokens ?? 0, costUsd: j.total_cost_usd ?? 0, turns: j.num_turns ?? 1, input: u.input_tokens ?? 0, output: u.output_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0 });
    const files = j.is_error ? [] : parseFiles(String(j.result ?? ''), dir);
    for (const f of files) {
      mkdirSync(dirname(join(dir, f.path)), { recursive: true });
      writeFileSync(join(dir, f.path), f.content);
      engine.live(t.id, { kind: 'action', text: `Écrit ${f.path}`, detail: `${f.content.split('\n').length} lignes` }, who);
    }
    const ok = !j.is_error && files.length > 0;
    engine.live(t.id, {
      kind: 'systeme', ok,
      text: ok ? `Appel direct fini : ${tokens.toLocaleString('fr-FR')} tokens` : 'Appel direct sans fichier utilisable',
      detail: `${u.input_tokens ?? 0} lus, ${u.output_tokens ?? 0} écrits, ${u.cache_creation_input_tokens ?? 0} mis en cache, ${(u.cache_read_input_tokens ?? 0)} relus du cache`,
    }, 'programme');
    onEnd({ ok, reason: ok ? 'fini' : 'réponse sans fichier', read: ctx.files, tokens, summary: files.length ? `Fichiers écrits : ${files.map((f) => f.path).join(', ')}.` : String(j.result ?? '').slice(0, 300) });
  });
  return child;
}
