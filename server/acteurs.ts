// Qui agit : vous (l'interface) ou l'Architecte (agent autonome, via la commande `lba`, en-tête x-lba-acteur).
// L'Architecte passe par les mêmes portes que vos boutons, sauf celles qui restent à vous (décision 0014).
import { AsyncLocalStorage } from 'node:async_hooks';

export const ACTOR_HEADER = 'x-lba-acteur';
export const actorStore = new AsyncLocalStorage<string>();
export const currentActor = () => actorStore.getStore();

// Ce qui reste toujours à vous : réunir dans main, git (revenir, brancher), le pilote et son budget,
// décider de ses propres propositions, fermer vos actions, et ce qui est réservé au programme (preuves, fins d'agent).
const OWNER_ONLY: { method: string; re: RegExp; why: string }[] = [
  { method: 'POST', re: /^\/api\/tickets\/[^/]+\/validate$/, why: 'réunir dans main reste à vous (bouton Valider)' },
  { method: 'POST', re: /^\/api\/projects\/[^/]+\/git\//, why: 'les actions git restent à vous' },
  { method: 'PUT', re: /^\/api\/pilot$/, why: 'le pilote et le budget du jour restent à vous' },
  { method: 'POST', re: /^\/api\/projects\/[^/]+\/architect\/decide$/, why: 'décider de ses propres propositions reste à vous' },
  { method: 'POST', re: /^\/api\/actions\/[^/]+\/resolve$/, why: 'vos actions à faire restent à vous' },
  { method: 'POST', re: /^\/api\/projects\/[^/]+\/report$/, why: 'réservé au programme' },
  { method: 'POST', re: /^\/api\/tickets\/[^/]+\/(steps\/[^/]+\/prove|agent-done|simulate-run)$/, why: 'les preuves sont écrites par le programme, jamais par un agent' },
  { method: 'DELETE', re: /./, why: 'supprimer reste à vous' },
  // Comptes Claude (décision 0017) : les ajouter, connecter, choisir et dépenser pour lire un quota restent à vous.
  { method: 'POST', re: /^\/api\/comptes/, why: 'les comptes restent à vous' },
  { method: 'PATCH', re: /^\/api\/comptes/, why: 'les comptes restent à vous' },
  { method: 'POST', re: /^\/api\/projects\/[^/]+\/(comptes|architecte\/reglages)$/, why: 'le choix du compte et du modèle reste à vous' },
];

export function architectRefusal(method: string, url: string): string | undefined {
  const path = url.split('?')[0];
  return OWNER_ONLY.find((r) => r.method === method.toUpperCase() && r.re.test(path))?.why;
}
