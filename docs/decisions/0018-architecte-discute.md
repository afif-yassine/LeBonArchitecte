# 0018 : L'Architecte discute au lieu de faire un rapport, et garde la discussion (cache d'une heure)

19 nov. 2026. Demandé par le propriétaire : « il me donne toujours des PDF, il est lent, je veux la réponse directe et une discussion pour régler l'architecture à la fin, pas un rapport à chaque message ». Puis : « vérifie, Anthropic a réglé le cache, et il faut un autocompact après une heure ».

## Ce qui a été vérifié

- **Le cache de Claude Code dure 1 heure** sur cet abonnement, et non 5 minutes.
  - Les conversations de l'Architecte ont 100 % de leur cache en `ephemeral_1h` et 0 en cache de 5 minutes.
  - Une conversation reprise après 24 minutes a relu 3 326 tokens dans le cache et n'en a réécrit que 515.
  - La décision 0011 (« 5 minutes ») était fausse.
- **Claude Code ne compacte pas selon le temps.**
  - `--autocompact` prend une taille d'au moins 100 k.
  - Ses 27 compactages automatiques sur ce PC ont eu lieu entre 230 k et 758 k tokens.
  - Une conversation de l'Architecte (10 à 15 k) n'est donc jamais compactée par Claude Code.
- Les 4 causes du « rapport à chaque message » :
  1. un bouton PDF sous chaque réponse ;
  2. une nouvelle conversation après 5 minutes de pause (6 de ses 8 dernières demandes) ;
  3. des règles qui imposaient « Avis / Problèmes / … / Rien fait » ;
  4. le budget répété à chaque réponse.

## Décision

1. **Reprise de la discussion** (`resumePlan`, partagé avec `/context`) :
   - pause de moins de 55 minutes : il reprend la conversation (cache relu, environ 10 % du prix) ;
   - plus d'une heure, mais conversation de moins de 30 k : il la reprend quand même et garde tout (réécrire coûte à peu près autant que repartir) ;
   - sinon, ou au-delà de 60 k : c'est le « compact » de LBA. Il repart avec son carnet, qui contient maintenant **les 8 derniers échanges en entier**, les consignes plus anciennes, ses actions et les titres des décisions.
   - Le bouton **« Nouvelle discussion »** (= `/compact`) permet de repartir quand vous voulez.
2. **Il discute** :
   - réponse directe et courte, comme à l'oral ;
   - jamais « Avis : » ni « Rien fait » pour une question ou une discussion, pas de tableau, pas de budget s'il n'en est pas question ;
   - un message pas clair reçoit une seule petite question ;
   - une idée (« et si… ? ») reçoit son avis en quelques phrases, puis « Qu'en penses-tu ? » ;
   - le format complet (avis, coût, « oui ») seulement quand on lui demande de **faire** quelque chose de gros ;
   - quand vous dites « on valide », il résume la décision et crée **un** ticket « Décision : … » qui l'écrit dans `docs/decisions`.
3. **PDF** : le lien n'apparaît que sous une réponse longue (plus de 1 500 caractères).
4. **Plus rapide** : réflexion légère pour une demande courte sur Sonnet ou Haiku.
5. **Agents des tickets** : la même erreur des 5 minutes est corrigée (`cacheWarm`, 55 minutes). Une petite correction faite moins d'une heure après reprend la conversation de l'agent au lieu d'un nouvel agent.

## Mesuré (mêmes 3 messages, Opus, avant puis après)

| Message | Avant | Après |
|---|---|---|
| « où » | 890 caractères, 11 s, 0,143 $ (il devine et cherche) | 45 caractères, 4 s, 0,070 $ : « Tu veux savoir où se trouve quoi exactement ? » |
| Pourquoi un seul agent par ticket ? | 873 caractères, 7 s, 0,162 $ | 430 caractères, 4 s, 0,081 $ |
| Et si deux agents, un qui code et un qui relit ? | 2 191 caractères, 16 s, 0,199 $ | 571 caractères, 5 s, 0,095 $, finit par « Qu'en penses-tu ? » |

69 tests verts. Écran vérifié : bouton « Nouvelle discussion », 3 liens PDF sur 16 réponses, aucune erreur.

## Limites

- Le modèle de l'Architecte était fixé sur **Opus** : c'est le plus cher et le plus lent. Pour discuter, « Auto » ou Sonnet coûte environ 3 fois moins.
- Une ancienne conversation reprise garde ses vieilles réponses en mémoire. Les règles disent de ne pas les imiter, et « Nouvelle discussion » repart au propre.
- Le prix exact d'une reprise après plus d'une heure : un essai de 22 k tokens a été lancé, et son résultat est ajouté ci-dessous dès qu'il arrive.
