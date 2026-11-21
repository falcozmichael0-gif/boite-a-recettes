# Ma Boîte à Recettes

Appli web installable (PWA) : retranscrit les recettes vues sur Facebook / Instagram (captures d'écran ou texte) grâce à Claude, les classe, et gère une liste de courses rangée par rayon. Les données sont synchronisées entre téléphone et PC via Firebase (connexion Google).

- `src/` : code de l'appli (`main.js` écrans et synchro, `claude.js` appel à l'API Claude, `courses.js` liste de courses, `config.js` configuration Firebase)
- `public/` : page, styles, manifeste, service worker, icônes
- `docs/` : site construit, publié par GitHub Pages (`npm run build`)
- `firestore.rules` : règles de sécurité à coller dans la console Firebase

La clé API Claude n'est jamais dans le code : chaque appareil la saisit dans Réglages et la garde en local.

## Construire

```
npm install
npm run build
```

`node test/build-test.mjs` construit une version de test (Firebase remplacé par une base en mémoire) dans `test/site/`.
