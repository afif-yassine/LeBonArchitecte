// Commandes du chat de l'Architecte (décision 0015, lot D), comme dans Claude Code.
// Toutes sont faites par le programme : 0 token. Partagé par le moteur (qui répond) et l'écran (qui les propose).
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
];

// Les mots avec accent ou en anglais mènent à la même commande.
const ALIAS: Record<string, string> = { help: 'aide', status: 'statut', coût: 'cout', cost: 'cout', contexte: 'context', modèle: 'modele', model: 'modele', carte: 'graphify' };

// « /usage » → { name: 'usage', arg: '' }. « /opus … » et « /sonnet … » ne sont pas des commandes : ils choisissent
// le modèle d'une demande. Un autre « /mot » inconnu → name 'inconnue'. Pas de « / » au début → undefined.
export function parseCommand(text: string): { name: string; arg: string } | undefined {
  const m = text.trim().match(/^\/([\p{L}]+)\s*([\s\S]*)$/u);
  if (!m) return undefined;
  const word = m[1].toLowerCase();
  if (word === 'opus' || word === 'sonnet') return undefined;
  const name = ALIAS[word] ?? word;
  return { name: ARCHITECT_COMMANDS.some((c) => c.name === name) ? name : 'inconnue', arg: m[2].trim() };
}
