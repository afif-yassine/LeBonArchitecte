// Cahier des charges (point 2) : lecture structurée du cahier et discussion avec l'Architecte.
// L'Architecte est Opus, effort haut (décision 0007) : c'est de l'architecture.
// Un seul appel sans outils : le programme prépare le contexte (cahier, tickets, décisions),
// l'Architecte répond en JSON. Il ne modifie rien : il propose, vous décidez.
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Engine } from './engine.ts';
import { Refused } from './tickets.ts';

export const CDC_PATH = 'docs/cahier-des-charges/cahier-des-charges.md';

export interface CdcRequirement { id: string; title: string; text: string; section: string }
export interface Cdc { title: string; intro: string; version: string; sections: { title: string; text: string }[]; requirements: CdcRequirement[] }

// Lecture du cahier : chaque ligne « - **E2 Agents** : … » devient une exigence (aucune IA).
export function parseCdc(md: string): Cdc {
  const lines = md.split(/\r?\n/);
  const out: Cdc = { title: '', intro: '', version: '', sections: [], requirements: [] };
  let section = '';
  let buf: string[] = [];
  const flush = () => { if (section) out.sections.push({ title: section, text: buf.join('\n').trim() }); buf = []; };
  for (const l of lines) {
    if (/^# /.test(l)) { out.title = l.slice(2).replace(/^LE BON ARCHITECTE\s*[—-]\s*/i, '').trim(); continue; }
    if (/^## /.test(l)) { flush(); section = l.slice(3).replace(/^\d+\.\s*/, '').trim(); continue; }
    if (!section) {
      if (/^Version/i.test(l)) out.version = l.trim();
      else if (l.trim()) out.intro += (out.intro ? ' ' : '') + l.trim();
      continue;
    }
    const m = l.match(/^- \*\*([EA]\d{1,2})\s+([^*]+?)\*\*\s*:?\s*(.*)$/);
    if (m) out.requirements.push({ id: m[1], title: m[2].trim(), text: m[3].trim(), section });
    else buf.push(l);
  }
  flush();
  return out;
}

export function readCdc(repo: string): Cdc & { raw: string } {
  let raw: string;
  try { raw = readFileSync(join(repo, CDC_PATH), 'utf8'); } catch { throw new Refused(`Pas de cahier des charges : ${CDC_PATH} est introuvable.`); }
  return { ...parseCdc(raw), raw };
}

const SYSTEM = [
  'Tu es l’Architecte de « Le Bon Architecte », une équipe d’agents qui construit les projets du propriétaire comme une ESN.',
  'Le propriétaire parle français simple : réponds en français simple, sans jargon, phrases courtes.',
  'Tu relis son cahier des charges et l’état réel du projet (tickets, décisions). Tu dis ce qui est faisable, ce qu’il faudrait enlever ou reporter, les risques, et ce que ça change pour le travail déjà commencé.',
  'Règle d’or : ne jamais perturber le travail en cours. Une modification devient une proposition de nouveau ticket ; tu ne modifies rien toi-même.',
  'Sois honnête et précis : cite les exigences (E0…E20, A1…A13) et les tickets (LBA-…) concernés. Pas de flatterie.',
  'Réponds UNIQUEMENT par un objet JSON valide, sans texte autour, de cette forme :',
  '{"verdict":"une phrase","faisable":["…"],"a_enlever":[{"quoi":"…","pourquoi":"…"}],"risques":["…"],"impact_en_cours":["…"],',
  '"propositions":[{"titre":"…","pourquoi":"…","attendu":"…","criteres":["…"],"exigences":["E2"],"perturbe_le_travail_en_cours":false}],"reponse":"réponse directe à la question, ou vide"}',
  'Au plus 5 propositions, les plus utiles d’abord. Listes vides si rien à dire.',
].join('\n');

const MODES: Record<string, string> = {
  revue: 'Fais une revue complète du cahier des charges : est-il faisable, que faut-il enlever ou reporter, quels risques, que manque-t-il ?',
  'en-cours': 'Le projet a déjà commencé. Que faut-il changer dans le cahier des charges sans perturber le travail en cours ? Donne l’impact sur chaque ticket concerné.',
};

const pending = new Set<string>();
export const architectBusy = (project: string) => pending.has(project);

export function askArchitect(engine: Engine, project: string, repo: string, o: { mode?: string; question?: string }): string {
  if (pending.has(project)) throw new Refused('L’Architecte réfléchit déjà à une question : attendez sa réponse.');
  const question = (o.question?.trim() || MODES[o.mode ?? 'revue'] || MODES.revue).slice(0, 2000);
  const cdc = readCdc(repo);
  const tickets = engine.tickets(project).sort((a, b) => Number(a.id.split('-')[1]) - Number(b.id.split('-')[1]))
    .map((t) => `- ${t.id} [${t.status}] ${t.title}${t.description.cdcRefs?.length ? ` (exigences : ${t.description.cdcRefs.join(', ')})` : ''}`);
  let decisions: string[] = [];
  try { decisions = readdirSync(join(repo, 'docs', 'decisions')).filter((f) => f.endsWith('.md')).map((f) => `- ${f.replace(/\.md$/, '')}`); } catch { /* aucune */ }
  const prompt = [
    `QUESTION DU PROPRIÉTAIRE : ${question}`, '',
    '=== CAHIER DES CHARGES ===', cdc.raw, '',
    '=== TICKETS DU PROJET (état réel) ===', ...tickets, '',
    '=== DÉCISIONS ÉCRITES ===', ...decisions,
  ].join('\n');

  pending.add(project);
  engine.notify();
  const args = ['-p', '--model', 'opus', '--output-format', 'json', '--system-prompt', SYSTEM, '--tools', '',
    '--strict-mcp-config', '--disable-slash-commands', '--effort', 'high', '--max-budget-usd', '3'];
  const child = spawn('claude', args, { cwd: repo, windowsHide: true, env: { ...process.env } });
  child.stdin.end(prompt);
  let out = '';
  let err = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { err += d; });
  child.on('close', () => {
    pending.delete(project);
    let tokens = 0;
    let answer: unknown;
    try {
      const j = JSON.parse(out);
      const u = j.usage ?? {};
      tokens = (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
      const text = String(j.result ?? '');
      const a = text.indexOf('{');
      const b = text.lastIndexOf('}');
      answer = a >= 0 && b > a ? JSON.parse(text.slice(a, b + 1)) : { verdict: '', reponse: text };
    } catch {
      answer = { verdict: 'L’Architecte n’a pas pu répondre.', reponse: (err || out).slice(0, 400) };
    }
    engine.recordReview(project, { question, answer, tokens, model: 'Opus' });
  });
  return 'L’Architecte (Opus) relit le cahier des charges et l’état du projet. Sa réponse arrive ici dans une minute environ.';
}
