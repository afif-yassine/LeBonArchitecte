# LE BON ARCHITECTE — Cahier des charges du propriétaire

Version d'origine : 17 nov. 2026. Ajouts datés en fin de document.

« Le Bon Architecte » : plateforme locale où une équipe d'agents IA (Claude Code, Codex, autres) construit les projets du propriétaire comme une ESN bien structurée, de l'idée jusqu'au déploiement. Le propriétaire est le client. Il parle français simple : réponses en français, sans jargon.

## 1. Règles de travail (non négociables)
1. **Avis d'abord.** Pour chaque étape : avis (bien, inutile, risqué, manquant), proposition, coût estimé (temps et tokens). Attendre le « oui ». Ensuite implémenter partout sans redemander point par point.
2. **Ne pas gaspiller de temps ni de tokens à construire l'outil.** Réutiliser ce qui existe (SDK officiels, Claude Code, outils gratuits, dépôts open source évalués). Chaque jalon utilisable seul et mesuré.
3. **Une session courte par jalon.** À la fin : bilan dans `docs/JOURNAL.md` (fait, preuves, reste à faire).
4. **Économie de tokens maximale** : ne lire que le résultat des commandes, lire le code par le graphe et les scans avant d'ouvrir un fichier, puis par morceaux ciblés.
5. **Jamais deux fois la même chose** : bloqué → chercher la cause, autre approche ; sinon s'arrêter et dire : cause, preuve, action précise attendue.
6. **Jamais le modèle Fable.** Sonnet par défaut, Opus pour le risqué (sécurité, architecture), Haiku pour le simple.
7. **Jamais** de push, merge, déploiement, dépense, suppression ou `curl | bash` sans « oui ». Jamais de secret lu ni affiché.
8. Une information = **un seul endroit**. Chaque choix structurant = une décision écrite dans `docs/decisions/`.

### Compléments du 18 nov. 2026 (version 2, LBA-12)

Cette partie 1 est **le seul endroit où les règles sont écrites** ; l'onglet Règles l'affiche telle quelle. Les décisions expliquent pourquoi une règle existe : quand une décision crée une règle, sa ligne s'ajoute ici. Les règles 1 à 8 restent entières ; les lignes 5a à 8a les précisent sans les répéter.

État : **Programme** = le moteur l'impose. **À la main** = suivie par les agents et le propriétaire, sans contrôle automatique. **Pas branchée** = le code existe, le moteur ne l'appelle pas. **À construire** = rien n'existe. **À vérifier** = pas contrôlée pendant LBA-12.

| N° | Règle | Source | État |
|---|---|---|---|
| 5a | « Deux fois » veut dire : la même erreur deux fois de suite. Le travail s'arrête et le ticket passe en « Besoin d'action ». | `server/rules.ts` | Pas branchée |
| 6a | Opus, effort haut, aussi pour l'architecture, le cahier des charges, l'audit, le cadrage, le backlog, la conception, la stratégie, la refonte et la migration. Haiku pour une recherche. | Décision 0007 | Programme |
| 7a | Pour réunir un ticket dans main, le « oui » est la validation du ticket par le propriétaire. Le push et le déploiement demandent chacun leur propre « oui ». | Décision 0006 | Programme |
| 8a | `CLAUDE.md` et `AGENTS.md` ne s'écrivent pas à la main : le programme les produit depuis cette liste, en moins de 1 000 tokens. | Recherche LBA-10 | À construire |
| 9 | Le texte du propriétaire n'est jamais réécrit : on ajoute, avec la date. | Dossier du cahier | À la main |
| 10 | Un agent reçoit les exigences de son ticket, jamais tout le dossier. Seul l'Architecte relit le cahier entier. | Dossier du cahier | À vérifier |
| 11 | Une exigence sans ticket reste visible dans l'écran « Cahier des charges ». | Dossier du cahier | À vérifier |
| 12 | Aucun lancement par le pilote sans plan validé, ni avant la fin des dépendances. | Décision 0005 | Programme |
| 13 | Une étape n'est cochée que si le programme a vérifié sa preuve. Ce qu'aucun outil ne vérifie s'affiche « non vérifié », jamais « ok ». | Décisions 0005 et 0008 | Programme, sauf la capture d'écran |
| 14 | Chaque ticket travaille dans son propre worktree ; main n'est touché qu'à la réunion. | Décision 0006 | Programme |
| 15 | Réunion seulement dans un main propre. Tests relancés après la réunion ; s'ils sont rouges, `git revert`, et le ticket reste « à tester ». | Décision 0008 | Programme |
| 16 | Un agent n'a que des droits précis (`npm test`, `npm run check`, `npm run build`, `npm run pdf`, git en lecture et commit, quelques commandes de lecture). Il ne modifie pas `package.json`. | Décision 0008 | Programme |
| 17 | Deux agents au plus en même temps par défaut, chacun dans son worktree. | `server/engine.ts` | Programme |
| 18 | Un ticket ne reste jamais bloqué « en cours » : si la fin d'un agent plante, il passe en « Besoin d'action » avec la raison. | Décision 0008 | Programme |
| 19 | Plafond par passage : 3 $, 8 $ pour un agent Opus, 0,50 $ en mode direct. | `server/claude.ts`, `server/direct.ts` | Programme |
| 20 | Une tâche simple de texte passe en mode direct : un seul appel, sans outils. | `server/rules.ts` | Programme |
| 21 | Contexte limité à 60 000 tokens par agent : un seul compactage à 85 %, puis session neuve avec passation. | Décision 0003, LBA-10 | Pas branchée |
| 22 | Mémoire : 3 à 8 notes par ticket, 600 tokens au plus. Une note = un fait. Les agents proposent, le programme écrit. | Décision 0003, LBA-10 | À construire |
| 23 | Seul l'Éclaireur lit le web, et il n'écrit que dans `docs/recherche/` et `docs/rapports/`. | `src/shared/plan.ts` | Programme |
| 24 | Une proposition de l'Architecte ne s'applique jamais seule : le propriétaire l'accepte d'abord. | `server/engine.ts` | Programme |
| 25 | Le moteur n'obéit qu'à l'interface de ce PC. | Décision 0008 | Programme |
| 26 | Un rôle n'existe que s'il a un besoin écrit, un déclencheur décidé par le programme et une preuve vérifiable. | Partie 2, LBA-12 | À la main |
| 27 | Une économie de tokens se mesure sur 5 tickets réels avant d'être généralisée. | LBA-10 | À la main |
| 28 | Si deux règles se contredisent : la sécurité d'abord, puis le choix écrit le plus récent du propriétaire, puis l'ordre de la partie 3. Sinon, l'agent s'arrête et demande. | Décision 0010 | À la main |
| 29 | Un avis, un coût et un « oui » par lot, pas par ticket. Ce « oui » valide les plans du lot, puis le pilote enchaîne. | Décision 0010 | À la main |
| 30 | L'orchestrateur reçoit des ordres et répond par règles, sans IA. Une conversation se fait avec l'Architecte ou l'agent du ticket. | Décision 0010 | Programme |
| 31 | Une seule ambiance active, avec un seul accent et une seule police. Une nouvelle ambiance demande une maquette validée. | Décision 0010 | À la main |
| 32 | Sans « oui », le programme ne retire que ce qu'il a créé lui-même et qui ne contient aucun travail unique. | Décision 0010 | Programme |
| 33 | Réparation automatique : une seule reprise de l'agent, dans le périmètre de son ticket, sur un manque que le programme sait revérifier. Toutes les preuves sont refaites. | Décision 0010, LBA-17 | Programme |

## 2. Échecs passés à ne jamais refaire (Escouade, fork, couche « Studio »)
- Tokens : 3 à 59 M par ticket ; chef orchestrateur IA permanent très coûteux ; sorties de tests lues en entier ; agents en parallèle.
- Boucles aveugles : jusqu'à 16 relances sur la même erreur ; tickets inachevés envoyés en « À tester » ; pas de colonne « besoin d'action ».
- Rôles inutiles (docteur, juge, Guardian) qui n'agissaient que si le chef y pensait ; juge qui ne voyait pas le code du fork.
- Désordre : tickets lancés avant leurs dépendances ; tickets morts impossibles à relancer ; doublons ; ticket commencé impossible à modifier (outil, modèle, compte).
- Lenteur : compilation Rust de 37 min, 12 à 17 Go ; code resté sur des branches jamais réunies.
- Codex sous Windows : état SQLite de `~/.codex` corrompu ; règles NTFS DENY persistantes du bac à sable (ne jamais lui passer de chemins `deny`) ; erreurs de démarrage invisibles ; ne jamais modifier `~/.codex` soi-même.
- Windows : chemins avec espaces, limite de 260 caractères, disque presque plein. PC : i5 11ᵉ gén., 16 Go, sans GPU dédié.
- Design et organisation non satisfaisants ; trois mémoires en double ; projet pas clair de A à Z.

## 3. Priorités (dans l'ordre)
1. Expérience utilisateur la meilleure possible : fluide, claire, reposante, rapide.
2. 0 token pour tout ce qui est mécanique ; l'IA seulement pour écrire du code, analyser, résumer.
3. Fiable : jamais de boucle aveugle, jamais de blocage silencieux, erreurs visibles et expliquées.
4. Rapide : Node.js/TypeScript + interface web locale (Vite), pas de Rust/Tauri.
5. Très puissant pour Claude Code et Codex via leurs interfaces officielles, en réutilisant ce que Claude Code fait déjà (compactage, mémoire, skills, hooks, mode plan, sous-agents).
6. Windows d'abord.

## 4. Fonctionnalités
- **E0 Scan d'abord (0 token)** : Graphify, stack, sécurité (gitleaks, osv-scanner, npm audit, pip-audit, Semgrep), qualité (jscpd, linters), carte du code ; résultats dans `.lba/scan/` ; détection projet vide / commencé / repris ; commandes d'installation proposées.
- **E1 Comptes et consommation** : plusieurs comptes et outils via adaptateurs ; état de connexion avec raison exacte ; quotas 5 h / 7 j ; coûts par projet, ticket, agent, boucle, jour ; budgets ; bascule automatique sans IA (quota > 90 %, outil qui ne démarre pas) annoncée.
- **E2 Agents** : liste claire (qui, projet, ticket, outil, compte, modèle, effort, état, consommation) ; journal en temps réel ; changer outil, compte, modèle ou effort à tout moment sans perte ; déplacer, arrêter, pause, reprise ; erreurs visibles, secrets masqués.
- **E3 Sous-agents et coordination** : limite par ticket ; messages entre agents sans tokens ; passerelles Claude ↔ Codex avec fichier de passation standard ; verrous de fichiers ; questions des agents dans l'interface.
- **E4 Orchestrateur** : gère tout le projet, par règles (0 token), IA seulement pour découper, résumer ou une question de fond ; peut bloquer un ticket, un agent ou un fichier pour sécurité ; réclamations suivies ; dépendances respectées ; ordres directs (« lance T-12 sur Codex »).
- **E5 Démarche ESN** : Comprendre (cadrage ou audit avec verdict) → Choisir (options chiffrées) → Planifier (spec, backlog, lots) → Réaliser → Vérifier → Livrer (déploiement sur « oui ») ; frise visible ; une porte par étape.
- **E6 Kanban et backlog** : À faire · En cours · Besoin d'action · À tester · Terminé, plus « Bloqué par sécurité » ; épopées → histoires → tickets ; contrôle des doublons avant création ; ticket inachevé jamais « À tester ».
- **E7 Espaces et Git** : plusieurs projets, projet privé, vue Ensemble ; worktree par ticket, commits liés, comparaison avant/après ; merge sur « oui » ; travail validé réuni et visible immédiatement.
- **E8 Mémoire et contexte** : mémoire par projet partagée (une note = un fait) ; décisions avec interdits lisibles par la machine ; Graphify avant toute lecture ; paquet de contexte par ticket ; compactage natif une fois puis session neuve avec passation.
- **E9 Skills et outils** : bibliothèque de skills par projet ; outils gratuits intégrés ; exécuteur de commandes (journal complet gardé, l'agent ne reçoit que le résumé).
- **E10 Qualité** : définition de fini vérifiée par le programme ; tests, audits, build, Docker ; aperçu avec rechargement à chaud.
- **E11 Signalements** : cause, preuve, solution, qui agit ; liste « Besoin d'action humaine » avec bouton ou commande prête ; « Propositions » jamais exécutées sans accord ; réparations automatiques des pannes connues puis reprise par le même agent.
- **E12 Comptes rendus et statistiques** : compte rendu du jour par le programme (l'IA ajoute au plus 5 lignes) ; rapports HTML et PDF ; statistiques (tokens, boucles, validé du premier coup, temps, coûts, blocages).
- **E13 Notifications** : application et bureau Windows, regroupées et calmes ; tableau de bord.
- **E14 Chat, images, fichiers** : chat avec l'orchestrateur et chaque agent ; coller des images, téléverser des fichiers joints au ticket.
- **E15 Guide** : bouton « Que puis-je faire ? » partout ; guides illustrés ; chaque blocage et refus expliqué.
- **E16 Sécurité** : interdits par défaut (push, merge, `rm -rf`, `.env` et clés, écriture hors projet) ; secrets masqués ; approbations durables ; journal d'audit.
- **E17 Optimisation** : modèle choisi selon le risque ; parallélisme selon les quotas ; nettoyage des agents vides et sessions abandonnées ; mesure avant/après.
- **E18 Ne pas partir de zéro** : démarrer depuis un dépôt existant ; fiche d'évaluation de chaque dépôt ; bibliothèque de modèles de projets.
- **E19 Flux fluide** : arrêté seulement pour les vraies décisions ; toujours une prochaine action ; pas de cérémonie pour un petit changement ; travail asynchrone ; retour en arrière simple ; moins de 3 clics.
- **E20 Interface reposante** : un seul espace de travail, palette Ctrl+K, mode focus ; thèmes doux clair et sombre automatiques, filtre du soir ; contraste AA ; une seule couleur d'accent ; animations courtes et désactivables ; maquettes validées par le propriétaire avant généralisation.

## 5. Ordre de construction
J0 Avis, architecture, maquettes → J1 Scan (E0, E18) → J2 Moteur (E6, E9, E10, E11, E16) → J3 Agents (E2, E1) → J4 Orchestrateur et démarche (E4, E5, E12) → J5 Espace de travail (E7, E13, E14, E15, E19, E20) → J6 Mémoire et contexte (E8) → J7 Avancé (E3, E17). Après chaque jalon : mesure et décision.

---

## Ajouts du 17 nov. 2026 (session J0)
- **A1 Design** : le design doit être impeccable. Thème, police et design entièrement refaits ; plusieurs ambiances au choix.
- **A2 Organisation** : plus d'espace et une organisation plus claire (onglets de projet).
- **A3 Description de ticket** : chaque ticket a sa description (pourquoi, attendu, critères, hors périmètre, exigences du cahier des charges liées).
- **A4 Réalisé** : chaque ticket montre ce qui a été fait et ajouté (résumé, ajouts, fichiers, tests, commits).
- **A5 Comptes rendus sans oubli ni doublon** : chaque ticket réalisé indique s'il a déjà été rapporté et dans quel compte rendu ; le prochain compte rendu reprend tous les tickets non encore rapportés.
- **A6 Cahier des charges dans un dossier** : `docs/cahier-des-charges/` dans chaque projet, base de tout le travail ; couverture des exigences visible.
- **A7 Pilote automatique** : un ticket fini lance seul le suivant prêt (dépendances, budgets, quotas, fin de lot respectés).
- **A8 Contrôle manuel** : lancer soi-même un ticket et arrêter un autre (arrêt propre avec passation).
- **A9 Audit du fonctionnement** : surveiller la façon dont l'équipe travaille : consommation anormale de tokens, compactage sans retour, boucles, contexte, sessions, disque.
- **A10 Git** : voir les branches ; revenir à une ancienne version (point de retour, `git revert`, jamais d'effacement d'historique, sur « oui ») ; résoudre les conflits.
- **A11 Incidents** : incidents suivis avec chronologie et résolution.
- **A12 Mise en place par l'orchestrateur** : l'orchestrateur lance les agents avec leurs rôles ; à la mise en place il compose une équipe adaptée au projet, aidé par des agents d'aide qui peuvent chercher sur Internet (documentation officielle, versions) et importer des briques évaluées, sur accord.
- **A13 Flux de travail** : le flux complet doit être visible et remarquable, de A à Z.

---

## Version 2 du 18 nov. 2026 (LBA-12)

Cette version complète le texte ci-dessus à partir de la recherche LBA-10 (`docs/rapports/cadrage-recherche.html`) et de l'audit LBA-11 (`docs/rapports/cadrage-audit.md`). Elle ne retire rien. Les priorités restent celles de la partie 3, les fonctions celles de la partie 4, les règles celles de la partie 1.

### Objectifs

| N° | Objectif | Vérifié par |
|---|---|---|
| O1 | Le propriétaire obtient un projet complet, de l'idée à la livraison, en gardant toutes les vraies décisions. | C13, C14 |
| O2 | Rien n'est déclaré fini sur parole : chaque étape a une preuve contrôlée par le programme. | C3, C4 |
| O3 | main reste sain, et aucun blocage ni aucune boucle ne passe inaperçu. | C1, C2, C5, C6, C12 |
| O4 | Le coût en tokens est mesuré, borné et prévisible. | C7 à C11 |
| O5 | L'interface reste claire, reposante et à jour sans geste inutile. | C14 à C16 |

### Dans le périmètre

- Solidifier ce qui existe : moteur, tickets, preuves, worktrees et réunion dans main.
- Finir les points d'audit encore ouverts : test du superviseur avec un faux `claude`, `node_modules` partagé, arrêt des processus enfants sous Windows, journaux de commandes gardés hors du worktree, recherche de secrets plus large (décision 0008).
- Brancher les règles écrites que le moteur n'appelle pas encore (5a, 21) et la bascule de quota de E1.
- Construire la mémoire triée par le programme (scénario B de LBA-10), puis la mesurer sur 5 tickets réels.
- Ajouter Codex par son interface officielle (LBA-7).
- Travailler en local, sur Windows d'abord.

### Hors périmètre

- Un service en ligne ou partagé entre plusieurs personnes : la plateforme reste locale.
- Rust et Tauri (partie 3).
- Un chef IA permanent, et tout rôle sans déclencheur (partie 2).
- Des mémoires relues en entier, ou laissées à chaque outil comme mémoire principale (scénarios A et C de LBA-10). Le scénario C reste possible en secours.
- L'effacement de l'historique git (A10).
- Un déploiement ou un push sans « oui » (règle 7).

### Critères de réussite

Les cibles sont des propositions à confirmer par le propriétaire. « Tokens comptés » : ceux du journal du ticket, sans les relectures du cache. « Pas mesuré » : aucun chiffre n'existe encore.

| N° | Critère | Cible | Comment on mesure | Point de départ (18 nov. 2026) |
|---|---|---|---|---|
| C1 | main reste vert | 100 % des réunions suivies de tests verts dans main, ou annulées par `git revert` | Journal des réunions, `npm test` | 35 tests sur 35 verts |
| C2 | Le projet compile | 0 erreur à chaque réunion | `npm run check` | 0 erreur |
| C3 | Preuves réelles | 5 types de preuve sur 5 contrôlés par le programme ; 0 étape cochée sans contrôle | Lecture du superviseur, journal des étapes | 4 sur 5 (la capture manque) |
| C4 | Validé du premier coup | Au moins 80 % des 20 derniers tickets | Statistiques E12 | Pas mesuré |
| C5 | Pas de boucle aveugle | 0 nouvel essai après deux erreurs identiques de suite | Journal des erreurs | Pas mesuré (règle 5a pas branchée) ; ancien outil : jusqu'à 16 relances |
| C6 | Pas de blocage silencieux | 0 ticket « en cours » resté plus de 15 min sans événement ni passage en « Besoin d'action » | Heures du journal | Pas mesuré |
| C7 | Départ d'un agent léger | 13 000 tokens au plus | Premier tour de l'agent | Environ 12 300 (34 210 avant allègement) |
| C8 | Tâche simple en mode direct | 10 000 tokens comptés au plus | Onglet Quotas | 5 842 (README, LBA-9) |
| C9 | Ticket normal | Médiane de 60 000 tokens comptés au plus, sur 10 tickets | Onglet Quotas | 52 782 (LBA-10, un seul ticket) |
| C10 | Ticket important sur Opus | Médiane de 100 000 tokens comptés au plus, sur 10 tickets | Onglet Quotas | 68 711 (LBA-11, un seul ticket) |
| C11 | Pas de dérive | 0 ticket au-delà de 200 000 tokens comptés sans arrêt et sans avis au propriétaire | Onglet Quotas | Pas mesuré ; ancien outil : 3 à 59 millions |
| C12 | Sécurité | 0 push, réunion ou suppression faits par un agent ; 0 secret dans main | Journal, historique git, recherche de secrets | Pas mesuré depuis la décision 0008 |
| C13 | Couverture du cahier | 34 exigences sur 34 avec un ticket ou un report écrit | Écran « Cahier des charges » | Pas mesuré |
| C14 | Flux court | Lancer, valider, voir ce qui bloque : moins de 3 clics chacun (E19) | Parcours compté à la recette | Pas mesuré |
| C15 | Écran à jour | Un changement visible en 10 s au plus, sans recharger | Essai chronométré | Pas mesuré |
| C16 | Lisibilité | Contraste AA sur tous les écrans, en clair et en sombre (E20) | Outil de contraste | Pas mesuré |

### Équipes et rôles

Il n'y a pas d'équipe fixe : pour chaque projet (A12), le programme n'appelle que les rôles dont le déclencheur se présente (règle 26). Le modèle suit la règle 6 et ses précisions.

| Équipe | Rôle | Besoin | Déclencheur | Preuve |
|---|---|---|---|---|
| Direction | Propriétaire | C'est le client : il décide et valide (E5, règle 1). | Plan, recette, réunion, push | Sa validation, inscrite au journal |
| Pilotage | Programme (moteur et pilote), sans IA | Tout ce qui est mécanique coûte 0 token (partie 3, E4). Le chef IA permanent était trop cher (partie 2). | Toujours actif | Journal des événements |
| Pilotage | Architecte | Une erreur de conception coûte plus cher que les tokens économisés (décision 0007, E5). | Ticket d'architecture, de conception, de cahier des charges ou de backlog ; question du propriétaire | Document écrit |
| Recherche | Éclaireur | Chercher dans la documentation officielle et évaluer des briques (A12, E18). | Ticket de recherche, veille ou comparatif | Document avec ses sources |
| Réalisation | Développeur serveur | Écrire le code hors interface (E2, E10). | Ticket sans rôle plus précis | Tests et compilation |
| Réalisation | Développeur interface | L'interface est la priorité 1 (partie 3, E20). | Ticket d'écran, de page ou de design | Compilation et capture d'écran |
| Réalisation | Rédacteur | Rapports et documentation lisibles (E12). | Ticket de rapport, compte rendu ou documentation | Document écrit |
| Contrôle | Testeur | Prouver que le travail marche (E10). | Ticket de qualité ou de recette ; aide sur une étape de tests | Tests verts |
| Contrôle | Sécurité | L'audit a montré des interdits contournables (LBA-11, E16). | Ticket d'audit ou de sécurité ; relecture d'un ticket à risque | Scans sans alerte |

**Un seul ajout proposé : le relecteur design** (équipe Contrôle, Sonnet).
- **Besoin** : le design est une exigence forte (A1, E20) et un échec passé (partie 2). Or le superviseur réel ne contrôle aucune capture d'écran : `capture` n'apparaît que dans `server/simulate.ts`.
- **Déclencheur** : un ticket du développeur interface, une fois les captures prises par le programme.
- **Preuve** : captures en thème clair et sombre, et contraste AA mesuré par un outil (C16).
- **Condition** : il ne démarre que lorsque le programme sait prendre ces captures. Sinon il jugerait sur parole.

**Rôles écartés**

| Rôle | Pourquoi il n'est pas retenu |
|---|---|
| Chef de projet IA | Le pilote et l'Architecte suffisent ; c'est l'échec le plus coûteux de la partie 2. |
| Docteur, juge, Guardian | N'agissaient que si le chef y pensait (partie 2). |
| Gardien de la mémoire | Le programme écrit les notes (règle 22). |
| Surveillant du fonctionnement (A9) | Compter les tokens, les boucles et le disque est mécanique : c'est au programme de le faire. |
| Intégrateur | La réunion est faite par le programme (règle 15). |
| Analyste | Son nom existe dans `src/shared/plan.ts`, mais aucun ticket n'y mène ; l'Architecte fait déjà le cadrage. |
| Agent Codex | Codex est un outil, pas un rôle : chaque rôle pourra l'utiliser (LBA-7). |

### À trancher par le propriétaire

1. **Cibles** : confirmer ou changer les cibles C4, C6, C9, C10 et C11, qui ne reposent encore sur aucune série de mesures.
2. **Agents en même temps** : la partie 2 cite les agents en parallèle comme un échec, alors que la règle 17 en autorise deux. Avis : garder deux, car chacun a son worktree et main est retesté après chaque réunion.
3. **Relecteur design** : l'accepter, une fois les captures faites par le programme. Avis : oui, c'est le seul ajout qui répond à un manque constaté.

---

## Ajouts du 18 nov. 2026 (décision 0010)
Quand deux règles de ce cahier se contredisent, `docs/decisions/0010-contradictions-du-cahier.md` dit laquelle gagne. Elle range aussi A9 dans E12 et E17, et A11 dans E11.

### Ordre de construction : état réel
Ce tableau remplace la lecture de la partie 5, dont le texte d'origine reste en place. Le travail n'a pas suivi l'ordre prévu : le « J1 » du journal a construit le moteur, pas le scan. L'état vient du code et du journal au 18 nov. 2026.

| Jalon | Exigences | État | Ce qui manque |
|---|---|---|---|
| J0 Avis, architecture, maquettes | A1, A2 | Fait | Validation finale de la maquette, non notée au journal |
| J1 Scan | E0, E18 | En partie | Graphify, outils de sécurité et de qualité, `.lba/scan/`, démarrage depuis un dépôt, modèles de projets |
| J2 Moteur | E6, E9, E10, E11, E16, A3, A4, A11 | En grande partie | Contrôle des doublons, bibliothèque de skills, Docker, aperçu, suivi des incidents |
| J3 Agents | E2, E1 | En partie | Codex (LBA-7), changement d'outil, de modèle ou de compte en cours de route, plusieurs comptes, bascule automatique |
| J4 Orchestrateur et démarche | E4, E5, E12, A5, A7, A8, A9 (chiffres), A12 | En partie | Règles 5a et 21 à brancher, Flux réel, comptes rendus du jour, import de briques évaluées |
| J5 Espace de travail | E7, E13, E14, E15, E19, E20, A6, A10, A13 | En partie | Plusieurs vrais projets, notifications Windows, images et fichiers joints, onglets Backlog, Équipe, Santé et Flux |
| J6 Mémoire et contexte | E8 | Étudié, pas construit | Mémoire partagée, Graphify, paquet de contexte par ticket |
| J7 Avancé | E3, E17, A9 (actions) | E3 pas commencé, E17 en partie | Coordination entre agents, nettoyage, nombre d'agents selon les quotas |

Suite proposée, à confirmer par le propriétaire :
1. Brancher les garde-fous déjà écrits : règles 5a et 21, bascule de quota (J3 et J4).
2. Finir les onglets réels et les comptes rendus du jour (J4 et J5).
3. Ajouter Codex (J3).
4. Compléter le scan (J1).
5. Construire la mémoire (J6), puis le jalon avancé (J7).
