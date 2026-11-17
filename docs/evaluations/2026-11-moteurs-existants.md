# Évaluation : moteurs existants pour orchestrer Claude Code et Codex

Date : 2026-11-17. Source : pages GitHub et licences lues le jour même. Code source non lu.

| Dépôt | Ce que c'est | Licence | État | Windows | Verdict |
|---|---|---|---|---|---|
| BloopAI/vibe-kanban | Kanban d'agents, worktree par tâche, API HTTP + MCP | Apache-2.0 | **En arrêt** (annonce sur le README) | Non indiqué | Idées seulement |
| stravu/crystal | Appli Electron, sessions Claude/Codex en worktrees | MIT | **Abandonné** (fév. 2026, remplacé par Nimbalyst) | Non indiqué | Idées seulement |
| eyaltoledano/claude-task-master | Cahier des charges → tâches avec dépendances, CLI + MCP | MIT **+ Commons Clause** (interdit de vendre, y compris hébergement et conseil) | Actif | Non indiqué | Reprendre des idées, **pas le code** |
| MrLesk/Backlog.md | Tâches en Markdown dans le dépôt, Kanban web, CLI `--json`, MCP | MIT | Actif | **Oui, indiqué** | Reprendre des idées ; code réutilisable si besoin |

## Points importants
- Vibe Kanban envoie des statistiques d'usage (PostHog) par défaut.
- Aucun des quatre ne montre de lecture des sorties `claude --output-format stream-json` ou `codex exec --json` : cette partie est à écrire nous-mêmes, à partir des documentations officielles.
- Aucun ne convient comme moteur : deux sont arrêtés, deux ne lancent pas d'agents.

## Ce qu'on reprend (idées, pas de code copié)
1. **Task Master** : les dépendances entre tâches (lancer avec ou sans ses dépendances) et le découpage des outils MCP en niveaux (peu d'outils par défaut, pour économiser le contexte).
2. **Backlog.md** : sortie `--json` stable et mode `--watch` pour suivre les changements ; « définition de fini » configurable ; libération d'un numéro de tâche quand aucune branche ne l'utilise plus.
3. **Vibe Kanban** : nettoyage automatique des worktrees orphelins ou expirés.

## Conclusion
Confirme la décision 0004 : notre moteur, en Node/TypeScript. Rien à intégrer dans le projet pour l'instant, donc aucune autorisation demandée.
