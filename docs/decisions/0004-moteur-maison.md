# Décision 0004 : notre propre moteur, en Node/TypeScript

Date : 2026-11-17. Statut : **acceptée par le propriétaire.**

## Choix
- On construit **notre moteur** en Node/TypeScript. On ne reprend pas le moteur d'Escouade (Rust, chef IA, défauts connus).
- Le savoir d'Escouade (pannes Windows, lancement de Claude et Codex) est repris comme **recettes**, pas comme code.
- Un dépôt existant n'est intégré que s'il passe la **grille d'évaluation** ci-dessous, avec une fiche écrite, et **après le « oui » du propriétaire**.
- L'interface ne parle qu'au contrat `src/shared/contract.ts`. Le moteur fournit exactement ces formes.

## Architecture du moteur
```
interface (Vite/React) ──HTTP + flux d'événements──► serveur local Node (Fastify)
  ├─ journal d'événements (SQLite, node:sqlite) : source unique de vérité
  ├─ machine à états des tickets
  ├─ règles de l'orchestrateur (table déclencheur → action, 0 token, testée sans IA)
  ├─ pilote automatique (file, dépendances, places, budgets, fin de lot)
  ├─ exécuteur de commandes (sortie complète au journal, résumé à l'agent)
  ├─ adaptateurs : Claude (Claude Agent SDK) et Codex (codex exec --json ou SDK, vérifié dans la doc officielle)
  ├─ worktrees git (un par ticket, chemins courts C:\lba\wt)
  ├─ mémoire (SQLite FTS5 d'abord ; vecteurs locaux seulement si la mesure le demande)
  └─ fiche du projet .lba/projet.yaml (remplie par le scan, corrigeable par le propriétaire)
```
Journal, comptes rendus, statistiques, santé et interventions sont **calculés** à partir du journal d'événements.

## États d'un ticket
`a-faire → en-cours → (a-tester | action) → termine`, plus `bloque-securite`.
- `en-cours → a-tester` seulement si la définition de fini est vérifiée par le programme.
- `a-tester → termine` seulement sur validation du propriétaire (recette).
- `a-tester → en-cours` sur réclamation (même agent, boucle + 1).
- Toute autre transition est refusée et journalisée.

## Règles de l'orchestrateur (première table)
| Déclencheur | Action |
|---|---|
| Fin d'agent | Vérifier la définition de fini → `a-tester` ou `action` avec la cause |
| Même erreur 2 fois | Arrêt, `action`, cause et preuve écrites |
| Quota 5 h > seuil de la fiche | Bascule d'outil avec passation, notification |
| Accès à un fichier sensible ou commande interdite | Blocage, `bloque-securite` |
| Place libre et pilote actif | Lancer le prochain ticket prêt (priorité, dépendances, lot, budget) |
| Contexte > 85 % du plafond | Compactage natif une fois, sinon session neuve avec passation |
| Compactage sans retour > 5 min | Incident, proposition de session neuve |
| Nouvelle décision | Recherche des décisions liées (0 token) ; vérification de sens par Haiku sur celles-ci seulement ; alerte si contradiction |

## Choix du modèle par ticket (règles)
Haiku : texte, style, 1 à 2 fichiers. Sonnet : par défaut. Opus : sécurité, paiement, base de données, architecture, plus de 8 fichiers. Échec : un cran au-dessus, une fois. Jamais Fable. Raison affichée dans le ticket.

## Changement de compte
Même outil et contexte < 30 k : reprise de la même session. Sinon, ou entre Claude et Codex : passation courte et session neuve. Conditions d'utilisation des comptes multiples à vérifier avant activation.

## Grille d'évaluation d'un dépôt
Windows sans bricolage ; utilisable sans sa fenêtre ; pas de chef IA obligatoire ; interfaces officielles de Claude et Codex ; licence libre ; maintenu ; taille ; sécurité (scan gratuit). Fiche dans `docs/evaluations/`.
