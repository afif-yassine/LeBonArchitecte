# Décision 0007 : le modèle le plus fort pour l'architecture et les tâches importantes

Date : 18 nov. 2026. Demandée par le propriétaire.

## Choix
- Architecture, cahier des charges, audit, cadrage, backlog, conception, stratégie, refonte, migration : **Opus, effort haut**, même si cela coûte plus de tokens.
- Sujets à risque (sécurité, paiement, données) : Opus, comme avant.
- Travail normal : Sonnet. Texte simple : Haiku. Lecture pour une recherche (Éclaireur) : Haiku.
- Jamais Fable.

## Pourquoi
« Pour ne pas faire quelque chose de mauvais et être obligé de répéter tout le travail. » Un mauvais choix d'architecture coûte bien plus que les tokens économisés.

## Où c'est appliqué
`server/rules.ts` (`pickModel`) et `server/claude.ts` (effort haut pour Opus). Testé dans `server/engine.test.ts`.
