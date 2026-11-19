// Commandes du chat de l'Architecte (décision 0015, lot D), comme dans Claude Code.
// Toutes sont faites par le programme (0 token), sauf /btw : une petite question à un modèle. Partagé par le moteur (qui répond) et l'écran (qui les propose).
export interface ArchitectCommand { name: string; args: string; what: string }

export const ARCHITECT_COMMANDS: ArchitectCommand[] = [
  { name: 'aide', args: '', what: 'la liste des commandes' },
  { name: 'statut', args: '', what: 'où en est le projet : ce qui attend, ce qui tourne' },
  { name: 'usage', args: '', what: 'les tokens du jour : Architecte, tickets, budget restant' },
  { name: 'cout', args: '[LBA-n]', what: 'ce qu’a coûté un ticket, ou les 7 derniers jours' },
  { name: 'context', args: '', what: 'ce que l’Architecte a en tête, et si la prochaine demande reprend ou repart à neuf' },
  { name: 'compact', args: '', what: 'la prochaine demande repart à neuf avec son carnet (moins cher qu’une longue conversation)' },
  { name: 'modele', args: '[opus | sonnet | auto]', what: 'choisir le modèle pour la suite (jamais Fable)' },
  { name: 'graphify', args: '[nom]', what: 'refaire la carte du code, ou chercher un élément dedans' },
  // La seule qui appelle un modèle : petite, sans outils, sans mémoire (lot C1).
  { name: 'btw', args: '<question>', what: 'question en passant, sans outils ni mémoire : environ 2 à 4 k tokens (mesuré : 2,5 k), même pendant qu’il travaille' },
];
export const PAID_COMMANDS = new Set(['btw']);

// Les mots avec accent ou en anglais mènent à la même commande.
const ALIAS: Record<string, string> = { help: 'aide', status: 'statut', coût: 'cout', cost: 'cout', contexte: 'context', modèle: 'modele', model: 'modele', carte: 'graphify' };

// « /usage » → { name: 'usage', arg: '' }. « /opus … », « /sonnet … » et « /haiku … » ne sont pas des commandes : ils choisissent
// le modèle d'une demande. Un autre « /mot » inconnu → name 'inconnue'. Pas de « / » au début → undefined.
export function parseCommand(text: string): { name: string; arg: string } | undefined {
  const m = text.trim().match(/^\/([\p{L}]+)\s*([\s\S]*)$/u);
  if (!m) return undefined;
  const word = m[1].toLowerCase();
  if (word === 'opus' || word === 'sonnet' || word === 'haiku') return undefined;
  const name = ALIAS[word] ?? word;
  return { name: ARCHITECT_COMMANDS.some((c) => c.name === name) ? name : 'inconnue', arg: m[2].trim() };
}
