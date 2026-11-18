# Décision 0008 : réunion sûre, droits précis, contrôles honnêtes

Date : 18 nov. 2026. Suite de l'audit LBA-11 (`docs/rapports/cadrage-audit.md`).

## Choix
1. **Réunion seulement dans un main propre.** Le dossier principal doit être sur `main`, sans fichier suivi modifié (hors `.lba/`). Sinon le moteur refuse, sans rien toucher, et dit quoi faire. Les changements d'un ticket sont toujours comparés à `main`, jamais à la branche ouverte.
2. **Tests relancés dans main après la réunion.** S'ils sont rouges, la réunion est annulée par un commit d'annulation (`git revert`) : rien n'est effacé de l'historique, le ticket reste « à tester » et garde son espace de travail.
3. **Droits précis pour les agents.** Plus de `npm *`, `npx *` ni `node *` : seulement `npm test`, `npm run check`, `npm run build`, `npm run pdf`, git en lecture et commit, et `ls`, `tail`, `head`, `wc`, `grep`. `package.json` ne peut pas être modifié par un agent. La liste de l'exécuteur reconnaît aussi `git -C . push`, mais elle n'est qu'un second filet.
4. **Contrôles honnêtes.** Ce qu'aucun outil ne vérifie (nouvelles failles, documentation, périmètre hors recherche) s'affiche « non vérifié », jamais « ok ». Les tests du projet sont lancés pour tout ticket, même un document.
5. **Jamais bloqué « en cours ».** Si la fin d'un agent plante, le ticket passe en « Besoin d'action » avec la raison.
6. **Le moteur n'obéit qu'à l'interface de ce PC.** Nom d'hôte local seulement, pas d'origine étrangère, actions en JSON seulement.

## Pourquoi
L'audit a montré qu'un ticket pouvait être réuni au mauvais endroit, que deux tickets verts pouvaient rendre main rouge, et qu'un agent pouvait contourner les interdits par `node` ou `npx`.

## Reste à faire (audit, priorité moyenne ou faible)
Test du superviseur avec un faux `claude` (point 9), `node_modules` partagé (6), arrêt des processus enfants sous Windows (7), journaux de commandes gardés hors du worktree (11), recherche de secrets plus large (14).
