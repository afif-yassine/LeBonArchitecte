// Fausses données de la maquette. Elles respectent le contrat (src/shared/contract.ts)
// et seront remplacées, jalon par jalon, par les données du serveur local.
import type {
  Account, Agent, AuditReport, CdcFile, ChatMessage, ConversationItem, DailyReport, DayUsage, Decision, GitBranch,
  AgentContext, ArchItem, FlowStage, GitCommit, HealthCheck, HumanAction, Incident, Intervention, LogEvent, MemoryNote, Project,
  ProjectRule, Proposal, Requirement, Role, SetupStep, Stats, Ticket, ToolUsage, Worktree,
} from '../shared/contract';

export const projects: Project[] = [
  {
    id: 'padel', name: 'padel-site', summary: 'Réservation de terrains de padel pour un club. Next.js, Prisma, Stripe.',
    step: 'realiser', gate: 'Faire la recette du lot 2 avant de passer à Vérifier', private: false,
    repo: 'padel-site', lot: { n: 2, name: 'Réservation' }, tokensToday: 38000,
  },
  {
    id: 'job', name: 'job-hunter', summary: 'Suivi de candidatures, repris d’un autre dépôt. Audit en cours.',
    step: 'comprendre', gate: 'Lire le rapport d’audit et choisir une option', private: true,
    repo: 'job-hunter', lot: { n: 0, name: 'Audit' }, tokensToday: 12000,
  },
  {
    id: 'portfolio', name: 'portfolio', summary: 'Site personnel. Astro, déployé sur votre accord.',
    step: 'livrer', gate: 'Donner votre accord pour le déploiement', private: false,
    repo: 'portfolio', lot: { n: 3, name: 'Mise en ligne' }, tokensToday: 0,
  },
];

const dod = (s: ('ok' | 'echec' | 'attente')[]) =>
  ['Critères tenus', 'Tests verts', 'Périmètre respecté', 'Aucun secret', 'Aucune nouvelle faille', 'Documentation à jour']
    .map((label, i) => ({ label, state: s[i] ?? 'attente' }));
const allOk = dod(['ok', 'ok', 'ok', 'ok', 'ok', 'ok']);

const desc = (context: string, expected: string, outOfScope = 'Rien d’autre que les critères.', cdcRefs: string[] = []) => ({ context, expected, outOfScope, cdcRefs });

const base = {
  projectId: 'padel', part: 'Réservation', lot: 2, tool: 'claude-code' as const, accountId: 'acc-claude-1',
  model: 'Sonnet', effort: 'moyen' as const, loops: 1, files: [] as string[], deps: [] as string[],
  criteria: [] as { text: string; done: boolean }[], budget: 40000, used: 0, done: dod([]), priority: 99,
};

function finished(id: string, title: string, o: { lot?: number; reportedIn?: string; summary: string; added: string[]; files: [string, number, number][]; tests: string; cdc?: string[] }): Ticket {
  return {
    ...base, id, title, lot: o.lot ?? 1, part: (o.lot ?? 1) === 1 ? 'Socle' : 'Réservation', status: 'termine',
    used: 6000 + (id.charCodeAt(2) % 7) * 1700, done: allOk, reportedIn: o.reportedIn,
    criteria: [{ text: 'Critères du ticket tenus', done: true }],
    description: desc(`Ticket du lot ${o.lot ?? 1}.`, title, undefined, o.cdc ?? []),
    realized: {
      summary: o.summary, added: o.added, files: o.files.map(([path, plus, minus]) => ({ path, plus, minus })),
      tests: o.tests, commits: [`${id.toLowerCase()}: ${title.toLowerCase()}`], branch: `${id.toLowerCase()}`,
    },
  };
}

export const tickets: Ticket[] = [
  finished('T-3', 'Initialiser le projet Next.js', { reportedIn: 'CR-12', summary: 'Projet Next.js 14 créé avec TypeScript strict et ESLint.', added: ['Structure du projet', 'Scripts dev, build, test'], files: [['package.json', 38, 0], ['tsconfig.json', 24, 0]], tests: 'Lanceur de tests en place, 1 test.' }),
  finished('T-4', 'Base de données Prisma', { reportedIn: 'CR-12', summary: 'Schéma Prisma : clubs, terrains, joueurs.', added: ['Base PostgreSQL locale', 'Script db:reset'], files: [['prisma/schema.prisma', 64, 0]], tests: '4 tests sur le schéma.', cdc: ['EX-01'] }),
  finished('T-5', 'Mise en page et thème', { reportedIn: 'CR-12', summary: 'Gabarit des pages, couleurs du club, polices.', added: ['En-tête et pied de page', 'Thème clair et sombre'], files: [['src/app/layout.tsx', 72, 4]], tests: 'Contrôle visuel dans l’aperçu.' }),
  finished('T-6', 'Page d’accueil du club', { reportedIn: 'CR-13', summary: 'Accueil avec horaires, adresse et bouton Réserver.', added: ['Page d’accueil'], files: [['src/app/page.tsx', 96, 2]], tests: '2 tests de rendu.', cdc: ['EX-02'] }),
  finished('T-7', 'Liste des terrains', { reportedIn: 'CR-13', summary: 'Liste filtrable par type de terrain.', added: ['Page Terrains', 'Filtre intérieur / extérieur'], files: [['src/app/terrains/page.tsx', 88, 0]], tests: '5 tests.', cdc: ['EX-03'] }),
  finished('T-8', 'Fiche d’un terrain', { reportedIn: 'CR-13', summary: 'Photos, équipements et tarifs d’un terrain.', added: ['Fiche terrain'], files: [['src/app/terrains/[id]/page.tsx', 71, 0]], tests: '3 tests.', cdc: ['EX-03'] }),
  finished('T-9', 'Horaires d’ouverture', { reportedIn: 'CR-14', summary: 'Horaires par jour, jours fériés fermés.', added: ['Règles d’ouverture'], files: [['src/lib/hours.ts', 54, 0]], tests: '8 tests.', cdc: ['EX-04'] }),
  finished('T-10', 'Modèle des créneaux', { lot: 2, reportedIn: 'CR-14', summary: 'Créneaux de 1 h 30 calculés à partir des horaires.', added: ['Type Slot', 'Calcul des créneaux'], files: [['src/lib/slots.ts', 48, 0]], tests: '12 tests.', cdc: ['EX-05'] }),
  finished('T-11', 'API des créneaux', { lot: 2, summary: 'Route GET /api/slots qui renvoie les créneaux libres d’un jour.', added: ['Route /api/slots', 'Cache de 30 secondes'], files: [['src/app/api/slots/route.ts', 61, 0], ['src/lib/slots.ts', 12, 3]], tests: '9 tests, dont 2 sur les jours fermés.', cdc: ['EX-05'] }),
  {
    ...base, id: 'T-12', title: 'Calendrier de réservation', priority: 1,
    description: desc(
      'Les joueurs doivent voir les créneaux libres d’un terrain et en choisir un. Les créneaux durent 1 h 30 (décision D-02).',
      'Un calendrier semaine par semaine, créneaux libres en clair, créneaux pris grisés, sélection en un clic.',
      'Le paiement (T-16) et les e-mails (T-17).', ['EX-05', 'EX-06'],
    ),
    criteria: [{ text: 'Choisir un créneau', done: true }, { text: 'Refuser un créneau pris', done: true }, { text: 'Fuseau horaire du club', done: false }, { text: 'Tests e2e', done: false }],
    deps: ['T-10', 'T-11'], status: 'en-cours', agentId: 'agent-12', used: 12000, files: ['src/calendar.ts', 'src/calendar.test.ts'],
    done: dod(['attente', 'ok', 'ok', 'ok', 'attente', 'attente']),
  },
  {
    ...base, id: 'T-13', title: 'Tests e2e du parcours', priority: 2, part: 'Qualité',
    description: desc('Le parcours complet doit être vérifié automatiquement avant chaque version.', 'Un scénario Playwright : choisir un terrain, un créneau, réserver.', 'Le paiement réel.', ['EX-09']),
    criteria: [{ text: 'Scénario réservation vert', done: false }], status: 'en-cours', tool: 'codex', accountId: 'acc-codex', model: 'gpt-codex',
    agentId: 'agent-13', used: 28000, files: ['e2e/booking.spec.ts'],
  },
  {
    ...base, id: 'T-14', title: 'Connexion des joueurs', priority: 3, part: 'Comptes',
    description: desc('Un joueur doit retrouver ses réservations.', 'Connexion par lien magique envoyé par e-mail, session de 30 jours.', 'Connexion par mot de passe ou réseaux sociaux.', ['EX-07']),
    criteria: [{ text: 'Lien magique', done: true }, { text: 'Session 30 jours', done: true }, { text: 'Déconnexion', done: true }, { text: 'Tests verts', done: true }],
    status: 'a-tester', used: 12000, done: allOk,
    realized: {
      summary: 'Connexion par lien magique. Le lien expire après 15 minutes. La session dure 30 jours.',
      added: ['Page Connexion', 'Envoi du lien par e-mail', 'Bouton Déconnexion dans l’en-tête'],
      files: [{ path: 'src/app/connexion/page.tsx', plus: 74, minus: 0 }, { path: 'src/lib/auth.ts', plus: 92, minus: 0 }, { path: 'src/components/Header.tsx', plus: 9, minus: 2 }],
      tests: '11 tests verts, dont l’expiration du lien.', commits: ['t-14: page de connexion', 't-14: lien magique et session'], branch: 't-14-connexion',
    },
  },
  {
    ...base, id: 'T-15', title: 'Envoi de SMS de rappel', priority: 4, part: 'Notifications',
    description: desc('Beaucoup de joueurs oublient leur réservation.', 'Un SMS la veille à 18 h avec le terrain et l’heure.', 'Les SMS marketing.', ['EX-08']),
    criteria: [{ text: 'SMS envoyé la veille à 18 h', done: false }], status: 'action', tool: 'codex', accountId: 'acc-codex', model: 'gpt-codex',
    agentId: 'agent-15', used: 2000, needAction: 'Clé API SMS manquante',
  },
  {
    ...base, id: 'T-18', title: 'Déploiement automatique', priority: 9, part: 'Exploitation', lot: 3, model: 'Opus', effort: 'haut', used: 3000,
    description: desc('Déployer chaque version validée sans manipulation.', 'Un workflow de déploiement déclenché après accord.', 'Tout déploiement sans accord.', ['EX-10']),
    criteria: [{ text: 'Déploiement sur accord', done: false }], status: 'action',
    securityBlock: 'Le ticket veut modifier .github/workflows/deploy.yml, un fichier sensible.',
  },
  {
    ...base, id: 'T-17', title: 'E-mails de confirmation', priority: 5, deps: ['T-11'], status: 'a-faire',
    description: desc('Le joueur veut une preuve de sa réservation.', 'Un e-mail avec terrain, date, heure et lien d’annulation.', 'Les rappels (T-15).', ['EX-08']),
    criteria: [{ text: 'Modèle d’e-mail relu', done: false }, { text: 'Envoyé en moins d’une minute', done: false }],
  },
  {
    ...base, id: 'T-16', title: 'Paiement Stripe', priority: 6, deps: ['T-12'], status: 'a-faire', waitingFor: 'Attend T-12',
    description: desc('Le club veut être payé à la réservation.', 'Paiement par carte en mode test, puis réservation confirmée.', 'Les remboursements.', ['EX-06']),
    criteria: [{ text: 'Paiement en mode test', done: false }],
  },
  {
    ...base, id: 'T-19', title: 'Tableau de bord du club', priority: 7, lot: 3, status: 'a-faire',
    description: desc('Le gérant veut suivre l’occupation.', 'Taux d’occupation par jour et par terrain.', 'Les exports comptables.', ['EX-11']),
    criteria: [{ text: 'Chiffres justes sur 3 cas', done: false }],
  },

  { ...base, id: 'J-1', projectId: 'job', title: 'Audit complet du dépôt', priority: 1, status: 'en-cours', part: 'Audit', lot: 0, model: 'Opus', effort: 'haut', agentId: 'agent-j1', used: 12000, budget: 120000, description: desc('Code repris d’un autre dépôt.', 'Grilles OWASP, architecture, qualité, tests remplies avec preuves.') },
  { ...base, id: 'J-2', projectId: 'job', title: 'Rapport d’audit et verdict', priority: 2, deps: ['J-1'], status: 'a-faire', waitingFor: 'Attend J-1', part: 'Audit', lot: 0, description: desc('Suite de J-1.', 'Verdict : garder, corriger, refondre ou refaire.') },

  ...['P-1 Structure Astro', 'P-2 Pages projets', 'P-3 Formulaire de contact', 'P-4 Référencement', 'P-5 Performances'].map((s) => {
    const [id, ...t] = s.split(' ');
    return { ...finished(id, t.join(' '), { lot: 3, reportedIn: 'CR-P2', summary: t.join(' '), added: [t.join(' ')], files: [['src/pages/index.astro', 40, 0]], tests: 'Vérifié dans l’aperçu.' }), projectId: 'portfolio', part: 'Site' };
  }),
  { ...base, id: 'P-6', projectId: 'portfolio', title: 'Note de version 1.0', priority: 1, status: 'a-tester', lot: 3, part: 'Livraison', used: 4000, done: allOk, description: desc('Version prête.', 'Résumer la version pour vos visiteurs.') },
];

export const agents: Agent[] = [
  { id: 'agent-12', name: 'agent-12', projectId: 'padel', ticketId: 'T-12', tool: 'claude-code', accountId: 'acc-claude-1', model: 'Sonnet', effort: 'moyen', state: 'travaille', tokens: 12000, lastAction: 'écrit calendar.ts' },
  { id: 'agent-13', name: 'agent-13', projectId: 'padel', ticketId: 'T-13', tool: 'codex', accountId: 'acc-codex', model: 'gpt-codex', effort: 'moyen', state: 'tests', tokens: 28000, lastAction: 'compactage sans retour depuis 6 min' },
  { id: 'agent-15', name: 'agent-15', projectId: 'padel', ticketId: 'T-15', tool: 'codex', accountId: 'acc-codex', model: 'gpt-codex', effort: 'moyen', state: 'attend', tokens: 2000, lastAction: 'clé SMS absente' },
  { id: 'agent-j1', name: 'agent-j1', projectId: 'job', ticketId: 'J-1', tool: 'claude-code', accountId: 'acc-claude-2', model: 'Opus', effort: 'haut', state: 'travaille', tokens: 12000, lastAction: 'remplit la grille OWASP' },
];

export const accounts: Account[] = [
  { id: 'acc-claude-1', tool: 'claude-code', label: 'Claude principal', plan: 'Max', connected: true, quota5h: 42, reset5h: '16:40', quota7d: 8, reset7d: 'lundi 9:00' },
  { id: 'acc-claude-2', tool: 'claude-code', label: 'Claude secondaire', plan: 'Pro', connected: true, quota5h: 0, reset5h: '—', quota7d: 41, reset7d: 'jeudi 14:00' },
  { id: 'acc-codex', tool: 'codex', label: 'Codex principal', plan: 'Plus', connected: true, quota5h: 92, reset5h: '15:10', quota7d: 51, reset7d: 'jeudi 18:00' },
  { id: 'acc-gemini', tool: 'gemini-cli', label: 'Gemini', plan: 'Gratuit', connected: false, problem: 'Le programme « gemini » est introuvable sur ce PC.', fixCommand: 'npm install -g @google/gemini-cli', quota5h: 0, reset5h: '—', quota7d: 0, reset7d: '—' },
];

const agent12 = { kind: 'agent' as const, name: 'agent-12' };
export const conversations: Record<string, ConversationItem[]> = {
  'T-12': [
    { type: 'msg', from: { kind: 'programme', name: 'Programme' }, at: '13:58', text: 'Ticket lancé par le pilote automatique : T-10 et T-11 sont finis. Contexte préparé : ticket, exigences EX-05 et EX-06 du cahier des charges, 14 éléments du graphe, 2 décisions (6 800 tokens).' },
    { type: 'msg', from: agent12, at: '14:02', text: 'J’ai lu le graphe : le calendrier touche 3 fichiers.\nJe crée src/calendar.ts et son test.' },
    { type: 'edit', at: '14:03', file: 'src/calendar.ts', plus: 84, minus: 0 },
    { type: 'edit', at: '14:03', file: 'src/calendar.test.ts', plus: 52, minus: 0 },
    { type: 'cmd', at: '14:04', command: 'npm test', summary: '42 passés, 0 échec', ok: true },
    { type: 'question', at: '14:04', from: agent12, text: 'Créneaux de 1 h ou de 1 h 30 ?', choices: ['1 h', '1 h 30', 'Autre…'], answer: '1 h 30' },
    { type: 'msg', from: { kind: 'vous', name: 'Vous' }, at: '14:05', text: '1 h 30, comme sur le cahier des charges.' },
    { type: 'msg', from: agent12, at: '14:06', text: 'Compris. J’adapte la grille et j’ajoute le fuseau horaire.' },
  ],
  'T-13': [
    { type: 'cmd', at: '14:02', command: 'npx playwright test', summary: '3 échecs : sélecteur du calendrier introuvable', ok: false },
    { type: 'msg', from: { kind: 'regle', name: 'Règle' }, at: '14:08', text: 'Contexte de l’agent à 88 % : compactage natif lancé (1 fois).' },
    { type: 'msg', from: { kind: 'regle', name: 'Règle' }, at: '14:14', text: 'Pas de retour du compactage depuis 6 minutes. Incident INC-4 ouvert. Recette proposée : session neuve avec passation.' },
  ],
  'T-15': [
    { type: 'cmd', at: '13:40', command: 'npm test -- sms', summary: '1 échec : SMS_API_KEY undefined', ok: false },
    { type: 'msg', from: { kind: 'regle', name: 'Règle' }, at: '13:41', text: 'Cause connue : clé d’API absente. Ticket mis en « Besoin d’action ». Aucune relance automatique.' },
  ],
};

export const events: LogEvent[] = [
  { id: 'e1', ticketId: 'T-12', at: '13:58', actor: { kind: 'programme', name: 'Programme' }, kind: 'info', text: 'Espace de travail créé sur la branche t-12-calendrier.' },
  { id: 'e2', ticketId: 'T-12', at: '14:01', actor: agent12, kind: 'lecture', text: 'A lu le sous-graphe « réservation » (14 éléments).' },
  { id: 'e3', ticketId: 'T-12', at: '14:01', actor: agent12, kind: 'lecture', text: 'A lu src/slots.ts, lignes 1 à 48.' },
  { id: 'e4', ticketId: 'T-12', at: '14:03', actor: agent12, kind: 'modif', text: 'A créé src/calendar.ts (+84).' },
  { id: 'e5', ticketId: 'T-12', at: '14:04', actor: agent12, kind: 'commande', text: 'npm test : sortie complète de 312 lignes gardée ici. L’agent a reçu 1 ligne de résumé.' },
  { id: 'e6', ticketId: 'T-12', at: '14:06', actor: { kind: 'orchestrateur', name: 'Orchestrateur' }, kind: 'regle', text: 'Verrouille src/calendar.ts pour agent-12.' },
];

export const interventions: Intervention[] = [
  { at: '14:14', who: 'règle', kind: 'regle', text: 'agent-13 : compactage sans retour, incident INC-4 ouvert' },
  { at: '14:06', who: 'orchestrateur', kind: 'verrou', text: 'verrouille calendar.ts pour agent-12' },
  { at: '14:04', who: 'règle', kind: 'bascule', text: 'T-13 : Codex à 92 %, passera sur Claude au prochain tour' },
  { at: '14:01', who: 'agent-13 vers agent-12', kind: 'message', text: '« J’ai besoin du type Slot » (message, 0 token)' },
  { at: '13:58', who: 'pilote automatique', kind: 'regle', text: 'T-11 fini : lance T-12, le suivant prêt dans la file' },
];

export const humanActions: HumanAction[] = [
  {
    id: 'h1', projectId: 'padel', ticketId: 'T-15', ticketTitle: 'Envoi de SMS de rappel', kind: 'cle', title: 'Clé API SMS absente',
    cause: 'La clé API du service SMS est absente du fichier .env.', proof: 'test sms.spec.ts → « SMS_API_KEY undefined »',
    todo: 'Ajoutez SMS_API_KEY dans .env. L’agent ne lit jamais ce fichier.', blocking: true, since: '12 min',
    buttons: ['C’est fait, reprendre', 'Reporter', 'Voir le ticket'],
  },
  {
    id: 'h2', projectId: 'padel', ticketId: 'T-18', ticketTitle: 'Déploiement automatique', kind: 'securite', title: 'Bloqué par sécurité',
    cause: 'Le ticket veut modifier .github/workflows/deploy.yml, un fichier sensible.', rule: 'Décision D-04 « Déploiement sur accord du propriétaire »',
    todo: 'Autorisez ce ticket seulement si vous voulez un déploiement automatique.', blocking: true, since: '35 min', buttons: ['Autoriser ce ticket', 'Refuser'],
  },
  {
    id: 'h5', projectId: 'padel', ticketId: 'T-13', ticketTitle: 'Tests e2e du parcours', kind: 'question', title: 'Compactage sans retour sur agent-13',
    cause: 'Le compactage natif a été lancé à 14:08 et n’a pas répondu depuis 6 minutes.', proof: 'INC-4 : dernière sortie de codex à 14:08:12',
    todo: 'Relancer en session neuve : même branche, fichier de passation écrit par le programme.', blocking: true, since: '6 min',
    buttons: ['Relancer en session neuve', 'Voir l’incident'],
  },
  {
    id: 'h3', projectId: 'padel', ticketId: 'T-14', ticketTitle: 'Connexion des joueurs', kind: 'reunion', title: 'T-14 est prêt : tous les critères sont tenus',
    cause: 'Les 4 critères et la définition de fini sont vérifiés par le programme.', todo: 'Testez dans l’aperçu, puis validez. Le travail sera réuni dans main.',
    blocking: false, since: '1 h', buttons: ['Valider T-14', 'Ouvrir l’aperçu'],
  },
  {
    id: 'h4', projectId: 'job', kind: 'installation', title: 'Installer gitleaks', cause: 'Le scan de job-hunter a sauté la recherche de secrets : gitleaks est absent.',
    todo: 'Lancez cette commande, puis relancez le scan.', blocking: false, since: '2 h', buttons: ['C’est fait, relancer le scan'], command: 'winget install --id Gitleaks.Gitleaks',
  },
];

export const proposals: Proposal[] = [
  { id: 'p1', projectId: 'padel', from: 'agent-12', text: 'Limiter les réservations à 2 créneaux par joueur et par jour', why: 'Évite qu’un joueur bloque tous les terrains.' },
  { id: 'p2', projectId: 'padel', from: 'scan jscpd', text: 'Fusionner deux composants de carte de terrain presque identiques', why: '64 lignes dupliquées.' },
];

export const chat: ChatMessage[] = [
  { id: 'c1', from: { kind: 'orchestrateur', name: 'Orchestrateur' }, at: '08:00', text: 'Bonjour. Depuis hier : T-14 est prêt à tester, T-15 attend une clé, T-18 est bloqué par sécurité. Rien n’attend en silence.' },
  { id: 'c2', from: { kind: 'vous', name: 'Vous' }, at: '10:12', text: 'lance T-17 sur Codex après T-13' },
  { id: 'c3', from: { kind: 'orchestrateur', name: 'Orchestrateur' }, at: '10:12', text: 'Compris par règle, sans IA : T-17 passe en tête de la file du pilote automatique, sur Codex.' },
];

export const audit: AuditReport = {
  date: '12 nov.', what: 'Site de réservation de terrains de padel pour un club.', stack: 'Next.js 14, Prisma, PostgreSQL, Stripe',
  good: 'Structure claire, TypeScript strict.', flaws: { critique: 1, haute: 3, moyenne: 5, tools: 'gitleaks, osv-scanner' },
  habits: 'Pas de tests sur le paiement. Secrets dans next.config.', verdict: 'corriger',
  verdictText: 'Garder et corriger : sécurité d’abord, environ 6 tickets.',
};

export const reports: DailyReport[] = [
  { id: 'CR-14', date: '14 nov.', tickets: ['T-9', 'T-10'], done: ['T-9 Horaires d’ouverture', 'T-10 Modèle des créneaux'], inProgress: ['T-11 API des créneaux'], blocked: [], tokens: 64000, waiting: ['Rien'] },
  { id: 'CR-13', date: '13 nov.', tickets: ['T-6', 'T-7', 'T-8'], done: ['T-6 Page d’accueil', 'T-7 Liste des terrains', 'T-8 Fiche d’un terrain'], inProgress: ['T-9'], blocked: [], tokens: 113000, waiting: ['Valider la page d’accueil'] },
  { id: 'CR-12', date: '12 nov.', tickets: ['T-3', 'T-4', 'T-5'], done: ['T-3 Initialisation', 'T-4 Base Prisma', 'T-5 Mise en page'], inProgress: ['T-6'], blocked: [], tokens: 82000, waiting: ['Lire le rapport d’audit'] },
];

export const decisions: Decision[] = [
  { id: 'D-01', title: 'Next.js et Prisma pour tout le site', forbids: 'Aucun autre framework web.' },
  { id: 'D-02', title: 'Créneaux de 1 h 30', forbids: 'Pas de créneau d’une autre durée.' },
  { id: 'D-03', title: 'Paiement par Stripe uniquement', forbids: 'Pas d’autre prestataire de paiement.' },
  { id: 'D-04', title: 'Déploiement sur accord du propriétaire', forbids: 'Pas de modification de .github/workflows sans accord.' },
];

export const stats: Stats = {
  tokensPerTicket: 180000, loopsPerTicket: 1.2, firstTry: 78,
  blocks: [{ cause: 'environnement', n: 3 }, { cause: 'clé absente', n: 2 }, { cause: 'compactage', n: 1 }, { cause: 'sécurité', n: 1 }],
};

export const usageByDay: DayUsage[] = [
  { day: 'mar.', tokens: 82000 }, { day: 'mer.', tokens: 113000 }, { day: 'jeu.', tokens: 64000 },
  { day: 'ven.', tokens: 0 }, { day: 'sam.', tokens: 21000 }, { day: 'dim.', tokens: 0 }, { day: 'lun.', tokens: 50000 },
];

export const usageByTool: ToolUsage[] = [
  { tool: 'claude-code', model: 'Sonnet', tokens: 241000, cost: 1.42, firstTry: 81 },
  { tool: 'claude-code', model: 'Opus', tokens: 64000, cost: 1.18, firstTry: 86 },
  { tool: 'claude-code', model: 'Haiku', tokens: 19000, cost: 0.04, firstTry: 92 },
  { tool: 'codex', model: 'gpt-codex', tokens: 155000, cost: 0.79, firstTry: 64 },
];

export const budgets = { day: 200000, usedToday: 50000, ticketDefault: 40000 };

export const epics = [
  { id: 'E1', title: 'Socle du site', stories: [{ title: 'Le club présente ses terrains', tickets: ['T-6', 'T-7', 'T-8', 'T-9'] }, { title: 'Le site a une base solide', tickets: ['T-3', 'T-4', 'T-5'] }] },
  { id: 'E2', title: 'Réservation', stories: [{ title: 'Le joueur réserve un créneau', tickets: ['T-10', 'T-11', 'T-12', 'T-13'] }, { title: 'Le joueur paie et reçoit sa confirmation', tickets: ['T-16', 'T-17', 'T-15'] }] },
  { id: 'E3', title: 'Comptes et exploitation', stories: [{ title: 'Le joueur a un compte', tickets: ['T-14'] }, { title: 'Le club suit son activité', tickets: ['T-19', 'T-18'] }] },
];


export const toolInstalls = [
  { tool: 'claude-code' as const, version: '2.4.1', bridge: 'Claude Agent SDK (officiel)', login: 'claude puis /login' },
  { tool: 'codex' as const, version: '0.61.0', bridge: 'codex exec --json (officiel)', login: 'codex login' },
  { tool: 'gemini-cli' as const, version: null, bridge: 'gemini --output-format json', login: 'gemini' },
];

export const approvals = [
  { id: 'ap1', what: 'Lancer npm install dans padel-site', scope: 'padel-site', until: '30 nov.' },
  { id: 'ap2', what: 'Créer des branches t-*', scope: 'Tous les projets', until: 'Sans fin' },
];

// ---------- Cahier des charges ----------
export const cdcFolder = 'docs/cahier-des-charges/';
export const cdcFiles: CdcFile[] = [
  { name: 'cahier-des-charges.md', kind: 'texte', size: '14 Ko', updated: '10 nov.' },
  { name: 'maquette-reservation.png', kind: 'image', size: '420 Ko', updated: '10 nov.' },
  { name: 'tarifs-club-2026.pdf', kind: 'pdf', size: '96 Ko', updated: '11 nov.' },
];
export const requirements: Requirement[] = [
  { id: 'EX-01', section: 'Données', text: 'Le site gère plusieurs terrains d’un même club.', tickets: ['T-4'] },
  { id: 'EX-02', section: 'Accueil', text: 'L’accueil montre horaires, adresse et un bouton Réserver.', tickets: ['T-6'] },
  { id: 'EX-03', section: 'Terrains', text: 'Chaque terrain a une fiche avec photos, équipements et tarif.', tickets: ['T-7', 'T-8'] },
  { id: 'EX-04', section: 'Horaires', text: 'Ouvert de 8 h à 23 h, fermé le 25 décembre.', tickets: ['T-9'] },
  { id: 'EX-05', section: 'Réservation', text: 'Créneaux de 1 h 30, réservables en ligne.', tickets: ['T-10', 'T-11', 'T-12'] },
  { id: 'EX-06', section: 'Réservation', text: 'Paiement en ligne à la réservation.', tickets: ['T-12', 'T-16'] },
  { id: 'EX-07', section: 'Comptes', text: 'Le joueur retrouve ses réservations.', tickets: ['T-14'] },
  { id: 'EX-08', section: 'Notifications', text: 'Confirmation par e-mail et rappel par SMS la veille.', tickets: ['T-15', 'T-17'] },
  { id: 'EX-09', section: 'Qualité', text: 'Le parcours de réservation est testé automatiquement.', tickets: ['T-13'] },
  { id: 'EX-10', section: 'Exploitation', text: 'Mise en ligne sur accord du gérant.', tickets: ['T-18'] },
  { id: 'EX-11', section: 'Gestion', text: 'Le gérant voit l’occupation des terrains.', tickets: ['T-19'] },
  { id: 'EX-12', section: 'Gestion', text: 'Le gérant peut bloquer un terrain pour un tournoi.', tickets: [] },
  { id: 'EX-13', section: 'Accessibilité', text: 'Le site est utilisable au clavier et lisible (WCAG AA).', tickets: [] },
];

// ---------- Git ----------
export const branches: GitBranch[] = [
  { name: 'main', status: 'principale', ahead: 0, behind: 0, lastCommit: 'réunion de t-11 : API des créneaux', at: 'hier 18:20' },
  { name: 't-12-calendrier', ticket: 'T-12', status: 'en-cours', ahead: 3, behind: 0, lastCommit: 'calendrier : grille de 1 h 30', at: '14:06' },
  { name: 't-13-e2e', ticket: 'T-13', status: 'en-cours', ahead: 1, behind: 0, lastCommit: 'e2e : premier scénario', at: '13:55' },
  { name: 't-14-connexion', ticket: 'T-14', status: 'a-reunir', ahead: 2, behind: 0, lastCommit: 'lien magique et session', at: '11:40' },
  { name: 't-15-sms', ticket: 'T-15', status: 'conflit', ahead: 1, behind: 2, lastCommit: 'service SMS', at: '13:40' },
  { name: 't-9-horaires', ticket: 'T-9', status: 'orpheline', ahead: 0, behind: 6, lastCommit: 'horaires (déjà réunie)', at: '14 nov.' },
];
export const commits: GitCommit[] = [
  { sha: 'a41c9e2', message: 'Réunion de T-11 : API des créneaux', ticket: 'T-11', at: 'hier 18:20', restorePoint: 'avant-T-11' },
  { sha: '7be03d1', message: 'Réunion de T-10 : modèle des créneaux', ticket: 'T-10', at: '14 nov. 17:02', restorePoint: 'avant-T-10' },
  { sha: 'c2f88a0', message: 'Réunion de T-9 : horaires d’ouverture', ticket: 'T-9', at: '14 nov. 11:15', restorePoint: 'avant-T-9' },
  { sha: '19d4b77', message: 'Réunion de T-8 : fiche d’un terrain', ticket: 'T-8', at: '13 nov. 16:48', restorePoint: 'avant-T-8' },
  { sha: 'e0a5513', message: 'Réunion de T-7 : liste des terrains', ticket: 'T-7', at: '13 nov. 12:30', restorePoint: 'avant-T-7' },
  { sha: '5c11f02', message: 'Réunion de T-6 : page d’accueil', ticket: 'T-6', at: '13 nov. 10:05', restorePoint: 'avant-T-6' },
];

// ---------- Santé : audit du fonctionnement ----------
export const health: HealthCheck[] = [
  {
    id: 'h-compact', severity: 'grave', area: 'compactage', title: 'Compactage sans retour sur agent-13',
    cause: 'Le compactage natif de Codex a été lancé à 14:08 et n’a rien renvoyé depuis 6 minutes.',
    proof: 'Dernière sortie de codex exec à 14:08:12. Processus vivant, aucune ligne JSON.',
    fix: 'Arrêter proprement, puis relancer une session neuve avec le fichier de passation. Même branche, rien perdu.', fixLabel: 'Relancer en session neuve', status: 'ouvert',
  },
  {
    id: 'h-tokens', severity: 'attention', area: 'tokens', title: 'T-13 consomme 3 fois la moyenne',
    cause: 'L’agent relit la sortie complète de Playwright à chaque essai.',
    proof: '28 k tokens en 25 min. Moyenne des tickets : 9 k sur la même durée.',
    fix: 'Activer le résumé pour « npx playwright test » : l’agent ne recevra que les échecs.', fixLabel: 'Activer le résumé', status: 'ouvert',
  },
  {
    id: 'h-ctx', severity: 'info', area: 'contexte', title: 'Contexte d’agent-12 à 71 %',
    cause: 'Session longue sur T-12.', proof: '142 k sur 200 k tokens de contexte.',
    fix: 'Compactage natif prévu à 85 %, une seule fois. Ensuite, session neuve avec passation.', status: 'ouvert',
  },
  {
    id: 'h-git', severity: 'attention', area: 'git', title: 'Branche t-9-horaires oubliée',
    cause: 'La branche est déjà réunie dans main mais n’a pas été nettoyée.', proof: '0 commit d’avance, 6 de retard sur main.',
    fix: 'Supprimer la branche locale et son espace de travail. Rien n’est perdu : tout est dans main.', fixLabel: 'Nettoyer', status: 'ouvert',
  },
  {
    id: 'h-loop', severity: 'attention', area: 'boucle', title: 'Boucle évitée sur T-15', auto: true,
    cause: 'Même erreur deux fois de suite (SMS_API_KEY undefined).', proof: 'npm test -- sms : même message à 13:38 et 13:40.',
    fix: 'Ticket arrêté et mis en « Besoin d’action » au lieu d’une 3ᵉ relance.', status: 'resolu',
  },
  {
    id: 'h-session', severity: 'info', area: 'session', title: '2 sessions abandonnées nettoyées', auto: true,
    cause: 'Sessions sans activité depuis plus de 12 heures.', proof: 'Sessions du 16 nov. sur T-11 et T-9.',
    fix: 'Nettoyées automatiquement par la recette « sessions vides ».', status: 'resolu',
  },
  {
    id: 'h-disk', severity: 'attention', area: 'disque', title: 'Disque : 11 Go libres',
    cause: 'Les espaces de travail et node_modules prennent de la place.', proof: '6 espaces de travail, 4,2 Go au total.',
    fix: 'Nettoyer les espaces de travail des tickets finis.', fixLabel: 'Libérer 2,8 Go', status: 'ouvert',
  },
];

export const incidents: Incident[] = [
  {
    id: 'INC-4', title: 'Compactage sans retour sur agent-13', status: 'ouvert', opened: 'aujourd’hui 14:14', ticket: 'T-13',
    timeline: [{ at: '14:08', text: 'Contexte à 88 % : compactage natif lancé.' }, { at: '14:14', text: 'Aucune sortie depuis 6 min : incident ouvert, ticket mis en « Besoin d’action ».' }],
  },
  {
    id: 'INC-3', title: 'Codex ne démarrait plus', status: 'resolu', opened: '15 nov. 09:12',
    timeline: [{ at: '09:12', text: 'codex exec sort avec le code 1, sans message.' }, { at: '09:13', text: 'Recette connue : état SQLite de ~/.codex corrompu (-wal devenu dossier).' }, { at: '09:20', text: 'Commande donnée au propriétaire, exécutée par lui.' }, { at: '09:21', text: 'Test de connexion réussi. Tickets repris par le même agent.' }],
    resolution: 'État de Codex reconstruit par le propriétaire. Recette ajoutée à la liste des pannes connues.',
  },
  {
    id: 'INC-2', title: 'Chemin trop long sous Windows', status: 'resolu', opened: '12 nov. 15:40', ticket: 'T-5',
    timeline: [{ at: '15:40', text: 'npm install échoue : chemin de plus de 260 caractères.' }, { at: '15:41', text: 'Recette : espaces de travail déplacés vers C:\\lba\\wt.' }],
    resolution: 'Espaces de travail raccourcis. Réglage gardé pour tous les projets.',
  },
];

export const autopilotDefaults = { on: true, maxParallel: 2, stopAtLotEnd: true, respectBudget: true };

// ---------- Équipe composée par l'orchestrateur ----------
export const roles: Role[] = [
  { id: 'analyste', name: 'Analyste', mission: 'Lit le cahier des charges, découpe en exigences et en tickets, vérifie les doublons.', tool: 'claude-code', model: 'Sonnet', skills: ['cadrage', 'backlog'], kind: 'equipe', max: 1 },
  { id: 'architecte', name: 'Architecte', mission: 'Choisit la structure, écrit les décisions, relit les choix risqués.', tool: 'claude-code', model: 'Opus', skills: ['architecture', 'décisions'], kind: 'equipe', max: 1 },
  { id: 'dev-front', name: 'Développeur interface', mission: 'Écrit les pages et composants. Suit le design validé.', tool: 'claude-code', model: 'Sonnet', skills: ['design', 'tests'], kind: 'equipe', max: 2 },
  { id: 'dev-back', name: 'Développeur serveur', mission: 'Écrit l’API, la base de données et les intégrations.', tool: 'codex', model: 'gpt-codex', skills: ['tests', 'sécurité'], kind: 'equipe', max: 2 },
  { id: 'testeur', name: 'Testeur', mission: 'Écrit et lance les tests de bout en bout. Ne reçoit que les résumés.', tool: 'codex', model: 'gpt-codex', skills: ['tests'], kind: 'equipe', max: 1 },
  { id: 'securite', name: 'Relecteur sécurité', mission: 'Relit chaque ticket fini avec les scans gratuits avant « À tester ».', tool: 'claude-code', model: 'Opus', skills: ['sécurité', 'audit'], kind: 'equipe', max: 1 },
  { id: 'redacteur', name: 'Rédacteur', mission: 'Met à jour la documentation et les notes de version.', tool: 'claude-code', model: 'Haiku', skills: ['compte rendu'], kind: 'equipe', max: 1 },
  { id: 'eclaireur', name: 'Éclaireur', mission: 'Cherche sur Internet la documentation officielle et les bonnes versions. Lecture seule.', tool: 'claude-code', model: 'Haiku', skills: ['recherche'], kind: 'aide', max: 1, web: true },
  { id: 'importateur', name: 'Importateur', mission: 'Évalue un dépôt, un modèle ou une skill (licence, sécurité, Windows), puis l’importe sur votre accord.', tool: 'claude-code', model: 'Sonnet', skills: ['évaluation'], kind: 'aide', max: 1, web: true },
];

export const agentRoles: Record<string, string> = { 'agent-12': 'dev-front', 'agent-13': 'testeur', 'agent-15': 'dev-back', 'agent-j1': 'securite' };

export const setupSteps: SetupStep[] = [
  { id: 's1', title: 'Scanner le dépôt', who: 'Programme', status: 'fait', tokens: 0, result: 'Next.js 14, Prisma, 3 tests, pas de CI. Graphe Graphify créé (412 éléments).' },
  { id: 's2', title: 'Lire le cahier des charges', who: 'Analyste', status: 'fait', tokens: 9000, result: '13 exigences extraites, dont 2 sans ticket.' },
  {
    id: 's3', title: 'Chercher la documentation officielle', who: 'Éclaireur', status: 'fait', tokens: 6000, result: 'Versions vérifiées et bonnes pratiques notées dans la mémoire du projet.',
    sources: [{ label: 'Next.js, routage App Router', url: 'nextjs.org/docs' }, { label: 'Prisma, migrations', url: 'prisma.io/docs' }, { label: 'Stripe, mode test', url: 'docs.stripe.com/testing' }, { label: 'Playwright, Windows', url: 'playwright.dev/docs' }],
  },
  { id: 's4', title: 'Importer des briques utiles', who: 'Importateur', status: 'fait', tokens: 7000, result: 'Skill « Stripe mode test » importée sur votre accord. Modèle de tests Playwright importé. 1 dépôt refusé (licence).' },
  { id: 's5', title: 'Composer l’équipe', who: 'Programme', status: 'fait', tokens: 0, result: '7 rôles, outils et modèles choisis par règles selon le risque et vos quotas.' },
  { id: 's6', title: 'Installer les outils manquants', who: 'Vous', status: 'a-faire', tokens: 0, result: 'gitleaks manquant : commande prête dans « Besoin d’action ».' },
  { id: 's7', title: 'Lancer le pilote automatique', who: 'Orchestrateur', status: 'fait', tokens: 0, result: 'File de tickets prête. 2 agents au plus en même temps.' },
];

export const flow: FlowStage[] = [
  { step: 'comprendre', roles: ['Analyste', 'Éclaireur'], produces: ['Rapport d’audit', 'Cahier des charges relu'], gate: 'Verdict validé par vous', tokens: 22000, activities: [{ text: 'Scan gratuit du dépôt', status: 'fait', who: 'Programme' }, { text: 'Audit avec grilles', status: 'fait', who: 'Analyste' }] },
  { step: 'choisir', roles: ['Architecte'], produces: ['3 options chiffrées', 'Décisions D-01 à D-04'], gate: 'Option cochée par vous', tokens: 14000, activities: [{ text: 'Options chiffrées', status: 'fait', who: 'Architecte' }, { text: 'Décisions écrites', status: 'fait', who: 'Architecte' }] },
  { step: 'planifier', roles: ['Analyste', 'Importateur'], produces: ['Backlog en 3 épopées', 'Équipe et outils en place'], gate: 'Backlog validé', tokens: 31000, activities: [{ text: 'Mise en place de l’équipe', status: 'fait', who: 'Orchestrateur' }, { text: 'Backlog et lots', status: 'fait', who: 'Analyste' }] },
  { step: 'realiser', roles: ['Développeur interface', 'Développeur serveur', 'Testeur'], produces: ['Tickets finis', 'Branches réunies'], gate: 'Recette du lot 2', tokens: 145000, activities: [{ text: 'Lot 1 « Socle » : 7 tickets', status: 'fait', who: 'Équipe' }, { text: 'Lot 2 « Réservation » : 3 sur 8', status: 'en-cours', who: 'Pilote automatique' }, { text: 'Lot 3 « Exploitation »', status: 'a-faire', who: 'Pilote automatique' }] },
  { step: 'verifier', roles: ['Testeur', 'Relecteur sécurité'], produces: ['Rapport de tests', 'Rapport de sécurité'], gate: 'Recette dans l’aperçu', tokens: 0, activities: [{ text: 'Tests de bout en bout', status: 'a-faire', who: 'Testeur' }, { text: 'Audit de sécurité final', status: 'a-faire', who: 'Relecteur sécurité' }] },
  { step: 'livrer', roles: ['Rédacteur'], produces: ['Note de version', 'Image Docker'], gate: 'Votre « oui » pour déployer', tokens: 0, activities: [{ text: 'Build et note de version', status: 'a-faire', who: 'Rédacteur' }, { text: 'Déploiement', status: 'a-faire', who: 'Vous' }] },
];

// ---------- Règles du projet (une seule source → CLAUDE.md et AGENTS.md) ----------
export const projectRules: ProjectRule[] = [
  { id: 'R-1', text: 'Répondre et commenter en français simple.', scope: 'global', source: 'vous', enforcedBy: 'agent', tokens: 14 },
  { id: 'R-2', text: 'Lire le graphe Graphify et les résultats de scan avant d’ouvrir un fichier, puis lire par morceaux.', scope: 'global', source: 'convention', enforcedBy: 'agent', tokens: 26 },
  { id: 'R-3', text: 'Ne jamais lire .env ni les clés.', scope: 'global', source: 'vous', enforcedBy: 'programme', tokens: 11 },
  { id: 'R-4', text: 'Commandes de test : lire seulement le résumé donné par l’exécuteur.', scope: 'global', source: 'recette', enforcedBy: 'programme', tokens: 18 },
  { id: 'R-5', text: 'Créneaux de 1 h 30 (D-02).', scope: 'projet', source: 'decision', enforcedBy: 'agent', tokens: 10 },
  { id: 'R-6', text: 'Paiement par Stripe uniquement (D-03).', scope: 'projet', source: 'decision', enforcedBy: 'programme', tokens: 11 },
  { id: 'R-7', text: 'Ne pas modifier .github/workflows sans accord (D-04).', scope: 'projet', source: 'decision', enforcedBy: 'programme', tokens: 15 },
  { id: 'R-8', text: 'Un composant par fichier, dans src/components.', scope: 'projet', source: 'convention', enforcedBy: 'agent', tokens: 12 },
  { id: 'R-9', text: 'Tests : npm test. Bout en bout : npx playwright test.', scope: 'projet', source: 'convention', enforcedBy: 'agent', tokens: 16 },
];

// ---------- Mémoire partagée ----------
export const memory: MemoryNote[] = [
  { id: 'g1', text: 'Codex sous Windows : ne jamais lui passer de chemins « deny » (règles NTFS persistantes).', scope: 'global', kind: 'recette', source: 'INC-1', uses: 9, tokens: 24 },
  { id: 'g2', text: 'Espaces de travail courts (C:\\lba\\wt) pour éviter la limite de 260 caractères.', scope: 'global', kind: 'recette', source: 'INC-2', uses: 6, tokens: 21 },
  { id: 'g3', text: 'État de ~/.codex corrompu : donner la commande au propriétaire, ne jamais le modifier soi-même.', scope: 'global', kind: 'recette', source: 'INC-3', uses: 3, tokens: 25 },
  { id: 'g4', text: 'Le propriétaire veut des réponses courtes, en français simple, avec une prochaine action.', scope: 'global', kind: 'preference', source: 'Vous', uses: 31, tokens: 20 },
  { id: 'g5', text: 'Next.js 14 : routes dans src/app, composants serveur par défaut.', scope: 'global', kind: 'fait', source: 'Éclaireur, nextjs.org', uses: 4, tokens: 17 },
  { id: 'n1', text: 'Les créneaux durent 1 h 30 (décision D-02).', scope: 'projet', kind: 'decision', source: 'Vous', uses: 3, tokens: 12 },
  { id: 'n2', text: 'Les tests e2e tournent avec Playwright, navigateur Chromium seulement.', scope: 'projet', kind: 'fait', source: 'agent-13', uses: 5, tokens: 16 },
  { id: 'n3', text: 'La base de test est réinitialisée par npm run db:reset.', scope: 'projet', kind: 'fait', source: 'agent-12', uses: 2, tokens: 14 },
  { id: 'n4', text: 'Le club ouvre de 8 h à 23 h, fermé le 25 décembre.', scope: 'projet', kind: 'fait', source: 'Cahier des charges, EX-04', uses: 4, tokens: 15 },
];
export const memoryStats = { total: 37, totalTokens: 2900, injectedPerTicket: '300 à 600', savedPerAgent: 2400 };
export const injected: Record<string, { id: string; score: number }[]> = {
  'T-12': [{ id: 'n1', score: .94 }, { id: 'n4', score: .81 }, { id: 'g5', score: .77 }, { id: 'n3', score: .62 }],
  'T-13': [{ id: 'n2', score: .96 }, { id: 'n3', score: .73 }, { id: 'g2', score: .55 }],
};

// ---------- Contexte des agents ----------
export const agentContexts: AgentContext[] = [
  { agentId: 'agent-12', ceiling: 60000, parts: [
    { label: 'Règles du projet', tokens: 640, detail: 'CLAUDE.md généré, 9 règles', kind: 'regles' },
    { label: 'Ticket T-12', tokens: 420, detail: 'Description, 4 critères, EX-05 et EX-06', kind: 'ticket' },
    { label: 'Sous-graphe', tokens: 2100, detail: '14 éléments du graphe « réservation »', kind: 'graphe' },
    { label: 'Mémoire', tokens: 310, detail: '4 notes choisies sur 37', kind: 'memoire' },
    { label: 'Fichiers lus', tokens: 4800, detail: '3 fichiers, par morceaux', kind: 'fichiers' },
    { label: 'Conversation et résultats', tokens: 15100, detail: '22 échanges, résumés de commandes', kind: 'conversation' },
  ] },
  { agentId: 'agent-13', ceiling: 60000, parts: [
    { label: 'Règles du projet', tokens: 640, detail: 'AGENTS.md généré, 9 règles', kind: 'regles' },
    { label: 'Ticket T-13', tokens: 380, detail: 'Description, 1 critère, EX-09', kind: 'ticket' },
    { label: 'Sous-graphe', tokens: 1600, detail: '9 éléments', kind: 'graphe' },
    { label: 'Mémoire', tokens: 240, detail: '3 notes choisies sur 37', kind: 'memoire' },
    { label: 'Fichiers lus', tokens: 6900, detail: '5 fichiers, dont 1 lu en entier', kind: 'fichiers' },
    { label: 'Conversation et résultats', tokens: 43100, detail: 'Sorties complètes de Playwright relues 4 fois', kind: 'conversation' },
  ] },
  { agentId: 'agent-15', ceiling: 60000, parts: [
    { label: 'Règles du projet', tokens: 640, detail: 'AGENTS.md généré', kind: 'regles' },
    { label: 'Ticket T-15', tokens: 300, detail: 'Description, EX-08', kind: 'ticket' },
    { label: 'Sous-graphe', tokens: 900, detail: '6 éléments', kind: 'graphe' },
    { label: 'Mémoire', tokens: 120, detail: '2 notes', kind: 'memoire' },
    { label: 'Fichiers lus', tokens: 1400, detail: '1 fichier', kind: 'fichiers' },
    { label: 'Conversation et résultats', tokens: 2700, detail: '6 échanges', kind: 'conversation' },
  ] },
];

// ---------- Espaces de travail Git (worktrees) ----------
export const worktrees: Worktree[] = [
  { path: 'C:\\lba\\wt\\padel\\t-12', branch: 't-12-calendrier', ticket: 'T-12', agent: 'agent-12', size: '310 Mo', state: 'actif' },
  { path: 'C:\\lba\\wt\\padel\\t-13', branch: 't-13-e2e', ticket: 'T-13', agent: 'agent-13', size: '640 Mo', state: 'actif' },
  { path: 'C:\\lba\\wt\\padel\\t-14', branch: 't-14-connexion', ticket: 'T-14', size: '305 Mo', state: 'propre' },
  { path: 'C:\\lba\\wt\\padel\\t-15', branch: 't-15-sms', ticket: 'T-15', agent: 'agent-15', size: '298 Mo', state: 'actif' },
  { path: 'C:\\lba\\wt\\padel\\t-9', branch: 't-9-horaires', ticket: 'T-9', size: '290 Mo', state: 'orphelin' },
];

// ---------- Conversation avec l'Architecte ----------
export const archHistory: ArchItem[] = [
  { type: 'user', text: 'Où en est le lot 2 ?', at: '09:02' },
  { type: 'tool', text: 'Lecture de l’état du projet', cost: '0 token' },
  { type: 'assistant', at: '09:02', cost: 'par règles, 0 token', text: 'Lot 2 « Réservation » : 3 tickets sur 8 réalisés.\n• En cours : T-12 Calendrier (Claude), T-13 Tests e2e (Codex).\n• Vous attend : la clé SMS de T-15, et la recette de T-14.\n• Ensuite : T-17, lancé seul par le pilote.' },
  { type: 'aside', question: 'c’est quoi un worktree ?', text: 'Une copie de travail du dépôt, avec sa propre branche. Chaque ticket a la sienne : deux agents ne se gênent jamais.', cost: 'Haiku, 140 tokens, hors contexte' },
  { type: 'user', text: 'Pourquoi T-13 consomme autant ?', at: '09:10' },
  { type: 'tool', text: 'Lecture : santé du projet et contexte d’agent-13', cost: '0 token' },
  { type: 'assistant', at: '09:10', cost: 'Sonnet, 1,1 k tokens', text: 'agent-13 relit la sortie complète de Playwright à chaque essai : 43 k tokens de conversation sur un plafond de 60 k. C’est aussi pour ça que son compactage a calé.\n\nJe propose deux choses : n’envoyer que les échecs de Playwright, et relancer agent-13 en session neuve avec sa passation.', actions: ['Activer le résumé Playwright', 'Relancer en session neuve'] },
];
