// Comptes rendus, écrits par le programme à partir du journal du moteur (0 token, toujours à jour,
// aucun fichier recopié : pages virtuelles de Documents, comme « Vos choix »).
// - Chaque ticket : fiche « Compte rendu » en 7 parties (résumé de l'agent + faits mesurés).
// - Ticket lourd : son propre compte rendu dans Documents.
// - Tickets légers : regroupés dans le compte rendu de leur lot, une fois le lot fini.
// - Compte rendu du jour : les tickets validés ce jour-là.
import type { Ticket } from '../src/shared/contract.ts';
import { TEST_KINDS, isTestCommand, testKinds } from '../src/shared/tests.ts';
import { unverifiedClaims } from '../src/shared/claims.ts';
import { timelineSvg, tokenBarsSvg, type Moment } from './reportCharts.ts';
import type { Engine } from './engine.ts';

export const REPORTS_DIR = 'lba/comptes-rendus/';
const HEAVY_TOKENS = 150_000;
const HEAVY_FILES = 8;

export interface TicketReport {
  id: string;
  title: string;
  lot: number;
  status: Ticket['status'];
  validatedAt?: string;
  heavy: string[]; // raisons ; vide = ticket léger
  unverified: string[]; // ce que l'agent dit ne pas avoir vérifié
  moments: Moment[]; // frise du ticket
  problem: string;
  solution: string;
  why?: string;
  limits?: string;
  how: { branch?: string; commits: string[]; files: { path: string; plus: number; minus: number }[]; decisions: string[] };
  tests: { kind: string; ok: boolean; result: string; command: string; failures: string[] }[];
  calls: { model: string; effort: string; passes: number; turns: number; tokens: number; costUsd: number; minutes: number; yourMessages: string[]; problems: string[] };
}

// Résumé de l'agent → parties, d'après ses titres (« ## Le problème », « ## Pourquoi cette solution »…).
function sectionsOf(summary: string): { problem?: string; solution?: string; why?: string; limits?: string } {
  // Certains résumés arrivent sur une seule ligne (« … ## Ce qui a été fait - **x** … ») : on remet les retours.
  const clean = summary.replace(/ÉTAPE \d+ : (faite|commencée)\s*/g, '').replace(/ (#{2,3} )/g, '\n\n$1').replace(/ - \*\*/g, '\n- **').trim();
  const parts = clean.split(/^#{1,3}\s+/m);
  const out: Record<string, string> = {};
  for (const p of parts.slice(1)) {
    const [head, ...body] = p.split('\n');
    const text = body.join('\n').trim();
    const h = head.toLowerCase();
    const key = /pourquoi/.test(h) ? 'why' : /probl/.test(h) ? 'problem' : /limite|suite|reste/.test(h) ? 'limits' : /solution|fait|réalis/.test(h) ? 'solution' : undefined;
    if (key && text) out[key] = out[key] ? `${out[key]}\n\n${text}` : text;
  }
  const intro = parts[0].trim();
  if (!out.solution) out.solution = intro || clean; // résumé libre (anciens tickets) : tout en « solution »
  else if (intro) out.solution = `${intro}\n\n${out.solution}`;
  return out;
}

export function ticketReport(engine: Engine, t: Ticket): TicketReport {
  const events = engine.events({ ticket: t.id, limit: 1000 }).reverse();
  const feed = engine.liveFeed(t.id);
  // Durée de travail : de chaque lancement à sa fin (à tester, arrêt, besoin d'action).
  let open: number | undefined; let ms = 0; let passes = 0;
  const problems: string[] = []; const yourMessages: string[] = [];
  const summaries: { text: string; fix: boolean }[] = []; let pass: 'work' | 'fix' = 'work';
  let validatedAt: string | undefined;
  const moments: Moment[] = [];
  for (const e of events) {
    const at = Date.parse(e.at);
    if (['ticket-lance', 'reclamation', 'reparation', 'ticket-repris'].includes(e.type)) { open ??= at; passes++; }
    if (['ticket-a-tester', 'ticket-arrete', 'besoin-action'].includes(e.type) && open !== undefined) { ms += at - open; open = undefined; }
    if (e.type === 'besoin-action') { const c = String(e.data.cause ?? 'besoin d’action'); problems.push(c.length > 220 ? `${c.slice(0, 220)}…` : c); }
    if (e.type === 'reparation') problems.push(`Réparation automatique : ${String(e.data.cause ?? '')}`);
    // « Demander à l'agent de résoudre » (small) : c'est un problème réglé, pas un message de vous.
    // (anciens événements sans « small » : reconnus à leur texte, écrit par le programme).
    const fix = e.type === 'reparation' || (e.type === 'reclamation' && (e.data.small || /^Problème à résoudre : /.test(String(e.data.problem ?? ''))));
    if (['ticket-lance', 'ticket-repris', 'reclamation', 'reparation'].includes(e.type)) pass = fix ? 'fix' : 'work';
    if (e.type === 'reclamation') (fix ? problems : yourMessages).push(fix ? `Résolution demandée : ${String(e.data.problem ?? '').replace(/^Problème à résoudre : /, '').split(/\.\s/)[0]}` : String(e.data.problem ?? ''));
    if (e.type === 'reuni') { const s = String((e.data.realized as { summary?: string } | undefined)?.summary ?? ''); if (s && s !== 'Voir le direct.' && !/hit your .*limit/i.test(s)) summaries.push({ text: s, fix: pass === 'fix' }); }
    if (e.type === 'direct' && e.actor === 'vous' && e.data.kind === 'message') yourMessages.push(String(e.data.text ?? ''));
    if (e.type === 'ticket-valide') validatedAt = e.at;
    // Moments clés pour la frise du PDF.
    const mo: Record<string, [string, Moment['tone']]> = {
      'ticket-lance': ['Lancé', 'accent'], 'ticket-repris': ['Repris', 'accent'], 'ticket-arrete': ['Arrêté', 'wait'],
      'besoin-action': ['Problème', 'danger'], reparation: ['Réparation', 'wait'], 'ticket-a-tester': ['À tester', 'ok'], 'ticket-valide': ['Validé', 'ok'],
    };
    if (mo[e.type]) moments.push({ at: e.at, label: mo[e.type][0], tone: mo[e.type][1] });
    if (e.type === 'reclamation') moments.push({ at: e.at, label: fix ? 'Résolution' : 'Votre demande', tone: 'wait' });
  }
  if (open !== undefined) ms += Date.now() - open;

  // Tests : le dernier passage de chaque type.
  const runs = feed.filter((i) => (i.kind === 'test' || (i.kind === 'commande' && i.ok !== undefined)));
  const tests: TicketReport['tests'] = [];
  for (const k of TEST_KINDS) {
    const last = [...runs].reverse().find((i) => { const c = i.text.replace(/\s:\s(vert|en échec)$/, ''); return isTestCommand(c) && testKinds(c).includes(k.id); });
    if (!last) continue;
    const lines = (last.detail ?? '').split('\n');
    tests.push({ kind: k.label, ok: last.ok !== false, result: /^Tests :/.test(lines[0]) ? lines[0].replace(/^Tests : /, '').replace(/\.$/, '') : last.ok === false ? 'en échec' : 'vert',
      command: last.text.replace(/\s:\s(vert|en échec)$/, ''), failures: lines.filter((l) => l.startsWith('✖ ')).map((l) => l.slice(2)) });
  }

  const r = t.realized;
  const files = r?.files ?? [];
  const decisions = files.map((f) => f.path).filter((p) => /^docs\/decisions\/\d{4}-.*\.md$/.test(p));
  // Résumé principal : le dernier passage de vrai travail ; les passages de résolution sont des corrections.
  const work = summaries.filter((x) => !x.fix);
  const main = work.length ? work[work.length - 1].text : (summaries[0]?.text ?? r?.summary ?? '');
  const s = sectionsOf(main);
  const fixes = summaries.filter((x) => x.fix && x.text !== main).map((x) => `- Correction : ${firstLine(sectionsOf(x.text).solution ?? x.text)}`);
  if (fixes.length) s.solution = `${s.solution ?? ''}\n\n${fixes.join('\n')}`.trim();
  const heavy: string[] = [];
  if (t.model === 'Opus') heavy.push('modèle Opus (tâche importante)');
  if (t.used > HEAVY_TOKENS) heavy.push(`${Math.round(t.used / 1000)} k tokens (plus de ${HEAVY_TOKENS / 1000} k)`);
  if (files.length > HEAVY_FILES) heavy.push(`${files.length} fichiers touchés`);
  if (decisions.length) heavy.push(`décision prise (${decisions.map((d) => d.split('/').pop()).join(', ')})`);
  if (problems.length || events.some((e) => e.type === 'reclamation')) heavy.push('problème en route (réclamation, conflit ou tests rouges)');

  return {
    id: t.id, title: t.title, lot: t.lot, status: t.status, validatedAt, heavy,
    unverified: unverifiedClaims(main), moments,
    problem: s.problem ?? t.description.context,
    solution: s.solution ?? '', why: s.why, limits: s.limits,
    how: { branch: r?.branch, commits: r?.commits ?? [], files, decisions },
    tests,
    // Effort réellement donné à Claude (même règle que server/claude.ts : Opus = haut).
    calls: { model: t.model, effort: t.model === 'Haiku' || t.effort === 'bas' ? 'bas' : t.effort === 'haut' || t.model === 'Opus' ? 'haut' : 'moyen', passes, turns: t.usage?.turns ?? 0, tokens: t.used, costUsd: t.usage?.costUsd ?? 0, minutes: Math.round(ms / 60_000), yourMessages, problems: [...new Set(problems)] },
  };
}

// ---------- Pages de Documents ----------
const k = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)} k` : String(n));
const day = (iso: string) => new Date(iso).toLocaleDateString('sv-SE'); // AAAA-MM-JJ, jour local
const frDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const firstLine = (s: string) => s.replace(/[#*`>]/g, '').split('\n').map((l) => l.trim()).find(Boolean)?.slice(0, 200) ?? '';
const testsLine = (r: TicketReport) => r.tests.length ? r.tests.map((x) => `${x.kind.toLowerCase()} ${x.ok ? '✓' : '✗'} ${x.result}`).join(' ; ') : 'aucun test lancé';

// Méthode de lecture courte (décision 0013) : la conclusion d'abord (feu + 5 lignes + 3 chiffres + un schéma),
// le détail ensuite, les preuves en annexe. On peut s'arrêter après « L'essentiel ».
type Light = 'vert' | 'orange' | 'rouge';
export function verdictOf(r: TicketReport): { light: Light; why: string } {
  if (r.tests.some((x) => !x.ok)) return { light: 'rouge', why: 'des tests sont en échec' };
  if (r.status !== 'termine') return { light: 'rouge', why: 'pas encore validé ni réuni dans main' };
  if (r.unverified.length) return { light: 'orange', why: `l’agent signale ${r.unverified.length} point(s) non vérifié(s)` };
  if (r.calls.problems.length) return { light: 'orange', why: `${r.calls.problems.length} problème(s) réglé(s) en route` };
  return { light: 'vert', why: 'validé, tests verts, rien à signaler' };
}
const LIGHT = { vert: '🟢 Vert', orange: '🟠 Orange', rouge: '🔴 Rouge' } as const;
const svgBlock = (svg: string) => (svg ? ['```svg', svg, '```', ''] : []);
const cell = (s: string) => s.replace(/\|/g, '/').replace(/\s+/g, ' ').trim();

export function ticketMarkdown(r: TicketReport): string {
  const v = verdictOf(r);
  const tests = r.tests.length ? r.tests.map((x) => `${x.kind.toLowerCase()} ${x.ok ? 'verts' : 'en échec'}`).join(', ') : 'aucun test lancé';
  return [
    `# Compte rendu de ${r.id} : ${r.title}`,
    `${r.validatedAt ? `Validé le ${new Date(r.validatedAt).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })}` : 'Pas encore validé'}, ticket lourd`, '',
    `> ${LIGHT[v.light]} : ${v.why}. ${firstLine(r.solution)} Tests : ${tests}. ${k(r.calls.tokens)} tokens, ${r.calls.minutes} min.`, '',
    '## L’essentiel',
    '| Feu | Tokens | Durée | Fichiers | Tests |', '|---|---|---|---|---|',
    `| ${LIGHT[v.light]} | ${k(r.calls.tokens)} | ${r.calls.minutes} min | ${r.how.files.length} | ${cell(tests)} |`, '',
    `Pourquoi c’est un ticket lourd : ${r.heavy.join(', ')}.`, '',
    '### La vie du ticket', ...svgBlock(timelineSvg(r.moments)),
    ...(r.unverified.length ? ['### À regarder vous-même', ...r.unverified.map((u) => `- ${u}`), ''] : []),
    '## 1. Le problème', r.problem, '',
    '## 2. La solution', r.solution || '_Pas de résumé de l’agent._', '',
    '## 3. Pourquoi cette solution', r.why ?? '_L’agent ne l’a pas écrit (ticket fait avant la nouvelle consigne)._', '',
    '## 4. Comment', `Branche \`${r.how.branch ?? '?'}\`, ${r.how.commits.length} commit(s), ${r.how.files.length} fichier(s) (liste en annexe).`, '',
    '## 5. Tests',
    ...(r.tests.length ? ['| Type | Résultat |', '|---|---|', ...r.tests.map((x) => `| ${x.kind} | ${x.ok ? '✓' : '✗'} ${x.result} |`)] : ['Aucun test lancé.']),
    ...r.tests.flatMap((x) => x.failures.map((f) => `- ✖ ${f}`)), '',
    '## 6. Appels',
    '| Agent | Passages | Échanges | Durée | Tokens | Coût équivalent |', '|---|---|---|---|---|---|',
    `| Claude ${r.calls.model}, effort ${r.calls.effort} | ${r.calls.passes} | ${r.calls.turns} | ${r.calls.minutes} min | ${k(r.calls.tokens)} | ${r.calls.costUsd.toFixed(2)} $ |`, '',
    ...(r.calls.yourMessages.length ? ['Vos messages :', ...r.calls.yourMessages.map((m) => `- « ${cell(m).slice(0, 240)} »`), ''] : ['Aucun message de votre part.', '']),
    ...(r.calls.problems.length ? ['Problèmes réglés en route :', ...r.calls.problems.map((p) => `- ${cell(p).slice(0, 240)}`), ''] : []),
    '## 7. Limites et suite', r.limits ?? '_Rien de signalé par l’agent._',
    ...(r.how.decisions.length ? ['', `Décisions liées : ${r.how.decisions.map((d) => `\`${d.split('/').pop()}\``).join(', ')}.`] : []), '',
    '## Annexes : les preuves',
    '| Fichier | + | − |', '|---|---|---|', ...r.how.files.map((f) => `| \`${f.path}\` | ${f.plus} | ${f.minus} |`), '',
    ...(r.tests.length ? ['Commandes de test exactes :', ...r.tests.map((x) => `- ${x.kind} : \`${cell(x.command)}\``)] : []),
  ].join('\n');
}

// Lot ou jour : même méthode. Feu global = le pire des tickets.
function groupMarkdown(title: string, meta: string, rs: TicketReport[], note: string): string {
  const tokens = rs.reduce((n, r) => n + r.calls.tokens, 0);
  const lights = rs.map((r) => verdictOf(r).light);
  const worst: Light = lights.includes('rouge') ? 'rouge' : lights.includes('orange') ? 'orange' : 'vert';
  const clean = lights.filter((l) => l === 'vert').length;
  const light = rs.filter((r) => !r.heavy.length); const heavy = rs.filter((r) => r.heavy.length);
  return [
    `# ${title}`, meta, '',
    `> ${LIGHT[worst]} : ${rs.length} ticket(s), ${clean} sans rien à signaler, ${k(tokens)} tokens au total. ${note}`, '',
    '## L’essentiel',
    '| Feu | Tickets | Sans rien à signaler | Tokens | Lourds |', '|---|---|---|---|---|',
    `| ${LIGHT[worst]} | ${rs.length} | ${clean} | ${k(tokens)} | ${heavy.length} |`, '',
    '### Tokens par ticket', ...svgBlock(tokenBarsSvg(rs.map((r) => ({ id: r.id, tokens: r.calls.tokens, testsOk: r.tests.length ? r.tests.every((x) => x.ok) : undefined, heavy: r.heavy.length > 0 })))),
    '## Les tickets', '',
    '| Ticket | Feu | Ce qui a été fait | Tokens |', '|---|---|---|---|',
    ...rs.map((r) => `| ${r.id} : ${cell(r.title)} | ${LIGHT[verdictOf(r).light]} | ${cell(firstLine(r.solution))} | ${k(r.calls.tokens)} |`), '',
    ...(heavy.length ? ['## Tickets lourds : compte rendu à part', ...heavy.map((r) => `- **${r.id}** : ${r.heavy.join(', ')}`), ''] : []),
    ...(light.length ? ['## Annexes : tests des tickets légers', '| Ticket | Tests |', '|---|---|', ...light.map((r) => `| ${r.id} | ${cell(testsLine(r))} |`)] : []),
  ].join('\n');
}
const lotMarkdown = (lot: number, rs: TicketReport[]) =>
  groupMarkdown(`Compte rendu du lot ${lot}`, 'Lot fini : tous ses tickets sont validés', rs, 'Les tickets légers sont résumés ici ; les lourds ont leur propre compte rendu.');
const dayMarkdown = (d: string, rs: TicketReport[]) =>
  groupMarkdown(`Compte rendu du ${frDay(d)}`, 'Tickets validés ce jour-là', rs, '');

export interface ReportDoc { path: string; title: string; size: number; at: string; content: string }

export function reportDocs(engine: Engine, project: string): ReportDoc[] {
  const tickets = engine.tickets(project);
  const done = tickets.filter((t) => t.status === 'termine').map((t) => ticketReport(engine, t));
  const doc = (path: string, title: string, at: string, content: string): ReportDoc => ({ path: `${REPORTS_DIR}${path}`, title, at, size: Buffer.byteLength(content), content });
  const at = (rs: TicketReport[]) => rs.map((r) => r.validatedAt ?? '').sort().pop() || new Date().toISOString();
  const out: ReportDoc[] = [];
  for (const r of done.filter((x) => x.heavy.length)) out.push(doc(`${r.id}.md`, `Compte rendu de ${r.id} : ${r.title}`, at([r]), ticketMarkdown(r)));
  // Un lot n'a son compte rendu qu'une fois tous ses tickets finis.
  for (const lot of [...new Set(tickets.map((t) => t.lot))].sort((a, b) => a - b)) {
    const all = tickets.filter((t) => t.lot === lot);
    if (!all.length || all.some((t) => t.status !== 'termine')) continue;
    const rs = done.filter((r) => r.lot === lot);
    out.push(doc(`lot-${lot}.md`, `Compte rendu du lot ${lot}`, at(rs), lotMarkdown(lot, rs)));
  }
  const days = new Map<string, TicketReport[]>();
  for (const r of done) if (r.validatedAt) days.set(day(r.validatedAt), [...(days.get(day(r.validatedAt)) ?? []), r]);
  for (const [d, rs] of days) out.push(doc(`jour-${d}.md`, `Compte rendu du ${frDay(d)}`, at(rs), dayMarkdown(d, rs)));
  return out;
}
