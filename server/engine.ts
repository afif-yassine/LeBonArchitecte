// Le moteur : il écrit chaque événement dans le journal, met à jour la vue des tickets dans la même
// transaction, puis applique les règles (0 token). Aucune IA ici.
import type { DatabaseSync } from 'node:sqlite';
import type { HumanAction, LiveItem, LiveKind, Ticket, TicketActivity } from '../src/shared/contract.ts';
import { Refused, assertMove, lastProvedStep, reduce, type EngineEvent } from './tickets.ts';
import { runCommand, type RunResult } from './executor.ts';
import { draftPlan } from '../src/shared/plan.ts';
import { budgetReached, checkDone, DAY_BUDGET, isReady, MAX_REPAIRS, nextReady, pickModel, running, type PilotSettings } from './rules.ts';
import type { MilestoneStats } from '../src/shared/targets.ts';

type Listener = () => void;
const now = () => new Date().toISOString();
const DEFAULT_PILOT: PilotSettings = { on: true, maxParallel: 2, stopAtLotEnd: true, respectBudget: true, dayBudget: DAY_BUDGET };
// Minuit à l'heure du PC : le « jour » du budget est celui du propriétaire.
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

export class Engine {
  private listeners = new Set<Listener>();
  private db: DatabaseSync;
  constructor(db: DatabaseSync) { this.db = db; }

  // ---------- Lecture ----------
  tickets(project?: string): Ticket[] {
    const rows = (project
      ? this.db.prepare('SELECT data FROM tickets WHERE project = ?').all(project)
      : this.db.prepare('SELECT data FROM tickets').all()) as { data: string }[];
    return rows.map((r) => JSON.parse(r.data) as Ticket);
  }

  ticket(id: string): Ticket {
    const row = this.db.prepare('SELECT data FROM tickets WHERE id = ?').get(id) as { data: string } | undefined;
    if (!row) throw new Refused(`Le ticket ${id} n’existe pas.`);
    return JSON.parse(row.data) as Ticket;
  }

  events(filter: { project?: string; ticket?: string; limit?: number } = {}): EngineEvent[] {
    const where = filter.ticket ? 'WHERE ticket = ?' : filter.project ? 'WHERE project = ?' : '';
    const args = filter.ticket ? [filter.ticket] : filter.project ? [filter.project] : [];
    const rows = this.db.prepare(`SELECT * FROM events ${where} ORDER BY id DESC LIMIT ${Math.min(filter.limit ?? 200, 1000)}`).all(...args) as (Omit<EngineEvent, 'data'> & { data: string })[];
    return rows.map((r) => ({ ...r, data: JSON.parse(r.data) }));
  }

  pilot(): PilotSettings {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = 'pilot'").get() as { value: string } | undefined;
    return row ? { ...DEFAULT_PILOT, ...JSON.parse(row.value) } : DEFAULT_PILOT;
  }

  // Tokens mesurés depuis minuit, tous projets.
  spentToday(): number {
    const r = this.db.prepare("SELECT COALESCE(SUM(json_extract(data, '$.used')), 0) AS n FROM events WHERE type = 'tokens' AND at >= ?").get(startOfToday().toISOString()) as { n: number };
    return r.n;
  }

  // Réglages du pilote et où en est le budget du jour (pour l'interface).
  pilotState(): PilotSettings & { spentToday: number; budgetHit: boolean } {
    const p = this.pilot();
    const spentToday = this.spentToday();
    return { ...p, spentToday, budgetHit: budgetReached(spentToday, p) };
  }

  // Actions « Pour vous » encore ouvertes : ouvertes moins résolues, dans l'ordre du journal.
  actions(project?: string): HumanAction[] {
    const rows = this.db.prepare("SELECT type, data FROM events WHERE type IN ('action-ouverte', 'action-resolue') ORDER BY id").all() as { type: string; data: string }[];
    const open = new Map<string, HumanAction>();
    for (const r of rows) {
      const d = JSON.parse(r.data);
      if (r.type === 'action-ouverte') open.set(d.action.id, d.action); else open.delete(d.id);
    }
    return [...open.values()].filter((a) => !project || a.projectId === project);
  }

  // Ajoute les actions d'exemple une seule fois, sans toucher au reste (bases créées avant LBA-4).
  seedActionsOnce(actions: HumanAction[]): void {
    const n = (this.db.prepare("SELECT COUNT(*) AS n FROM events WHERE type = 'action-ouverte'").get() as { n: number }).n;
    if (n > 0) return;
    for (const a of actions) this.record({ project: a.projectId, type: 'action-ouverte', actor: 'programme', data: { action: a } });
    this.changed();
  }

  // Recalcule chaque ticket depuis son journal (au démarrage). Le journal est la source, la table
  // « tickets » n'est qu'une vue : quand le calcul d'un ticket s'enrichit (ex. détail des tokens),
  // les anciens tickets en profitent aussi, sans rien perdre.
  rebuild(): number {
    const rows = this.db.prepare('SELECT * FROM events WHERE ticket IS NOT NULL ORDER BY id').all() as (Omit<EngineEvent, 'data'> & { data: string })[];
    const views = new Map<string, Ticket>();
    for (const r of rows) {
      const ev = { ...r, data: JSON.parse(r.data) } as EngineEvent;
      const after = reduce(ev.type === 'ticket-cree' ? undefined : views.get(ev.ticket!), ev);
      if (after) views.set(after.id, after);
    }
    this.db.exec('BEGIN');
    try {
      const put = this.db.prepare('INSERT OR REPLACE INTO tickets (id, project, data) VALUES (?, ?, ?)');
      for (const t of views.values()) put.run(t.id, t.projectId, JSON.stringify(t));
      this.db.exec('COMMIT');
    } catch (err) { this.db.exec('ROLLBACK'); throw err; }
    return views.size;
  }

  isEmpty(): boolean {
    return ((this.db.prepare('SELECT COUNT(*) AS n FROM events').get() as { n: number }).n) === 0;
  }

  // ---------- Écriture : un événement = une ligne du journal + la vue à jour ----------
  // Qui agit à la place de « vous » (l'Architecte, via la commande lba) : réglé par le serveur pour chaque requête.
  actorOverride?: () => string | undefined;

  private record(e: Omit<EngineEvent, 'at'>): number {
    const ev: EngineEvent = { ...e, actor: e.actor === 'vous' ? (this.actorOverride?.() ?? 'vous') : e.actor, at: now() };
    this.db.exec('BEGIN');
    let id = 0;
    try {
      id = Number(this.db.prepare('INSERT INTO events (at, project, ticket, type, actor, data) VALUES (?, ?, ?, ?, ?, ?)')
        .run(ev.at, ev.project, ev.ticket ?? null, ev.type, ev.actor, JSON.stringify(ev.data)).lastInsertRowid);
      if (ev.ticket) {
        const before = ev.type === 'ticket-cree' ? undefined : this.ticket(ev.ticket);
        const after = reduce(before, ev);
        if (after) this.db.prepare('INSERT OR REPLACE INTO tickets (id, project, data) VALUES (?, ?, ?)').run(after.id, after.projectId, JSON.stringify(after));
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
    return id;
  }

  private changed(): void { this.listeners.forEach((l) => l()); }
  // Prévenir l'interface d'un changement qui n'est pas un événement (ex. : l'Architecte commence à réfléchir).
  notify(): void { this.changed(); }
  onChange(l: Listener): () => void { this.listeners.add(l); return () => this.listeners.delete(l); }

  // ---------- Commandes ----------
  seed(tickets: Ticket[], actions: HumanAction[] = []): void {
    for (const t of tickets) this.record({ project: t.projectId, ticket: t.id, type: 'ticket-cree', actor: 'programme', data: { ticket: t } });
    for (const a of actions) this.record({ project: a.projectId, type: 'action-ouverte', actor: 'programme', data: { action: a } });
    this.changed();
  }

  setPilot(p: Partial<PilotSettings>): PilotSettings {
    if (p.dayBudget !== undefined && !(Number.isFinite(p.dayBudget) && p.dayBudget > 0)) throw new Refused('Le budget du jour doit être un nombre de tokens positif.');
    const next = { ...this.pilot(), ...p };
    this.db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('pilot', ?)").run(JSON.stringify(next));
    this.record({ project: '*', type: 'pilote-regle', actor: 'vous', data: { ...p } });
    this.changed();
    return next;
  }

  // manual : travail fait hors agent (par vous ou par une session Claude Code) ; aucun agent ne démarre,
  // mais les étapes restent à prouver par le programme comme pour un agent.
  launch(id: string, opts: { replace?: string; actor?: string; manual?: boolean } = {}): string {
    const t = this.ticket(id);
    assertMove(t, 'en-cours');
    const all = this.tickets(t.projectId);
    const pilot = this.pilot();
    if (!isReady(t, all) && opts.actor === 'pilote') throw new Refused(`${id} attend ${t.deps.join(', ')}.`);
    if (!t.planOk && opts.actor === 'pilote') throw new Refused(`Le plan de ${id} n’est pas validé : le pilote ne le lance pas.`);
    if (opts.actor === 'pilote' && this.budgetHit(t.projectId)) throw new Refused(`Budget du jour atteint : le pilote ne lance pas ${id}.`);
    const busy = running(all, t.projectId);
    if (busy.length >= pilot.maxParallel && !opts.replace) {
      throw new Refused(`Plus de place : ${busy.map((b) => b.id).join(' et ')} ${busy.length > 1 ? 'sont' : 'est'} en cours (${pilot.maxParallel} au plus). Arrêtez-en un ou mettez ${id} en tête de file.`);
    }
    let msg = '';
    if (!t.planOk) { this.record({ project: t.projectId, ticket: id, type: 'plan-valide', actor: opts.actor ?? 'vous', data: {} }); msg = 'Plan validé. '; }
    if (opts.replace) { this.stop(opts.replace, false, `remplacé par ${id}`); msg =`${opts.replace} arrêté proprement, passation écrite. `; }
    const { model, reason } = pickModel(t, t.loops > 1);
    this.record({ project: t.projectId, ticket: id, type: 'ticket-lance', actor: opts.actor ?? 'vous', data: { model, reason, ...(opts.manual ? { manual: true } : {}) } });
    this.changed();
    return `${msg}${id} démarre sur ${model}. ${reason}`;
  }

  // Sans raison : mis en pause par vous (le pilote ne le relance pas). Avec raison : repart seul en tête de file.
  // Ce que le programme fait sur le ticket (valider, tester), affiché en haut de la fiche, avec l'erreur.
  setActivity(id: string, activity: TicketActivity | null): void {
    const t = this.ticket(id);
    this.record({ project: t.projectId, ticket: id, type: 'activite', actor: 'programme', data: { activity } });
    this.changed();
  }

  // Un problème que l'agent peut résoudre (conflit, tests rouges) : le ticket ne reste jamais bloqué
  // « à tester », il passe en « Besoin d'action » avec la cause et le bouton « Demander à l'agent ».
  needsAction(id: string, cause: string): void {
    const t = this.ticket(id);
    if (t.status === 'action') return;
    assertMove(t, 'action');
    this.record({ project: t.projectId, ticket: id, type: 'besoin-action', actor: 'programme', data: { cause } });
    this.changed();
  }

  stop(id: string, notify = true, reason?: string): string {
    const t = this.ticket(id);
    assertMove(t, 'a-faire');
    this.record({ project: t.projectId, ticket: id, type: 'ticket-arrete', actor: 'vous', data: reason ? { reason } : {} });
    if (notify) this.changed();
    return reason ? `${id} arrêté, il repartira en tête de file.` : `${id} mis en pause : son travail est gardé dans sa branche. « Reprendre » le relance dans sa session.`;
  }

  // Pause : un ticket en cours est arrêté (travail gardé) ; un ticket en file n'est plus pris par le pilote.
  pause(id: string): string {
    const t = this.ticket(id);
    if (t.status === 'en-cours') return this.stop(id);
    if (t.status !== 'a-faire') throw new Refused(`${id} n’est ni en cours ni en file : rien à mettre en pause.`);
    if (t.paused) return `${id} est déjà en pause.`;
    this.record({ project: t.projectId, ticket: id, type: 'ticket-pause', actor: 'vous', data: { paused: true } });
    this.changed();
    return `${id} mis en pause : le pilote ne le lancera pas avant « Reprendre ».`;
  }

  // Reprendre : il repart tout de suite s'il y a une place (dans sa session s'il en a une), sinon en tête de file.
  // Un seul « Reprendre » : un ticket mis en pause par vous, ou interrompu par une panne (LBA-16).
  resume(id: string): string {
    const t = this.ticket(id);
    if (t.status === 'action' && t.interrupted) return this.resumeInterrupted(id);
    return this.resumePaused(id);
  }

  private resumePaused(id: string): string {
    const t = this.ticket(id);
    if (t.status !== 'a-faire' || !t.paused) throw new Refused(`${id} n’est ni en pause ni interrompu : rien à reprendre.`);
    this.record({ project: t.projectId, ticket: id, type: 'ticket-pause', actor: 'vous', data: { paused: false } });
    this.record({ project: t.projectId, ticket: id, type: 'priorite', actor: 'vous', data: { priority: 0 } });
    try {
      return this.launch(id);
    } catch (err) {
      if (!(err instanceof Refused)) throw err;
      this.changed();
      return `${id} repris : il attend en tête de file (${err.message})`;
    }
  }

  // Plus aucun agent ne travaille sur ce ticket (PC éteint, panne, espace de travail impossible) :
  // il ne reste pas « en cours » ; il attend votre « Reprendre », avec sa dernière étape prouvée.
  interrupt(id: string, reason: string): string {
    const t = this.inProgress(id);
    const lastProved = lastProvedStep(t)?.label;
    const cause = `${reason} ${lastProved ? `Dernière étape prouvée : « ${lastProved} ».` : 'Aucune étape prouvée pour l’instant.'}`;
    this.record({ project: t.projectId, ticket: id, type: 'ticket-interrompu', actor: 'programme', data: { cause, ...(lastProved ? { lastProved } : {}) } });
    this.changed();
    return cause;
  }

  // « Reprendre » après une panne : le ticket repart avec ses preuves ; le superviseur lui donne sa passation.
  private resumeInterrupted(id: string): string {
    const t = this.ticket(id);
    if (t.status !== 'action' || !t.interrupted) throw new Refused(`${id} n’a pas été interrompu : rien à reprendre.`);
    const until = this.quotaUntil();
    if (until) throw new Refused(`Limite de l’abonnement jusqu’à ${new Date(until).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} : reprenez ${id} après cette heure.`);
    const busy = running(this.tickets(t.projectId), t.projectId);
    if (busy.length >= this.pilot().maxParallel) throw new Refused(`Plus de place : ${busy.map((b) => b.id).join(' et ')} ${busy.length > 1 ? 'sont' : 'est'} en cours. Arrêtez-en un ou attendez sa fin pour reprendre ${id}.`);
    this.record({ project: t.projectId, ticket: id, type: 'ticket-repris', actor: 'vous', data: {} });
    this.changed();
    return `${id} reprend avec sa passation, sans refaire les étapes prouvées.`;
  }

  // Dernier départ d'un ticket. Requête dédiée : un long direct ne doit jamais le faire disparaître.
  lastStart(id: string): EngineEvent | undefined {
    const r = this.db.prepare("SELECT * FROM events WHERE ticket = ? AND type IN ('ticket-lance', 'reclamation', 'reparation', 'ticket-repris') ORDER BY id DESC LIMIT 1").get(id) as (Omit<EngineEvent, 'data'> & { data: string }) | undefined;
    return r ? { ...r, data: JSON.parse(r.data) } : undefined;
  }

  // Réclamation pas encore traitée : aucun passage « à tester » depuis qu'elle a été écrite.
  openComplaint(id: string): string | undefined {
    const r = this.db.prepare("SELECT type, data FROM events WHERE ticket = ? AND type IN ('reclamation', 'ticket-a-tester') ORDER BY id DESC LIMIT 1").get(id) as { type: string; data: string } | undefined;
    return r?.type === 'reclamation' ? String(JSON.parse(r.data).problem ?? '') : undefined;
  }

  // Limite d'abonnement atteinte (ex. « 5-hour limit ») : ce n'est pas un échec du ticket.
  // Il repart en tête de file (sa session est gardée pour reprendre sans tout refaire) et le pilote
  // ne lance plus rien avant l'heure de retour : sinon chaque ticket lancé s'arrête aussitôt.
  quotaPause(id: string, until: string, message: string): string {
    const t = this.ticket(id);
    this.db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('quota-until', ?)").run(until);
    if (t.status === 'en-cours' || t.status === 'action') {
      this.record({ project: t.projectId, ticket: id, type: 'ticket-arrete', actor: 'programme', data: { reason: 'limite de l’abonnement, sa session reprendra' } });
    }
    const at = new Date(until).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    this.live(id, { kind: 'systeme', ok: false, text: `Limite de l’abonnement atteinte : ${id} attend en tête de file. Reprise de sa session à ${at}.`, detail: message }, 'programme');
    this.changed();
    return at;
  }

  quotaUntil(): string | undefined {
    const r = this.db.prepare("SELECT value FROM settings WHERE key = 'quota-until'").get() as { value: string } | undefined;
    return r && new Date(r.value).getTime() > Date.now() ? r.value : undefined;
  }

  // Fin d'un agent. « result » vient de l'adaptateur (plus tard) ou d'une simulation (maquette).
  // repair : le superviseur a vérifié qu'une réparation automatique peut aider (voir canAutoRepair).
  agentDone(id: string, result: { criteriaOk: boolean; checks: Record<string, 'ok' | 'echec' | 'non-verifie'> }, opts: { repair?: boolean } = {}): string {
    const t = this.ticket(id);
    if (t.status !== 'en-cours') throw new Refused(`${id} n’est pas en cours.`);
    this.record({ project: t.projectId, ticket: id, type: 'agent-termine', actor: t.agentId ?? 'agent', data: result });
    const after = this.ticket(id);
    const verdict = checkDone(after);
    let msg: string;
    if (verdict.ok) {
      this.record({ project: t.projectId, ticket: id, type: 'ticket-a-tester', actor: 'programme', data: {} });
      msg = `${id} est prêt à tester : définition de fini vérifiée.`;
    } else {
      const missing = verdict.missing.join(', ');
      const used = this.repairsUsed(id);
      const noBudget = budgetReached(this.spentToday(), this.pilot());
      if (opts.repair && used < MAX_REPAIRS && !noBudget) {
        this.record({ project: t.projectId, ticket: id, type: 'reparation', actor: 'programme', data: { cause: `Pas fini : ${missing}.` } });
        this.changed();
        return `${id} n’est pas fini : réparation automatique lancée (une seule tentative). Manque : ${missing}.`;
      }
      const cause = `Pas fini${used ? ' après la réparation automatique' : ''} : ${missing}.${opts.repair && !used && noBudget ? ' Pas de réparation automatique : budget du jour atteint.' : ''}`;
      this.record({ project: t.projectId, ticket: id, type: 'besoin-action', actor: 'programme', data: { cause } });
      msg = `${id} n’est pas fini, il passe en « Besoin d’action ». ${cause}`;
    }
    msg += this.runPilot(t.projectId, t.lot);
    this.changed();
    return msg;
  }

  // Réparations déjà faites depuis votre dernier lancement ou votre dernière réclamation.
  // Une relance par le pilote (après une limite d'abonnement) ne redonne pas de tentative.
  private repairsUsed(id: string): number {
    const r = this.db.prepare(`SELECT COUNT(*) AS n FROM events WHERE ticket = ? AND type = 'reparation' AND id > COALESCE(
      (SELECT MAX(id) FROM events WHERE ticket = ? AND actor = 'vous' AND type IN ('ticket-lance', 'reclamation')), 0)`).get(id, id) as { n: number };
    return r.n;
  }

  validate(id: string): string {
    const t = this.ticket(id);
    assertMove(t, 'termine');
    this.record({ project: t.projectId, ticket: id, type: 'ticket-valide', actor: 'vous', data: {} });
    this.closeReunion(id);
    const msg = `${id} validé. Il sera réuni dans main avec un point de retour.${this.runPilot(t.projectId, t.lot)}`;
    this.changed();
    return msg;
  }

  // small : petite correction ciblée (conflit, test rouge) demandée par « Demander à l'agent de résoudre ».
  reject(id: string, problem: string, small = false): string {
    const t = this.ticket(id);
    assertMove(t, 'en-cours');
    if (!problem.trim()) throw new Refused('Décrivez ce qui ne marche pas : l’agent en a besoin pour corriger.');
    this.record({ project: t.projectId, ticket: id, type: 'reclamation', actor: 'vous', data: small ? { problem, small } : { problem } });
    this.closeReunion(id);
    this.changed();
    return `Réclamation enregistrée sur ${id}. Le même agent reprend avec votre description.`;
  }

  report(project: string, reportId: string): string[] {
    const ids = this.tickets(project).filter((t) => (t.status === 'termine' || t.status === 'a-tester') && !t.reportedIn).map((t) => t.id);
    for (const id of ids) this.record({ project, ticket: id, type: 'rapporte', actor: 'programme', data: { report: reportId } });
    this.changed();
    return ids;
  }

  // Refaire le plan avec les règles à jour, tant qu'aucune étape n'est prouvée (rien n'est perdu).
  replan(id: string): string {
    const t = this.ticket(id);
    if (t.status === 'termine' || t.status === 'a-tester') throw new Refused(`${id} est fini : son plan ne change plus.`);
    if (t.steps.some((s) => s.state === 'prouve')) throw new Refused(`${id} a déjà des étapes prouvées : son plan ne change plus.`);
    const steps = draftPlan(t);
    this.record({ project: t.projectId, ticket: id, type: 'plan-refait', actor: 'programme', data: { steps } });
    this.changed();
    return `Plan de ${id} refait : ${steps.length} étapes.`;
  }

  validatePlan(id: string): string {
    const t = this.ticket(id);
    if (t.planOk) return `Le plan de ${id} est déjà validé.`;
    if (t.status !== 'a-faire') throw new Refused(`${id} a déjà démarré : son plan ne se valide plus.`);
    this.record({ project: t.projectId, ticket: id, type: 'plan-valide', actor: 'vous', data: {} });
    // Le pilote ne démarrait qu'à la fin d'un ticket : un plan validé alors que rien ne tourne restait en attente.
    const go = this.runPilot(t.projectId, t.lot);
    this.changed();
    return `Plan de ${id} validé : ${t.steps.length} étapes.${go || (this.pilot().on ? ' Le pilote le lancera dès qu’une place se libère.' : ' Pilote arrêté : lancez-le vous-même.')}`;
  }

  // ---------- Pendant le travail (adaptateurs, ou simulation en démonstration) ----------
  private inProgress(id: string): Ticket {
    const t = this.ticket(id);
    if (t.status !== 'en-cours') throw new Refused(`${id} n’est pas en cours.`);
    return t;
  }

  stepStart(id: string, step: string, who = 'agent'): void {
    const t = this.inProgress(id);
    if (!t.steps.some((s) => s.id === step)) throw new Refused(`${id} n’a pas d’étape ${step}.`);
    this.record({ project: t.projectId, ticket: id, type: 'etape-commencee', actor: who, data: { step } });
    this.changed();
  }

  // L'agent annonce une étape finie. « proof » vient du programme qui a vérifié (tests, fichier, commande) :
  // sans preuve, l'étape reste « annoncée, pas prouvée » et la définition de fini la bloquera.
  stepDone(id: string, step: string, proof: { ok: boolean; evidence: string }, who = 'agent'): string {
    const t = this.inProgress(id);
    const s = t.steps.find((x) => x.id === step);
    if (!s) throw new Refused(`${id} n’a pas d’étape ${step}.`);
    this.record({ project: t.projectId, ticket: id, type: 'etape-annoncee', actor: who, data: { step, proofOk: proof.ok, evidence: proof.evidence } });
    this.changed();
    return proof.ok ? `Étape prouvée : ${s.label}.` : `Étape annoncée mais pas prouvée : ${s.label}. ${proof.evidence}`;
  }

  live(id: string, item: { kind: LiveKind; text: string; detail?: string; ok?: boolean; step?: string }, who = 'agent'): void {
    const t = this.ticket(id);
    this.record({ project: t.projectId, ticket: id, type: 'direct', actor: who, data: { ...item } });
    this.changed();
  }

  // Une commande d'agent : refusée si interdite, sortie complète au journal, résumé seul dans le direct.
  async run(id: string, command: string, cwd: string, who = 'agent'): Promise<RunResult> {
    const t = this.ticket(id);
    try {
      const r = await runCommand(command, { cwd, ticket: id });
      this.live(id, { kind: 'commande', text: command, ok: r.ok, detail: `${r.summary}
Sortie complète : ${r.log} (${r.lines} lignes, ${(r.durationMs / 1000).toFixed(1)} s)` }, who);
      return r;
    } catch (err) {
      if (err instanceof Refused) this.record({ project: t.projectId, ticket: id, type: 'direct', actor: 'programme', data: { kind: 'systeme', ok: false, text: err.message } });
      this.changed();
      throw err;
    }
  }

  // Preuve d'une étape : le moteur lance lui-même la commande ; l'étape n'est cochée que si elle réussit.
  // Sans commande (relecture, capture), l'attestation est écrite au journal avec son auteur.
  async proveStep(id: string, step: string, o: { command?: string; evidence?: string; cwd?: string }, who = 'agent'): Promise<string> {
    const t = this.inProgress(id);
    const s = t.steps.find((x) => x.id === step);
    if (!s) throw new Refused(`${id} n’a pas d’étape ${step}.`);
    if (o.command) {
      if (!o.cwd) throw new Refused('Ce projet n’a pas de dossier sur ce PC : rien à exécuter.');
      this.stepStart(id, step, who);
      const r = await this.run(id, o.command, o.cwd, who);
      const first = r.summary.split('\n')[0];
      return this.stepDone(id, step, { ok: r.ok, evidence: `${o.command} : ${first}` }, who);
    }
    if (s.proof.kind === 'tests' || s.proof.kind === 'commande') throw new Refused(`L’étape « ${s.label} » se prouve par une commande (${s.proof.text}), pas par une déclaration.`);
    if (!o.evidence?.trim()) throw new Refused('Donnez la preuve : ce qui a été lu, ou la capture.');
    return this.stepDone(id, step, { ok: true, evidence: o.evidence.trim() }, who);
  }

  // Tokens mesurés par un adaptateur (Claude Code renvoie l'usage à la fin de chaque tour).
  // input / output / cacheWrite : le détail de « used » (entrée, sortie, cache écrit), pour la fiche du ticket.
  tokens(id: string, d: { used: number; cacheRead: number; costUsd: number; turns: number; input?: number; output?: number; cacheWrite?: number }): void {
    const t = this.ticket(id);
    this.record({ project: t.projectId, ticket: id, type: 'tokens', actor: 'programme', data: { ...d } });
    this.budgetHit(t.projectId); // prévient dès que le budget est franchi, sans attendre le prochain lancement
    this.changed();
  }

  // Session Claude de l'agent d'un ticket : sert à reprendre son travail si le moteur redémarre.
  setSession(id: string, sessionId: string): void {
    this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(`session:${id}`, sessionId);
  }
  sessionOf(id: string): string | undefined {
    return (this.db.prepare('SELECT value FROM settings WHERE key = ?').get(`session:${id}`) as { value: string } | undefined)?.value;
  }

  // Tokens réellement mesurés, par ticket et par jour (onglet Quotas). Aucune estimation.
  usage(project?: string): { total: { used: number; cacheRead: number; costUsd: number; runs: number }; byTicket: { id: string; title: string; used: number; cacheRead: number; costUsd: number; runs: number }[]; byDay: { day: string; used: number }[]; stats: MilestoneStats } {
    const rows = this.db.prepare(`SELECT at, ticket, data FROM events WHERE type = 'tokens'${project ? ' AND project = ?' : ''} ORDER BY id`).all(...(project ? [project] : [])) as { at: string; ticket: string; data: string }[];
    const total = { used: 0, cacheRead: 0, costUsd: 0, runs: 0 };
    const tk = new Map<string, { used: number; cacheRead: number; costUsd: number; runs: number }>();
    const day = new Map<string, number>();
    for (const r of rows) {
      const d = JSON.parse(r.data) as { used: number; cacheRead: number; costUsd: number };
      const x = tk.get(r.ticket) ?? { used: 0, cacheRead: 0, costUsd: 0, runs: 0 };
      for (const o of [x, total]) { o.used += d.used || 0; o.cacheRead += d.cacheRead || 0; o.costUsd += d.costUsd || 0; o.runs += 1; }
      tk.set(r.ticket, x);
      day.set(r.at.slice(0, 10), (day.get(r.at.slice(0, 10)) ?? 0) + (d.used || 0));
    }
    const title = (id: string) => { try { return this.ticket(id).title; } catch { return id; } };
    return {
      total,
      byTicket: [...tk].map(([id, v]) => ({ id, title: title(id), ...v })).sort((a, b) => b.used - a.used),
      byDay: [...day].map(([d, used]) => ({ day: d, used })),
      stats: this.milestoneStats(project, tk),
    };
  }

  // Mesures à comparer aux cibles des jalons, sur les tickets faits par un agent et arrivés « à tester ».
  // Temps : seulement quand l'agent travaille (les attentes et les arrêts ne comptent pas).
  // Premier coup : validé par vous sans réclamation ni réparation automatique.
  private milestoneStats(project: string | undefined, tokens: Map<string, { used: number }>): MilestoneStats {
    const rows = this.db.prepare(`SELECT at, ticket, type FROM events WHERE type IN ('ticket-lance', 'reclamation', 'reparation', 'ticket-a-tester', 'ticket-arrete', 'besoin-action', 'ticket-valide')${project ? ' AND project = ?' : ''} ORDER BY id`).all(...(project ? [project] : [])) as { at: string; ticket: string; type: string }[];
    const by = new Map<string, { open?: number; ms: number; finished: boolean; validated: boolean; redone: boolean }>();
    for (const r of rows) {
      const x = by.get(r.ticket) ?? { ms: 0, finished: false, validated: false, redone: false };
      by.set(r.ticket, x);
      const at = Date.parse(r.at);
      if (r.type === 'ticket-lance' || r.type === 'reclamation') x.open ??= at;
      if (r.type === 'reclamation' || r.type === 'reparation') x.redone = true;
      if (r.type === 'ticket-valide') x.validated = true;
      if (r.type === 'ticket-a-tester') x.finished = true;
      if ((r.type === 'ticket-a-tester' || r.type === 'ticket-arrete' || r.type === 'besoin-action') && x.open !== undefined) { x.ms += at - x.open; x.open = undefined; }
    }
    const done = [...by].filter(([id, x]) => x.finished && tokens.has(id));
    const validated = done.filter(([, x]) => x.validated);
    const avg = (n: number) => (done.length ? Math.round(n / done.length) : null);
    return {
      tickets: done.length,
      tokensPerTicket: avg(done.reduce((s, [id]) => s + tokens.get(id)!.used, 0)),
      firstTryPct: validated.length ? Math.round((validated.filter(([, x]) => !x.redone).length / validated.length) * 100) : null,
      minutesPerTicket: avg(done.reduce((s, [, x]) => s + x.ms, 0) / 60_000),
    };
  }

  // Ce qui a été réalisé, écrit par le programme à partir de git (sans IA).
  realized(id: string, realized: Ticket['realized']): void {
    const t = this.ticket(id);
    this.record({ project: t.projectId, ticket: id, type: 'reuni', actor: 'programme', data: { realized } });
    this.changed();
  }

  // Nouveau ticket : plan proposé par règles, à valider avant que le pilote le lance.
  // Lier un ticket aux exigences du cahier qu'il couvre (« E2 » en entier, « E2~ » en partie).
  linkRequirements(id: string, refs: string[]): string {
    const t = this.ticket(id);
    const clean = [...new Set(refs.map((r) => r.trim().toUpperCase()).filter((r) => /^[EA]\d{1,2}~?$/.test(r)))];
    this.record({ project: t.projectId, ticket: id, type: 'exigences-liees', actor: 'vous', data: { refs: clean } });
    this.changed();
    return `${id} couvre : ${clean.join(', ') || 'aucune exigence'}.`;
  }

  // Discussions avec l'Architecte sur le cahier des charges : gardées, avec leur coût mesuré.
  // Fil de l'Architecte (agent autonome, décision 0014) : vos messages, ses réponses, ses actions, ses tokens.
  architectSay(project: string, who: 'vous' | 'architecte' | 'action' | 'systeme', text: string, extra: Record<string, unknown> = {}): void {
    this.record({ project, type: 'architecte-fil', actor: who === 'vous' ? 'vous' : 'architecte', data: { who, text, ...extra } });
    this.changed();
  }
  architectThread(project: string, limit = 200): { id: number; at: string; who: string; text: string; [k: string]: unknown }[] {
    const rows = this.db.prepare("SELECT id, at, data FROM events WHERE project = ? AND type = 'architecte-fil' ORDER BY id DESC LIMIT ?").all(project, limit) as { id: number; at: string; data: string }[];
    return rows.reverse().map((r) => ({ id: r.id, at: r.at, ...JSON.parse(r.data) }));
  }
  // Tokens de l'Architecte : comptés dans le budget du jour comme ceux d'un ticket.
  architectTokens(project: string, d: { used: number; cacheRead: number; costUsd: number; turns: number; model: string }): void {
    this.record({ project, type: 'tokens', actor: 'architecte', data: { ...d, architecte: true } });
  }
  // Tokens d'aujourd'hui pour /usage : l'Architecte à part, puis chaque ticket. Mesurés, jamais estimés.
  usageToday(project: string): { architect: { used: number; cacheRead: number; costUsd: number; runs: number }; tickets: { id: string; used: number; costUsd: number }[] } {
    const rows = this.db.prepare("SELECT ticket, data FROM events WHERE type = 'tokens' AND project = ? AND at >= ?").all(project, startOfToday().toISOString()) as { ticket: string | null; data: string }[];
    const architect = { used: 0, cacheRead: 0, costUsd: 0, runs: 0 };
    const tk = new Map<string, { used: number; costUsd: number }>();
    for (const r of rows) {
      const d = JSON.parse(r.data) as { used?: number; cacheRead?: number; costUsd?: number; architecte?: boolean };
      if (d.architecte || !r.ticket) { architect.used += d.used ?? 0; architect.cacheRead += d.cacheRead ?? 0; architect.costUsd += d.costUsd ?? 0; architect.runs += 1; continue; }
      const x = tk.get(r.ticket) ?? { used: 0, costUsd: 0 };
      x.used += d.used ?? 0; x.costUsd += d.costUsd ?? 0; tk.set(r.ticket, x);
    }
    return { architect, tickets: [...tk].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.used - a.used) };
  }
  // Modèle choisi avec /modele pour les demandes suivantes ; vide = choix automatique.
  architectModel(project: string): 'Opus' | 'Sonnet' | undefined {
    const v = (this.db.prepare('SELECT value FROM settings WHERE key = ?').get(`architecte-modele:${project}`) as { value: string } | undefined)?.value;
    return v === 'Opus' || v === 'Sonnet' ? v : undefined;
  }
  setArchitectModel(project: string, model?: 'Opus' | 'Sonnet'): void {
    this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(`architecte-modele:${project}`, model ?? '');
    this.changed();
  }

  recordReview(project: string, data: { question: string; answer: unknown; tokens: number; model: string }): number {
    const id = this.record({ project, ticket: undefined, type: 'architecte-revue', actor: 'architecte', data });
    this.changed();
    return id;
  }

  reviews(project: string): { id: number; at: string; question: string; answer: unknown; tokens: number; model: string; decisions: Record<number, { decision: 'acceptee' | 'refusee'; ticket?: string }> }[] {
    const rows = this.db.prepare("SELECT id, at, type, data FROM events WHERE project = ? AND type IN ('architecte-revue', 'proposition-decidee') ORDER BY id").all(project) as { id: number; at: string; type: string; data: string }[];
    const out = new Map<number, ReturnType<Engine['reviews']>[number]>();
    for (const r of rows) {
      const d = JSON.parse(r.data);
      if (r.type === 'architecte-revue') out.set(r.id, { id: r.id, at: r.at, question: d.question, answer: d.answer, tokens: d.tokens, model: d.model, decisions: {} });
      else out.get(d.review)?.decisions && (out.get(d.review)!.decisions[d.index] = { decision: d.decision, ticket: d.ticket });
    }
    return [...out.values()].reverse();
  }

  // Une proposition de l'Architecte n'est jamais appliquée seule : vous l'acceptez (elle devient un ticket
  // « à faire », plan à valider, sans toucher au travail en cours) ou vous la refusez.
  decideProposal(project: string, review: number, index: number, decision: 'acceptee' | 'refusee'): string {
    const r = this.reviews(project).find((x) => x.id === review);
    const p = (r?.answer as { propositions?: { titre: string; pourquoi: string; attendu?: string; criteres?: string[]; exigences?: string[] }[] } | undefined)?.propositions?.[index];
    if (!r || !p) throw new Refused('Proposition introuvable.');
    if (r.decisions[index]) throw new Refused('Cette proposition a déjà été décidée.');
    let ticket: string | undefined;
    if (decision === 'acceptee') {
      const t = this.createTicket(project, { title: p.titre, context: `Proposé par l’Architecte : ${p.pourquoi}`, expected: p.attendu ?? p.titre, criteria: p.criteres?.length ? p.criteres : [p.attendu ?? p.titre], part: 'Cahier des charges' });
      if (p.exigences?.length) this.linkRequirements(t.id, p.exigences);
      ticket = t.id;
    }
    this.record({ project, ticket, type: 'proposition-decidee', actor: 'vous', data: { review, index, decision, ticket } });
    this.changed();
    return decision === 'acceptee' ? `Proposition acceptée : ${ticket} créé, plan à valider. Rien d’autre n’a changé.` : 'Proposition refusée.';
  }

  createTicket(project: string, o: { title: string; context?: string; expected: string; criteria: string[]; deps?: string[]; part?: string; lot?: number; model?: 'Opus' | 'Sonnet' | 'Haiku' }): Ticket {
    if (!o.title?.trim() || !o.expected?.trim()) throw new Refused('Un ticket a besoin d’un titre et de ce qui est attendu.');
    const all = this.tickets(project);
    const prefix = (all[0]?.id.split('-')[0]) ?? project.toUpperCase();
    const n = Math.max(0, ...all.map((x) => Number(x.id.split('-')[1]) || 0)) + 1;
    const base = {
      id: `${prefix}-${n}`, projectId: project, title: o.title.trim(), deps: o.deps ?? [], status: 'a-faire' as const,
      part: o.part ?? 'Général', lot: o.lot ?? Math.max(1, ...all.map((x) => x.lot)), tool: 'claude-code' as const, accountId: 'acc-claude-1',
      model: o.model ?? 'Sonnet', effort: 'moyen' as const, budget: 40000, used: 0, loops: 1, files: [],
      done: ['Critères tenus', 'Tests verts', 'Périmètre respecté', 'Aucun secret', 'Aucune nouvelle faille', 'Documentation à jour'].map((label) => ({ label, state: 'attente' as const })),
      priority: Math.max(0, ...all.filter((x) => x.status === 'a-faire').map((x) => x.priority)) + 1,
      criteria: o.criteria.filter((c) => c.trim()).map((text) => ({ text: text.trim(), done: false })),
      description: { context: o.context ?? '', expected: o.expected.trim(), outOfScope: 'Rien d’autre que les critères.', cdcRefs: [] },
    };
    const t: Ticket = { ...base, steps: draftPlan(base), planOk: false };
    this.record({ project, ticket: t.id, type: 'ticket-cree', actor: 'vous', data: { ticket: t } });
    this.changed();
    return t;
  }

  // Parler à l'agent qui a fait le travail. Sa conversation (session Claude) est gardée avec le ticket :
  // - en cours : le message attend la fin de son tour, puis l'agent reprend sa session avec lui ;
  // - à tester ou en besoin d'action : c'est une demande de modification, l'agent reprend sa session tout de suite ;
  // - fini (réuni dans main) : sa branche est close, une modification devient un nouveau ticket.
  message(id: string, text: string): string {
    const t = this.ticket(id);
    const msg = text.trim();
    if (!msg) throw new Refused('Le message est vide.');
    if (t.status === 'a-tester' || t.status === 'action') {
      this.reject(id, msg);
      return `Demande envoyée : l’agent de ${id} reprend sa conversation pour faire la modification. Le ticket repasse « En cours ».`;
    }
    if (t.status === 'termine') throw new Refused(`${id} est déjà réuni dans main : pour une modification, créez un nouveau ticket (sa conversation reste lisible dans le Direct).`);
    this.live(id, { kind: 'message', text: msg, detail: t.status === 'en-cours' ? 'En attente : l’agent le reçoit à la fin de son tour.' : 'Gardé : l’agent le recevra à son lancement.' }, 'vous');
    return t.status === 'en-cours' ? 'Message gardé : l’agent le reçoit dès la fin de son tour, puis continue dans sa conversation.' : 'Message gardé : l’agent le recevra à son lancement.';
  }

  // Messages de vous arrivés depuis un événement (ex. le départ du tour de l'agent), pas encore transmis.
  messagesSince(id: string, sinceId: number): string[] {
    return this.events({ ticket: id, limit: 200 })
      .filter((e) => (e.id ?? 0) > sinceId && e.type === 'direct' && e.actor === 'vous' && e.data.kind === 'message')
      .reverse().map((e) => String(e.data.text));
  }

  lastEventId(): number {
    return (this.db.prepare('SELECT MAX(id) AS m FROM events').get() as { m: number | null }).m ?? 0;
  }

  // Le direct d'un ticket : son journal, raconté en clair, du plus ancien au plus récent.
  liveFeed(id: string): LiveItem[] {
    const t = this.ticket(id);
    const label = (step: unknown) => t.steps.find((s) => s.id === step)?.label ?? String(step);
    return this.events({ ticket: id, limit: 600 }).reverse().flatMap((e): LiveItem[] => {
      const d = e.data;
      const base = { id: e.id ?? 0, at: e.at, who: e.actor };
      switch (e.type) {
        case 'direct': return [{ ...base, kind: d.kind as LiveKind, text: String(d.text), detail: d.detail as string | undefined, ok: d.ok as boolean | undefined, step: d.step as string | undefined }];
        case 'ticket-lance': return [{ ...base, kind: 'agent', text: `Lancé sur ${d.model}`, detail: String(d.reason ?? '') }];
        case 'ticket-arrete': return [{ ...base, kind: 'systeme', text: 'Arrêté proprement, passation écrite' }];
        case 'ticket-interrompu': return [{ ...base, kind: 'systeme', ok: false, text: String(d.cause) }];
        case 'ticket-repris': return [{ ...base, kind: 'systeme', text: 'Repris par vous, avec sa passation' }];
        case 'plan-valide': return [{ ...base, kind: 'etape', text: 'Plan validé', ok: true }];
        case 'etape-commencee': return [{ ...base, kind: 'etape', text: `Commence : ${label(d.step)}`, step: String(d.step) }];
        case 'etape-annoncee': return [{ ...base, kind: 'etape', ok: Boolean(d.proofOk), step: String(d.step), text: d.proofOk ? `Prouvé : ${label(d.step)}` : `Annoncé, pas prouvé : ${label(d.step)}`, detail: String(d.evidence ?? '') }];
        case 'agent-termine': return [{ ...base, kind: 'systeme', text: 'L’agent a fini son tour' }];
        case 'ticket-a-tester': return [{ ...base, kind: 'systeme', ok: true, text: 'Définition de fini vérifiée : prêt à tester' }];
        case 'besoin-action': return [{ ...base, kind: 'systeme', ok: false, text: String(d.cause) }];
        case 'ticket-valide': return [{ ...base, kind: 'systeme', ok: true, text: 'Validé par vous' }];
        case 'reclamation': return [{ ...base, kind: 'message', text: `Ça ne marche pas : ${d.problem}` }];
        case 'rapporte': return [{ ...base, kind: 'systeme', text: `Rapporté dans ${d.report}` }];
        default: return [];
      }
    });
  }

  private closeReunion(ticketId: string): void {
    for (const a of this.actions().filter((x) => x.ticketId === ticketId && x.kind === 'reunion')) {
      this.record({ project: a.projectId, type: 'action-resolue', actor: 'programme', data: { id: a.id, label: 'Recette faite' } });
    }
  }

  // Ordre de la file : échanger avec le voisin, ou passer en tête.
  reorder(id: string, dir: -1 | 1 | 'tete'): string {
    const t = this.ticket(id);
    if (t.status !== 'a-faire') throw new Refused(`${id} n’est pas dans la file : seul un ticket « à faire » change de place.`);
    const q = this.tickets(t.projectId).filter((x) => x.status === 'a-faire').sort((a, b) => a.priority - b.priority);
    if (dir === 'tete') {
      const top = q[0];
      if (top.id === id) return `${id} est déjà en tête de file.`;
      this.record({ project: t.projectId, ticket: id, type: 'priorite', actor: 'vous', data: { priority: top.priority - 1 } });
      this.changed();
      return `${id} passe en tête de file. Le pilote le lancera dès qu’une place se libère.`;
    }
    const other = q[q.findIndex((x) => x.id === id) + dir];
    if (!other) return `${id} est déjà ${dir < 0 ? 'en tête' : 'en fin'} de file.`;
    const [a, b] = other.priority === t.priority ? [t.priority + dir, t.priority] : [other.priority, t.priority];
    this.record({ project: t.projectId, ticket: id, type: 'priorite', actor: 'vous', data: { priority: a } });
    this.record({ project: t.projectId, ticket: other.id, type: 'priorite', actor: 'vous', data: { priority: b } });
    this.changed();
    return `${id} ${dir < 0 ? 'monte' : 'descend'} d’une place.`;
  }

  // Une action « Pour vous » est faite. Si elle bloquait un ticket, il revient en tête de file.
  resolveAction(actionId: string, label: string): string {
    const a = this.actions().find((x) => x.id === actionId);
    if (!a) throw new Refused('Cette action est déjà réglée.');
    this.record({ project: a.projectId, type: 'action-resolue', actor: 'vous', data: { id: a.id, label } });
    let msg = `« ${label} » : c’est noté.`;
    const t = a.ticketId ? this.tickets(a.projectId).find((x) => x.id === a.ticketId) : undefined;
    if (t?.status === 'action') {
      this.record({ project: t.projectId, ticket: t.id, type: 'ticket-arrete', actor: 'programme', data: { reason: 'action réglée' } });
      this.record({ project: t.projectId, ticket: t.id, type: 'priorite', actor: 'programme', data: { priority: 0 } });
      msg += ` ${t.id} revient en tête de file.${this.runPilot(t.projectId, t.lot)}`;
    }
    this.changed();
    return msg;
  }

  // « Valider les plans et lancer » : vous cochez les tickets, leurs plans sont validés d'un coup,
  // puis le pilote remplit les places libres. Ceux qui attendent un autre ticket attendent seuls.
  validatePlans(project: string, ids: string[]): string {
    const ok: string[] = [];
    for (const id of ids) {
      const t = this.ticket(id);
      if (t.projectId !== project || t.status !== 'a-faire' || t.planOk) continue;
      this.record({ project, ticket: id, type: 'plan-valide', actor: 'vous', data: {} });
      ok.push(id);
    }
    if (!ok.length) throw new Refused('Aucun plan à valider parmi ces tickets.');
    const go = this.pilot().on ? this.kickPilot(project) : '';
    this.changed();
    return `Plans validés : ${ok.join(', ')}.${go || (this.pilot().on ? ' Aucune place libre ou ils attendent un autre ticket : le pilote les lancera ensuite.' : ' Pilote arrêté : allumez-le pour qu’ils partent.')}`;
  }

  // Pilote allumé : il démarre tout de suite les tickets prêts du lot en cours (le plus petit lot pas fini).
  kickPilot(project: string): string {
    const open = this.tickets(project).filter((t) => t.status !== 'termine');
    if (!open.length) return '';
    const msg = this.runPilot(project, Math.min(...open.map((t) => t.lot)));
    if (msg) this.changed();
    return msg;
  }

  // Pilote allumé et budget du jour atteint : il s'arrête et vous prévient (une fois par jour et par budget).
  private budgetHit(project: string): boolean {
    const p = this.pilot();
    const spent = this.spentToday();
    if (!p.on || !budgetReached(spent, p)) return false;
    const d = startOfToday();
    const id = `budget-${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}-${p.dayBudget}`;
    const known = this.db.prepare("SELECT 1 FROM events WHERE type = 'action-ouverte' AND json_extract(data, '$.action.id') = ? LIMIT 1").get(id);
    if (known) return true;
    const n = (v: number) => v.toLocaleString('fr-FR');
    const action: HumanAction = {
      id, projectId: project, kind: 'question', title: 'Budget du jour atteint : le pilote est arrêté',
      cause: `${n(spent)} tokens utilisés aujourd’hui, pour un budget de ${n(p.dayBudget)}.`,
      rule: 'Le pilote ne lance aucun ticket quand le budget du jour est atteint.',
      todo: 'Les agents déjà au travail finissent leur ticket. Pour continuer aujourd’hui : montez le budget dans les réglages du projet, ou lancez un ticket vous-même. Le pilote ne repart pas seul à minuit : demain, il reprend à la prochaine validation ou fin de ticket.',
      blocking: true, since: 'aujourd’hui', buttons: ['Compris'],
    };
    this.record({ project, type: 'action-ouverte', actor: 'programme', data: { action } });
    this.changed();
    return true;
  }

  // Pilote automatique : remplit les places libres avec les tickets prêts.
  private runPilot(project: string, lot: number): string {
    const launched: string[] = [];
    if (this.quotaUntil()) return ''; // limite d'abonnement : rien ne part avant l'heure de retour
    if (this.budgetHit(project)) return ' Budget du jour atteint : le pilote ne lance plus de ticket.';
    for (let i = 0; i < 4; i++) {
      const next = nextReady(this.tickets(project), project, this.pilot(), lot);
      if (!next) break;
      const { model, reason } = pickModel(next);
      this.record({ project, ticket: next.id, type: 'ticket-lance', actor: 'pilote', data: { model, reason } });
      launched.push(next.id);
    }
    return launched.length ? ` Pilote automatique : ${launched.join(', ')} démarre.` : '';
  }
}
