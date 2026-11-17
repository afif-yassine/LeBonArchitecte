# 0006 : vrais agents, un worktree par ticket, réunion après tests

**Statut** : acceptée le 2026-11-18 par le propriétaire. Ses mots : « with abonnement claude », « chaque ticket dans une worktree, après tous les tests on merge avec main ».

## Contexte
La documentation officielle de l'Agent SDK (code.claude.com/docs/en/agent-sdk/overview) dit qu'Anthropic n'autorise pas, sauf accord préalable, la connexion claude.ai ni les limites d'abonnement dans des produits construits avec le SDK.

## Décision
- **Connexion** : le moteur lance **Claude Code lui-même**, en mode non interactif (`claude -p --output-format stream-json`), avec la connexion de l'abonnement du propriétaire, sur son PC et pour son usage personnel. Pas de `--bare`, qui exige une clé API.
  - Si Le Bon Architecte est un jour distribué à d'autres, il faudra passer à une clé API (décision à refaire).
- **Interdits appliqués par Claude Code lui-même**, avec des règles deny :
  - commandes git : push, merge, reset, checkout ;
  - commandes système : `rm`, `curl`, `npm publish` ;
  - fichiers secrets : lecture de `.env` et des `.pem` ;
  - recherche et lecture sur Internet.
  - Les autorisations sont limitées à une liste : `npm`, `npx`, `node`, et en git seulement status, diff, log, add, commit. Toute autre demande est refusée sans attendre (`--permission-prompts none`). Plafond de 3 $ estimés par passage.
- **Un worktree par ticket** : `.lba/worktrees/<id>`, sur la branche `ticket/<id>`. `node_modules` est partagé par une jonction, retirée avant toute suppression. main n'est jamais touché pendant le travail.
- **Preuves** : à la fin de l'agent, le programme enregistre le travail (commit dans la branche du ticket), puis lance lui-même les commandes de la fiche du projet dans le worktree.
- **Réunion dans main** : quand vous validez, les tests sont relancés dans le worktree. Ensuite seulement vient `git merge --no-ff`, avec un point de retour noté (`git revert -m 1 <merge>`). En cas de conflit, la réunion est annulée et expliquée. Push : jamais sans votre « oui ».
- **Un lancement = un seul passage d'agent.** Au redémarrage du moteur, aucun agent n'est relancé tout seul.

## Conséquences
- Les tokens de chaque ticket sont mesurés pour de vrai, d'après le résultat renvoyé par Claude Code.
- Le contrôle de secrets lit les changements, en plus du blocage dans Claude Code. Le périmètre, les failles et la documentation ne sont pas encore outillés : ils sont regardés à la recette.
