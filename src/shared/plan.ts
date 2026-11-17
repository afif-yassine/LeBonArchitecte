// Plan d'un ticket proposé par règles (0 token). Plus tard, l'Architecte (Haiku) l'affinera ;
// ce brouillon garantit qu'aucun ticket ne part sans étapes ni preuves.
import type { ProofKind, Ticket, TicketStep } from './contract.ts';

type Draftable = Pick<Ticket, 'title' | 'part' | 'criteria' | 'description'>;

const FRONT = /page|interface|calendrier|design|écran|ecran|mise en page|tableau de bord|site|thème|theme|déroulé/i;
const TESTS = /tests? e2e|qualité|recette/i;
const DOC = /note de version|documentation|rapport|compte rendu/i;
const AUDIT = /audit|sécurité|securite/i;
const RISKY = /sécurité|paiement|stripe|base de données|prisma|migration|auth|connexion|déploiement|adaptateur|exécuteur/i;
const EXTERNAL = /stripe|paiement|sms|e-mail|email|api|prisma|sdk|codex|claude/i;

function roleFor(t: Draftable): string {
  const text = `${t.title} ${t.part}`;
  if (AUDIT.test(text)) return 'securite';
  if (DOC.test(text)) return 'redacteur';
  if (TESTS.test(text)) return 'testeur';
  if (FRONT.test(text)) return 'dev-front';
  return 'dev-back';
}

function skillsFor(text: string): string[] {
  const s: string[] = [];
  if (/stripe|paiement/i.test(text)) s.push('stripe');
  if (/e-mail|email/i.test(text)) s.push('e-mails');
  if (/sms/i.test(text)) s.push('sms');
  if (/sdk|claude|codex|adaptateur/i.test(text)) s.push('sdk-officiels');
  if (FRONT.test(text)) s.push('design');
  return s;
}

const step = (id: string, label: string, role: string, skills: string[], kind: ProofKind, proof: string, helper?: string): TicketStep =>
  ({ id, label, role, skills, proof: { kind, text: proof }, state: 'a-faire', ...(helper ? { helper } : {}) });

export function draftPlan(t: Draftable): TicketStep[] {
  const role = roleFor(t);
  const text = `${t.title} ${t.description.expected}`;
  const out: TicketStep[] = [
    step('s1', 'Relire le code et les exigences concernés', role, ['lire-avant-coder'], 'relecture', 'liste des fichiers lus, jointe au journal'),
  ];
  const work = t.criteria.length ? t.criteria.slice(0, 4).map((c) => c.text) : [t.description.expected];
  work.forEach((w, i) => {
    out.push(step(`s${out.length + 1}`, w, role, skillsFor(`${text} ${w}`), 'commande', 'le projet compile sans erreur',
      i === 0 && EXTERNAL.test(text) ? 'eclaireur' : undefined));
  });
  if (role !== 'redacteur') out.push(step(`s${out.length + 1}`, 'Écrire et faire passer les tests', role, ['tests'], 'tests', 'tous les tests verts', 'testeur'));
  if (role === 'dev-front') out.push(step(`s${out.length + 1}`, 'Vérifier en image', role, ['design'], 'capture', 'capture d’écran jointe'));
  if (RISKY.test(text)) out.push(step(`s${out.length + 1}`, 'Relecture sécurité', 'securite', ['sécurité'], 'relecture', 'scans gratuits sans alerte'));
  return out;
}

const EVIDENCE: Record<ProofKind, string> = {
  tests: 'tests lancés : 0 échec',
  commande: 'compilation terminée sans erreur',
  fichier: 'fichier présent et compilé',
  capture: 'capture jointe au ticket',
  relecture: 'liste des fichiers lus, jointe au journal',
};
export const evidenceFor = (k: ProofKind) => EVIDENCE[k];

// Pour les données d'exemple : les n premières étapes prouvées, la suivante en cours.
export function withProgress(steps: TicketStep[], proven: number, current = true): TicketStep[] {
  return steps.map((s, i) => i < proven
    ? { ...s, state: 'prouve', evidence: EVIDENCE[s.proof.kind] }
    : i === proven && current ? { ...s, state: 'en-cours' } : s);
}
