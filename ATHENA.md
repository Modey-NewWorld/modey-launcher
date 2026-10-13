# Launcher Athéna — complément Modey

> Retour : [README Modey](../../README.md) · Plateforme : [MODEY](../../docs/MODEY.md) · Overlay EML : [docs/EML.md](../../docs/EML.md) · EML upstream : [README](./README.md) · Roadmap : [ROADMAP](../../docs/ROADMAP.md)

Fork de `EML Template` (Electron + Vite + `eml-lib 2.3.5`) renommé `Modey Launcher — Athéna`.

## Spécifique Athéna (vs template)

* Profils **vivants** : `eml-lib` → `ADMINTOOL_URL` (`http://localhost:8090`) : liste, IP, loader, news, maintenance, files. Pas l’Auth-Server.
* `config/athena-profile.json` / `free-build-profile.json` + tags/copy dans `home.ts` : **encore en dur**. Cible : `GET /api/modey/launcher` (Auth `/admin`) — teasers, `enabled`, `autoBlockIfOffline`. Aujourd’hui le ping colore la pastille mais **ne bloque pas Jouer**.
* `src/views/home.ts` : sans IP/port (ou slug `free-build`) → coming soon, Jouer off + teaser.
* `electron/const.ts` : `ADMINTOOL_URL=http://localhost:8090`, `AUTH_SERVER_URL=http://localhost:3005/api/yggdrasil`.
* `src/views/login.ts` : **Se connecter / Créer un compte Modey** (même compte que le site, plus tard le cloud). Microsoft optionnel, pas fusionné. Statut « citoyen » = **Athéna**, pas le compte.
* `src/views/profile.ts` + page `Mon Profil` (`#profile-page`) : studio 3D (Face/Dos, 360°, Classique/Slim, import .png, capes), identité, statut en jeu selon le serveur sélectionné, gestion du compte. La gestion des skins a quitté les paramètres.

## Dev

```bash
npm install
npm run dev            # Electron + HMR
npm run release:win    # .exe NSIS -> release/
```

> Ne pas éditer `README.md` upstream pour la doc Athéna — tout le contexte projet est ici + hub principal.
