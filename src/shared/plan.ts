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

// Recherche sur Internet : rôle Éclaireur, seul rôle qui a le droit de lire le web.
// Il n'écrit que dans docs/recherche/ et docs/rapports/ (vérifié par le programme à la fin).
export const RESEARCH = /recherche|veille|état de l.art|comparatif|benchmark|scénarios?/i;
export const RESEARCH_DIRS = ['docs/recherche/', 'docs/rapports/'];

function roleFor(t: Draftable): string {
  const text = `${t.title} ${t.part}`;
  if (RESEARCH.test(text)) return 'eclaireur';
  // Architecture, conception, cahier des charges, backlog : l'Architecte (Opus, décision 0007).
  if (/architecture|conception|cahier des charges|backlog/i.test(text)) return 'architecte';
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

type Proof = TicketStep['proof'];
const step = (id: string, label: string, role: string, skills: string[], proof: Proof, helper?: string): TicketStep =>
  ({ id, label, role, skills, proof, state: 'a-faire', ...(helper ? { helper } : {}) });

// Rôles qui produisent des documents, pas du code : leur preuve est un fichier vérifié, pas une compilation.
const WRITES_DOCS = new Set(['redacteur', 'eclaireur', 'architecte', 'analyste']);

// Chaque critère reçoit la preuve qui lui correspond, toujours vérifiable par le programme.
export function proofFor(criterion: string, role: string): Proof {
  if (/pdf/i.test(criterion)) return { kind: 'fichier', check: 'pdf', text: 'un PDF ajouté par le ticket' };
  if (/schéma|schema|svg|diagramme/i.test(criterion)) return { kind: 'fichier', check: 'svg', text: 'un schéma présent dans le document écrit' };
  if (/sources?\b|liens?\b|références/i.test(criterion)) return { kind: 'fichier', check: 'liens', text: 'des liens vers les sources dans le document écrit' };
  if (/tests?\b/i.test(criterion)) return { kind: 'tests', text: 'tous les tests verts' };
  if (/compile|build|typescript/i.test(criterion)) return { kind: 'commande', text: 'le projet compile sans erreur' };
  if (WRITES_DOCS.has(role) || /rapport|document|readme|cahier|backlog|résumé|note/i.test(criterion)) return { kind: 'fichier', check: 'md', text: 'un document écrit par le ticket' };
  return { kind: 'commande', text: 'le projet compile sans erreur' };
}

export function draftPlan(t: Draftable): TicketStep[] {
  const role = roleFor(t);
  const text = `${t.title} ${t.description.expected}`;
  const out: TicketStep[] = [
    step('s1', 'Relire le code et les exigences concernés', role, ['lire-avant-coder'], { kind: 'relecture', text: 'liste des fichiers lus, jointe au journal' }),
  ];
  const work = t.criteria.length ? t.criteria.slice(0, 5).map((c) => c.text) : [t.description.expected];
  work.forEach((w, i) => {
    out.push(step(`s${out.length + 1}`, w, role, skillsFor(`${text} ${w}`), proofFor(w, role),
      i === 0 && EXTERNAL.test(text) && role !== 'eclaireur' ? 'eclaireur' : undefined));
  });
  // Le code doit garder des tests verts ; un document n'en écrit pas, mais ne doit rien casser.
  const hasTests = out.some((s) => s.proof.kind === 'tests');
  if (!WRITES_DOCS.has(role) && !hasTests) out.push(step(`s${out.length + 1}`, 'Écrire et faire passer les tests', role, ['tests'], { kind: 'tests', text: 'tous les tests verts' }, 'testeur'));
  if (role === 'dev-front') out.push(step(`s${out.length + 1}`, 'Vérifier en image', role, ['design'], { kind: 'capture', text: 'capture d’écran jointe' }));
  if (RISKY.test(text)) out.push(step(`s${out.length + 1}`, 'Relecture sécurité', 'securite', ['sécurité'], { kind: 'relecture', text: 'scans gratuits sans alerte' }));
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
