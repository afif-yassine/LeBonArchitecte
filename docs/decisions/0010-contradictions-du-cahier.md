# Décision 0010 : quelle règle gagne quand le cahier des charges se contredit

Date : 18 nov. 2026. Ticket LBA-15. Statut : **proposée, s'applique quand le propriétaire valide ce ticket.**

## Pourquoi
Plusieurs règles du cahier disent des choses opposées. Sans arbitrage écrit, chaque agent choisit au hasard. Cette décision explique les choix. Les règles qui en sortent sont écrites à un seul endroit, la partie 1 du cahier (règles 28 à 33).

## Règle générale pour tout nouveau conflit (règle 28)
On applique le premier point qui répond à la question :
1. La sécurité gagne toujours : règle 7 et E16.
2. Sinon, le choix écrit le plus récent du propriétaire gagne.
3. Sinon, on suit l'ordre des priorités de la partie 3 du cahier.
4. Sinon, l'agent s'arrête et pose la question. Il ne choisit jamais seul.

## Ce qu'est une « vraie décision »
Le travail s'arrête pour demander un « oui » seulement dans ces cas :
- lancer un lot ;
- valider un ticket fini (recette) ;
- push, déploiement, dépense, suppression, `curl | bash` ;
- retour en arrière, import d'une brique extérieure, proposition d'un agent ;
- changement de ce qui était prévu, ou choix entre options qui change le résultat.

## Les contradictions et la règle qui gagne

### 1. Règle 1 et E5 contre E19 et A7 : combien de « oui » ?
- **Conflit** : la règle 1 veut un « oui » à chaque étape, E5 une porte par étape. E19 veut un arrêt seulement pour les vraies décisions, et A7 enchaîne les tickets seul.
- **Gagne : la règle 1, au niveau du lot. E19 gagne à l'intérieur du lot.**
- **Dans quel cas** : un avis, un coût et un « oui » **par lot**, pas par ticket. Ce « oui » valide tous les plans du lot, puis le pilote enchaîne sans redemander. Un petit changement isolé est un lot d'un seul ticket. Les portes de E5 sont celles de la démarche (Comprendre, Choisir, Planifier, Réaliser, Vérifier, Livrer), pas celles de chaque ticket.
- **Aujourd'hui** : « Valider les plans et lancer » valide plusieurs tickets d'un coup, et le pilote s'arrête à la fin du lot.

### 2. E4 et partie 2 contre A12 : l'orchestrateur est-il une IA ?
- **Conflit** : E4 veut un orchestrateur par règles, à 0 token, et la partie 2 rejette le chef IA permanent. A12 lui demande de composer une équipe adaptée et de se faire aider par des agents qui cherchent sur Internet.
- **Gagne : E4.** A12 dit quoi obtenir, E4 dit comment.
- **Dans quel cas** : lancer les agents et choisir les rôles se fait par règles. L'équipe adaptée est faite des seuls rôles dont le déclencheur se présente (règle 26). Si les règles ne suffisent pas, un seul appel d'IA ponctuel répond à la question, puis s'arrête. Un agent d'aide est un ticket normal, avec plan validé et budget. Un import exige une fiche d'évaluation et un « oui ».
- **Aujourd'hui** : rôles, modèle et lancement sont choisis par règles, et l'Éclaireur existe (règle 23). L'import de briques n'existe pas.

### 3. A1 contre E20 : plusieurs ambiances ou une seule couleur ?
- **Conflit** : A1 veut plusieurs ambiances au choix. E20 veut une seule couleur d'accent et une interface reposante.
- **Gagne : A1 pour le choix entre ambiances, E20 à l'intérieur de chacune.**
- **Dans quel cas** : une seule ambiance est active à la fois, avec un seul accent et une seule police. Chaque ambiance respecte tout E20, en clair et en sombre. « Impeccable » n'autorise pas plus d'effets : en cas de doute, le plus calme gagne. Une nouvelle ambiance demande une maquette validée par le propriétaire.
- **Aujourd'hui** : trois ambiances (Ardoise, Papier, Brume), chacune avec son accent et sa police.

### 4. E4 contre E14 : parler à l'orchestrateur coûte-t-il des tokens ?
- **Conflit** : E14 veut un chat avec l'orchestrateur. E4 lui interdit l'IA, sauf cas précis.
- **Gagne : E4.**
- **Dans quel cas** : l'orchestrateur reçoit des ordres et répond par règles, sans IA. Une vraie conversation se fait avec l'Architecte ou avec l'agent du ticket.
- **Aujourd'hui** : le chat de l'orchestrateur a été retiré au profit d'un panneau et d'une barre d'ordres. On peut parler à l'agent depuis son ticket.

### 5. Règle 7, E16 et « merge sur oui » contre « réuni immédiatement » : qui réunit ?
- **Conflit** : la règle 7 et E16 interdisent le merge sans « oui ». E7 demande aussi que le travail validé soit réuni tout de suite, et la décision 0006 réunit après les tests.
- **Gagne : la règle 7, et la validation du ticket est ce « oui »** (règle 7a).
- **Dans quel cas** : un agent ne réunit jamais. Quand le propriétaire valide un ticket à tester, le programme relance les tests, réunit, puis reteste dans main. Il n'y a pas de second « oui ».
- **Aujourd'hui** : c'est appliqué (décisions 0006 et 0008).

### 6. Règle 7 contre E17 : le nettoyage automatique est-il permis ?
- **Conflit** : la règle 7 interdit toute suppression sans « oui ». E17 demande de nettoyer les agents vides et les sessions abandonnées.
- **Gagne : la règle 7, avec une seule exception.**
- **Dans quel cas** : le programme peut retirer seul ce qu'il a créé lui-même et qui ne contient aucun travail unique. Tout le reste est proposé et attend un « oui ». L'historique git n'est jamais effacé.
- **Aujourd'hui** : seuls l'espace de travail d'un ticket réuni et les sauvegardes au-delà des 10 gardées sont retirés automatiquement. Le nettoyage de E17 n'existe pas encore.

### 7. Partie 2 contre E17 : des agents en parallèle ?
- **Conflit** : la partie 2 classe « agents en parallèle » parmi les échecs. E17 demande du parallélisme selon les quotas.
- **Gagne : E17, avec une limite** (règle 17). Cela répond au point 2 de « À trancher » de la version 2, si le propriétaire valide ce ticket.
- **Dans quel cas** : deux agents au plus par défaut, sur des tickets dont les dépendances sont réglées. Si le budget du jour est atteint, ou si la limite d'abonnement est atteinte, aucun nouvel agent ne démarre.
- **Aujourd'hui** : la limite de deux agents, le budget du jour et la pause à la limite d'abonnement existent. Le nombre d'agents ne s'adapte pas encore aux quotas.

### 8. Règle 5 et « Propositions » contre « réparations automatiques » (E11)
- **Conflit** : E11 interdit d'exécuter une proposition sans accord, mais demande de réparer seul les pannes connues. La règle 5 interdit de refaire deux fois la même chose.
- **Gagne : la règle 5 et l'accord, sauf pour un manque que le programme sait revérifier.**
- **Dans quel cas** : l'agent reprend seul une seule fois, dans le périmètre de son ticket, et toutes les preuves sont refaites. Si cela échoue, le ticket passe en « Besoin d'action » avec la cause et la preuve. Tout le reste est une proposition.
- **Aujourd'hui** : c'est appliqué pour les tests rouges, la compilation et un document absent (LBA-17).

### 9. E7 contre A2 : faut-il une vue Ensemble ?
- **Conflit** : E7 demande une vue Ensemble. A2 demande une organisation plus claire, et la session J0 a isolé chaque projet en retirant cette vue.
- **Gagne : A2, pour l'instant.**
- **Dans quel cas** : chaque projet reste séparé tant qu'un seul vrai projet tourne. La vue Ensemble revient en discussion quand il y en aura un deuxième.
- **Aujourd'hui** : pas de vue Ensemble. C'est le seul arbitrage de cette liste qui reporte une demande : le propriétaire peut le refuser à la recette.

### 10. Règles 4 et 6 contre décision 0007 : quel modèle ?
- **Conflit** : les règles 4 et 6 demandent l'économie et Sonnet par défaut. La décision 0007 demande Opus pour les tâches importantes, même si cela coûte plus.
- **Gagne : la décision 0007**, choix plus récent du propriétaire (règle 6a).
- **Dans quel cas** : la liste des tâches concernées est dans la règle 6a. Partout ailleurs, Sonnet par défaut. La règle 4 sur la façon de lire reste valable pour tous. Jamais Fable.
- **Aujourd'hui** : c'est appliqué par le choix automatique du modèle.

## Où ranger A9 et A11
A9 et A11 gardent leur numéro, pour ne pas casser les liens des tickets. Ils ne créent ni écran ni liste à part.

**A9 Audit du fonctionnement est rangé dans E12 et E17.** E12 constate, E17 agit. Tout est fait par le programme, sans rôle dédié (version 2 du cahier).

| Ce que A9 surveille | E12 : le chiffre, sans IA | E17 : l'action |
|---|---|---|
| Consommation anormale de tokens | Tokens par ticket et par jour, écart signalé | Modèle ou nombre d'agents ajusté |
| Boucles | Nombre de boucles par ticket | Mesure avant et après correction |
| Compactage sans retour | Durée constatée | Session neuve avec passation |
| Contexte | Taille par agent | Plafond et session neuve |
| Sessions | Sessions ouvertes et abandonnées | Nettoyage selon la contradiction 6 |
| Disque | Place prise par le projet | Nettoyage selon la contradiction 6 |

Quand un de ces points bloque le travail, il devient un signalement de E11.

**A11 Incidents est rangé dans E11.** Un incident est un signalement suivi dans le temps : il garde la cause, la preuve, la solution et qui agit, et ajoute sa chronologie et sa résolution. La chronologie est calculée par le programme depuis le journal du moteur. Il n'y a qu'une seule liste, « Besoin d'action humaine ».

## Ordre de construction
La partie 5 d'origine ne correspond plus au travail fait. L'état réel est écrit à un seul endroit : la section « Ajouts du 18 nov. 2026 (décision 0010) » du cahier. Le texte d'origine reste en place (règle 9).

## Fichiers lus
`docs/cahier-des-charges/cahier-des-charges.md`, `docs/cahier-des-charges/README.md`, `docs/JOURNAL.md`, `docs/decisions/0001` à `0009`, `docs/rapports/cadrage-audit.md`, `server/rules.ts`, et des extraits de `server/architect.ts`, `server/engine.ts`, `server/supervisor.ts`, `server/git.ts`, `server/db.ts`, `server/claude.ts`, `server/index.ts`, `src/shared/plan.ts`, `src/settings.ts`, `src/App.tsx`.
