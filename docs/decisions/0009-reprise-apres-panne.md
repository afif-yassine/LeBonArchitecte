# Décision 0009 : reprise après redémarrage ou panne du PC

Date : 18 nov. 2026. Ticket LBA-16, proposé par l'Architecte.

## Le problème
Si le PC s'éteint pendant qu'un agent travaille, l'agent disparaît mais son ticket reste écrit « En cours ». Il occupe une place et plus rien ne le fait avancer : c'est un ticket mort.

## Choix

### 1. Aucun ticket « En cours » sans agent vivant
- Au démarrage du moteur, aucun agent ne tourne encore. Tout ticket d'un vrai projet resté « En cours » passe donc en **« Besoin d'action »**, avec la cause et sa **dernière étape prouvée**, et libère sa place.
- Même traitement si l'espace de travail d'un ticket ne peut pas être créé : sans espace, pas d'agent.
- **Rien ne repart tout seul.** Cela remplace la reprise automatique ajoutée après l'audit LBA-11 : c'est vous qui décidez, avec le bouton **« Reprendre »**, sur la carte et dans le ticket.
- Deux exceptions, qui n'ont pas d'agent géré par le moteur : le travail lancé en **mode manuel** (fait hors agent) et les **projets d'exemple**. Ils gardent leur état.

### 2. La reprise réutilise la passation
- Le programme écrit la passation dans `.lba/passations/<ticket>.md`, sans IA : état de chaque étape, dernière étape prouvée, fichiers déjà enregistrés, fichiers modifiés mais pas enregistrés, derniers messages de l'agent, réclamation en attente.
- « Reprendre » rouvre la **même session Claude** si son journal existe encore et y joint la passation. Sinon, un **nouvel agent** part de la passation.
- Les étapes prouvées restent prouvées : ni l'agent ni le programme ne les refont.
- « Reprendre » est refusé, avec l'explication, dans trois cas : l'ancien agent a écrit il y a moins de 90 secondes (il tourne peut-être encore), il n'y a plus de place, ou la limite de l'abonnement est atteinte.

### 3. Sauvegarde simple de l'état de l'outil
- Une copie de la base (`.lba/lba.db`, qui contient tout le journal) est faite dans `.lba/sauvegardes/` au démarrage, avant tout changement, puis chaque heure.
- Au plus une copie par heure, et les 10 plus récentes sont gardées : des redémarrages répétés n'effacent pas les bonnes copies.
- La copie passe par un fichier temporaire : une panne pendant la sauvegarde ne laisse pas de copie abîmée.
- Le travail des tickets n'est pas dans cette copie : il reste dans leurs branches et leurs dossiers `.lba/worktrees/`.

**Pour restaurer :** arrêter le moteur, supprimer `.lba/lba.db-wal` et `.lba/lba.db-shm`, copier la sauvegarde choisie à la place de `.lba/lba.db`, relancer. Tout ce qui a été fait après cette sauvegarde est perdu du journal.

## Limites connues
- Un fichier en cours d'écriture au moment de la panne peut être incomplet. La passation le signale : l'agent doit relire les fichiers « pas encore enregistrés ».
- Si un ticket est coupé plusieurs fois dans la même session, les tokens de la partie déjà comptée peuvent l'être à nouveau.
- La sauvegarde reste sur ce PC : elle protège d'une base abîmée, pas d'un disque perdu.
