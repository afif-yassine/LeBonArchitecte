// Serveur local du Bon Architecte. Écoute seulement sur 127.0.0.1 : rien n'est exposé au réseau.
import Fastify from 'fastify';
import { join } from 'node:path';
import { openDb } from './db.ts';
import { Engine } from './engine.ts';
import { Refused } from './tickets.ts';
import { simulateRun } from './simulate.ts';
import { writeProfile, type ProjectProfile } from './scan.ts';
import { startSupervisor } from './supervisor.ts';
import { humanActions, tickets as seedTickets } from '../src/mock/data.ts';

const PORT = Number(process.env.LBA_PORT ?? 4317);
// Dossier de chaque vrai projet. Les projets d'exemple n'en ont pas.
const PROJECT_DIRS: Record<string, string> = { lba: process.cwd() };
const engine = new Engine(openDb(join(process.cwd(), '.lba', 'lba.db')));
if (engine.isEmpty()) engine.seed(seedTickets, humanActions); // premier démarrage : tickets de démonstration
else engine.seedActionsOnce(humanActions);

const app = Fastify({ logger: false });

// Toute règle refusée devient une réponse 409 avec une explication en clair.
app.setErrorHandler((err, _req, reply) => {
  if (err instanceof Refused) return reply.code(409).send({ message: err.message });
  const e = err as Error;
  console.error(e);
  return reply.code(500).send({ message: `Erreur du serveur : ${e.message}` });
});

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
app.get('/api/pilot', async () => engine.pilot());
app.get('/api/actions', async () => engine.actions());
app.post<Id & { Body: { label?: string } }>('/api/actions/:id/resolve', async (req) => ({ message: engine.resolveAction(req.params.id, req.body?.label ?? 'Fait') }));
app.post<Id & { Body: { dir?: -1 | 1 | 'tete' } }>('/api/tickets/:id/priority', async (req) => ({ message: engine.reorder(req.params.id, req.body?.dir ?? 'tete') }));
app.put<{ Body: Record<string, unknown> }>('/api/pilot', async (req) => engine.setPilot(req.body as never));

app.post<Id & { Body: { replace?: string; manual?: boolean; who?: string } }>('/api/tickets/:id/launch', async (req) => ({ message: engine.launch(req.params.id, { replace: req.body?.replace, manual: req.body?.manual, actor: req.body?.who }) }));
app.post<Id>('/api/tickets/:id/stop', async (req) => ({ message: engine.stop(req.params.id) }));
app.post<Id>('/api/tickets/:id/validate', async (req) => ({ message: await supervisor.validate(req.params.id) }));
app.post<Id & { Body: { title: string; context?: string; expected: string; criteria?: string[]; deps?: string[]; part?: string } }>('/api/projects/:id/tickets', async (req) => {
  if (!PROJECT_DIRS[req.params.id]) throw new Refused('Les projets d’exemple ne reçoivent pas de nouveaux tickets.');
  const t = engine.createTicket(req.params.id, { ...req.body, criteria: req.body.criteria ?? [] });
  return { message: `${t.id} créé avec un plan de ${t.steps.length} étapes, à valider.`, ticket: t };
});
app.post<Id & { Body: { problem?: string } }>('/api/tickets/:id/reject', async (req) => ({ message: engine.reject(req.params.id, req.body?.problem ?? '') }));
app.post<Id & { Body: { command?: string } }>('/api/tickets/:id/run', async (req) => {
  const t = engine.ticket(req.params.id);
  const dir = PROJECT_DIRS[t.projectId];
  if (!dir) throw new Refused('Ce projet d’exemple n’a pas de dossier sur ce PC : rien à exécuter.');
  const r = await engine.run(t.id, req.body?.command ?? '', dir, 'vous');
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
app.get<Id>('/api/tickets/:id/live', async (req) => engine.liveFeed(req.params.id));
app.post<Id>('/api/tickets/:id/plan/validate', async (req) => ({ message: engine.validatePlan(req.params.id) }));
app.post<Id & { Body: { text?: string } }>('/api/tickets/:id/message', async (req) => ({ message: engine.message(req.params.id, req.body?.text ?? '') }));
// Démonstration tant que les adaptateurs ne sont pas branchés (LBA-6, LBA-7) : joue un déroulé sur un projet d'exemple.
app.post<Id>('/api/tickets/:id/simulate-run', async (req) => ({ message: simulateRun(engine, req.params.id) }));
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
