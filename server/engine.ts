// Le moteur : il écrit chaque événement dans le journal, met à jour la vue des tickets dans la même
// transaction, puis applique les règles (0 token). Aucune IA ici.
import type { DatabaseSync } from 'node:sqlite';
import type { HumanAction, LiveItem, LiveKind, Ticket } from '../src/shared/contract.ts';
import { Refused, assertMove, reduce, type EngineEvent } from './tickets.ts';
import { runCommand, type RunResult } from './executor.ts';
import { draftPlan } from '../src/shared/plan.ts';
import { checkDone, isReady, nextReady, pickModel, running, type PilotSettings } from './rules.ts';

type Listener = () => void;
const now = () => new Date().toISOString();
const DEFAULT_PILOT: PilotSettings = { on: true, maxParallel: 2, stopAtLotEnd: true, respectBudget: true };

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

  isEmpty(): boolean {
    return ((this.db.prepare('SELECT COUNT(*) AS n FROM events').get() as { n: number }).n) === 0;
  }

  // ---------- Écriture : un événement = une ligne du journal + la vue à jour ----------
  private record(e: Omit<EngineEvent, 'at'>): void {
    const ev: EngineEvent = { ...e, at: now() };
    this.db.exec('BEGIN');
    try {
      this.db.prepare('INSERT INTO events (at, project, ticket, type, actor, data) VALUES (?, ?, ?, ?, ?, ?)')
        .run(ev.at, ev.project, ev.ticket ?? null, ev.type, ev.actor, JSON.stringify(ev.data));
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
  }

  private changed(): void { this.listeners.forEach((l) => l()); }
  onChange(l: Listener): () => void { this.listeners.add(l); return () => this.listeners.delete(l); }

  // ---------- Commandes ----------
  seed(tickets: Ticket[], actions: HumanAction[] = []): void {
    for (const t of tickets) this.record({ project: t.projectId, ticket: t.id, type: 'ticket-cree', actor: 'programme', data: { ticket: t } });
    for (const a of actions) this.record({ project: a.projectId, type: 'action-ouverte', actor: 'programme', data: { action: a } });
    this.changed();
  }

  setPilot(p: Partial<PilotSettings>): PilotSettings {
    const next = { ...this.pilot(), ...p };
    this.db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('pilot', ?)").run(JSON.stringify(next));
    this.record({ project: '*', type: 'pilote-regle', actor: 'vous', data: { ...p } });
    this.changed();
    return next;
  }

  launch(id: string, opts: { replace?: string; actor?: string } = {}): string {
    const t = this.ticket(id);
    assertMove(t, 'en-cours');
    const all = this.tickets(t.projectId);
    const pilot = this.pilot();
    if (!isReady(t, all) && opts.actor === 'pilote') throw new Refused(`${id} attend ${t.deps.join(', ')}.`);
    if (!t.planOk && opts.actor === 'pilote') throw new Refused(`Le plan de ${id} n’est pas validé : le pilote ne le lance pas.`);
    const busy = running(all, t.projectId);
    if (busy.length >= pilot.maxParallel && !opts.replace) {
      throw new Refused(`Plus de place : ${busy.map((b) => b.id).join(' et ')} ${busy.length > 1 ? 'sont' : 'est'} en cours (${pilot.maxParallel} au plus). Arrêtez-en un ou mettez ${id} en tête de file.`);
    }
    let msg = '';
    if (!t.planOk) { this.record({ project: t.projectId, ticket: id, type: 'plan-valide', actor: opts.actor ?? 'vous', data: {} }); msg = 'Plan validé. '; }
    if (opts.replace) { this.stop(opts.replace, false); msg = `${opts.replace} arrêté proprement, passation écrite. `; }
    const { model, reason } = pickModel(t, t.loops > 1);
    this.record({ project: t.projectId, ticket: id, type: 'ticket-lance', actor: opts.actor ?? 'vous', data: { model, reason } });
    this.changed();
    return `${msg}${id} démarre sur ${model}. ${reason}`;
  }

  stop(id: string, notify = true): string {
    const t = this.ticket(id);
    assertMove(t, 'a-faire');
    this.record({ project: t.projectId, ticket: id, type: 'ticket-arrete', actor: 'vous', data: {} });
    if (notify) this.changed();
    return `${id} arrêté proprement. Il reprendra avec sa passation.`;
  }

  // Fin d'un agent. « result » vient de l'adaptateur (plus tard) ou d'une simulation (maquette).
  agentDone(id: string, result: { criteriaOk: boolean; checks: Record<string, 'ok' | 'echec'> }): string {
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
      const cause = `Pas fini : ${verdict.missing.join(', ')}.`;
      this.record({ project: t.projectId, ticket: id, type: 'besoin-action', actor: 'programme', data: { cause } });
      msg = `${id} n’est pas fini, il passe en « Besoin d’action ». ${cause}`;
    }
    msg += this.runPilot(t.projectId, t.lot);
    this.changed();
    return msg;
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

  reject(id: string, problem: string): string {
    const t = this.ticket(id);
    assertMove(t, 'en-cours');
    if (!problem.trim()) throw new Refused('Décrivez ce qui ne marche pas : l’agent en a besoin pour corriger.');
    this.record({ project: t.projectId, ticket: id, type: 'reclamation', actor: 'vous', data: { problem } });
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

  validatePlan(id: string): string {
    const t = this.ticket(id);
    if (t.planOk) return `Le plan de ${id} est déjà validé.`;
    if (t.status !== 'a-faire') throw new Refused(`${id} a déjà démarré : son plan ne se valide plus.`);
    this.record({ project: t.projectId, ticket: id, type: 'plan-valide', actor: 'vous', data: {} });
    this.changed();
    return `Plan de ${id} validé : ${t.steps.length} étapes. Le pilote pourra le lancer.`;
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
  tokens(id: string, d: { used: number; cacheRead: number; costUsd: number; turns: number }): void {
    const t = this.ticket(id);
    this.record({ project: t.projectId, ticket: id, type: 'tokens', actor: 'programme', data: { ...d } });
    this.changed();
  }

  // Ce qui a été réalisé, écrit par le programme à partir de git (sans IA).
  realized(id: string, realized: Ticket['realized']): void {
    const t = this.ticket(id);
    this.record({ project: t.projectId, ticket: id, type: 'reuni', actor: 'programme', data: { realized } });
    this.changed();
  }

  // Nouveau ticket : plan proposé par règles, à valider avant que le pilote le lance.
  createTicket(project: string, o: { title: string; context?: string; expected: string; criteria: string[]; deps?: string[]; part?: string; lot?: number }): Ticket {
    if (!o.title?.trim() || !o.expected?.trim()) throw new Refused('Un ticket a besoin d’un titre et de ce qui est attendu.');
    const all = this.tickets(project);
    const prefix = (all[0]?.id.split('-')[0]) ?? project.toUpperCase();
    const n = Math.max(0, ...all.map((x) => Number(x.id.split('-')[1]) || 0)) + 1;
    const base = {
      id: `${prefix}-${n}`, projectId: project, title: o.title.trim(), deps: o.deps ?? [], status: 'a-faire' as const,
      part: o.part ?? 'Général', lot: o.lot ?? Math.max(1, ...all.map((x) => x.lot)), tool: 'claude-code' as const, accountId: 'acc-claude-1',
      model: 'Sonnet', effort: 'moyen' as const, budget: 40000, used: 0, loops: 1, files: [],
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

  message(id: string, text: string): string {
    if (!text.trim()) throw new Refused('Le message est vide.');
    this.live(id, { kind: 'message', text: text.trim() }, 'vous');
    return 'Message transmis. L’agent le lira à la fin de son action en cours.';
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

  // Pilote automatique : remplit les places libres avec les tickets prêts.
  private runPilot(project: string, lot: number): string {
    const launched: string[] = [];
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
