# Décision 0003 : mémoire partagée, règles et contexte des agents

Date : 2026-11-17. Statut : proposée.

## Problème
Une mémoire partagée qui grossit coûte cher si chaque agent la lit en entier. Escouade lisait trop (3 à 59 M tokens par ticket).

## Choix
1. **Règles du projet** : une seule liste (globales + projet), recopiée par le programme dans `CLAUDE.md` et `AGENTS.md`. Cible : moins de 1 000 tokens. Les règles « bloquées » sont vérifiées par le programme (hooks), pas seulement lues.
2. **Mémoire à deux étages** : globale (tous les projets : recettes Windows, préférences, savoir sur les outils) et par projet. Un nouveau projet profite de la mémoire globale sans rien recréer.
3. **Une note = un fait court** (10 à 30 tokens), avec type, source, nombre d'utilisations. Avant d'écrire : recherche d'une note proche, mise à jour au lieu de doublon. Les agents proposent, le programme écrit.
4. **Personne ne lit tout** : pour chaque ticket, le programme choisit 3 à 8 notes (plafond 600 tokens) par pertinence : mots du ticket, fichiers touchés, voisins dans le graphe Graphify.
5. **Recherche locale, 0 token** : SQLite FTS5 (plein texte) + vecteurs calculés localement par un petit modèle d'embeddings (environ 25 Mo, CPU, via transformers.js ou ONNX). Aucun service payant. À valider en J6 (temps sur l'i5, taille).
6. **À la demande** : un outil MCP `memoire.chercher` renvoie 3 notes au plus.
7. **Contexte plafonné** : 60 k tokens par agent, compactage natif une seule fois à 85 %, puis session neuve avec passation. Le contexte de chaque agent est visible poste par poste.
8. **Architecte** : conversation avec commandes `/` (dont `/btw` hors contexte). Commandes et état du projet traités par règles, 0 token.

## Interdits
- Aucun agent ne reçoit la mémoire entière.
- Aucune note écrite sans recherche de doublon.
