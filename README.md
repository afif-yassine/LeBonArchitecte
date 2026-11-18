# Le Bon Architecte

Le Bon Architecte est une plateforme locale, sur votre PC. Elle sert à organiser une petite équipe d'agents IA (Claude Code, Codex, et d'autres) qui construisent vos projets. Le travail suit une organisation de type entreprise de services informatiques : des tickets, un ordre de travail, des tests, une recette, puis des comptes rendus.

Le propriétaire du projet est le client. Il valide le travail. Les agents ne poussent rien en ligne, ne fusionnent rien et ne suppriment rien sans son accord.

## Ce qu'il y a dans le dépôt

- **L'interface** (`src/`) : les écrans de l'espace de travail (Flux, Travail, Ticket, Architecte, etc.), faits avec React et Vite.
- **Le moteur** (`server/`) : un petit serveur local Node.js. Il tient le journal des événements, l'état des tickets, le pilote automatique, l'exécuteur de commandes et le scan du projet. Il n'écoute que sur `127.0.0.1` : rien n'est exposé au réseau.
- **Les tests** (`server/engine.test.ts`) : ils vérifient les règles du moteur sans appeler d'IA.
- **Les documents** (`docs/`) : le cahier des charges, les décisions et le journal (voir plus bas).

## Ce qu'il faut avant de commencer

- Windows (ou tout autre système avec Node.js).
- **Node.js**, une version récente. Le projet a été testé avec Node 24 (la base de données intégrée à Node doit être disponible).
- Git, si vous voulez utiliser les espaces de travail par ticket.

## Lancer le projet

Dans le dossier du projet, la première fois :

```bash
npm install
```

Puis, pour tout lancer :

```bash
npm run dev
```

Cette commande démarre deux choses en même temps :

- le moteur, sur `http://127.0.0.1:4317` ;
- l'interface, sur `http://localhost:5173`. Ouvrez cette adresse dans votre navigateur.

Pour arrêter, faites `Ctrl + C` dans le terminal.

Si vous voulez seulement l'interface, lancez `npm run dev:ui`. Elle affichera un bandeau si le moteur n'est pas lancé.

## Les commandes utiles

| Commande | Ce qu'elle fait |
|---|---|
| `npm install` | Installe les dépendances (à faire une fois, ou après un changement de `package.json`). |
| `npm run dev` | Lance le moteur et l'interface ensemble. |
| `npm run dev:ui` | Lance seulement l'interface. |
| `npm run engine` | Lance seulement le moteur. |
| `npm test` | Lance les tests du moteur. Ils doivent tous être verts. |
| `npm run check` | Vérifie les types TypeScript, sans rien construire. |
| `npm run build` | Vérifie les types puis construit l'interface dans le dossier `dist/`. |
| `npm run engine:reset` | Efface la base de démonstration du moteur (`.lba/lba.db`) pour repartir de zéro. Le prochain démarrage recrée les tickets de démonstration. |

Avant de dire qu'une modification est prête, lancez au minimum `npm test` et `npm run check`.

## Où sont les décisions et le journal

- **Journal du projet** : [docs/JOURNAL.md](docs/JOURNAL.md). Pour chaque session : ce qui a été fait, les preuves (tests, captures) et ce qui reste à faire.
- **Décisions** : [docs/decisions/](docs/decisions/). Chaque choix important y est écrit, avec son statut (proposée ou acceptée) et sa date.
- **Cahier des charges** : [docs/cahier-des-charges/](docs/cahier-des-charges/). C'est la source de vérité : chaque ticket cite les exigences qu'il couvre.
- **Évaluations de dépôts existants** : [docs/evaluations/](docs/evaluations/).
