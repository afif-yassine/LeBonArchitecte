# 0015 : Commandes du chat de l'Architecte et carte du code (Graphify)

18 nov. 2026. Demandé par le propriétaire : « le chat doit être comme Claude, avec /compact, /usage, /context, /graphify… ». Il a aussi proposé de ne montrer à l'Architecte que la partie utile de la carte.

## Décision

1. **8 commandes dans le chat de l'Architecte**, toutes faites par le programme : 0 token, réponse immédiate, l'agent n'est pas appelé.
   - `/aide`
   - `/statut`
   - `/usage`
   - `/cout [LBA-n]`
   - `/context`
   - `/compact`
   - `/modele [opus | sonnet | auto]` (jamais Fable, Haiku refusé pour l'Architecte)
   - `/graphify [nom]`

   La liste est dans `src/shared/commands.ts`, partagée par le moteur et l'écran. Les réponses sont dans `server/architectCommands.ts`. Les commandes vont dans le fil, marquées `commande`, mais jamais dans le carnet de l'Architecte.
2. **`/compact` ne fait pas écrire de résumé par une IA**, à la différence de Claude Code. Il oublie seulement la conversation, et la demande suivante repart avec le carnet, déjà écrit par le programme.
3. **Carte du code : Graphify**, logiciel gratuit, installé à part dans `.lba/outils/graphify`.
   - Elle est faite **sans IA** (`graphify update . --no-cluster`), en environ 3 s, pour 0 token.
   - Elle est refaite au démarrage du moteur, au scan d'un projet (donc à l'import) et après chaque réunion dans main.
   - Elle est rangée dans `<projet>/graphify-out/`, que git ignore en local (`.git/info/exclude`) : aucun fichier suivi du projet ne change.
4. **L'Architecte ne lit jamais la carte entière.** Il lui pose de petites questions (`lba carte <nom>`, environ 400 caractères), avec un nom du code. S'il ne connaît pas le nom, il fait un seul Grep, puis il utilise la carte pour les liens. `graphify-out/` lui est interdit en lecture.

## Mesures (Sonnet, même question deux fois)

| Question | Sans carte | Carte entière | Petites questions |
|---|---|---|---|
| Routes réservées au propriétaire | 0,042 $ | 0,070 $ | 0,025 $ |
| Choix Sonnet / Opus | 0,070 $ | non mesuré | 0,035 $ |
| Validation d'un ticket | 0,040 $ | non mesuré | 0,040 $ |
| **Total** | **0,152 $** | | **0,100 $ (34 % de moins)** |

La qualité des réponses était égale ou meilleure, et le nombre de tours plus bas (4 à 5 au lieu de 6 à 7).

## Limites

- La carte connaît les noms du code, pas les mots français. Une recherche par question (`graphify query`) a donné trop de bruit, donc elle n'est pas utilisée.
- Graphify ne sait pas nommer les groupes sans IA : ils restent « Community N ». Ce n'est pas utile, donc ce n'est pas utilisé.
- Sur un projet petit et connu comme LBA, le gain est modeste. Le vrai gain attendu concerne les gros projets importés : à mesurer sur le premier.
- Seul l'Architecte utilise la carte pour l'instant. Les agents des tickets pourront l'avoir ensuite, si une mesure le justifie.
