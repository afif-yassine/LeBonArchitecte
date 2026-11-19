// Contrat de données entre l'interface et le futur serveur local.
// Règle : une information = un seul endroit. Toute forme de donnée est définie ici.
// La maquette remplit ces types avec de fausses données (src/mock/data.ts) ;
// à chaque jalon, le serveur fournira exactement les mêmes formes.

export type EsnStep = 'comprendre' | 'choisir' | 'planifier' | 'realiser' | 'verifier' | 'livrer';

export const ESN_STEPS: { id: EsnStep; label: string; question: string }[] = [
  { id: 'comprendre', label: 'Comprendre', question: "Qu'est-ce qu'on construit, ou qu'est-ce qui existe déjà ?" },
  { id: 'choisir', label: 'Choisir', question: 'Quelle option retenir, et à quel coût ?' },
  { id: 'planifier', label: 'Planifier', question: 'Quels tickets, dans quel ordre ?' },
  { id: 'realiser', label: 'Réaliser', question: "L'équipe écrit le code, ticket par ticket." },
  { id: 'verifier', label: 'Vérifier', question: 'Tests, audits et recette dans l’aperçu.' },
  { id: 'livrer', label: 'Livrer', question: 'Version prête, déploiement sur votre accord.' },
];

export type ToolId = 'claude-code' | 'codex' | 'gemini-cli';

// Jamais le modèle Fable (règle 6).
export const TOOLS: Record<ToolId, { label: string; short: string; models: string[] }> = {
  'claude-code': { label: 'Claude Code', short: 'Claude', models: ['Haiku', 'Sonnet', 'Opus'] },
  codex: { label: 'Codex', short: 'Codex', models: ['gpt-codex-mini', 'gpt-codex'] },
  'gemini-cli': { label: 'Gemini CLI', short: 'Gemini', models: ['Gemini Flash', 'Gemini Pro'] },
};

export type Effort = 'bas' | 'moyen' | 'haut';
export type AgentState = 'travaille' | 'tests' | 'attend' | 'bloque' | 'fini' | 'erreur' | 'en-pause';
export type TicketStatus = 'a-faire' | 'en-cours' | 'action' | 'a-tester' | 'termine';
export type Space = 'architecte' | 'flux' | 'travail' | 'pour-vous' | 'cdc' | 'backlog' | 'equipe' | 'regles' | 'docs' | 'git' | 'sante' | 'memoire';

// Règle du projet : une seule source, recopiée par le programme dans CLAUDE.md et AGENTS.md.
export interface ProjectRule {
  id: string;
  text: string;
  scope: 'global' | 'projet';
  source: 'vous' | 'decision' | 'convention' | 'recette';
  enforcedBy: 'programme' | 'agent'; // programme = bloqué par un contrôle ; agent = consigne lue
  tokens: number;
}

// Note de mémoire : un fait court. Globale = partagée par tous les projets.
export interface MemoryNote {
  id: string;
  text: string;
  scope: 'global' | 'projet';
  kind: 'fait' | 'recette' | 'preference' | 'decision';
  source: string;
  uses: number;
  tokens: number;
}

// Ce qu'un agent a dans son contexte, poste par poste.
export interface AgentContext {
  agentId: string;
  ceiling: number; // plafond voulu par le projet (bien en dessous de la fenêtre du modèle)
  parts: { label: string; tokens: number; detail: string; kind: 'regles' | 'ticket' | 'graphe' | 'memoire' | 'fichiers' | 'conversation' }[];
}

export interface Worktree {
  path: string;
  branch: string;
  ticket?: string;
  agent?: string;
  size: string;
  state: 'actif' | 'propre' | 'orphelin';
}

// Conversation avec l'Architecte (comme Claude Code ou Codex).
export type ArchItem =
  | { type: 'user'; text: string; at: string }
  | { type: 'assistant'; text: string; at: string; cost: string; actions?: string[] }
  | { type: 'tool'; text: string; cost: string }
  | { type: 'aside'; question: string; text: string; cost: string };

// Rôle d'un agent dans l'équipe composée par l'orchestrateur à la mise en place.
export interface Role {
  id: string;
  name: string;
  mission: string;
  tool: ToolId;
  model: string;
  skills: string[];
  kind: 'equipe' | 'aide'; // aide = appelé seulement pour la mise en place ou une recherche
  max: number; // agents de ce rôle en même temps
  web?: boolean; // a le droit de chercher sur Internet (lecture seule)
}

// Étape de mise en place : préparer le travail avant le premier ticket.
export interface SetupStep {
  id: string;
  title: string;
  who: string; // « Programme », un rôle, ou « Vous »
  status: 'fait' | 'en-cours' | 'a-faire';
  tokens: number;
  result: string;
  sources?: { label: string; url: string }[];
}

// Le flux complet d'un projet, étape par étape, avec qui agit et ce qui sort.
export interface FlowStage {
  step: EsnStep;
  roles: string[];
  produces: string[];
  gate: string;
  tokens: number;
  activities: { text: string; status: 'fait' | 'en-cours' | 'a-faire'; who: string }[];
}

export const COLUMNS: { id: TicketStatus; label: string }[] = [
  { id: 'a-faire', label: 'À faire' },
  { id: 'en-cours', label: 'En cours' },
  { id: 'action', label: 'Action' },
  { id: 'a-tester', label: 'À tester' },
  { id: 'termine', label: 'Fini' },
];

export interface Project {
  id: string;
  name: string;
  summary: string;
  step: EsnStep;
  gate: string;
  private: boolean;
  repo: string;
  lot: { n: number; name: string };
  tokensToday: number;
  demo?: boolean; // projet d'exemple, pour montrer les écrans
}

export interface DoneCheck {
  label: string;
  // non-verifie : aucun outil ne l'a contrôlé ; à regarder à la recette (jamais affiché « ok » à tort).
  state: 'ok' | 'echec' | 'attente' | 'non-verifie';
}

// Prévu réaliste par modèle (mesuré sur LBA-10 à 17 : un ticket Opus prend 150 à 260 k tokens).
// L'ancien budget fixe de 40 k rendait chaque ticket rouge sans raison.
const BUDGET_REF: Record<string, number> = { Opus: 250_000, Sonnet: 120_000, Haiku: 40_000 };
export const budgetFor = (t: { budget: number; model: string }) => Math.max(t.budget, BUDGET_REF[t.model] ?? t.budget);

export interface TicketActivity {
  label: string; // ex. « Validation »
  steps: { label: string; state: 'attente' | 'en-cours' | 'ok' | 'echec'; detail?: string }[];
  error?: string;
  fixable?: boolean; // l'agent peut le résoudre (conflit, test rouge) : bouton « Demander à l'agent »
  at: string;
}

// Backlog (lot B) : les idées et besoins pas encore décidés. Un élément qui devient un ticket quitte le backlog
// (une information à un seul endroit) : il garde seulement le lien vers son ticket.
export interface BacklogItem { id: string; title: string; detail: string; origin: string; size?: 'S' | 'M' | 'L'; at: string; ticket?: string; removed?: boolean }

export interface Ticket {
  id: string;
  projectId: string;
  title: string;
  criteria: { text: string; done: boolean }[];
  deps: string[];
  status: TicketStatus;
  securityBlock?: string;
  needAction?: string;
  interrupted?: { at: string; lastProved?: string }; // coupé par un redémarrage ou une panne : à reprendre
  waitingFor?: string; // ce que la carte attend, en mots simples
  paused?: boolean; // mis en pause par vous : le pilote ne le lance pas
  // Ce que le programme fait en ce moment sur le ticket (valider, tester…), étape par étape, avec l'erreur s'il y en a.
  // Affiché en haut de la fiche : on voit toujours ce qui se passe, même après coup.
  activity?: TicketActivity;
  // Détail des tokens, additionné sur tous les tours. split = faux si un ancien tour n'avait que le total.
  usage?: { input: number; output: number; cacheWrite: number; cacheRead: number; costUsd: number; turns: number; split: boolean };
  part: string;
  lot: number;
  tool: ToolId;
  accountId: string;
  model: string;
  effort: Effort;
  budget: number;
  used: number;
  loops: number;
  files: string[];
  agentId?: string;
  done: DoneCheck[];
  priority: number; // ordre dans la file du pilote automatique (1 = d'abord)
  description: TicketDescription;
  realized?: Realized; // ce qui a été fait et ajouté, rempli par le programme à la fin
  reportedIn?: string; // id du compte rendu qui a déjà parlé de ce ticket ; absent = pas encore rapporté
  steps: TicketStep[]; // le plan du ticket, montré avant le lancement
  planOk: boolean; // plan validé (par vous, au lancement) : le pilote ne lance jamais un plan non validé
}

// Une étape du plan. Elle n'est cochée que si le programme a vérifié sa preuve (0 token) :
// l'agent peut l'annoncer finie, mais sans preuve elle reste « annoncée, pas prouvée ».
export type ProofKind = 'tests' | 'fichier' | 'commande' | 'capture' | 'relecture';
export interface TicketStep {
  id: string;
  label: string;
  role: string; // rôle de l'agent qui la fait (id de Role)
  helper?: string; // agent d'aide appelé pour cette étape (id de Role)
  skills: string[];
  // check : ce que le programme vérifie lui-même pour une preuve « fichier » (pdf, svg, liens, md).
  proof: { kind: ProofKind; text: string; check?: 'pdf' | 'svg' | 'liens' | 'md' };
  state: 'a-faire' | 'en-cours' | 'annonce' | 'prouve';
  evidence?: string; // ce que le programme a vérifié, ou pourquoi la preuve manque
}

// Ce que l'on voit « en direct » pendant qu'un agent travaille.
export type LiveKind = 'reflexion' | 'message' | 'action' | 'commande' | 'test' | 'bug' | 'resolu' | 'agent' | 'skill' | 'etape' | 'systeme';
export interface LiveItem {
  id: number;
  at: string; // ISO
  kind: LiveKind;
  who: string;
  text: string;
  detail?: string;
  ok?: boolean;
  step?: string;
}

// Les étapes de la vie d'un ticket, montrées en frise.
export const TICKET_PHASES = [
  { id: 'prepare', label: 'Préparé' },
  { id: 'plan', label: 'Plan validé' },
  { id: 'travail', label: 'En cours' },
  { id: 'tests', label: 'Tests' },
  { id: 'recette', label: 'À tester' },
  { id: 'fini', label: 'Terminé' },
] as const;
export type TicketPhase = (typeof TICKET_PHASES)[number]['id'];

export function ticketPhase(t: Pick<Ticket, 'status' | 'steps' | 'planOk'>): TicketPhase {
  if (t.status === 'termine') return 'fini';
  if (t.status === 'a-tester') return 'recette';
  if (t.status === 'en-cours' || t.status === 'action') {
    const cur = t.steps.find((s) => s.state !== 'prouve');
    return cur?.proof.kind === 'tests' && cur.state !== 'a-faire' ? 'tests' : 'travail';
  }
  return t.planOk ? 'plan' : 'prepare';
}

export interface TicketDescription {
  context: string;
  expected: string;
  outOfScope: string;
  cdcRefs: string[]; // exigences du cahier des charges couvertes (EX-…)
}

export interface Realized {
  summary: string;
  added: string[];
  files: { path: string; plus: number; minus: number }[];
  tests: string;
  commits: string[];
  branch: string;
}

export interface Agent {
  id: string;
  name: string;
  projectId: string;
  ticketId: string;
  tool: ToolId;
  accountId: string;
  model: string;
  effort: Effort;
  state: AgentState;
  tokens: number;
  lastAction: string;
}

export interface Account {
  id: string;
  tool: ToolId;
  label: string;
  plan: string;
  connected: boolean;
  problem?: string;
  fixCommand?: string;
  quota5h: number;
  reset5h: string;
  quota7d: number;
  reset7d: string;
}

export interface Actor {
  kind: 'agent' | 'orchestrateur' | 'programme' | 'regle' | 'vous';
  name: string;
}

// Conversation d'un agent sur un ticket : messages, commandes résumées, fichiers modifiés, questions.
export type ConversationItem =
  | { type: 'msg'; from: Actor; at: string; text: string }
  | { type: 'cmd'; at: string; command: string; summary: string; ok: boolean }
  | { type: 'edit'; at: string; file: string; plus: number; minus: number }
  | { type: 'question'; at: string; from: Actor; text: string; choices: string[]; answer?: string };

export interface LogEvent {
  id: string;
  ticketId: string;
  at: string;
  actor: Actor;
  kind: 'lecture' | 'modif' | 'commande' | 'question' | 'regle' | 'info';
  text: string;
}

// Journal « qui intervient » de l'équipe.
export interface Intervention {
  at: string;
  who: string;
  kind: 'verrou' | 'bascule' | 'message' | 'regle';
  text: string;
}

export interface HumanAction {
  id: string;
  projectId: string;
  ticketId?: string;
  ticketTitle?: string;
  kind: 'question' | 'securite' | 'cle' | 'installation' | 'reunion';
  title: string;
  cause: string;
  proof?: string;
  rule?: string;
  todo: string;
  blocking: boolean;
  since: string;
  buttons: string[];
  command?: string;
}

export interface Proposal {
  id: string;
  projectId: string;
  from: string;
  text: string;
  why: string;
}

export interface Attachment {
  name: string;
  url?: string;
}

export interface ChatMessage {
  id: string;
  from: Actor;
  text: string;
  at: string;
  attachments?: Attachment[];
}

export interface AuditReport {
  date: string;
  what: string;
  stack: string;
  good: string;
  flaws: { critique: number; haute: number; moyenne: number; tools: string };
  habits: string;
  verdict: 'garder' | 'corriger' | 'refondre' | 'refaire';
  verdictText: string;
}

export interface DailyReport {
  id: string;
  tickets: string[]; // tickets rapportés dans ce compte rendu
  date: string;
  done: string[];
  inProgress: string[];
  blocked: string[];
  tokens: number;
  waiting: string[];
  aiNote?: string; // 5 lignes au plus, ajoutées par l'IA
}

export interface Decision {
  id: string;
  title: string;
  forbids: string; // interdit lisible par la machine
}

export interface Stats {
  tokensPerTicket: number;
  loopsPerTicket: number;
  firstTry: number;
  blocks: { cause: string; n: number }[];
}

// Cahier des charges : un dossier du projet, source de vérité pour tous les agents.
export interface CdcFile {
  name: string;
  kind: 'texte' | 'image' | 'pdf';
  size: string;
  updated: string;
}

export interface Requirement {
  id: string; // EX-01
  section: string;
  text: string;
  tickets: string[];
}

export interface GitBranch {
  name: string;
  ticket?: string;
  status: 'principale' | 'en-cours' | 'a-reunir' | 'reunie' | 'conflit' | 'orpheline';
  ahead: number;
  behind: number;
  lastCommit: string;
  at: string;
}

export interface GitCommit {
  sha: string;
  message: string;
  ticket?: string;
  at: string;
  restorePoint?: string; // nom du point de retour créé avant une réunion
}

// Audit du fonctionnement de la plateforme elle-même (0 token, calculé par le programme).
export interface HealthCheck {
  id: string;
  severity: 'grave' | 'attention' | 'info';
  area: 'tokens' | 'compactage' | 'boucle' | 'contexte' | 'session' | 'git' | 'disque' | 'outil';
  title: string;
  cause: string;
  proof: string;
  fix: string;
  fixLabel?: string;
  auto?: boolean; // réparé seul par une recette connue
  status: 'ouvert' | 'resolu';
}

export interface Incident {
  id: string;
  title: string;
  status: 'ouvert' | 'resolu';
  opened: string;
  ticket?: string;
  timeline: { at: string; text: string }[];
  resolution?: string;
}

export interface DayUsage {
  day: string;
  tokens: number;
}

export interface ToolUsage {
  tool: ToolId;
  model: string;
  tokens: number;
  cost: number;
  firstTry: number;
}
