# Décision 0002 : nouveau design, flux de travail, pilote automatique

Date : 2026-11-17. Statut : proposée, en attente de validation de la maquette.

## Choix
- Design refait : 3 ambiances complètes au choix (Ardoise par défaut, Papier, Brume), chacune en clair et en sombre. Couleurs en OKLCH à partir d'une teinte par ambiance.
- Organisation : barre latérale globale, en-tête de projet avec onglets (Flux, Travail, Backlog, Cahier des charges, Comptes rendus, Git, Santé, Documents, Équipe, Mémoire, Paramètres).
- Cahier des charges : dossier `docs/cahier-des-charges/` dans chaque projet, source de vérité ; chaque ticket cite ses exigences.
- Pilote automatique : règles uniquement (dépendances, priorité, limite d'agents, fin de lot, budgets et quotas). Arrêt et lancement manuels avec passation.
- Comptes rendus : chaque ticket réalisé porte l'id du compte rendu qui l'a rapporté ; le suivant reprend tous les autres.
- Mise en place : l'orchestrateur compose l'équipe par règles ; agents d'aide (Éclaireur : Internet en lecture seule ; Importateur : évaluation puis import sur accord).
- Retour en arrière Git : point de retour + `git revert`, jamais `reset --hard`, toujours sur « oui ».

## Interdits (lisibles par la machine)
- Aucun agent d'aide n'écrit dans le projet sans accord.
- Le pilote ne démarre aucun ticket si le budget du jour ou un quota est dépassé.
