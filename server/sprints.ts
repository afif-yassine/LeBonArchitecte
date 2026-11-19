// Backlog relié au cahier des charges, sprints et rapport de sprint (décision 0020, lots S1 à S4).
// Tout est calculé par le programme depuis le journal, le cahier et git (0 token). Seul le court résumé en tête
// du rapport de sprint est écrit par une IA, une fois, à la fermeture du sprint.
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Sprint } from '../src/shared/contract.ts';
import type { Engine } from './engine.ts';
import { readCdc } from './architect.ts';
import { equipeRepo, roleOf, rolesOf } from './equipe.ts';
import { rangeChanges } from './git.ts';
import { ticketReport, REPORTS_DIR, type TicketReport } from './reports.ts';
import { envOf, pickCompte, recordQuota } from './comptes.ts';

const k = (n: number) => `${Math.round(n / 100) / 10} k`.replace('.', ',');
const cell = (s: string) => String(s ?? '').replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
const frDay = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '…');
const decisionsOf = (repo: string) => { try { return readdirSync(join(repo, 'docs', 'decisions')).filter((f) => /^\d{4}-.*\.md$/.test(f)).sort(); } catch { return []; } };

// --- S1 : couverture du cahier des charges. Une exigence est couverte si un élément du backlog ou un ticket la cite. ---
export function coverage(engine: Engine, project: string, repo = equipeRepo(project)) {
  let reqs: { id: string; title: string }[] = [];
  try { if (repo) reqs = readCdc(repo).requirements.map((r) => ({ id: r.id, title: r.title })); } catch { /* pas de cahier */ }
  const b = engine.backlog(project);
  const items = [...b.items, ...(b.sprint?.elements ?? []), ...b.done];
  const tickets = engine.tickets(project);
  const by = reqs.map((r) => ({
    ...r,
    backlog: items.filter((i) => i.refs?.some((x) => x.replace('~', '') === r.id)).map((i) => i.id),
    tickets: tickets.filter((t) => t.description.cdcRefs?.some((x) => x.replace('~', '') === r.id)).map((t) => t.id),
  }));
  const missing = by.filter((r) => !r.backlog.length && !r.tickets.length);
  return { total: reqs.length, covered: reqs.length - missing.length, missing: missing.map(({ id, title }) => ({ id, title })), byReq: by };
}

// --- S4 : changement du cahier ou des décisions depuis la dernière fois que vous avez dit « c'est vu ». ---
type Snapshot = { version: string; reqs: Record<string, string>; decisions: string[] };
function snapshot(repo: string): Snapshot | undefined {
  try {
    const c = readCdc(repo);
    const reqs = Object.fromEntries(c.requirements.map((r) => [r.id, createHash('sha1').update(`${r.title}\n${r.text}`).digest('hex').slice(0, 12)]));
    return { version: c.version, reqs, decisions: decisionsOf(repo) };
  } catch { return undefined; }
}
export function changes(engine: Engine, project: string, repo = equipeRepo(project)) {
  const now = repo ? snapshot(repo) : undefined;
  if (!now) return { changed: false as const };
  const raw = engine.setting(`vu-cahier:${project}`);
  if (!raw) { engine.setSetting(`vu-cahier:${project}`, JSON.stringify(now), true); return { changed: false as const }; } // première fois : point de départ
  const was = JSON.parse(raw) as Snapshot;
  const added = Object.keys(now.reqs).filter((id) => !(id in was.reqs));
  const removed = Object.keys(was.reqs).filter((id) => !(id in now.reqs));
  const modified = Object.keys(now.reqs).filter((id) => id in was.reqs && was.reqs[id] !== now.reqs[id]);
  const decisions = now.decisions.filter((d) => !was.decisions.includes(d));
  const changed = added.length + removed.length + modified.length + decisions.length > 0 || was.version !== now.version;
  return { changed, versionFrom: was.version, versionTo: now.version, added, removed, modified, decisions };
}
export function acknowledgeChanges(engine: Engine, project: string, repo = equipeRepo(project)): string {
  const now = repo ? snapshot(repo) : undefined;
  if (!now) return 'Pas de cahier des charges à suivre.';
  engine.setSetting(`vu-cahier:${project}`, JSON.stringify(now));
  return 'C’est noté : le cahier et les décisions actuels sont le nouveau point de départ.';
}

// --- S2 : chiffres d'un sprint (vitesse), depuis les tickets du sprint (lot = n). ---
export function sprintFacts(engine: Engine, project: string, s: Sprint) {
  const tickets = engine.tickets(project).filter((t) => t.lot === s.n);
  const done = tickets.filter((t) => t.status === 'termine');
  const tokens = tickets.reduce((n, t) => n + (t.used ?? 0), 0);
  const days = Math.max(1, Math.round(((s.closedAt ? Date.parse(s.closedAt) : Date.now()) - Date.parse(s.openedAt)) / 86_400_000));
  return { tickets: tickets.length, done: done.length, tokens, days, ids: tickets.map((t) => t.id) };
}

// --- S3 : rapport de sprint, assemblé par le programme. ---
export function sprintMarkdown(engine: Engine, project: string, s: Sprint, repo = equipeRepo(project)): string {
  const all = engine.tickets(project).filter((t) => t.lot === s.n);
  const reports: TicketReport[] = all.map((t) => ticketReport(engine, t));
  const f = sprintFacts(engine, project, s);
  const b = engine.backlog(project);
  const elements = [...(b.sprint?.n === s.n ? b.sprint.elements : []), ...b.done.filter((x) => x.sprint === s.n)];
  const roles = repo ? rolesOf(project, repo).roles : [];
  const range = repo && s.startCommit ? rangeChanges(repo, s.startCommit, s.endCommit ?? 'main') : undefined;
  const decisions = range ? range.files.filter((x) => x.path.startsWith('docs/decisions/') && x.status === 'A').map((x) => x.path.replace('docs/decisions/', '')) : [];
  const folders = new Map<string, { files: number; plus: number; minus: number }>();
  for (const x of range?.files ?? []) {
    const top = x.path.includes('/') ? `${x.path.split('/')[0]}/` : x.path;
    const g = folders.get(top) ?? { files: 0, plus: 0, minus: 0 };
    folders.set(top, { files: g.files + 1, plus: g.plus + x.plus, minus: g.minus + x.minus });
  }
  const models = new Map<string, number>();
  for (const r of reports) models.set(r.calls.model, (models.get(r.calls.model) ?? 0) + r.calls.tokens);
  const cost = reports.reduce((n, r) => n + r.calls.costUsd, 0);
  const tests = reports.flatMap((r) => r.tests);
  const checks = all.flatMap((t) => t.done).reduce((m, d) => { const x = m.get(d.label) ?? { ok: 0, ko: 0, unknown: 0 }; if (d.state === 'ok') x.ok++; else if (d.state === 'echec') x.ko++; else x.unknown++; m.set(d.label, x); return m; }, new Map<string, { ok: number; ko: number; unknown: number }>());
  const state = s.closedAt ? `fermé le ${frDay(s.closedAt)}` : 'en cours';
  const past = engine.sprints(project).filter((x) => x.n < s.n && x.closedAt).slice(-3).map((x) => ({ n: x.n, ...sprintFacts(engine, project, x) }));
  return [
    `# Rapport du sprint ${s.n}`,
    `Objectif : **${s.objectif}**. Ouvert le ${frDay(s.openedAt)}, ${state} (${f.days} jour${f.days > 1 ? 's' : ''}).`, '',
    `> ${f.done === f.tickets && f.tickets ? '🟢' : f.done ? '🟠' : '🔵'} ${f.done} ticket(s) fini(s) sur ${f.tickets}, ${k(f.tokens)} tokens, ${cost.toFixed(2).replace('.', ',')} $.`, '',
    ...(s.summary ? ['## Résumé', s.summary, ''] : s.closedAt ? [] : ['_Le résumé sera écrit à la fermeture du sprint. Tout le reste est à jour en direct._', '']),
    '## Le backlog de ce sprint',
    ...(elements.length ? ['| Élément | Exigences | Tickets |', '|---|---|---|', ...elements.map((x) => `| ${x.id} : ${cell(x.title)} | ${(x.refs ?? []).join(', ') || '—'} | ${x.tickets.join(', ') || 'pas encore découpé'} |`)] : ['Aucun élément.']), '',
    '## Les tickets',
    ...(reports.length ? ['| Ticket | Rôle | État | Ce qui a été fait | Tokens |', '|---|---|---|---|---|',
      ...reports.map((r, i) => `| ${r.id} : ${cell(r.title)} | ${roles.length ? roleOf(all[i], roles).nom : '—'} | ${r.status === 'termine' ? 'fini' : r.status} | ${cell(r.solution.split('\n').find((l) => l.trim()) ?? '').slice(0, 160)} | ${k(r.calls.tokens)} |`)] : ['Aucun ticket encore.']),
    ...(all.some((t) => t.status !== 'termine') ? ['', `Pas finis à la ${s.closedAt ? 'fermeture' : 'date du rapport'} : ${all.filter((t) => t.status !== 'termine').map((t) => t.id).join(', ')}.`] : []), '',
    '## Changements d’architecture et de code',
    ...(range ? [
      `${range.commits} commit(s) dans main, ${range.files.length} fichier(s) touché(s) depuis \`${s.startCommit}\`${s.endCommit ? ` jusqu’à \`${s.endCommit}\`` : ''}.`, '',
      '| Dossier | Fichiers | Lignes ajoutées | Lignes enlevées |', '|---|---|---|---|',
      ...[...folders].sort((a, b) => b[1].plus + b[1].minus - (a[1].plus + a[1].minus)).map(([d, g]) => `| ${d} | ${g.files} | +${g.plus} | −${g.minus} |`), '',
      ...(range.files.filter((x) => x.status === 'A').length ? ['Fichiers nouveaux : ' + range.files.filter((x) => x.status === 'A').map((x) => `\`${x.path}\``).slice(0, 30).join(', ')] : []),
    ] : ['Commit de départ inconnu : pas de comparaison git.']), '',
    '## Décisions prises',
    ...(decisions.length ? decisions.map((d) => `- ${d.replace(/\.md$/, '')}`) : ['Aucune nouvelle décision écrite pendant ce sprint.']), '',
    '## Outils utilisés',
    ...(models.size ? [`Modèles : ${[...models].map(([m, t]) => `${m} (${k(t)})`).join(', ')}.`] : []),
    `Rôles : ${[...new Set(all.map((t) => (roles.length ? roleOf(t, roles).nom : '—')))].join(', ') || '—'}.`,
    `Commandes de test : ${[...new Set(tests.map((x) => `\`${x.command}\``))].join(', ') || 'aucune'}.`, '',
    '## Tests et contrôles',
    `Tests lancés : ${tests.length}, dont ${tests.filter((x) => x.ok).length} verts.`,
    ...(checks.size ? ['| Contrôle | OK | Échec | Non vérifié |', '|---|---|---|---|', ...[...checks].map(([l, x]) => `| ${l} | ${x.ok} | ${x.ko} | ${x.unknown} |`)] : []), '',
    '## Vitesse',
    '| Sprint | Tickets finis | Tokens | Jours |', '|---|---|---|---|',
    ...past.map((p) => `| ${p.n} | ${p.done} / ${p.tickets} | ${k(p.tokens)} | ${p.days} |`),
    `| **${s.n}** | **${f.done} / ${f.tickets}** | **${k(f.tokens)}** | **${f.days}** |`, '',
    '## Annexes',
    `Tickets : ${f.ids.join(', ') || 'aucun'}. Chaque ticket a son compte rendu détaillé (fiche du ticket, onglet Compte rendu).`,
  ].join('\n');
}

export function sprintDocs(engine: Engine, project: string) {
  return engine.sprints(project).map((s) => {
    const content = sprintMarkdown(engine, project, s);
    return { path: `${REPORTS_DIR}sprint-${s.n}.md`, title: `Rapport du sprint ${s.n}${s.closedAt ? '' : ' (en cours)'} : ${s.objectif}`, at: s.closedAt ?? s.openedAt, size: Buffer.byteLength(content), content };
  });
}

// --- Le résumé du rapport : UN appel court (Sonnet, sans outils, sans conversation), à partir des faits ci-dessus. ---
const SUMMARY_SYSTEM = [
  'Tu écris le résumé en tête du rapport de sprint d’un projet logiciel, pour un propriétaire qui parle français simple.',
  'Utilise seulement les faits donnés. 5 à 8 phrases courtes : ce qui a été fait par rapport à l’objectif, les changements d’architecture importants, les décisions, ce qui reste, et un conseil pour le prochain sprint.',
  'Pas de titre, pas de tableau, pas de jargon. N’invente rien.',
].join('\n');
export function summarizeSprint(engine: Engine, project: string, n: number): void {
  const s = engine.sprints(project).find((x) => x.n === n);
  if (!s) return;
  const facts = sprintMarkdown(engine, project, s).slice(0, 14_000);
  const compte = pickCompte(engine, project, 'architecte');
  const child = spawn('claude', ['-p', '--model', 'sonnet', '--output-format', 'stream-json', '--verbose', '--system-prompt', SUMMARY_SYSTEM, '--tools', '',
    '--strict-mcp-config', '--disable-slash-commands', '--no-session-persistence', '--effort', 'low', '--max-budget-usd', '0.5'],
  { cwd: process.cwd(), windowsHide: true, env: { ...process.env, ...envOf(compte), CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' } });
  child.stdin.end(facts);
  let buf = '';
  child.stdout.on('data', (d) => {
    buf += d;
    let i: number;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      try {
        const m = JSON.parse(line);
        if (m.type === 'rate_limit_event') recordQuota(engine, compte.id, m.rate_limit_info);
        if (m.type === 'result' && !m.is_error && m.result) {
          const u = m.usage ?? {};
          const tokens = (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
          engine.architectTokens(project, { used: tokens, cacheRead: u.cache_read_input_tokens ?? 0, costUsd: m.total_cost_usd ?? 0, turns: 1, model: 'Sonnet' });
          engine.sprintSummary(project, n, `${String(m.result).trim().slice(0, 3000)}\n\n_Résumé écrit par Sonnet à partir des faits ci-dessous : ${tokens.toLocaleString('fr-FR')} tokens, ${(m.total_cost_usd ?? 0).toFixed(3).replace('.', ',')} $._`, { tokens, costUsd: m.total_cost_usd ?? 0 });
        }
      } catch { /* ligne non JSON */ }
    }
  });
  child.on('error', () => { /* Claude Code absent : le rapport reste complet, sans résumé */ });
}
