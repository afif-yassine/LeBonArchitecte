// Machine à états des tickets et application des événements (décision 0004).
// Fonctions pures : aucune base, aucun réseau, aucune IA. Testées dans tickets.test.ts.
import type { Ticket, TicketStatus, TicketStep } from '../src/shared/contract.ts';

export const TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  'a-faire': ['en-cours'],
  'en-cours': ['a-faire', 'a-tester', 'action'],
  action: ['en-cours', 'a-faire'],
  'a-tester': ['termine', 'en-cours'],
  termine: [],
};

const LABEL: Record<TicketStatus, string> = {
  'a-faire': 'à faire', 'en-cours': 'en cours', action: 'en besoin d’action', 'a-tester': 'à tester', termine: 'fini',
};
export const statusLabel = (s: TicketStatus) => LABEL[s];

// Erreur refusée par une règle : toujours expliquée en clair, jamais silencieuse.
export class Refused extends Error {}

export function assertMove(t: Ticket, to: TicketStatus): void {
  if (!TRANSITIONS[t.status].includes(to)) {
    throw new Refused(`${t.id} est ${LABEL[t.status]} : il ne peut pas passer « ${LABEL[to]} ».`);
  }
}

export type EventType =
  | 'ticket-cree' | 'ticket-lance' | 'ticket-arrete' | 'agent-termine' | 'ticket-a-tester'
  | 'besoin-action' | 'ticket-valide' | 'reclamation' | 'rapporte'
  | 'plan-valide' | 'plan-refait' | 'etape-commencee' | 'etape-annoncee' | 'direct'
  | 'priorite' | 'action-ouverte' | 'action-resolue' | 'tokens' | 'reuni';

export interface EngineEvent {
  id?: number;
  at: string;
  project: string;
  ticket?: string;
  type: EventType | 'pilote-regle' | 'refus';
  actor: string; // « vous », « programme », « pilote », un agent
  data: Record<string, unknown>;
}

// Applique un événement à un ticket. Le journal est la source ; ce résultat n'est qu'une vue.
export function reduce(t: Ticket | undefined, e: EngineEvent): Ticket | undefined {
  if (e.type === 'ticket-cree') return e.data.ticket as Ticket;
  if (!t) return t;
  switch (e.type) {
    case 'ticket-lance':
      return { ...t, status: 'en-cours', waitingFor: undefined, needAction: undefined, model: (e.data.model as string) ?? t.model };
    case 'ticket-arrete':
      return {
        ...t, status: 'a-faire', priority: 0, needAction: undefined, securityBlock: undefined,
        waitingFor: e.data.reason ? `Reprend en tête de file : ${e.data.reason}` : 'Arrêté par vous, reprendra avec sa passation',
      };
    case 'agent-termine':
      return {
        ...t,
        criteria: e.data.criteriaOk ? t.criteria.map((c) => ({ ...c, done: true })) : t.criteria,
        done: t.done.map((d) => ({ ...d, state: (e.data.checks as Record<string, 'ok' | 'echec' | 'non-verifie'> | undefined)?.[d.label] ?? d.state })),
      };
    case 'ticket-a-tester':
      return { ...t, status: 'a-tester', needAction: undefined };
    case 'besoin-action':
      return { ...t, status: 'action', needAction: String(e.data.cause ?? 'Cause non précisée') };
    case 'ticket-valide':
      return { ...t, status: 'termine' };
    case 'reclamation':
      // Le travail va changer : toutes les preuves sont à refaire, aucune coche ancienne ne reste.
      return { ...t, status: 'en-cours', loops: t.loops + 1, steps: t.steps.map((s) => ({ ...s, state: 'a-faire', evidence: undefined })) };
    case 'rapporte':
      return { ...t, reportedIn: String(e.data.report) };
    case 'tokens':
      return { ...t, used: t.used + Number(e.data.used ?? 0) };
    case 'reuni':
      return { ...t, realized: (e.data.realized as Ticket['realized']) ?? t.realized };
    case 'priorite':
      return { ...t, priority: Number(e.data.priority) };
    case 'plan-valide':
      return { ...t, planOk: true, steps: (e.data.steps as TicketStep[] | undefined) ?? t.steps };
    case 'plan-refait':
      // Nouveau plan écrit par les règles (ou l'Architecte) : la validation déjà donnée reste.
      return { ...t, steps: e.data.steps as TicketStep[] };
    case 'etape-commencee':
      return { ...t, steps: t.steps.map((s) => (s.id === e.data.step && s.state !== 'prouve' ? { ...s, state: 'en-cours' } : s)) };
    case 'etape-annoncee':
      // L'agent annonce ; seule la preuve vérifiée par le programme coche l'étape.
      return { ...t, steps: t.steps.map((s) => (s.id === e.data.step ? { ...s, state: e.data.proofOk ? 'prouve' : 'annonce', evidence: String(e.data.evidence ?? '') } : s)) };
    default:
      return t;
  }
}
