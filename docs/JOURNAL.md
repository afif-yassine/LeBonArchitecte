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
- Premier commit `e87a183` envoyé sur GitHub (`afif-yassine/LeBonArchitecte`, branche `main`). Ce projet envoie avec le compte afif-yassine ; radinave1 reste le compte par défaut du PC.

**Preuves**
- `npm test` : 10 tests sur 10 verts en 0,1 s.
- `tsc` et `vite build` passent. `npm audit --omit=dev` : 0 faille.
- Navigateur : « Moteur connecté » ; fin simulée de T-12 → « À tester », puis T-17 lancé par le pilote du moteur.

**Reste à faire (J2)**
- Priorité de la file et actions « Pour vous » encore locales : les passer dans le moteur.
- Exécuteur de commandes (sortie complète au journal, résumé à l'agent).
- Adaptateur Claude (Claude Agent SDK), puis Codex.
- Fiche du projet `.lba/projet.yaml` remplie par le scan.

## LBA-3 : déroulé des tickets (2026-11-18)

**Fait**
- Le Bon Architecte devient son propre premier projet (`lba`, tickets LBA-1 à LBA-8). padel-site, job-hunter et portfolio sont marqués « exemple ».
- Plan de chaque ticket : étapes avec rôle, agent d'aide, skills et preuve attendue. Proposé par règles, sans token. Validé au lancement. Le pilote refuse un plan non validé.
- Étape cochée seulement sur preuve vérifiée par le programme. Sans preuve, elle reste « annoncée, pas prouvée » et bloque « À tester ».
- Ticket : frise de vie (Préparé, Plan validé, En cours, Tests, À tester, Terminé). Nouvel onglet Déroulé avec les étapes et le direct, filtrable : Réflexion, Actions, Bugs, Tests. Le journal brut du moteur est dans l'onglet Journal. Les messages à l'agent passent par le moteur.
- Fenêtre de lancement : « Ce ticket va faire… » avant de démarrer.
- Déroulé simulé (`server/simulate.ts`), seulement sur les projets d'exemple. Décision 0005.

**Preuves**
- `npm test` : 14 tests sur 14 verts. `tsc` et `vite build` passent.
- Navigateur :
  - plan affiché au lancement de LBA-6 ;
  - T-12 simulé : étapes cochées une à une, bug « créneau de 23 h 30 » trouvé puis résolu, T-12 « À tester » avec 7 étapes prouvées sur 7 ;
  - aucune erreur dans la console.

**Limites connues**
- Les écrans autres que Travail et Ticket (cahier des charges, Git, Santé…) montrent encore les données d'exemple, même dans le projet `lba`. LBA-8 (fiche du projet par le scan) commencera à les remplir.

## LBA-4 et LBA-5 : file, « Pour vous », exécuteur (2026-11-18)

**Fait**
- LBA-4 : l'ordre de la file (monter, descendre, tête de file) et les actions « Pour vous » sont dans le journal du moteur. Régler une action qui bloquait un ticket le remet en tête de file. La recette ferme seule son action. Une base existante reçoit les actions sans être effacée.
- LBA-5 : `server/executor.ts`.
  - Interdits refusés avant de partir : push, merge, `rm -rf`, `reset --hard`, lecture de `.env` et des clés, `curl | bash`, publication et déploiement.
  - Sortie complète dans `.lba/logs/`, et seulement un résumé de 3 lignes au plus dans le direct.
  - Temps limite.
- Preuve par commande : `POST /api/tickets/:id/steps/:step/prove`. Le moteur lance la commande et ne coche l'étape que si elle réussit. Une étape de tests ou de compilation ne se prouve jamais par une simple déclaration.
- Dans un ticket, « !npm test » lance une commande par le moteur.
- LBA-4 et LBA-5 sont passés par le moteur lui-même : chaque étape a été prouvée par `npx tsc --noEmit` ou `npm test`, lancés par l'exécuteur. Les deux tickets sont « À tester ».

**Preuves**
- `npm test` : 20 tests sur 20 verts. `tsc` passe.
- Navigateur : le direct de LBA-5 montre chaque commande, son résumé et le chemin de sa sortie complète.

**Limites connues**
- Les étapes « critère » sont prouvées par la compilation. Les critères eux-mêmes sont couverts par les tests du moteur. Une preuve propre à chaque critère viendra avec la fiche du projet (LBA-8).
- L'onglet « Réalisé » de LBA-4 et LBA-5 est vide : il sera rempli par le programme à partir des commits (à faire).

## LBA-8 : fiche du projet par le scan (2026-11-18)

**Fait**
- `server/scan.ts` : scan gratuit (0 token).
  - Il trouve les langages, les outils, les commandes (tests, vérification, build, dev), les fichiers sensibles (noms seulement, jamais lus), la branche et le dépôt git (sans nom de compte).
  - Il écrit `.lba/projet.yaml`.
- Les preuves des étapes utilisent la fiche : sans commande donnée, une étape « tests » lance `npm test` et une étape « compilation » lance `npm run check`.
- Paramètres du projet : bloc « Fiche du projet » avec un bouton « Rescanner ».
- Budget d'un ticket : « non mesuré » au lieu d'un faux 0 quand aucun agent n'a compté.
- LBA-8 est passé par le moteur avec les commandes de la fiche : il est « À tester ».

**Preuves**
- 21 tests sur 21 verts. Le scan réel trouve : TypeScript, React, Vite, Fastify, `npm test`, `npm run check`.

**Bloqué : LBA-6 et LBA-7 attendent une décision du propriétaire**
- La documentation officielle de l'Agent SDK (code.claude.com/docs/en/agent-sdk/overview) dit qu'Anthropic n'autorise pas, sauf accord préalable, la connexion claude.ai ni les limites d'abonnement dans des produits construits avec le SDK. Elle demande une clé API, facturée à part.
- Deux voies :
  - une clé API avec l'Agent SDK ;
  - Claude Code lui-même en mode non interactif (`claude -p --output-format stream-json`), avec votre connexion, pour votre usage personnel.

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

## LBA-9 : README du projet (2026-11-18)

**Fait**
- `README.md` réécrit en français simple : ce qu'est le projet, ce qu'il faut avant, comment le lancer (`npm install`, `npm run dev`, `npm run dev:ui`, `npm run engine`), les commandes de test et de vérification (`npm test`, `npm run check`, `npm run build`, `npm run engine:reset`), et liens vers `docs/JOURNAL.md`, `docs/decisions/`, le cahier des charges et les évaluations.
- Aucun autre fichier modifié, sauf ce journal.

**Étape 1 : fichiers relus (preuve)**
- `package.json` (scripts), `vite.config.ts` (ports 5173 et 4317), `index.html`, `.gitignore`, `scripts/dev.mjs`, `server/index.ts` (40 premières lignes), `server/engine.test.ts` (noms des tests).
- `docs/JOURNAL.md`, `docs/decisions/0001` à `0005` (en-têtes et choix), `docs/cahier-des-charges/README.md` et `cahier-des-charges.md` (début), `docs/evaluations/2026-11-moteurs-existants.md` (début), `.lba/projet.yaml`.
- Non relu en détail : le code de `src/` et les autres fichiers de `server/`. Le README ne décrit leur rôle que de façon générale, d'après les noms de fichiers et le journal.

**Preuves**
- `npm test` : 23 tests sur 23 verts, avant et après l'écriture du README.
- `npm run check` (tsc) : passe, sans erreur.
- `npm run build` (tsc + vite build) : passe.

**Reste à faire**
- Le README indique Node.js 22.5 ou plus (base `node:sqlite`). Non vérifié : le projet a été lancé ici seulement avec Node 24.11.

## LBA-6, vrais agents, mode direct (2026-11-18)

**Fait**
- **Vrais agents Claude** (décision 0006).
  - Le moteur lance Claude Code en mode non interactif, avec l'abonnement du propriétaire, dans un worktree par ticket (`.lba/worktrees/<id>`, branche `ticket/<id>`).
  - Interdits bloqués par Claude Code lui-même.
  - À la fin, le programme fait un commit dans la branche, prouve les étapes avec les commandes de la fiche du projet, et note ce qui a été réalisé à partir de git.
  - À la validation, les tests sont relancés, puis le ticket est réuni dans main (`--no-ff`) avec un point de retour.
- **Tokens.** Premier agent réel (LBA-9, README) : 71 770 tokens. Mesure tour par tour : 34 210 de charge fixe (plugins, skills et MCP de l'installation), 27 690 de lecture, 9 842 écrits.
  - Les agents tournent désormais avec un contexte minimal : `--strict-mcp-config`, `--disable-slash-commands`, 6 outils. La charge fixe mesurée passe à ~12 300.
  - **Mode direct** pour les tâches simples de texte : un appel sans outils, avec un contexte préparé par le programme. Le README de LBA-9 refait ainsi a coûté **5 842 tokens** ; c'est la version réunie dans main (7fadd7c). Le Node 22.5 cité plus haut n'est plus dans le README : il indique Node 24.
- **Écran à jour sans actualiser** : le flux est rouvert après un redémarrage du moteur, avec une relecture de secours toutes les 10 s. Un vrai projet n'affiche jamais les données d'exemple.
- **Réalisé** : chaque fichier s'ouvre, en contenu (Markdown lisible) ou en changements, lu depuis la branche du ticket.
- Lancement « manuel » (travail fait hors agent, étapes toujours prouvées). Après une réclamation, toutes les preuves sont à refaire.

**Preuves**
- 25 tests sur 25 verts, dont le worktree (node_modules d'origine intact), le mode direct (chemins hors dossier et `.env` refusés) et les preuves remises à zéro.
- LBA-9 validé par le propriétaire : tests relancés, réuni dans main en 7fadd7c, point de retour 4d8d5c3.

**Reste à faire**
- LBA-7 (Codex). Note de passation à l'arrêt. Outils pour le périmètre, les failles et la documentation.

## Cadrage, étape 1 : les outils (18 nov. 2026)
- Recherche sur Internet : l'Éclaireur (rôle déjà existant) devient le seul rôle qui lit le web (WebSearch, WebFetch). Un ticket dont le titre parle de recherche, veille, comparatif ou scénarios lui est confié, toujours en mode agent.
- Il n'écrit que dans `docs/recherche/` et `docs/rapports/` : sinon le programme signale un bug et le contrôle « Périmètre respecté » passe en échec.
- Rapports PDF : `npm run pdf -- docs/rapports/<nom>.html` (Microsoft Edge, rien à installer). Modèle avec schéma SVG et tableau de scénarios : `docs/rapports/modele.html`. Essai : PDF créé, 53 Ko.
- Tests : 26 verts. Suite : tickets de cadrage C1 à C5.

## Recherche moins chère et onglets réels, lot 1 (18 nov. 2026)
- Mesure LBA-10 (Sonnet) contre une session Opus normale, même consigne : 52 782 contre 69 396 tokens comptés, 125 620 contre 595 281 relus du cache. En coût réel, environ 2 fois moins cher grâce au départ allégé.
- Recherche : Haiku, 6 pages ouvertes au plus, rapport en Markdown mis en page par le programme (`npm run pdf -- x.md`).
- Onglets branchés sur les vraies données du projet, sans IA : Cahier des charges, Documents, Règles (partie 1 du cahier), Git, Réglages > Quotas (tokens mesurés par ticket et par jour).
- Sur un vrai projet, un onglet pas encore branché le dit au lieu d'afficher du faux (Architecte, Flux, Backlog, Équipe, Santé, Mémoire). Fausses pastilles et faux journal de l'Orchestrateur retirés.
- Lot 2 : Backlog, Équipe, Santé, Flux, journal du pilote.

## Corrections de l'audit LBA-11 (18 nov. 2026)
- Plans adaptés à chaque ticket : preuve vérifiable par critère (PDF, schéma, liens, document, tests, compilation), rôle Architecte pour l'architecture. Étapes annoncées en direct par l'agent (« ÉTAPE n : commencée / faite »), cochées seulement après vérification.
- Incident : un redémarrage du moteur (mes changements) a coupé l'agent LBA-11. Correction : un agent coupé reprend sa propre session Claude (reprise LBA-11 : 2 597 tokens au lieu de tout refaire). Les fichiers lus et les tokens de la partie coupée sont repris du journal de session.
- Décision 0008 : réunion seulement dans un main propre, tests relancés après la réunion avec annulation par revert, droits précis des agents (plus de node/npx/npm *), contrôles « non vérifié » au lieu de « ok », ticket jamais bloqué en cours, moteur fermé aux pages étrangères (vérifié : 403 et 415).
- Tests : 29 verts. LBA-11 : 68 711 tokens (Opus), prêt à tester.
- À vérifier au prochain vrai ticket : que les nouveaux droits suffisent à l'agent (tests, compilation, PDF).

## Cahier des charges réel, point 2 (18 nov. 2026)
- Onglet Cahier des charges : les 34 exigences (E0 à E20, A1 à A13) lues dans le cahier sans IA ; carte de couverture ; schémas d'architecture et de vie d'un ticket (couleurs du thème) ; exigences en cases cochées seulement par les preuves.
- Lien ticket → exigences dans le ticket (« E2 » en entier, « E2~ » en partie). Les 14 tickets LBA sont liés. Couverture actuelle : 4 faites, 15 en partie, 1 en cours, 3 prévues, 11 sans ticket.
- Discussion avec l'Architecte (Opus, effort haut, un appel sans outils, contexte préparé par le programme). Ses propositions deviennent des tickets « à faire » seulement si vous les acceptez. Premier essai, revue complète : 13 334 tokens mesurés, 5 propositions et 9 points à enlever ou reporter.
- Tests : 29 verts. Écran vérifié dans le navigateur.

## Git en schéma, point 3 (18 nov. 2026)
- Onglet Git : main et une colonne par branche de ticket, départs et réunions dessinés, annulations en rouge, point « changements pas encore enregistrés ». Légende des branches : réunie, en travail, pas réunie.
- Clic sur un point : message, fichiers changés (pour une réunion : ce que le ticket a apporté). « Repartir d'ici » crée une branche reprise/<commit> sans toucher main. « Annuler ce ticket dans main » ajoute un commit d'annulation (main propre exigé), puis relance les tests. Confirmation dans la page, jamais de boîte du navigateur.
- Tests : 30 verts (dont un dépôt jetable : schéma, reprise, annulation). Écran vérifié dans le navigateur.

## Objectifs par jalon et budget du pilote, LBA-17 (18 nov. 2026)
La règle 2 du cahier des charges demande des jalons mesurés. Voici les cibles, par ticket fait par un agent :

| Jalon | Tokens par ticket (au plus) | Validé du premier coup (au moins) | Temps par ticket (au plus) |
|---|---|---|---|
| J2 Moteur | 60 000 | 60 % | 45 min |
| J3 Agents | 50 000 | 70 % | 30 min |
| J4 Orchestrateur et démarche | 40 000 | 80 % | 20 min |

- D'où viennent ces chiffres : les tokens partent des mesures déjà faites (LBA-9 : 71 770, LBA-10 : 52 782, LBA-11 : 68 711). Le premier coup et le temps n'avaient aucune mesure : ce sont des cibles de départ, à corriger après le premier bilan.
- Comment c'est mesuré : moyenne des tickets arrivés « à tester ». « Premier coup » veut dire validé sans réclamation ni réparation automatique. Le temps ne compte que les moments où l'agent travaille.
- Où les voir : Réglages › Quotas et budgets, avec « tenue » ou « pas encore » en face de chaque cible.
- **Budget du jour du pilote : 200 000 tokens par défaut**, tous projets, de minuit à minuit, réglable dans les réglages du projet. Une fois atteint, le pilote ne lance plus rien et une alerte arrive dans « Pour vous ». Les agents déjà au travail finissent leur ticket, et vous pouvez toujours lancer un ticket vous-même. Le pilote ne repart pas seul à minuit : il reprend à la prochaine validation ou fin de ticket.
- **Réparation automatique : une seule tentative.** Si le programme trouve un manque qu'il sait revérifier (tests rouges, compilation, document absent), l'agent reprend sa session une fois, et toutes les preuves sont refaites. Encore raté : « Besoin d'action » avec la cause. Pas de réparation si l'agent s'est arrêté sur une erreur, si un secret est écrit, si le périmètre est dépassé ou si le budget du jour est atteint.
- Tests : 42 verts.

## Corrections signalées par le propriétaire (18 nov. 2026)
- Valider LBA-11 échouait : « git status » est rogné, la 1re ligne perdait son espace et « .lba/projet.yaml » devenait « lba/projet.yaml », pris pour un vrai fichier modifié. Lecture corrigée (statusPaths), aussi dans le schéma Git.
- Après correction, un conflit (deux tests ajoutés en fin du même fichier) : la garde a refusé sans rien changer ; branche du ticket mise à jour avec main, 33 tests verts, puis LBA-11 réuni (83e6994).
- Le pilote ne démarrait qu'à la fin d'un ticket. Maintenant : valider un plan ou allumer le pilote lance tout de suite les tickets prêts (vrais projets seulement). Il ne lance jamais un plan non validé.
- Documents › Décisions : nouvelle page « Vos choix sur les propositions de l'Architecte », écrite par le programme depuis le journal (pas de fichier recopié). Les Règles du projet restent les règles de travail du cahier.

## Lancement groupé (18 nov. 2026)
- Tableau : bouton « Valider les plans et lancer ». On coche les tickets, on choisit le nombre d'agents en même temps ; un ticket qui attend un ticket non coché est signalé « bloqué ». Le bandeau du pilote dit pourquoi il attend (plans à valider). 34 tests verts.
- Lancé depuis l'écran : LBA-12, 15, 16 sur Opus (3 en même temps), chacun sur sa branche et son dossier ; LBA-17 attend une place. Gardés de côté : LBA-7 (Codex), LBA-13 (à fusionner avec LBA-12), LBA-14 (attend LBA-13).
- Pendant que les agents travaillent, aucune modification du moteur (elle le redémarrerait).
- Incident : 2 à 3 minutes après le départ, la limite de 5 h de l'abonnement est atteinte (« resets 5:50am »). Le moteur l'a pris pour une fin normale : les 4 tickets en « Pas fini », et le pilote a lancé LBA-17 qui s'est arrêté aussitôt.
- Corrigé : la limite est reconnue. Le travail est gardé dans la branche, le ticket attend en tête de file avec sa session, le pilote se met en pause jusqu'à l'heure de retour (gardée même si le moteur redémarre), puis reprend. Un ticket relancé reprend sa session Claude au lieu de tout relire. 35 tests verts.
- Relancés à 12 h : LBA-12, 15, 16 reprennent leur session (branches mises à jour avec la correction) ; LBA-17 attend une place.
