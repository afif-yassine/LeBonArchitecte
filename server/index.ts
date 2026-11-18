// Serveur local du Bon Architecte. Écoute seulement sur 127.0.0.1 : rien n'est exposé au réseau.
import Fastify from 'fastify';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { backupDb, openDb } from './db.ts';
import { Engine } from './engine.ts';
import { Refused } from './tickets.ts';
import { simulateRun } from './simulate.ts';
import { writeProfile, type ProjectProfile } from './scan.ts';
import { startSupervisor } from './supervisor.ts';
import { contextOf } from './claude.ts';
import { REPORTS_DIR, reportDocs, ticketReport } from './reports.ts';
import { reportPdf } from './reportPdf.ts';
import { ACTOR_HEADER, actorStore, architectRefusal, currentActor } from './acteurs.ts';
import { architectRunning, askArchitectAgent } from './architectAgent.ts';
import { assertMainReady, diffFile, fileAt, fileBytesAt, revertMerge, worktreeOf } from './git.ts';
import { branchFrom, commitInfo, gitGraph, gitInfo, listDocs, readDoc, readPdf } from './projectData.ts';
import { runCommand } from './executor.ts';
import { architectBusy, askArchitect, CDC_PATH, CHOICES_PATH, choicesDoc, readCdc } from './architect.ts';
import { humanActions, tickets as seedTickets } from '../src/mock/data.ts';

const PORT = Number(process.env.LBA_PORT ?? 4317);
// Dossier de chaque vrai projet. Les projets d'exemple n'en ont pas.
const PROJECT_DIRS: Record<string, string> = { lba: process.cwd() };
const db = openDb(join(process.cwd(), '.lba', 'lba.db'));
// Sauvegarde de l'état de l'outil : au démarrage (avant tout changement), puis chaque heure.
const saveState = () => { try { backupDb(db, join(process.cwd(), '.lba', 'sauvegardes')); } catch (err) { console.error(`Sauvegarde impossible : ${(err as Error).message}`); } };
saveState();
setInterval(saveState, 3_600_000).unref();
const engine = new Engine(db);
if (engine.isEmpty()) engine.seed(seedTickets, humanActions); // premier démarrage : tickets de démonstration
else engine.seedActionsOnce(humanActions);
engine.rebuild(); // chaque ticket recalculé depuis son journal (vérifié sans différence sur une copie de la base, 18 nov.)

const app = Fastify({ logger: false });

// Toute règle refusée devient une réponse 409 avec une explication en clair.
app.setErrorHandler((err, _req, reply) => {
  if (err instanceof Refused) return reply.code(409).send({ message: err.message });
  const e = err as Error;
  console.error(e);
  return reply.code(500).send({ message: `Erreur du serveur : ${e.message}` });
});

// Audit LBA-11, point 8 : le moteur n'obéit qu'à l'interface de ce PC.
// - Nom d'hôte local seulement (bloque un site qui se ferait passer pour « localhost » : DNS rebinding).
// - Une page d'un autre site (Origin étranger) ne peut rien demander.
// - Toute action (POST, PUT) doit être en JSON : un formulaire ou un envoi « texte » d'un autre site est refusé.
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
app.addHook('onRequest', async (req, reply) => {
  const host = String(req.headers.host ?? '');
  const origin = req.headers.origin;
  if (!LOCAL_HOST.test(host) || (origin && !LOCAL_ORIGIN.test(origin))) return reply.code(403).send({ message: 'Refusé : le moteur ne répond qu’à l’interface de ce PC.' });
  if (req.method !== 'GET' && req.method !== 'HEAD' && !String(req.headers['content-type'] ?? '').startsWith('application/json')) {
    return reply.code(415).send({ message: 'Refusé : une action doit être envoyée en JSON par l’interface.' });
  }
  // L'Architecte (commande lba) : ses actions sont écrites à son nom, et les portes qui restent à vous lui sont fermées.
  if (req.headers[ACTOR_HEADER] === 'architecte') {
    const why = architectRefusal(req.method, req.url);
    if (why) return reply.code(403).send({ message: `Refusé à l’Architecte : ${why}. Demandez-le au propriétaire.` });
    actorStore.enterWith('architecte');
  }
});
engine.actorOverride = currentActor;

type Id = { Params: { id: string } };

app.get('/api/health', async () => ({ ok: true }));

// Fiche du projet (LBA-8) : le scan gratuit tourne au besoin, la fiche est écrite dans .lba/projet.yaml.
const profiles = new Map<string, ProjectProfile>();
const profileOf = (project: string, fresh = false) => {
  const dir = PROJECT_DIRS[project];
  if (!dir) throw new Refused('Ce projet d’exemple n’a pas de dossier sur ce PC : rien à scanner.');
  if (fresh || !profiles.has(project)) profiles.set(project, writeProfile(dir));
  return profiles.get(project)!;
};
app.get<Id>('/api/projects/:id/profile', async (req) => profileOf(req.params.id));
app.post<Id>('/api/projects/:id/scan', async (req) => ({ message: 'Scan fait : fiche écrite dans .lba/projet.yaml.', profile: profileOf(req.params.id, true) }));
app.get('/api/tickets', async () => engine.tickets());
app.get<Id>('/api/projects/:id/events', async (req) => engine.events({ project: req.params.id }));
app.get<Id>('/api/tickets/:id/events', async (req) => engine.events({ ticket: req.params.id }));
app.get('/api/pilot', async () => engine.pilotState());
app.get('/api/actions', async () => engine.actions());
app.post<Id & { Body: { label?: string } }>('/api/actions/:id/resolve', async (req) => ({ message: engine.resolveAction(req.params.id, req.body?.label ?? 'Fait') }));
app.post<Id & { Body: { dir?: -1 | 1 | 'tete' } }>('/api/tickets/:id/priority', async (req) => ({ message: engine.reorder(req.params.id, req.body?.dir ?? 'tete') }));
app.post<Id & { Body: { ids?: string[] } }>('/api/projects/:id/plans/validate', async (req) => ({ message: engine.validatePlans(req.params.id, req.body?.ids ?? []) }));
app.put<{ Body: Record<string, unknown> }>('/api/pilot', async (req) => {
  const s = engine.setPilot(req.body as never);
  // Allumer le pilote démarre tout de suite les tickets prêts des vrais projets (pas les démos).
  if (s.on) for (const p of Object.keys(PROJECT_DIRS)) engine.kickPilot(p);
  return engine.pilotState();
});

app.post<Id & { Body: { replace?: string; manual?: boolean; who?: string } }>('/api/tickets/:id/launch', async (req) => ({ message: engine.launch(req.params.id, { replace: req.body?.replace, manual: req.body?.manual, actor: req.body?.who }) }));
app.post<Id>('/api/tickets/:id/stop', async (req) => ({ message: engine.stop(req.params.id) }));
app.post<Id>('/api/tickets/:id/pause', async (req) => ({ message: engine.pause(req.params.id) }));
// Reprendre : un ticket en pause, ou interrompu par une panne (avec sa passation, LBA-16).
app.post<Id>('/api/tickets/:id/resume', async (req) => ({ message: supervisor.resume(req.params.id) }));
app.post<Id>('/api/tickets/:id/validate', async (req) => ({ message: await supervisor.validate(req.params.id) }));
// « Tester » : les tests du projet lancés dans la branche du ticket (son dossier), pas dans main.
app.post<Id>('/api/tickets/:id/test', async (req) => {
  const t = engine.ticket(req.params.id);
  const repo = PROJECT_DIRS[t.projectId];
  if (!repo) throw new Refused('Ce projet d’exemple n’a pas de dossier sur ce PC : rien à tester.');
  const test = profileOf(t.projectId).commands.test;
  if (!test) throw new Refused('Aucune commande de tests dans la fiche du projet.');
  const wt = worktreeOf(repo, t.id);
  const where = existsSync(wt) ? `Tests dans la branche de ${t.id}` : 'Tests dans main';
  const at = () => new Date().toISOString();
  engine.setActivity(t.id, { label: 'Tests', steps: [{ label: where, state: 'en-cours' }], at: at() });
  const r = await engine.run(t.id, test, existsSync(wt) ? wt : repo, 'vous');
  const first = r.summary.split('\n')[0];
  engine.setActivity(t.id, { label: 'Tests', steps: [{ label: where, state: r.ok ? 'ok' : 'echec', detail: first }], at: at(), ...(r.ok ? {} : { error: `Tests rouges : ${first}`, fixable: false }) });
  return { message: `${r.ok ? 'Tests verts' : 'Tests rouges'} : ${where.toLowerCase()} : ${first}`, result: r };
});
app.post<Id>('/api/tickets/:id/fix', async (req) => ({ message: supervisor.fix(req.params.id) }));
// Contexte de l'agent du ticket, lu dans le journal de sa session (le chemin dépend du dossier du ticket,
// même s'il a été retiré après la réunion).
// Compte rendu du ticket en 7 parties (programme, 0 token).
app.get<Id>('/api/tickets/:id/report', async (req) => ticketReport(engine, engine.ticket(req.params.id)));
app.get<Id>('/api/tickets/:id/context', async (req) => {
  const t = engine.ticket(req.params.id);
  const repo = PROJECT_DIRS[t.projectId];
  const session = engine.sessionOf(t.id);
  if (!repo || !session) return { exists: false, kept: false };
  return { ...contextOf(worktreeOf(repo, t.id), session), kept: true };
});
// Pour le lanceur : le moteur ne redémarre (mise à jour de son code) que s'il est libre.
app.get('/api/busy', async () => {
  const running = supervisor.running();
  const validating = supervisor.validating();
  // L'Architecte qui travaille compte aussi : le moteur ne redémarre pas sous lui.
  const architect = Object.keys(PROJECT_DIRS).filter(architectRunning);
  return { busy: running.length + validating.length + architect.length > 0, running, validating, architect };
});
app.post<Id & { Body: { title: string; context?: string; expected: string; criteria?: string[]; deps?: string[]; part?: string; lot?: number; model?: string } }>('/api/projects/:id/tickets', async (req) => {
  if (!PROJECT_DIRS[req.params.id]) throw new Refused('Les projets d’exemple ne reçoivent pas de nouveaux tickets.');
  const model = req.body.model && ['Opus', 'Sonnet', 'Haiku'].includes(req.body.model) ? req.body.model as 'Opus' | 'Sonnet' | 'Haiku' : undefined;
  if (req.body.model && !model) throw new Refused('Modèle inconnu : Opus, Sonnet ou Haiku (jamais Fable).');
  const t = engine.createTicket(req.params.id, { ...req.body, model, criteria: req.body.criteria ?? [] });
  return { message: `${t.id} créé avec un plan de ${t.steps.length} étapes, à valider.`, ticket: t };
});
app.post<Id & { Body: { problem?: string } }>('/api/tickets/:id/reject', async (req) => ({ message: engine.reject(req.params.id, req.body?.problem ?? '') }));
app.post<Id & { Body: { command?: string } }>('/api/tickets/:id/run', async (req) => {
  const t = engine.ticket(req.params.id);
  const dir = PROJECT_DIRS[t.projectId];
  if (!dir) throw new Refused('Ce projet d’exemple n’a pas de dossier sur ce PC : rien à exécuter.');
  const wt = worktreeOf(dir, t.id);
  const r = await engine.run(t.id, req.body?.command ?? '', existsSync(wt) ? wt : dir, 'vous'); // dans la branche du ticket si elle existe
  const first = r.summary.split('\n')[0];
  return { message: r.ok ? `Commande terminée : ${first}` : `Commande en échec : ${first}`, result: r };
});
app.post<{ Params: { id: string; step: string }; Body: { command?: string; evidence?: string; who?: string } }>('/api/tickets/:id/steps/:step/prove', async (req) => {
  const t = engine.ticket(req.params.id);
  // Sans commande donnée, la preuve vient de la fiche du projet : tests ou vérification du typage.
  const step = t.steps.find((s) => s.id === req.params.step);
  const prof = PROJECT_DIRS[t.projectId] ? profileOf(t.projectId) : undefined;
  const command = req.body?.command ?? (step?.proof.kind === 'tests' ? prof?.commands.test : step?.proof.kind === 'commande' ? prof?.commands.check : undefined);
  return { message: await engine.proveStep(t.id, req.params.step, { ...req.body, command, cwd: PROJECT_DIRS[t.projectId] }, req.body?.who ?? 'agent') };
});
app.post<Id & { Body: { who?: string } }>('/api/tickets/:id/agent-done', async (req) => {
  const ok = { 'Critères tenus': 'ok', 'Tests verts': 'ok', 'Périmètre respecté': 'ok', 'Aucun secret': 'ok', 'Aucune nouvelle faille': 'ok', 'Documentation à jour': 'ok' } as const;
  return { message: engine.agentDone(req.params.id, { criteriaOk: true, checks: ok }) };
});
// Lire un fichier réalisé par un ticket (contenu ou changements), depuis sa branche.
// Seulement les fichiers listés dans « Réalisé », jamais un fichier sensible.
app.get<Id & { Querystring: { path?: string; diff?: string } }>('/api/tickets/:id/file', async (req) => {
  const t = engine.ticket(req.params.id);
  const repo = PROJECT_DIRS[t.projectId];
  const path = req.query.path ?? '';
  if (!repo) throw new Refused('Ce projet d’exemple n’a pas de fichiers sur ce PC.');
  if (!t.realized?.files.some((f) => f.path === path)) throw new Refused('Ce fichier ne fait pas partie de ce que le ticket a réalisé.');
  if (/(^|\/)\.env|\.pem$|\.key$|id_rsa/i.test(path)) throw new Refused('Fichier sensible : il ne s’affiche pas.');
  if (req.query.diff) return { path, diff: diffFile(repo, t.id, path) };
  const content = fileAt(repo, t.id, path);
  if (content === undefined) throw new Refused(`${path} n’existe plus dans la branche du ticket.`);
  return { path, content };
});
app.get<Id>('/api/tickets/:id/live', async (req) => engine.liveFeed(req.params.id));
app.post<Id>('/api/tickets/:id/plan/redo', async (req) => ({ message: engine.replan(req.params.id) }));
app.post<Id>('/api/tickets/:id/plan/validate', async (req) => ({ message: engine.validatePlan(req.params.id) }));
app.post<Id & { Body: { text?: string } }>('/api/tickets/:id/message', async (req) => ({ message: engine.message(req.params.id, req.body?.text ?? '') }));
// Démonstration tant que les adaptateurs ne sont pas branchés (LBA-6, LBA-7) : joue un déroulé sur un projet d'exemple.
app.post<Id>('/api/tickets/:id/simulate-run', async (req) => ({ message: simulateRun(engine, req.params.id) }));
// Onglets réels (lot 1) : documents, git, tokens mesurés. Lecture seule, sans IA.
const repoOf = (id: string) => {
  const r = PROJECT_DIRS[id];
  if (!r) throw new Refused('Ce projet d’exemple n’a pas de dossier sur ce PC.');
  return r;
};
app.get<Id>('/api/projects/:id/docs', async (req) => {
  const docs = listDocs(repoOf(req.params.id));
  const c = choicesDoc(engine, req.params.id);
  if (c) { const { content: _, ...entry } = c; docs.push(entry); }
  // Chaque compte rendu a aussi son PDF (créé au premier clic) : size 0 = pas encore créé.
  for (const { content: _, ...entry } of reportDocs(engine, req.params.id)) docs.push(entry, { ...entry, path: entry.path.replace(/\.md$/, '.pdf'), size: 0 });
  return docs;
});
app.get<Id & { Querystring: { path?: string } }>('/api/projects/:id/doc', async (req) => {
  if (req.query.path === CHOICES_PATH) return { path: CHOICES_PATH, content: choicesDoc(engine, req.params.id)?.content ?? '' };
  if (req.query.path?.startsWith(REPORTS_DIR)) return { path: req.query.path, content: reportDocs(engine, req.params.id).find((d) => d.path === req.query.path)?.content ?? '' };
  return { path: req.query.path, content: readDoc(repoOf(req.params.id), req.query.path ?? '') };
});
// PDF ouvert directement dans le navigateur (affichage, pas téléchargement).
const pdf = (reply: { header: (k: string, v: string) => unknown; type: (t: string) => unknown; send: (b: Buffer) => unknown }, body: Buffer, name: string) => {
  reply.header('Content-Disposition', `inline; filename="${name.replace(/[^\w.-]/g, '_')}"`);
  reply.type('application/pdf');
  return reply.send(body);
};
app.get<Id & { Querystring: { path?: string } }>('/api/projects/:id/raw', async (req, reply) => {
  const path = req.query.path ?? '';
  // Compte rendu : PDF créé à la demande depuis la page calculée (décision 0013).
  if (path.startsWith(REPORTS_DIR) && path.endsWith('.pdf')) {
    const doc = reportDocs(engine, req.params.id).find((d) => d.path === path.replace(/\.pdf$/, '.md'));
    if (!doc) throw new Refused('Ce compte rendu n’existe pas (ou plus).');
    return pdf(reply, await reportPdf(repoOf(req.params.id), path, doc.content), path.split('/').pop() ?? 'compte-rendu.pdf');
  }
  return pdf(reply, readPdf(repoOf(req.params.id), path), path.split('/').pop() ?? 'document.pdf');
});
app.get<Id & { Querystring: { path?: string } }>('/api/tickets/:id/raw', async (req, reply) => {
  const t = engine.ticket(req.params.id);
  const path = req.query.path ?? '';
  if (!path.endsWith('.pdf') || !t.realized?.files.some((f) => f.path === path)) throw new Refused('Ce PDF ne fait pas partie de ce que le ticket a réalisé.');
  const body = fileBytesAt(repoOf(t.projectId), t.id, path);
  if (!body) throw new Refused(`${path} n’existe plus dans la branche du ticket.`);
  return pdf(reply, body, path.split('/').pop() ?? 'document.pdf');
});
// Git en schéma (point 3) : graphe, détail d'un commit, « Repartir d'ici », annuler un ticket réuni.
app.get<Id>('/api/projects/:id/graph', async (req) => gitGraph(repoOf(req.params.id)));
app.get<Id & { Querystring: { hash?: string } }>('/api/projects/:id/commit', async (req) => commitInfo(repoOf(req.params.id), req.query.hash ?? ''));
app.post<Id & { Body: { hash: string } }>('/api/projects/:id/git/branch', async (req) => ({ message: branchFrom(repoOf(req.params.id), String(req.body?.hash ?? '')) }));
// Annuler un ticket déjà réuni : un commit d'annulation dans main (jamais d'effacement), puis les tests.
app.post<Id & { Body: { hash: string } }>('/api/projects/:id/git/revert', async (req) => {
  const repo = repoOf(req.params.id);
  const node = gitGraph(repo, 200).nodes.find((n) => n.hash === req.body?.hash);
  if (!node || node.kind !== 'reunion') throw new Refused('Seule la réunion d’un ticket dans main peut être annulée ici.');
  assertMainReady(repo);
  const rev = revertMerge(repo, node.hash);
  const test = profileOf(req.params.id).commands.test;
  const r = test ? await runCommand(test, { cwd: repo }) : undefined;
  return { message: `Réunion ${node.short}${node.ticket ? ` (${node.ticket})` : ''} annulée par le commit ${rev} ; l’historique est gardé.${r ? (r.ok ? ' Tests verts.' : ` Attention, tests rouges : ${r.summary.split('\n')[0]}`) : ''}` };
});
app.get<Id>('/api/projects/:id/git', async (req) => gitInfo(repoOf(req.params.id)));
// Cahier des charges (point 2) : exigences lues dans le cahier, liens avec les tickets, discussion avec l'Architecte.
app.get<Id>('/api/projects/:id/cdc', async (req) => {
  const c = readCdc(repoOf(req.params.id));
  return { title: c.title, intro: c.intro, version: c.version, sections: c.sections, requirements: c.requirements, path: CDC_PATH };
});
app.get<Id>('/api/projects/:id/architect', async (req) => ({ busy: architectBusy(req.params.id), reviews: engine.reviews(req.params.id) }));
// Architecte autonome (décision 0014) : vous lui écrivez, il agit avec la commande lba ; son fil garde tout.
app.get<Id>('/api/projects/:id/architecte', async (req) => ({ busy: architectRunning(req.params.id), thread: engine.architectThread(req.params.id) }));
app.post<Id & { Body: { text?: string } }>('/api/projects/:id/architecte', async (req) => {
  if (!PROJECT_DIRS[req.params.id]) throw new Refused('Les projets d’exemple n’ont pas d’Architecte branché.');
  return { message: askArchitectAgent(engine, req.params.id, repoOf(req.params.id), req.body?.text ?? '') };
});
app.post<Id & { Body: { mode?: string; question?: string } }>('/api/projects/:id/architect', async (req) => ({ message: askArchitect(engine, req.params.id, repoOf(req.params.id), req.body ?? {}) }));
app.post<Id & { Body: { review: number; index: number; decision: 'acceptee' | 'refusee' } }>('/api/projects/:id/architect/decide', async (req) =>
  ({ message: engine.decideProposal(req.params.id, Number(req.body.review), Number(req.body.index), req.body.decision === 'acceptee' ? 'acceptee' : 'refusee') }));
app.post<Id & { Body: { refs: string[] } }>('/api/tickets/:id/requirements', async (req) => ({ message: engine.linkRequirements(req.params.id, req.body?.refs ?? []) }));
app.get<Id>('/api/projects/:id/usage', async (req) => engine.usage(req.params.id));
app.post<Id & { Body: { reportId: string } }>('/api/projects/:id/report', async (req) => ({ tickets: engine.report(req.params.id, req.body.reportId) }));

// Flux en direct : l'interface est prévenue à chaque changement et relit les données.
app.get('/api/stream', (req, reply) => {
  reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  reply.raw.write('data: hello\n\n');
  const off = engine.onChange(() => reply.raw.write('data: change\n\n'));
  const ping = setInterval(() => reply.raw.write(': ping\n\n'), 25_000);
  req.raw.on('close', () => { off(); clearInterval(ping); });
});

// Vrais agents : démarrés au lancement d'un ticket d'un vrai projet (Claude Code, abonnement du propriétaire).
const supervisor = startSupervisor(engine, PROJECT_DIRS, (p) => profileOf(p));

app.listen({ port: PORT, host: '127.0.0.1' })
  .then(() => console.log(`Moteur prêt sur http://127.0.0.1:${PORT}`))
  .catch((err) => { console.error(`Le moteur n’a pas pu démarrer : ${err.message}`); process.exit(1); });
