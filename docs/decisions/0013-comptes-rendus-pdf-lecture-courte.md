# Décision 0013 : comptes rendus en PDF, avec schémas, à lire en une page

Date : 18 nov. 2026. Statut : appliquée. Demandé par le propriétaire : « le compte rendu doit être PDF avec schémas … bien comprendre avec les méthodes de réduction ».

## Méthode de lecture courte (pour tous les comptes rendus)
1. **La conclusion d'abord** : page 1 = un feu (vert, orange, rouge) avec sa raison, « En bref » en quelques lignes, un tableau de 3 à 5 chiffres clés, un schéma.
2. **Le détail ensuite** : les 7 parties (ticket) ou la liste des tickets (lot, jour).
3. **Les preuves en annexe** : fichiers, commandes exactes, tests des tickets légers.
4. Tableaux plutôt que paragraphes ; une idée par ligne. On peut s'arrêter après « L'essentiel ».

Feu : rouge = tests en échec ou pas validé ; orange = points non vérifiés par l'agent ou problèmes réglés en route ; vert = rien à signaler.

## Schémas (programme, 0 token)
- Ticket : frise des moments clés (lancé, problème, résolution, à tester, validé), à égale distance, avec l'heure.
- Lot et jour : barres de tokens par ticket, pastille de tests, barre foncée = ticket lourd.

## PDF
- Bouton « Ouvrir le PDF » sur chaque compte rendu (Documents). Créé au clic par l'outil existant `scripts/pdf.mjs` (Edge), mode `--compte-rendu` : page de garde courte, pas de sommaire.
- Rangé dans `.lba/comptes-rendus/` (ignoré par git), refait seulement si le texte ou la mise en page a changé. Environ 1 s, 0 token.

## Code
`server/reportCharts.ts`, `server/reportPdf.ts`, `server/reports.ts` (`verdictOf`, mise en page), `scripts/pdf.mjs` (`--compte-rendu`).
