// Le moteur : il écrit chaque événement dans le journal, met à jour la vue des tickets dans la même
// transaction, puis applique les règles (0 token). Aucune IA ici.
import type { DatabaseSync } from 'node:sqlite';
import type { Ticket } from '../src/shared/contract.ts';
import { Refused, assertMove, reduce, type EngineEvent } from './tickets.ts';
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
  seed(tickets: Ticket[]): void {
    for (const t of tickets) this.record({ project: t.projectId, ticket: t.id, type: 'ticket-cree', actor: 'programme', data: { ticket: t } });
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
    const busy = running(all, t.projectId);
    if (busy.length >= pilot.maxParallel && !opts.replace) {
      throw new Refused(`Plus de place : ${busy.map((b) => b.id).join(' et ')} ${busy.length > 1 ? 'sont' : 'est'} en cours (${pilot.maxParallel} au plus). Arrêtez-en un ou mettez ${id} en tête de file.`);
    }
    let msg = '';
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
    const msg = `${id} validé. Il sera réuni dans main avec un point de retour.${this.runPilot(t.projectId, t.lot)}`;
    this.changed();
    return msg;
  }

  reject(id: string, problem: string): string {
    const t = this.ticket(id);
    assertMove(t, 'en-cours');
    if (!problem.trim()) throw new Refused('Décrivez ce qui ne marche pas : l’agent en a besoin pour corriger.');
    this.record({ project: t.projectId, ticket: id, type: 'reclamation', actor: 'vous', data: { problem } });
    this.changed();
    return `Réclamation enregistrée sur ${id}. Le même agent reprend avec votre description.`;
  }

  report(project: string, reportId: string): string[] {
    const ids = this.tickets(project).filter((t) => (t.status === 'termine' || t.status === 'a-tester') && !t.reportedIn).map((t) => t.id);
    for (const id of ids) this.record({ project, ticket: id, type: 'rapporte', actor: 'programme', data: { report: reportId } });
    this.changed();
    return ids;
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
