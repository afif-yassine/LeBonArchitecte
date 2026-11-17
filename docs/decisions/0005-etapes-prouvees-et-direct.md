# 0005 : étapes prouvées et direct des tickets

**Statut** : acceptée le 2026-11-18 par le propriétaire.

## Contexte
Avant de lancer un ticket, le propriétaire veut savoir ce qu'il va faire. Pendant le travail, il veut voir l'agent réfléchir, agir, trouver et corriger les bugs, lancer les tests. À la fin, il veut être sûr que tout est fait.

## Décision
- Chaque ticket a un **plan** : des étapes, chacune avec son rôle, son agent d'aide éventuel, ses skills et sa **preuve attendue** (tests, compilation, fichier, capture, relecture).
- Le plan est proposé **par règles, sans token** (`src/shared/plan.ts`). L'Architecte (Haiku) pourra l'affiner plus tard.
- **Le pilote ne lance jamais un plan non validé.** Vous le validez en lançant le ticket, ou avec « Valider le plan ».
- Une étape n'est cochée que si **le programme a vérifié la preuve**. L'annonce de l'agent seule laisse l'étape « annoncée, pas prouvée », et la définition de fini refuse alors « À tester ».
- Le **direct** est le journal du moteur raconté en clair : réflexion (telle que l'outil la rend, souvent résumée), actions, commandes, tests, bugs et leur résolution, agents d'aide, skills, messages. L'afficher ne coûte aucun token.
- Les adaptateurs (LBA-6, LBA-7) utiliseront les mêmes commandes du moteur : `stepStart`, `stepDone`, `live`, `agentDone`.
- Tant qu'ils n'existent pas, un déroulé **simulé** est possible, uniquement sur les projets d'exemple.

## Conséquences
- Un ticket ne peut plus être fini « sur parole ».
- La définition de fini contient maintenant les étapes.
- Le Bon Architecte est son propre premier projet (`lba`). Les autres projets sont marqués « exemple ».
