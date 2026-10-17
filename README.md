# Modey Launcher 🚀

[![Version](https://img.shields.io/badge/version-26.1.0-blue?style=for-the-badge)](package.json)
[![Licence Modey](https://img.shields.io/badge/licence_Modey-tous%20droits%20r%C3%A9serv%C3%A9s-c0392b?style=for-the-badge)](#-licence--droits-dautor)
[![Code hérité EML : MIT](https://img.shields.io/badge/code_h%C3%A9rit%C3%A9_EML-MIT-yellow?style=for-the-badge)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-0077DA?style=for-the-badge)](#)

**Modey Launcher** est le launcher officiel, modulaire et ultra-rapide conçu pour la plateforme de jeux **[Modey](https://github.com/Modey-NewWorld)**.

Il a été construit à partir du **[EML Template](https://github.com/Electron-Minecraft-Launcher/EML-Template)** — le template de référence de l'écosystème open-source **[EML Project](https://emlproject.com/)** — puis entièrement adapté à l'univers Modey : identité visuelle, authentification citoyenne, architecture multi-serveurs et fichiers isolés par serveur.

Propulsé par **Electron**, **Vite** et **TypeScript**, avec le moteur de synchronisation **[EML Lib](https://github.com/Electron-Minecraft-Launcher/EML-Lib)**, il offre aux joueurs une expérience fluide et sécurisée pour rejoindre tous les mondes et serveurs de la constellation Modey.

---

## 🧩 Origine : le template EML

Le Modey Launcher est un fork du **[EML Template](https://github.com/Electron-Minecraft-Launcher/EML-Template)**, le boilerplate officiel **Electron + Vite** du projet EML, et il réutilise sa bibliothèque **EML Lib** pour toute la logique Minecraft : authentification, téléchargements vérifiés (hash), installation des loaders et lancement du jeu.

| Ressource | Lien |
|---|---|
| 🌐 Site officiel EML Project | <https://emlproject.com/> |
| 📚 Documentation EML | <https://emlproject.com/docs/> |
| 🧩 EML Template — base de ce launcher | <https://github.com/Electron-Minecraft-Launcher/EML-Template> |
| 📦 EML Lib — logique Minecraft | <https://github.com/Electron-Minecraft-Launcher/EML-Lib> |
| 🛠️ EML AdminTool — distribution des modpacks | <https://github.com/Electron-Minecraft-Launcher/EML-AdminTool> |

---

## 🌟 Fonctionnalités Clés

* **Architecture Multi-Serveurs (N Serveurs, 1 Compte)** : Basculez en un clic entre les serveurs (Athéna, Free Build, Serveurs Créatifs) sans réinstallation.
* **Authentification Sécurisée Modey Auth & Yggdrasil** : Connexion directe avec votre compte citoyen ou votre compte Microsoft officiel.
* **Gestion Avancée des Rôles & Gradients Dynamiques** : Thème visuel personnalisé s'adaptant en temps réel au rang du joueur (Fondateur, Admin, Modérateur, Développeur, Builder, Citoyen).
* **Déblocage Administrateur & Bypass Mode Maintenance** :
  - Détection en direct de l'état des serveurs Minecraft (latence, slots, maintenance, hors-ligne).
  - Verrouillage sécurisé pour les joueurs lorsque le serveur est éteint ou en maintenance.
  - Bouton d'accès d'urgence orange exclusif pour le staff et les administrateurs permettant de lancer le jeu même serveur fermé.
* **Studio 3D & Personnalisation** : Prévisualisation interactive 3D des skins (Alex / Steve), sélection de capes et changement instantané.
* **Téléchargements Delta & Mises à Jour Différentielles** : Synchronisation automatique des mods, configurations, packs de textures et Java avec contrôle d'intégrité SHA1.
* **Versionnage par Année (CalVer)** : Adoption du standard CalVer (`26.1.0`) pour un suivi transparent et pérenne des versions.

---

## 📥 Téléchargement

Rendez-vous dans la section [Releases](https://github.com/Modey-NewWorld/modey-launcher/releases) pour télécharger le dernier installateur officiel Windows :

- 📦 **Modey Launcher-Setup-26.1.0.exe**

---

## 🛠️ Développement Local

### Prérequis
* [Node.js](https://nodejs.org/) (v20+ recommandé)
* `npm`

### Installation
```bash
# Cloner le dépôt
git clone https://github.com/Modey-NewWorld/modey-launcher.git
cd modey-launcher

# Installer les dépendances
npm install

# Démarrer en mode développement
npm run dev
```

### Compiler la Release
```bash
# Compiler le code frontend et backend
npm run build

# Générer l'installateur Windows NSIS
npm run release:win
```

---

## 📜 Licence & Droits d'Auteur

* **Code hérité d'EML** ([EML Template](https://github.com/Electron-Minecraft-Launcher/EML-Template) & [EML Lib](https://github.com/Electron-Minecraft-Launcher/EML-Lib)) : sous licence **[MIT](LICENSE)** — les fichiers d'origine EML conservent leur licence.
* **Projet Modey** (identité, interface, code spécifique Modey) : **tous droits réservés** — aucune licence publique.

Conçu et développé avec passion par **[FlowCreativeStudio](https://github.com/NayrolfRdgs)** — Florian. © 2026 FlowCreativeStudio.
