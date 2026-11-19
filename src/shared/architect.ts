// Choix du modèle de l'Architecte, partagé par le moteur (qui l'applique) et l'écran (qui annonce le coût avant l'envoi).
// Opus pour l'architecture, les décisions, les risques, les agents et l'équipe ; Sonnet pour une consigne.
// « /opus », « /sonnet » ou « /haiku » au début force le choix. Haiku : le moins cher, pour une consigne très simple
// (choisi par vous seulement, jamais automatiquement). Fable : jamais (règle du propriétaire).
// « fixed » : le modèle choisi avec /modele pour la suite (le préfixe /opus ou /sonnet passe quand même avant).
export type ArchitectModel = 'Opus' | 'Sonnet' | 'Haiku';
export const ARCHITECT_MODELS: { id: ArchitectModel; label: string; short: string; what: string }[] = [
  { id: 'Opus', label: 'Opus 5.5', short: 'le plus fort', what: 'le plus fort : architecture, décisions, équipe' },
  { id: 'Sonnet', label: 'Sonnet 5.5', short: 'équilibré', what: 'le bon équilibre pour une consigne' },
  { id: 'Haiku', label: 'Haiku 5.5', short: 'le moins cher', what: 'le moins cher, pour une consigne très simple ; moins fiable pour agir' },
];
export function pickArchitectModel(text: string, fixed?: ArchitectModel): ArchitectModel {
  if (/^\/opus\b/i.test(text)) return 'Opus';
  if (/^\/sonnet\b/i.test(text)) return 'Sonnet';
  if (/^\/haiku\b/i.test(text)) return 'Haiku';
  if (fixed) return fixed;
  // Créer ou changer des agents, des rôles ou l'équipe = architecture (mais « lance un agent sur LBA-13 » reste une consigne).
  const team = /(cré|construi|fai|ajout|organis|chang|défini|defini)\w*[^.?!]{0,40}\b(agents?|rôles?|roles?|équipe|equipe|devops)\b/i.test(text);
  return team || /architect|revue|cahier des charges|décision|decision|stratégi|risque|sécurit|audit|pourquoi|priorit|plan du projet|équipe|equipe/i.test(text) || text.length > 500 ? 'Opus' : 'Sonnet';
}

// Ordre de grandeur mesuré le 18 nov. (tokens comptés, hors cache relu) : Sonnet 1,4 à 5,4 k ; Opus 7,5 k.
// Haiku : pas encore mesuré sur l'Architecte ; même lecture du contexte, prix environ 3 fois plus bas que Sonnet.
export const ARCHITECT_COST: Record<ArchitectModel, string> = { Haiku: 'environ 2 à 6 k (moins chers)', Sonnet: 'environ 2 à 6 k', Opus: 'environ 5 à 15 k' };
