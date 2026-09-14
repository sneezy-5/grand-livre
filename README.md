# Grand livre — Finance × Tech

Suivi personnel d'apprentissage de la comptabilité (et au-delà) : tu décris un objectif,
l'IA le découpe en chapitres et les planifie sur tes jours disponibles, et l'app t'affiche
chaque jour la leçon à faire — avec son exercice pour valider et avancer. Pas de journal à
remplir, pas de tableau de bord à onglets multiples : trois écrans, un flux quotidien simple.

## Architecture

```
grand-livre/
├── server/              backend Express + SQLite (better-sqlite3)
│   ├── server.js        toutes les routes API (/api/...)
│   ├── db.js            schéma SQLite + données de départ (jalons, curriculum de base)
│   ├── ai.js            appels IA (OpenRouter) — objectifs, quiz, avis, suggestions
│   ├── .env.example     variables IA à copier en .env (jamais commité)
│   └── package.json
├── public/               frontend — SPA Vue 3 chargée depuis un CDN, aucun build
│   ├── index.html
│   ├── css/style.css
│   └── js/app.js         3 composants Vue (un par onglet) + client API fetch()
├── Dockerfile            image de production (voir « Déployer avec Docker »)
├── docker-compose.yml
├── .dockerignore
└── .gitignore
```

Le serveur Express fait deux choses :
1. il sert les fichiers de `public/` tels quels (pas de build, pas de webpack/vite) ;
2. il expose une API REST sous `/api/...` que le frontend appelle avec `fetch`.

Toutes les données vivent dans un seul fichier `data.sqlite`, créé automatiquement au
premier lancement — par défaut à côté du code (`server/data.sqlite`), ou dans le
répertoire pointé par la variable d'environnement `DATA_DIR` si elle est définie (c'est
ce que fait l'image Docker, pour séparer les données du code). Pas de service externe,
pas de configuration à part `npm install`.

## Lancer en local

```bash
cd server
npm install
npm start
```

Puis ouvrir `http://localhost:3000`.

`npm run dev` relance le serveur automatiquement à chaque modification (Node ≥ 18.11, via `--watch`).

## Les trois onglets

**Aujourd'hui** (écran d'accueil) — affiche la ou les leçons dont la date planifiée est
arrivée : titre, description, et directement l'exercice (quiz) pour la valider. Si le
chapitre n'a pas encore de quiz, un bouton le génère via l'IA. Réussir l'exercice (≥70 %)
passe le chapitre à "Terminé" et le fait disparaître d'ici. Un aperçu des prochaines leçons
s'affiche en dessous, grisé — verrouillé tant que leur date n'est pas arrivée, impossible
d'avancer en avance sur le planning.

**Programme** — vue d'ensemble du curriculum, par module, en tableau Kanban (Pas commencé /
En cours / Terminé). C'est ici qu'on crée un nouvel objectif :

> Décris ce que tu veux savoir faire (« Comprendre la fiscalité des entreprises »), coche
> tes jours disponibles + une heure/durée de session, et l'IA découpe l'objectif en 4 à 10
> chapitres progressifs. **Le calcul des dates n'est pas fait par l'IA** (peu fiable pour
> ça) — le serveur répartit ensuite déterministiquement chaque chapitre sur les prochaines
> occurrences réelles des jours choisis (`scheduleDates()` dans `server.js`), et crée le
> créneau correspondant. C'est ce qui alimente l'écran Aujourd'hui.

L'ajout manuel d'un chapitre reste possible (bouton replié « + Ajouter un chapitre
manuellement ») pour ajuster à la main, mais il n'aura pas de créneau/date associé tant
qu'on ne lui en donne pas un — il restera visible dans Programme sans jamais apparaître dans
Aujourd'hui.

**Le statut "Terminé" ne se débloque qu'en réussissant le quiz du chapitre** — le
glisser-déposer direct vers cette colonne est refusé (icône 🔒 sur son en-tête). Pas
commencé ⇄ En cours restent libres au glisser-déposer, tout comme réordonner et déplacer un
chapitre vers un autre module (menu déroulant sur la carte).

**Bilan** — vue d'ensemble : l'état de 8 domaines (5 calculés automatiquement depuis la
progression du Programme, 3 — Concours, Anglais, Technologie — évalués à la main faute de
curriculum associé) et la roadmap des grands jalons, en Kanban.

## Fonctionnalités IA (optionnel)

Quatre fonctionnalités s'appuient sur un modèle de langage via [OpenRouter](https://openrouter.ai)
(pas l'API Anthropic directe) — **toutes déclenchées uniquement par un clic explicite**, jamais en
arrière-plan ni automatiquement, pour garder la maîtrise du coût :

1. **Nouvel objectif** (formulaire en haut du Programme) — découpe un objectif décrit en langage
   naturel en chapitres, puis planifie chacun sur une vraie date selon les jours disponibles
   donnés et crée le créneau correspondant (backend uniquement — pas d'onglet dédié).
2. **Générer un quiz IA** (bouton sur un chapitre, dans Programme ou directement dans
   Aujourd'hui) — écrit 6 questions à choix multiples adaptées au chapitre.
3. **Avis IA sur ma performance** (bouton après correction d'un quiz) — 2 à 4 phrases ciblées sur
   les erreurs commises.
4. **Suggestion IA « quoi étudier ensuite »** (encart en haut de l'onglet Bilan) — à partir des
   jalons, des chapitres du Programme et de l'historique des scores de quiz. Mise en cache
   (table `ai_insights`, une seule ligne) jusqu'au prochain clic sur « Actualiser ».

Réussir un quiz met aussi à jour le statut affiché dans Bilan sans rechargement : Aujourd'hui,
Programme et Bilan partagent le même tableau réactif côté frontend (`programmeStore` dans
`app.js`) plutôt que de refaire chacun leur propre requête.

**Configuration** :

```bash
cd server
cp .env.example .env
# puis édite .env et renseigne OPENROUTER_API_KEY (récupérable sur https://openrouter.ai/keys)
npm start
```

`OPENROUTER_MODEL` (dans le même `.env`) choisit le modèle utilisé pour les quatre
fonctionnalités — vérifie qu'il existe toujours sur [openrouter.ai/models](https://openrouter.ai/models),
le catalogue évolue.

**Sans clé configurée**, l'app fonctionne normalement — les boutons IA affichent juste un
message d'erreur clair (« OPENROUTER_API_KEY n'est pas configurée... ») au lieu de planter.
Toute la logique d'appel vit dans `server/ai.js`, séparée des routes Express — aucun SDK
supplémentaire, juste `fetch()` vers l'API compatible OpenAI d'OpenRouter, comme le frontend le
fait déjà pour l'API interne.

## Interface : barre latérale + Kanban

Le design s'inspire d'un outil de suivi de projet (Linear/Trello) plutôt que d'un
formulaire classique. La navigation est une barre latérale (colonne à gauche sur desktop,
menu tiroir accessible par un bouton hamburger sur mobile). Les listes à statut (chapitres
du Programme, jalons du Bilan) se présentent en tableau **Kanban** à 3 colonnes, où l'on
glisse une carte d'une colonne à l'autre pour changer son statut (sauf "Terminé" côté
Programme, verrouillé — voir plus haut), et où l'on réordonne les cartes en les glissant
dans une même colonne.

## Le mécanisme d'évaluation

Le score d'un quiz n'est jamais calculé côté navigateur : le client envoie seulement les
réponses choisies, et c'est `server.js` qui compare aux bonnes réponses stockées en base
et renvoie le score. Impossible de le trafiquer depuis la console du navigateur. C'est ce
même score qui déclenche (ou non) le passage du chapitre à "Terminé".

## Fonctionnalités retirées de l'interface (mais pas de la base de données)

L'app a eu plusieurs vies avant de converger vers ce flux à 3 écrans. Un journal quotidien
en texte libre, un planning hebdomadaire de tâches ad hoc, un emploi du temps à créneaux
manuels, une vue calendrier mensuelle et des notes mensuelles par domaine ont existé comme
onglets à part entière puis ont été retirés de l'interface pour la simplifier — le point
d'entrée de l'app, ce n'est plus « qu'est-ce que j'ai fait aujourd'hui » mais « qu'est-ce que
je dois faire aujourd'hui ». Leurs tables (`journal_entries`, `week_tasks`, `schedule_slots`,
`month_scores`, `dashboard_status`) et routes restent en place côté serveur — aucune donnée
existante n'a été supprimée — mais ne sont plus atteignables depuis l'interface, à
l'exception de `schedule_slots`, qui reste au cœur du mécanisme Aujourd'hui/Programme (créé
automatiquement par un nouvel objectif, jamais exposé comme son propre onglet).

## Déployer avec Docker

Le moyen le plus simple : `better-sqlite3` (module natif) et Node sont déjà réglés dans
l'image, aucune installation à faire sur la machine cible à part Docker lui-même.

```bash
docker compose up -d --build
```

Puis ouvrir `http://localhost:3000`. C'est tout — `docker-compose.yml` construit l'image,
publie le port 3000 et monte un volume nommé (`grand-livre-data`) sur `/app/data`, où vit
`data.sqlite`. Ce volume survit aux redémarrages et aux rebuilds de l'image (`docker compose
up -d --build` après avoir modifié le code ne touche pas aux données).

Sans Compose, l'équivalent est :

```bash
docker build -t grand-livre .
docker run -d -p 3000:3000 -v grand-livre-data:/app/data --name grand-livre grand-livre
```

Pour activer les [fonctionnalités IA](#fonctionnalités-ia-optionnel) dans le conteneur, ajoute
`-e OPENROUTER_API_KEY=...` à cette commande `docker run` (ou renseigne un fichier `.env` à côté
de `docker-compose.yml`, lu automatiquement par Compose).

Détails utiles :
- Le `Dockerfile` fait un build en deux étapes : la première installe les outils de
  compilation (`python3`, `make`, `g++`) pour `better-sqlite3` si aucun binaire précompilé
  n'est disponible pour la plateforme cible, la seconde ne garde que le strict runtime —
  l'image finale n'a pas de compilateur.
- Le port s'ajuste via la variable d'environnement `PORT` (par défaut `3000` dans l'image) ;
  dans `docker-compose.yml`, change `"3000:3000"` en `"8080:3000"` par exemple pour exposer
  un autre port sur l'hôte sans toucher au conteneur.
- **Sauvegarder les données** : `docker run --rm -v grand-livre-data:/data -v "$PWD":/backup
  debian tar czf /backup/grand-livre-backup.tar.gz -C /data .` archive le volume dans le
  dossier courant.
- Pour servir en HTTPS sur un nom de domaine, mets un reverse proxy devant (nginx, caddy,
  Traefik) qui pointe vers le port publié par le conteneur.

## Déployer sur ton propre serveur (sans Docker)

1. Copie le dossier `grand-livre/` sur le serveur (git clone, scp, rsync — au choix).
2. `cd grand-livre/server && npm install --production`
   - `better-sqlite3` compile un module natif : le serveur a besoin de `python3`, `make`
     et `g++` (paquet `build-essential` sur Debian/Ubuntu). Si `npm install` échoue avec
     une erreur de compilation, installe ces paquets puis relance.
3. Lance le serveur : `npm start` (ou mieux, via un gestionnaire de process comme `pm2`
   ou un service `systemd`, pour qu'il redémarre automatiquement).
4. Mets un reverse proxy devant (nginx, caddy) si tu veux servir en HTTPS sur un
   nom de domaine — le serveur Node écoute en HTTP simple sur le port défini par
   la variable d'environnement `PORT` (3000 par défaut).
5. Sauvegarde régulièrement `server/data.sqlite` (c'est un fichier unique — une simple
   copie suffit) puisque c'est la seule chose qui contient tes données.

## Table des routes API

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/api/today` | Leçons du jour (`due`) et aperçu des prochaines (`upcoming`), pour l'écran Aujourd'hui |
| GET | `/api/programme` | Liste des chapitres du curriculum (tous modules confondus) |
| POST | `/api/programme` | Ajoute un chapitre manuellement `{module, label, description, month_label}` |
| POST | `/api/programme/:id` | Met à jour un chapitre, tout ou partie de `{label, description, month_label, status, module}` |
| DELETE | `/api/programme/:id` | Supprime un chapitre |
| POST | `/api/programme-reorder` | Réordonne les chapitres d'un module `{module, order: [id1, id2, ...]}` |
| POST | `/api/objectives/generate` | Découpe un objectif en chapitres via l'IA et les planifie `{title, description, days, start_time, duration_minutes}` |
| POST | `/api/programme/:id/generate-quiz` | Génère un quiz IA pour ce chapitre et l'insère normalement |
| GET | `/api/quizzes/:id` | Questions d'un quiz (sans les bonnes réponses), avec le chapitre lié le cas échéant |
| POST | `/api/quizzes/:id/attempt` | Corrige une tentative `{answers}`, calcule le score côté serveur, valide le chapitre lié si ≥70 % |
| POST | `/api/quizzes/:id/feedback` | Avis IA ciblé `{results}` (le tableau renvoyé par `/attempt`) |
| GET | `/api/milestones` | Liste des jalons (la roadmap) |
| POST | `/api/milestones` | Ajoute un jalon `{label, date_label}` |
| POST | `/api/milestones/:id` | Met à jour un jalon, tout ou partie de `{label, date_label, status}` |
| DELETE | `/api/milestones/:id` | Supprime un jalon |
| POST | `/api/milestones-reorder` | Réordonne les jalons `{order: [id1, id2, ...]}` |
| GET | `/api/insights` | Dernière suggestion IA en cache (ou `null`) |
| POST | `/api/insights/refresh` | Régénère la suggestion IA « quoi étudier ensuite » |
| POST | `/api/reset` | Efface toutes les données (`{confirm: "EFFACER"}` obligatoire) |

D'autres routes existent côté serveur (`/api/journal`, `/api/calendar/:month`,
`/api/week/:weekStart`, `/api/week-tasks/:id`, `/api/month/:month`, `/api/month-scores`,
`/api/dashboard`, `/api/quizzes` GET/POST/DELETE, `/api/quizzes/:id/attempts`,
`/api/schedule/:weekStart`, `/api/schedule-slots/:id`) — elles alimentaient les onglets
retirés de l'interface (voir plus haut) et restent fonctionnelles, juste inatteignables
depuis l'app actuelle.

## Pourquoi ce choix technique

- **SQLite** : un seul fichier, aucune base à administrer séparément, largement
  suffisant pour un usage personnel mono-utilisateur.
- **better-sqlite3** : API synchrone, donc le code des routes reste simple à lire
  (pas de callbacks ni de `await` imbriqués pour chaque requête SQL).
- **Vue 3 via CDN, sans build** : pas de webpack/vite/npm à faire tourner côté
  frontend, un seul `<script src="...">`. Suffisant pour une appli de cette taille ;
  si le projet grossit beaucoup, migrer vers Vite devient pertinent.
