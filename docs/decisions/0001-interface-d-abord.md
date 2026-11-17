# Décision 0001 : interface d'abord, application web installable

Date : 2026-11-17. Statut : proposée, en attente de validation de la maquette.

## Choix
- Stack : Node.js, TypeScript, React, Vite. Pas de Rust/Tauri.
- Forme : serveur local Node plus interface web, installable comme application Windows (PWA). Emballage Electron possible plus tard sans réécrire.
- Maquette construite avec la vraie technique ; fausses données dans `src/mock/data.ts`.
- Contrat de données unique : `src/shared/contract.ts`. Le futur serveur devra fournir exactement ces formes.

## Interdits (lisibles par la machine)
- Pas de modèle Fable. Sonnet par défaut, Opus pour le risqué, Haiku pour le simple.
- Pas de push, merge, déploiement, dépense ou suppression sans accord.
- Pas de lecture de `.env` ni de clés.

## Floorplan
Plugin Claude Code et Codex, MIT, coûte des tokens (l'IA décrit les fichiers). Donc bouton à la demande, jamais dans le scan automatique. Essai mesuré sous Windows à faire en J1 avant adoption.
