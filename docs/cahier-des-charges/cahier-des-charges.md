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
