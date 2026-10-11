# Launcher Athéna — complément Modey

> Retour : [README Modey](../../README.md) · Plateforme : [MODEY](../../docs/MODEY.md) · EML upstream : [README](./README.md) · Roadmap : [ROADMAP](../../docs/ROADMAP.md)

Fork de `EML Template` (Electron + Vite + `eml-lib 2.3.5`) renommé `Modey Launcher — Athéna`.

## Spécifique Athéna (vs template)

* `config/athena-profile.json` : `1.21.1 / NeoForge 21.1.169`, Java 21, RAM 4/8Go, `autoConnect 127.0.0.1:25565`.
* `electron/const.ts` : `ADMINTOOL_URL=http://localhost:8090`, `AUTH_SERVER_URL=http://localhost:3005/api/yggdrasil`.
* `src/views/login.ts` : onglets **Se connecter / Créer compte citoyen** (pseudo unique + email), Microsoft gardé en optionnel.

## Dev

```bash
npm install
npm run dev            # Electron + HMR
npm run release:win    # .exe NSIS -> release/
```

> Ne pas éditer `README.md` upstream pour la doc Athéna — tout le contexte projet est ici + hub principal.
