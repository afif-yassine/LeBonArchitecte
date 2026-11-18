# Décision 0014 : l'Architecte devient un agent autonome, avec des garde-fous

Date : 18 nov. 2026. Statut : lots A et B appliqués ; lot C (écran) et l’équipe à faire. Demandé par le propriétaire : « l'architecte peut avoir la main sur tout le projet… comme Claude Code ici… il peut appeler les agents… sans permission, avec les garde-fous et les règles ».

## Ce que l'Architecte fait seul
Kanban (créer un ticket, plan, ordre, pause, reprise, lancement), agents (lancer, écrire, demander de résoudre, lire le déroulé), documents (cahier, décisions, rapports : dans sa branche), équipe et agents (lot B), réponses et propositions. Sans question de permission.

## Ce qui reste toujours au propriétaire (refusé par le serveur, pas seulement par la consigne)
Réunir dans main (Valider), git (revenir, brancher), pilote et budget du jour, décider de ses propres propositions, fermer les actions du propriétaire, supprimer. Les preuves et fins d'agent restent écrites par le programme seul.

## Comment
- Commande `node scripts/lba.mjs` (aide, etat, ticket, deroule, compte-rendu, creer, valider-plan, replanifier, lancer, pause, reprendre, arreter, resoudre, tester, message, refuser, ordre, docs, doc). Elle passe par le même moteur que vos boutons, avec l'en-tête `x-lba-acteur: architecte`.
- Le serveur écrit chaque action au nom « architecte » dans le journal (visible, réversible) et ferme les portes du propriétaire (`server/acteurs.ts`).
- Les autres agents n'ont pas accès à cette commande (node, curl et le web leur sont refusés). Lot B : l'Architecte ne pourra pas modifier `scripts/lba.mjs` ni le moteur ; ses documents passent par sa branche et « À tester ».
- Coût : un agent qui lit et agit coûte environ 20 à 60 k par demande (contre 13 k pour un avis sans outils) ; contexte préparé par le programme, Sonnet pour les petites consignes, Opus pour l'architecture, budget du jour respecté.

## Lot B : l'agent, et pourquoi il ne relit pas tout à chaque demande
- Règles et procédures = consigne système fixe (toujours le même texte, en premier) : mise en cache, relue à 10 % du prix, jamais relue avec un outil.
- L'état du kanban est préparé par le programme (0 token) et joint à la demande ; son carnet (12 dernières actions, écrit par le programme) remplace une longue conversation.
- Conversation reprise seulement si elle date de moins de 5 minutes (cache chaud) ; sinon nouvelle conversation courte.
- Sonnet pour une consigne, Opus pour architecture, décisions, risques, équipe (« /opus » ou « /sonnet » force le choix). Tokens comptés dans le budget du jour.
- Lecture seule sur main (toujours à jour) : il ne modifie aucun fichier ; un document ou du code = un ticket qu'il crée et lance (branche, À tester, votre Valider). Écriture, git add/commit, npm, npx, curl, web et ~/.claude lui sont refusés.
- Mesuré le 18 nov. (Sonnet) : 1re question 3 936 tokens + 4 768 relus du cache ; question suivante 1 374 tokens + 7 962 relus du cache.

## Contradictions et taille du contexte (ajout du 18 nov.)
- Son carnet contient aussi vos 10 dernières consignes et le titre de chaque décision (0 token, préparé par le programme).
- Une demande qui contredit une consigne, une décision ou un ticket déjà commencé : il ne fait rien et répond « Contradiction : » avec 3 choix (garder, remplacer, combiner), son avis et le coût. Ticket pas commencé : il le replanifie et le dit. Rien n'est effacé.
- Conversation reprise seulement si elle a moins de 60 k de contexte (et moins de 5 min) ; au-delà, nouvelle conversation avec le carnet : elle ne grossit jamais sans fin.
- Essai réel (Sonnet) : « un compte rendu complet pour chaque ticket » a été reconnu comme contraire à la décision 0012, sans action, 3 choix proposés ; 5 443 tokens + 4 768 relus du cache, contexte 9 k.
