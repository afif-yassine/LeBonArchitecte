# Décision 0012 : comptes rendus selon le poids du ticket

Date : 18 nov. 2026. Statut : appliquée. Demandé par le propriétaire : « si le ticket est lourd on fait un compte rendu à ce ticket, s'il est léger on le regroupe ».

## Choix
- **Chaque ticket** : onglet « Compte rendu » en 7 parties (problème, solution, pourquoi, comment, tests, appels, limites et suite). L'agent écrit 4 parties dans son résumé (titres imposés par la consigne) ; le programme ajoute fichiers, branche, tests, tokens, durée, vos messages et les problèmes (0 token).
- **Ticket lourd** (au moins une raison) : modèle Opus, plus de 150 k tokens, plus de 8 fichiers, une décision écrite (docs/decisions/NNNN-…), ou un problème en route (réclamation, conflit, tests rouges, réparation). Il a son compte rendu dans Documents › Comptes rendus.
- **Tickets légers** : une ligne chacun dans « Compte rendu du lot N », publié quand tout le lot est fini.
- **Compte rendu du jour** : les tickets validés ce jour-là (filtre par jour) ; par ticket : l'onglet de la fiche.

## Pourquoi
- Moins à lire (environ 8 documents au lieu de 15 pour LBA), sans perte : tout reste dans la fiche du ticket.
- Pages virtuelles calculées depuis le journal (comme « Vos choix ») : aucun fichier écrit dans main (main doit rester propre pour les réunions), une information = un endroit, toujours à jour.
- Synthèse des lots faite par le programme avec les chiffres, pas par un modèle : 0 token. Une synthèse écrite par Haiku peut s'ajouter plus tard si elle manque.

## Code
`server/reports.ts`, `src/components/ReportTab.tsx`, route `/api/tickets/:id/report`, consigne de résumé dans `server/claude.ts`.
