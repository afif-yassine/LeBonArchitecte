# Décision 0014 : l'Architecte devient un agent autonome, avec des garde-fous

Date : 18 nov. 2026. Statut : lot A appliqué ; lots B et C à faire. Demandé par le propriétaire : « l'architecte peut avoir la main sur tout le projet… comme Claude Code ici… il peut appeler les agents… sans permission, avec les garde-fous et les règles ».

## Ce que l'Architecte fait seul
Kanban (créer un ticket, plan, ordre, pause, reprise, lancement), agents (lancer, écrire, demander de résoudre, lire le déroulé), documents (cahier, décisions, rapports : dans sa branche), équipe et agents (lot B), réponses et propositions. Sans question de permission.

## Ce qui reste toujours au propriétaire (refusé par le serveur, pas seulement par la consigne)
Réunir dans main (Valider), git (revenir, brancher), pilote et budget du jour, décider de ses propres propositions, fermer les actions du propriétaire, supprimer. Les preuves et fins d'agent restent écrites par le programme seul.

## Comment
- Commande `node scripts/lba.mjs` (aide, etat, ticket, deroule, compte-rendu, creer, valider-plan, replanifier, lancer, pause, reprendre, arreter, resoudre, tester, message, refuser, ordre, docs, doc). Elle passe par le même moteur que vos boutons, avec l'en-tête `x-lba-acteur: architecte`.
- Le serveur écrit chaque action au nom « architecte » dans le journal (visible, réversible) et ferme les portes du propriétaire (`server/acteurs.ts`).
- Les autres agents n'ont pas accès à cette commande (node, curl et le web leur sont refusés). Lot B : l'Architecte ne pourra pas modifier `scripts/lba.mjs` ni le moteur ; ses documents passent par sa branche et « À tester ».
- Coût : un agent qui lit et agit coûte environ 20 à 60 k par demande (contre 13 k pour un avis sans outils) ; contexte préparé par le programme, Sonnet pour les petites consignes, Opus pour l'architecture, budget du jour respecté.
