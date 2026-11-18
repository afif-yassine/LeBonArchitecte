// Choix du modèle de l'Architecte, partagé par le moteur (qui l'applique) et l'écran (qui annonce le coût avant l'envoi).
// Opus pour l'architecture, les décisions, les risques, les agents et l'équipe ; Sonnet pour une consigne.
// « /opus » ou « /sonnet » au début force le choix.
// « fixed » : le modèle choisi avec /modele pour la suite (le préfixe /opus ou /sonnet passe quand même avant).
export function pickArchitectModel(text: string, fixed?: 'Opus' | 'Sonnet'): 'Opus' | 'Sonnet' {
  if (/^\/opus\b/i.test(text)) return 'Opus';
  if (/^\/sonnet\b/i.test(text)) return 'Sonnet';
  if (fixed) return fixed;
  // Créer ou changer des agents, des rôles ou l'équipe = architecture (mais « lance un agent sur LBA-13 » reste une consigne).
  const team = /(cré|construi|fai|ajout|organis|chang|défini|defini)\w*[^.?!]{0,40}\b(agents?|rôles?|roles?|équipe|equipe|devops)\b/i.test(text);
  return team || /architect|revue|cahier des charges|décision|decision|stratégi|risque|sécurit|audit|pourquoi|priorit|plan du projet|équipe|equipe/i.test(text) || text.length > 500 ? 'Opus' : 'Sonnet';
}

// Ordre de grandeur mesuré le 18 nov. (tokens comptés, hors cache relu) : Sonnet 1,4 à 5,4 k ; Opus 7,5 k.
export const ARCHITECT_COST: Record<'Opus' | 'Sonnet', string> = { Sonnet: 'environ 2 à 6 k', Opus: 'environ 5 à 15 k' };
