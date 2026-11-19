# 0019 : Équipe (fiches de rôle) et Backlog réels

19 nov. 2026. Demandé par le propriétaire : « on passe à l'Équipe et au Backlog, comment on gère ? », puis « lance tout » (lots B, E1, E2, E3). Cela suit sa question sur la sécurité, le DevOps et les MCP (décision 0016).

## Décision

### Backlog
- Le Backlog garde les idées et les besoins **pas encore décidés** : titre, détail, taille, qui l'a ajouté. Le Kanban garde le travail décidé.
- Chaque changement est un événement du journal (`backlog-ajout`, `-maj`, `-ordre`, `-ticket`, `-retire`). On sait qui a fait quoi, et on peut tout revoir.
- On les range par glisser-déposer, ou avec les flèches au clavier. Retirer un élément reste au propriétaire.
- **« En faire un ticket »** passe par l'Architecte, qui écrit les critères. Il crée le ticket avec `lba creer --depuis B-n`, et l'élément quitte alors le backlog : une information à un seul endroit.
- L'Architecte voit les 5 premiers éléments dans l'état du projet. Sa règle : une idée pas encore décidée va dans le backlog.

### Fiches de rôle
- **Un rôle ne crée pas d'agent en plus.** On garde un seul agent par ticket (décision 0006). Le rôle règle cet agent unique :
  - sa mission ;
  - son modèle par défaut ;
  - ses commandes permises en plus ;
  - son MCP, avec **seulement** les outils listés ;
  - les dossiers où il peut écrire ;
  - les mots qui l'appellent ;
  - son budget par lancement.
- Les fiches sont rangées dans `<projet>/.lba/equipe.json`, suivi par git. Elles sont lues dans le dossier principal, **jamais dans la branche d'un ticket**. Les agents n'ont pas le droit de modifier ce fichier. Seul le propriétaire le change, depuis l'écran Équipe (l'Architecte peut seulement proposer).
- **Rôle d'un ticket :** celui choisi à la création (`--role`), sinon l'Éclaireur pour une recherche, sinon le premier rôle actif dont un mot apparaît dans le ticket, sinon Développeur. C'est le programme qui le calcule : 0 token.
- **Garde-fous :** une fiche ne peut jamais donner git push ou merge, une suppression, un téléchargement, un interpréteur (node, bash, powershell…), un enchaînement de commandes, un chemin hors du projet, Fable, ni un MCP sans liste d'outils. Les interdits des agents restent plus forts que tout.
- **Périmètre :** le contrôle qui était réservé aux recherches vaut pour tout rôle qui a des dossiers permis.
- Rôles de base : Développeur, Éclaireur, Sécurité. Modèles prêts à ajouter : DevOps, Média, Rédacteur.

### Écran Équipe et équipe proposée
- L'écran montre chaque fiche, et ce que le rôle a vraiment fait, lu dans le journal : tickets finis, part validée du premier coup (sans réclamation), tokens, tickets en cours.
- **À l'import, le programme propose une équipe** d'après ce que contient le projet (0 token) :
  - un Dockerfile, un Jenkinsfile ou une CI donnent DevOps ;
  - une bibliothèque d'images ou de vidéos donne Média ;
  - des documents donnent Rédacteur.
- Le propriétaire clique « Accepter cette équipe », ou demande à l'Architecte de l'adapter. C'est mieux qu'un appel à l'Architecte à chaque import : même résultat, sans tokens.

## Vérifié
- 71 tests verts :
  - garde-fous des fiches ;
  - rôle d'un ticket (« ci » n'est pas pris au milieu de « accents ») ;
  - périmètre ;
  - équipe proposée ;
  - enregistrement ;
  - backlog complet.
- Écrans Backlog et Équipe contrôlés sur PC et téléphone, sans erreur. Les chiffres réels de LBA : Développeur, 11 tickets finis sur 12 (9 du premier coup) ; Sécurité, 2 sur 5 ; Éclaireur, 1 sur 1.

## Limites
- Un rôle avec MCP ou commandes en plus (DevOps, Média) n'a pas encore tourné sur un vrai ticket. Son premier lancement est à surveiller.
- « Validé du premier coup » compte les réclamations, pas les réparations automatiques.
- Le Sécurité est appelé par le mot « quota ». Sur LBA, beaucoup de tickets en parlent : ils recevront sa mission (avec un test d'abus). Le modèle reste celui du ticket.
