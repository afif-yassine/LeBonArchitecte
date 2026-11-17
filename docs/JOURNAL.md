# Journal

## J0, session 1 : maquette de l'espace de travail

**Fait**
- Projet Vite + React + TypeScript, polices installées localement (Geist, IBM Plex, Manrope).
- Design refait : 3 ambiances (Ardoise, Papier, Brume) en clair et sombre, toiles arrondies, en-tête de projet à onglets.
- Écrans : Ensemble, Besoin d'action ; par projet : Flux, Travail (pilote automatique, file, Kanban, Lancer, Arrêter), Backlog, Cahier des charges (dossier, couverture des exigences), Comptes rendus (prochain compte rendu, déjà écrits), Git (branches, historique, retour en arrière), Santé (contrôles, incidents), Documents, Équipe (rôles, mise en place, agents), Mémoire, Paramètres ; Ticket (Description, Conversation, Réalisé, Journal, Diff, Tests) ; Réglages (Connexions, Quotas, Sécurité, Apparence, Notifications).
- État partagé `src/store.tsx` : pilote automatique, lancement et arrêt, comptes rendus sans oubli ni doublon.
- Cahier des charges du projet : `docs/cahier-des-charges/`. Décisions 0001 et 0002.

**Preuves**
- `tsc` et `vite build` passent.
- Vérifiés en image : Travail, Flux, Équipe, Réglages Apparence (Ardoise sombre, Papier clair). Pilote automatique testé : T-12 fini → T-17 démarre seul.

**Session 1, suite (organisation ESN)**
- Projets isolés : plus de vue Ensemble ni de « Besoin d'action » global. Sélecteur de projet en haut à gauche.
- Structure du projet à gauche : Piloter (Flux, Travail, Pour vous), Construire (Cahier des charges, Backlog, Équipe), Suivre (Documents, Git, Santé, Mémoire), Paramètres.
- Comptes rendus regroupés dans Documents.
- Chat retiré : panneau de l'orchestrateur (prochaine action, pour vous, équipe, décisions par règles) et barre d'ordres en bas (lance, arrête, valide).
- Recette des tickets « À tester » : Ouvrir l'aperçu, Tout marche (valider), Ça ne marche pas (réclamation, même agent).
- En attente : chemin d'Escouade pour reprendre son thème.

**Session 1, suite (Architecte, mémoire, contexte)**
- Architecte : conversation façon Claude Code ou Codex, 18 commandes `/` (dont `/btw`, `/plan`, `/compact`, `/contexte`, `/retiens`, `/regle`), mentions `@`, modèle, mode plan, jauge de contexte. Barre du bas « Écrire à l'Architecte » sur tous les écrans.
- Règles du projet : une liste, CLAUDE.md et AGENTS.md générés, règles bloquées par le programme.
- Mémoire et contexte : mémoire globale et par projet, contexte de chaque agent poste par poste, explication de la stratégie. Décision 0003.
- Git : espaces de travail (worktrees) avec nettoyage.
- Design : onglets en contrôle segmenté, Flux refait en chaîne d'étapes et détail d'étape.
- Vérifiés en image : Architecte (menu /), Flux.

**Clôture de J0**
- Décisions : 0001 (interface web locale), 0002 (design et flux), 0003 (mémoire et contexte), 0004 (moteur maison, acceptée).
- Maquette : en attente de validation finale du propriétaire ; thème Escouade à reprendre quand le chemin sera donné.

## J1 : socle du moteur (fait le 2026-11-17, même session)

**Fait**
- Analyse de 4 dépôts (Vibe Kanban, Crystal, Task Master, Backlog.md) : aucun ne convient comme moteur. Fiche : `docs/evaluations/2026-11-moteurs-existants.md`. Escouade écarté par le propriétaire.
- Moteur local `server/` (Node 24, TypeScript lu directement par Node, sans compilation) :
  - `db.ts` : SQLite intégré à Node, journal d'événements = source de vérité, vue des tickets recalculable.
  - `tickets.ts` : machine à états et application des événements.
  - `rules.ts` : définition de fini, dépendances, pilote, même erreur deux fois, choix du modèle, bascule de quota, contexte.
  - `engine.ts` : commandes (lancer, arrêter, fin d'agent, valider, réclamer, rapporter) et pilote automatique.
  - `index.ts` : serveur Fastify sur 127.0.0.1:4317, refus expliqués (409), flux en direct.
- Interface branchée sur le moteur pour les tickets, le pilote, la recette et les comptes rendus. Bandeau clair si le moteur est arrêté.
- `npm run dev` lance moteur + interface ; `npm test` ; `npm run engine:reset` remet la démo à zéro.
- `git init` fait. Premier commit en attente : nom et e-mail git non configurés sur ce PC.

**Preuves**
- `npm test` : 10 tests sur 10 verts en 0,1 s.
- `tsc` et `vite build` passent. `npm audit --omit=dev` : 0 faille.
- Navigateur : « Moteur connecté » ; fin simulée de T-12 → « À tester », puis T-17 lancé par le pilote du moteur.

**Reste à faire (J2)**
- Priorité de la file et actions « Pour vous » encore locales : les passer dans le moteur.
- Exécuteur de commandes (sortie complète au journal, résumé à l'agent).
- Adaptateur Claude (Claude Agent SDK), puis Codex.
- Fiche du projet `.lba/projet.yaml` remplie par le scan.

## Ancien plan de J1 (pour mémoire)
À coller au début de la session neuve :
> Lis `docs/JOURNAL.md` et `docs/decisions/0004-moteur-maison.md`. Fais J1 : socle du moteur.

Étapes de J1 :
1. `git init` du projet et premier commit (sur « oui »).
2. Analyse des dépôts utiles pour le moteur, avec la grille de la décision 0004 : candidats Vibe Kanban, Crystal, Task Master, Backlog.md, Escouade (chemin à fournir). Fiches dans `docs/evaluations/`. Intégration seulement sur « oui ».
3. Serveur local Node (Fastify) + SQLite (`node:sqlite`) : journal d'événements, machine à états des tickets, API conforme à `contract.ts`.
4. Brancher les écrans Travail et Ticket sur le serveur (les autres restent sur les fausses données).
5. Tests de la machine à états et des premières règles, sans IA.
6. Mesure : temps de démarrage, tokens de la session. Bilan dans ce journal.

**Reste à faire**
- Propriétaire : tester et valider la maquette.
- Pas encore vérifiés en image : Ticket (nouveaux onglets), Cahier des charges, Comptes rendus, Git, Santé, Brume, petits écrans.
- `npm install` invite à lancer `npm audit` : à vérifier en J1 avec les scans.
- Aucun code serveur : volontaire.
