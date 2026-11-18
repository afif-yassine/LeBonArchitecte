# Audit de l’architecture du Bon Architecte (LBA-11)

> Le cœur tient debout : 26 tests sur 26 sont verts et le projet compile sans erreur. Le moteur, les preuves vérifiées par le programme et les espaces de travail séparés (worktrees) marchent. Les vrais risques sont ailleurs : la réunion se fait dans la branche ouverte (pas forcément main), les tests ne sont pas relancés après la réunion, et les interdits donnés à l’agent se contournent. Trois points à corriger en premier, avant d’ajouter des fonctions.

Date : 18 novembre 2026. Branche : `ticket/LBA-11`. Lecture limitée à une dizaine de fichiers, par morceaux.

## Résultat des tests

| Contrôle | Commande | Résultat |
|---|---|---|
| Tests du moteur | `npm test` | **26 passés, 0 en échec** (6,4 s) |
| Compilation | `npm run check` | **sans erreur** |
| Interdits de l’exécuteur | essai à la main | `git push` refusé, mais `git -C . push origin main` **accepté** |

Ce qui n’a aucun test : le superviseur (`server/supervisor.ts`) et l’adaptateur Claude (`server/claude.ts`). C’est pourtant là que se jouent la fin d’un agent et la réunion dans main.

## Schéma de l’architecture

Les pastilles rouges renvoient aux points faibles numérotés plus bas.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 400" width="100%" font-family="Manrope, sans-serif" font-size="13">
  <defs><marker id="f" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#555"/></marker></defs>
  <g fill="#f4f1ea" stroke="#333">
    <rect x="20" y="20" width="200" height="56" rx="8"/>
    <rect x="280" y="20" width="200" height="56" rx="8"/>
    <rect x="540" y="20" width="200" height="56" rx="8"/>
    <rect x="280" y="130" width="200" height="56" rx="8"/>
    <rect x="20" y="240" width="200" height="56" rx="8"/>
    <rect x="280" y="240" width="200" height="56" rx="8"/>
    <rect x="540" y="130" width="200" height="56" rx="8"/>
    <rect x="540" y="240" width="200" height="56" rx="8"/>
    <rect x="280" y="330" width="200" height="56" rx="8"/>
  </g>
  <g text-anchor="middle" fill="#111">
    <text x="120" y="44" font-weight="700">Interface</text><text x="120" y="62">src/ (React)</text>
    <text x="380" y="44" font-weight="700">Serveur local</text><text x="380" y="62">index.ts, 127.0.0.1</text>
    <text x="640" y="44" font-weight="700">Moteur</text><text x="640" y="62">engine.ts, rules.ts, SQLite</text>
    <text x="380" y="154" font-weight="700">Superviseur</text><text x="380" y="172">supervisor.ts</text>
    <text x="120" y="264" font-weight="700">Agent Claude</text><text x="120" y="282">claude.ts (outils)</text>
    <text x="380" y="264" font-weight="700">Mode direct</text><text x="380" y="282">direct.ts (1 appel)</text>
    <text x="640" y="154" font-weight="700">Exécuteur</text><text x="640" y="172">executor.ts (preuves)</text>
    <text x="640" y="264" font-weight="700">Worktree du ticket</text><text x="640" y="282">git.ts, ticket/LBA-n</text>
    <text x="380" y="354" font-weight="700">Réunion dans main</text><text x="380" y="372">git.ts, après tests verts</text>
  </g>
  <g stroke="#555" stroke-width="1.5" fill="none" marker-end="url(#f)">
    <path d="M220,48 H276"/><path d="M480,48 H536"/>
    <path d="M640,76 V100 H380 V126"/>
    <path d="M330,186 L150,236"/><path d="M380,186 V236"/>
    <path d="M480,158 H536"/>
    <path d="M220,268 C300,310 520,310 560,296"/><path d="M480,268 H536"/>
    <path d="M640,186 V236"/>
    <path d="M640,296 V358 H484"/>
  </g>
  <g fill="#666" font-size="11" text-anchor="middle">
    <text x="510" y="40">HTTP</text><text x="510" y="116">change</text>
    <text x="230" y="206">agent</text><text x="398" y="214">direct</text>
    <text x="506" y="150">tests</text>
  </g>
  <g fill="#c0392b" font-size="11" font-weight="700" text-anchor="middle">
    <circle cx="470" cy="22" r="10"/><text x="470" y="26" fill="#fff">8</text>
    <circle cx="470" cy="132" r="10"/><text x="470" y="136" fill="#fff">2</text>
    <circle cx="210" cy="242" r="10"/><text x="210" y="246" fill="#fff">3</text>
    <circle cx="730" cy="132" r="10"/><text x="730" y="136" fill="#fff">3</text>
    <circle cx="730" cy="242" r="10"/><text x="730" y="246" fill="#fff">6</text>
    <circle cx="470" cy="332" r="10"/><text x="470" y="336" fill="#fff">1</text>
  </g>
</svg>
```

Le chemin d’un ticket : vous lancez depuis l’interface ; le moteur l’écrit dans son journal ; le superviseur le voit, prépare le worktree et choisit l’agent Claude ou le mode direct ; à la fin, le programme enregistre le travail, relance lui-même les preuves (tests, compilation), puis, quand vous validez, relance les tests et réunit la branche dans main.

## Ce qui marche

- **Moteur sans IA** : chaque changement est un événement écrit dans SQLite ; les règles (passages d’état, place libre, plan validé) refusent avec une raison claire.
- **Preuves faites par le programme** : une étape « tests » ou « commande » ne se coche que si le moteur a lancé la commande et qu’elle a réussi. Une simple déclaration est refusée.
- **Un worktree par ticket** : main n’est pas touché pendant le travail ; réunion `--no-ff` avec point de retour et commande d’annulation ; en cas de conflit, la réunion est annulée proprement.
- **node_modules protégé à la suppression** : la jonction est retirée avant d’effacer le worktree, jamais le dossier d’origine.
- **Agent tenu court** : pas de connecteurs, budget plafonné (3 $ ou 8 $ pour Opus), interdits passés à Claude Code, un seul passage par lancement, pas de relance cachée au redémarrage.
- **Mode direct** : un seul appel sans outils ; les chemins rendus sont contrôlés (pas de `..`, pas de fichiers de secrets, 3 fichiers au plus).
- **Serveur local seulement** (127.0.0.1) et recherche de secrets avant la réunion.

## Points faibles et risques, par gravité

### Élevé : à corriger avant la suite

| N° | Problème | Fichier | Conséquence |
|---|---|---|---|
| 1 | La réunion se fait dans la branche ouverte du dossier principal, sans vérifier que c’est main ni qu’il est propre. Les listes de changements comparent aussi à cette branche (`HEAD...ticket`). | `server/git.ts` (mergeTicket, changedFiles, diffOf) | Si vous avez une autre branche ouverte, le ticket est réuni au mauvais endroit, et la liste des fichiers changés est fausse. |
| 2 | Les tests sont relancés dans la branche du ticket, pas après la réunion. | `server/supervisor.ts` (validate) | Deux tickets verts chacun peuvent donner un main rouge, surtout avec plusieurs agents en parallèle. |
| 3 | Les interdits se contournent. L’agent a le droit à `node *`, `npx *` et `npm *`, donc à n’importe quel code. La liste de l’exécuteur est une liste de mots : `git -C . push` passe (testé). Le commentaire « toute commande d’un agent passe ici » est faux pour l’agent réel, qui lance ses commandes lui-même. | `server/claude.ts` (ALLOWED), `server/executor.ts` (FORBIDDEN) | Un push ou une suppression reste possible malgré la règle. La vraie protection, aujourd’hui, c’est seulement que la réunion est faite par le programme. |

### Moyen : à prévoir dans les prochains tickets

| N° | Problème | Fichier | Conséquence |
|---|---|---|---|
| 4 | Des contrôles sont affichés « ok » sans être vérifiés : « Aucune nouvelle faille », « Documentation à jour » toujours ok ; « Tests verts » ok s’il n’y a aucune commande de test. | `server/supervisor.ts` (finish) | Le tableau dit « ok » alors que rien n’a été regardé. |
| 5 | Si la fin de l’agent plante (commit refusé, erreur git), seul un message est écrit. | `server/supervisor.ts` (onEnd) | Le ticket reste « en cours » pour toujours et garde une place. |
| 6 | node_modules est partagé par une jonction : un `npm install` dans un worktree modifie celui du projet principal. Le mode direct peut aussi écrire dans `node_modules/` ou `package.json`. | `server/git.ts` (ensureWorktree), `server/direct.ts` (SENSITIVE) | Un ticket peut casser les dépendances des autres, ou changer la commande de tests. |
| 7 | Arrêter un agent ou une commande trop longue tue le processus principal, pas toujours ses enfants sous Windows. | `server/executor.ts` (kill), `server/supervisor.ts` (tick) | Des tests ou des commandes continuent en arrière-plan. |
| 8 | Le serveur n’a ni mot de passe ni contrôle d’origine. Une page web ouverte dans le navigateur pourrait appeler les routes sans contenu (lancer, arrêter, valider). Probable, non testé. | `server/index.ts` | Lancement ou réunion déclenchés sans vous. |
| 9 | Aucun test pour le superviseur et l’adaptateur Claude. | `server/engine.test.ts` | Les points 1, 2, 4 et 5 ne seraient vus par aucun test. |

### Faible : à garder en tête

| N° | Problème | Fichier | Conséquence |
|---|---|---|---|
| 10 | La sortie de Claude est lue par morceaux d’octets : un accent coupé entre deux morceaux devient « � ». | `server/claude.ts`, `server/direct.ts` (stdout) | Texte abîmé, rare, mais possible dans un fichier écrit en mode direct. |
| 11 | Les journaux des commandes sont rangés dans le worktree. | `server/executor.ts` (logDir), `server/git.ts` (removeWorktree) | Ils disparaissent avec le worktree après la réunion : moins de traces pour un audit. |
| 12 | L’étape « relecture » est cochée dès que l’agent a lu un fichier, n’importe lequel. | `server/supervisor.ts` (finish) | Preuve faible. |
| 13 | En mode direct, l’écriture des tokens n’est pas protégée par un try. | `server/direct.ts` | Si le ticket a disparu, le moteur peut s’arrêter. |
| 14 | La recherche de secrets ne connaît que quelques formats et lit 2 Mo au plus. | `server/supervisor.ts` (SECRET), `server/git.ts` (diffOf) | Un autre type de clé passerait. |

## Ordre conseillé

1. Réunion sûre : vérifier que le dossier principal est sur main et propre, comparer à `main` et non à `HEAD`, relancer les tests après la réunion et revenir au point de retour s’ils sont rouges (points 1 et 2).
2. Interdits : retirer `node *` et `npx *` des droits de l’agent, ou les remplacer par des commandes précises (`npm test`, `npm run check`) ; ne plus présenter la liste de mots comme une barrière (point 3).
3. Tableau honnête : afficher « non vérifié » au lieu de « ok » (point 4) et sortir un ticket bloqué en « Besoin d’action » (point 5).
4. Un test du superviseur avec un faux `claude` (point 9).

## Fichiers lus

`package.json`, `.gitignore`, `server/supervisor.ts`, `server/git.ts`, `server/claude.ts`, `server/direct.ts`, `server/executor.ts`, `server/engine.ts` (lancement, fin, validation, preuves), `server/index.ts` (routes), `server/rules.ts` (choix du mode), `scripts/pdf.mjs`.
