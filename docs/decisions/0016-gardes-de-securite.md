# 0016 : Gardes de sécurité gratuites (lot S)

18 nov. 2026. Demandé par le propriétaire : « un `.env` exposé dans git, une faille comme un quota remis à zéro en supprimant puis remettant un fichier : comment on gère ? ». Il a choisi le lot S en premier.

## Décision

Ce qu'une machine peut vérifier, c'est le programme qui le vérifie (0 token). L'IA sert seulement à ce qui demande de réfléchir.

1. **Secrets, dans chaque commit du ticket** (`server/securite.ts`, `quickScan`).
   - Le programme lit toutes les lignes ajoutées de `main..ticket/<id>`, commit par commit : un secret ajouté puis effacé est trouvé quand même, car la réunion copierait l'historique dans main.
   - Les règles : les formats exacts des fournisseurs (Anthropic, OpenAI, GitHub, AWS, Google, Slack, Stripe, clé privée), plus les mots de passe écrits en dur.
   - Une fausse valeur de test peut porter `lba:pas-un-secret` sur sa ligne. Le marqueur ne vaut que pour la règle des mots de passe, jamais pour une vraie clé de fournisseur.
   - **gitleaks** 8.30.1 (installé le 19 nov., empreinte vérifiée) s’ajoute à ces règles, avec `--redact`. S’il manque, le programme le dit et ses règles tournent seules.
   - **Aucune valeur n'est gardée ni affichée** : seulement le fichier et le genre de secret.
2. **Fichiers interdits dans git** : `.env` et `.env.*` (sauf `.example`, `.sample`, `.template`), `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.jks`, `id_rsa` et ses variantes, `credentials.json`.
3. **`.env` pas ignoré** : si un `.env` existe dans le projet et que git ne l'ignore pas, c'est signalé. Si le ticket a changé `.gitignore` et rendu un `.env` visible, la réunion est bloquée. Les noms seulement : le contenu n'est jamais lu.
4. **Le contrôle est refait juste avant la réunion** (première étape de la validation : « Contrôle sécurité »). Un secret dans l'historique ne se répare pas par l'agent : le ticket passe en « Besoin d'action », et c'est vous qui décidez.
5. **Paquets à risque** : si `package.json` ou `package-lock.json` a changé, `npm audit` compare la branche à main. Une faille grave ou critique **nouvelle** donne « Aucune nouvelle faille : échec ». Hors ligne, cela reste « non vérifié ».
6. **Failles de logique (exemple du quota)** : aucun outil ne les trouve.
   - Le programme repère les zones sensibles touchées : connexion et droits, quotas et limites, paiement, envoi de fichiers, chiffrement. Les tests et les documents ne comptent pas.
   - Une zone touchée donne « Aucune nouvelle faille : non vérifié », avec « relecture sécurité conseillée à la recette ».
   - L'Architecte ajoute un critère « **Test d'abus** : <la triche> échoue » aux tickets de ces zones. L'agent écrit alors un test qui **essaie** la triche, et ce test tourne avec les autres à chaque fois.
7. **Droits des agents resserrés** (`server/claude.ts`).
   - Ils ne peuvent plus **écrire** un `.env` ni un `.pem` : avant, seule la modification d'un fichier existant était interdite.
   - Ils ne peuvent plus lire un `.env`, une clé ou un `id_rsa` par `tail`, `head` ou `grep`.
   - Chaque agent reçoit une ligne en plus dans ses consignes (environ 50 tokens) : « jamais de secret dans le code ».

## Vérifié

- 4 tests nouveaux (68 au total, tous verts), dont un vrai dépôt git avec un secret ajouté puis effacé.
- Tout l'historique de LBA a été passé aux règles : 0 secret, 0 fichier interdit. Une première fausse alerte (le libellé `'Aucun secret': 'non-verifie'`) a été corrigée : la valeur d'un mot de passe doit contenir un chiffre.

## Limites

- Un mot de passe sans aucun chiffre, écrit en dur, n'est pas vu par nos règles : gitleaks en voit davantage.
- La relecture sécurité par Opus n'est pas automatique : elle coûte des tokens. C'est conseillé, pas lancé. À décider plus tard, avec les fiches de rôle (lot E1).
- Sur LBA, beaucoup de tickets touchent aux quotas (c'est son sujet) : ils seront souvent « non vérifié ». C'est voulu : on ne dit jamais « ok » à tort.
- Les agents héritent des variables d'environnement du moteur. Ils n'ont pas de commande pour les afficher, mais les tests du projet, eux, les voient.
