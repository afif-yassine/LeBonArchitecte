# 0017 : Modèle et compte dans le chat, comptes Claude, quotas, pièces jointes, /btw (lots C1 à C4)

19 nov. 2026. Demandé par le propriétaire, à partir de captures d'une autre application : « changer le modèle et le compte dans le chat, connecter des comptes, voir le quota directement, tous les comptes, ajouter photos et documents, et /btw pour une question moins chère ». Puis : « il ne montre pas les modèles opus, haiku et les autres de Claude Code ».

## Décision

1. **Barre du chat (C1)** : le **modèle** et le **compte** se choisissent sous la zone d'écriture, pour les demandes suivantes.
   - Modèles proposés : Auto, **Opus 5.5, Sonnet 5.5, Haiku 5.5**. Fable 5.2 est montré grisé : jamais, c'est la règle du propriétaire.
   - Haiku n'est jamais choisi automatiquement. Il est permis quand vous le choisissez (`/modele haiku` ou `/haiku` au début). Cela remplace le refus de la décision 0015, car le propriétaire l'a demandé.
2. **`/btw` (C1)** : une question en passant, comme dans Claude Code.
   - Sonnet, **sans outils**, **sans conversation gardée** (`--no-session-persistence`) et **jamais dans le carnet**.
   - Il voit l'état du projet (préparé par le programme) et les 6 derniers échanges.
   - Possible même pendant que l'Architecte travaille.
   - **Mesuré : 2 488 tokens, 0,011 $, 3 s**, au lieu de 7 à 60 k pour une vraie demande.
3. **Pièces jointes (C2)** : photos (png, jpg, gif, webp), PDF et documents texte.
   - On les joint avec un bouton, en glissant ou en collant. 8 au plus par message, 10 Mo chacune.
   - Elles sont rangées dans `.lba/pieces/<projet>/`, que git ignore.
   - **Le coût est estimé avant l'envoi**, par le programme : une image vaut largeur × hauteur / 750, plafonné à 1 600 ; un PDF environ 3 000 par page ; un texte, ses caractères divisés par 4.
   - L'Architecte les lit lui-même avec Read. L'accès à leur dossier est ajouté seulement pour cette demande (`--add-dir`). Un fichier `.env` ou une clé est refusé.
4. **Comptes (C3)** : un compte est un dossier de configuration de Claude Code (`CLAUDE_CONFIG_DIR`).
   - Le compte de la machine garde `~/.claude`. Les autres vont dans `.lba/comptes/<id>/`, que git ignore.
   - **Vous vous connectez vous-même** : « Ajouter » ouvre une fenêtre `claude auth login`. Le programme lit seulement `claude auth status --json` (connecté ? quel forfait ?) et ne voit jamais de mot de passe ni de jeton.
   - Les agents et l'Architecte n'ont pas le droit de lire `.lba/comptes/` ni `.credentials.json`.
   - **Choix du compte** : celui que vous fixez par projet (Architecte, agents), sinon le premier actif de la liste, permis pour ce projet, dont la fenêtre de 5 h est sous 90 % et la semaine pas pleine.
   - Une conversation reprise reste sur le compte qui l'a commencée : son journal est cherché dans le dossier de chaque compte.
   - Ajouter, connecter, choisir et actualiser restent au propriétaire : le serveur les refuse à l'Architecte.
5. **Quotas (C4)** : la source est le message officiel **`rate_limit_event`** que Claude Code envoie à chaque appel.
   - Il donne le pourcentage de la fenêtre de 5 h et de la semaine, avec l'heure de remise à zéro. Il est vérifié sur un vrai appel.
   - Chaque agent, chaque demande à l'Architecte et chaque `/btw` met le quota à jour **gratuitement**.
   - « Actualiser » fait un tout petit appel Haiku : **mesuré 3 011 tokens, 0,0006 $**.
   - Le haut de l'écran montre la jauge 5 h ; un clic montre tous les comptes, avec la prévision à la remise à zéro au rythme actuel (vert, orange au-delà de 80 %, rouge au-delà de 100 %).
   - Rien n'est inventé : un quota pas encore lu est affiché « … ».

## Vérifié

- 69 tests verts, compilation sans erreur.
- Écran vérifié dans un Chrome sans fenêtre, sur PC (1 280 px) et sur téléphone (390 px) : la jauge et la fenêtre des quotas (au-dessus du tiroir Orchestrateur), la barre Modèle et Compte, une image jointe (400 × 300, estimée 160 tokens), le coût de `/btw` et le panneau des comptes. Aucune erreur, pas de défilement de côté.
- `.lba/comptes/` et `.lba/pieces/` ont été ajoutés à `.gitignore` : ils n'étaient pas ignorés.

## Limites

- Le compte de la machine est le seul connecté pour l'instant. La bascule vers un deuxième compte est testée par les tests, pas encore en vrai.
- La fenêtre de connexion s'ouvre seulement sous Windows. Ailleurs, la commande est donnée.
- Codex et les autres outils (Copilot, Gemini…) ne sont pas branchés. Codex attend LBA-7.
- Vu en passant : l'appel d'essai a écrit son cache pour **1 heure** (`ephemeral_1h`), et non 5 minutes. Si c'est vrai pour tous les appels, reprendre une conversation après 5 minutes coûterait moins que prévu (décision 0011). À mesurer avant de changer quoi que ce soit.
