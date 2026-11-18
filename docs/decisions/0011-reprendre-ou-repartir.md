# Décision 0011 : reprendre la conversation ou repartir avec une passation

Date : 18 nov. 2026. Statut : appliquée.

## Constat (mesuré sur LBA-15)
- Le cache de Claude expire après ~5 minutes sans échange. Reprendre une session plus tard réécrit toute la conversation au plein tarif (×1,25).
- LBA-15 : 2 rechargements (limite d'abonnement, puis correction de 2 conflits) = 148 704 tokens, 58 % de tout le cache écrit. La correction des conflits a rechargé 83 k pour toucher 2 fichiers.
- Un tiers des lectures étaient inutiles : fichiers relus, JOURNAL et toutes les décisions affichés en entier.

## Décision
| Cas | Choix |
|---|---|
| Pause courte (< 5 min, cache chaud) | reprendre la session |
| Pause longue + petite correction (« Demander à l'agent de résoudre », réparation automatique) | nouvel agent, consigne courte + passation écrite par le programme |
| Pause longue + gros travail (limite d'abonnement, votre demande de modification, « Reprendre ») | reprendre la session : l'agent a besoin de sa mémoire |

- Consigne à chaque agent : ne jamais relire un fichier déjà lu ; JOURNAL et décisions seulement si le ticket les nomme, par morceaux.
- Fiche ticket, bloc « Contexte de l'agent » : nombre de rechargements et tokens payés pour rien.

## Code
`server/supervisor.ts` (`cacheWarm`, `freshFix`), `server/claude.ts` (`Why = 'correction'`, `correctionPrompt`, `ECONOMY`, `contextOf().reloads`), `server/engine.ts` (`reject(…, small)`).
