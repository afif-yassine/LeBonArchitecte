# 0020 : Backlog relié au cahier des charges, sprints, rapport de sprint, changements

19 nov. 2026. Demandé par le propriétaire : « le backlog se base sur le projet, l'architecture, le cahier des charges et les règles ; des sprints l'un après l'autre jusqu'à l'état final ; à chaque changement on recalcule ; à chaque sprint un rapport complet, comme une vraie ESN ». Puis : « le backlog aussi depuis l'état actuel du projet ? Quelle différence entre le cahier des charges et le backlog ? ».

## Cahier des charges ou backlog
- Le **cahier des charges** dit **ce que** le projet doit être : ses exigences (E1, E2…, A1…). Il change rarement. C'est le contrat.
- Le **backlog** dit **ce qui reste à faire** pour y arriver **depuis l'état actuel**, dans l'ordre de priorité. Il change à chaque sprint. C'est le plan de route.
- Le lien entre les deux : chaque élément du backlog cite les exigences qu'il couvre. Un ticket fait depuis cet élément hérite de ces exigences. On suit ainsi le fil cahier → backlog → ticket.

## Décision (adaptée de la demande)
1. **S1, backlog depuis le cahier et l'état actuel.**
   - L'Architecte remplit le backlog jusqu'à l'état final, en **gros morceaux** reliés aux exigences, avec une taille, dans l'ordre. Ce qui existe déjà dans le projet n'y va pas.
   - **Pas de tickets détaillés à l'avance.** 80 tickets complets coûteraient 200 à 800 k tokens et seraient faux à la moitié du projet.
   - La **couverture** est calculée par le programme : combien d'exigences ont un élément ou un ticket, et lesquelles n'ont rien. Sur LBA : **28 sur 34**. Il manque E13, E14, E18, A5, A10 et A13.
2. **S2, sprints.**
   - Un sprint a un objectif et prend des éléments en tête du backlog. L'Architecte découpe chaque élément en 1 à 4 tickets (`lba creer --depuis B-n`) ; le sprint et les exigences suivent seuls.
   - Les sprints **continuent la numérotation des lots** (un lot était déjà un sprint) : le prochain est le **sprint 3**.
   - Un seul sprint ouvert à la fois. **Ouvrir et fermer un sprint restent au propriétaire** ; l'Architecte peut proposer l'objectif et les éléments.
   - La vitesse est calculée : tickets finis, tokens et jours par sprint.
   - Les colonnes du Kanban restent les étapes d'un ticket, pas un sprint.
3. **S3, rapport de sprint**, calculé par le programme (0 token) depuis le journal et git, entre le commit de début et celui de fin du sprint :
   - l'objectif ;
   - les éléments et leurs exigences ;
   - les tickets (rôle, état, ce qui a été fait, tokens) ;
   - les changements de code par dossier et les fichiers nouveaux ;
   - les décisions écrites pendant le sprint ;
   - les modèles, rôles et commandes de test utilisés ;
   - les tests et les contrôles (secrets, failles, périmètre…) ;
   - la vitesse comparée aux sprints d'avant.

   Seul le **résumé en tête** est écrit par une IA (Sonnet, sans outils, environ 5 à 8 k), une fois, à la fermeture. Le rapport est dans Documents (`lba/comptes-rendus/sprint-n`), en PDF. Une version « en cours » existe pendant le sprint.
4. **S4, changement → impact.**
   - Le programme compare le cahier (version, et une empreinte par exigence) et la liste des décisions à ce que vous avez marqué « c'est vu ».
   - En cas de changement, il affiche les exigences ajoutées, modifiées ou enlevées, et les décisions nouvelles.
   - « Analyser l'impact » demande à l'Architecte la liste de **ce qui est touché seulement** et ce qu'il changerait. Il ne change rien avant votre oui. **On ne recalcule pas tout.**

## Vérifié
- 72 tests verts : sprints (ouverture, refus, plusieurs tickets par élément, fermeture), couverture (y compris « E2~ » en partie), changements, rapport.
- Rapport d'un sprint d'essai sur le vrai dépôt : 4 commits et 22 fichiers repérés, nouvelle décision trouvée. PDF de 127 Ko construit.
- Écran Backlog contrôlé sur PC et téléphone : couverture, préparation du sprint, aucune erreur.
- En vrai, le propriétaire a déjà mis B-2 en tête puis « En faire un ticket » : l'Architecte a créé LBA-18.

## Limites
- Le remplissage du backlog par l'Architecte n'a pas encore été lancé sur LBA (environ 20 à 40 k, une fois) : c'est au propriétaire de cliquer.
- Les lots 1 et 2 d'avant n'ont pas de commit de départ enregistré : seuls les sprints à partir du 3 ont la partie git du rapport.
- La couverture dit si une exigence a **quelque chose**, pas si elle est **finie**.
