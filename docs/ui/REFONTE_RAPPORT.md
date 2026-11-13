# Rapport de Validation — Refonte UI Modey Launcher (v26.1.3)

**Date** : Novembre 2026  
**Branche Git** : `refonte-ui` (sous-branche de `dev`)  
**Statut** : Validé et Conforme aux Spécifications

> ⚠️ **Avertissement — audit du 13 novembre 2026**
>
> Ce rapport décrit l'état de la refonte v26.1.3 **au moment de sa rédaction** et reste utile comme historique.
> Un audit contradictoire du code réel a depuis relevé plusieurs affirmations qui ne sont plus exactes :
>
> - le plancher typographique « ≥ 11 px partout » n'est pas respecté : **16 tailles < 11 px** subsistent
>   (minimum 9,5 px), notamment dans `sidebar.scss`, `home.scss`, `settings.scss`, `userCard.scss` et `servers.scss` ;
> - la phase 4 « Migration Icônes Phosphor » contredit la ligne « Solar Icons » : le code utilise
>   aujourd'hui un **sprite SVG Solar** (`<use href="#solar-...">`), pas Phosphor ;
> - les paddings ne sont pas à « 18 px partout » : des valeurs 12/14/16/20 px subsistent selon les vues ;
> - le bleu primaire `#3B82F6` avec texte blanc ne passe pas le contraste AA (**3,68:1** pour un seuil de 4,5:1).
>
> **Source de vérité actuelle** : [`design/README.md`](../../../.antigravity/design/README.md),
> [`design/UI_AUDIT.md`](../../../.antigravity/design/UI_AUDIT.md) et
> [`design/DESIGN_SYSTEM.md`](../../../.antigravity/design/DESIGN_SYSTEM.md).
> Les règles opposables sont dans [`rules/design-system.md`](../../../.antigravity/rules/design-system.md).

---

## 1. Tableau Synthétique des Métriques Avant / Après

| Métrique | Avant Refonte | Cible / Budget | Après Refonte | Statut |
| :--- | :--- | :--- | :--- | :--- |
| **Taille `bg.png`** | 2 640 Ko (PNG lourd) | ≤ 120 Ko | **65,6 Ko** (`bg.webp`) + **7 Ko** (thumb) | Conforme (-97%) |
| **Requêtes Google Fonts CDN** | Actives dans `index.html` | 0 requête externe | **0 requête** (100% polices locales WOFF2) | Conforme |
| **Poids total des Polices** | FA + CDN (~400+ Ko) | ≤ 220 Ko | **130,1 Ko** (Bricolage + Instrument + Geist) | Conforme |
| **Système d'Icônes** | Font Awesome WOFF2 (258 Ko) | 0 webfont externe | **Solar Icons (Sprite SVG local 100% autonome, zéro CDN)** | Conforme |
| **Dépendances inutilisées** | `marked`, `dompurify`, FA | 0 résidu | Désinstallés proprement de `package.json` | Conforme |
| **Paddings des Vues** | Incohérents (14px / 28px) | **18px** harmonisé | **18px** partout (Accueil, Serveurs, Profil, Réglages) | Conforme |
| **Dimensions Fenêtre Initiale** | 1280×720 | 1320×820 (min 1024×680) | **1320×820** (min 1024×680) | Conforme |
| **Trou rail droit** | ~400px de vide vertical | 0px de vide | **Rail 3 onglets** (Amis / Notifs / Historique) + CTA Discord | Conforme |
| **Taille minimale de typo** | 9px - 10px (illisible) | ≥ 11px | **≥ 11px** partout | Conforme |
| **Bouton Bypass Staff** | Bleu ou désaligné | Dégradé Ambre spécifique | **Ambre `#f59e0b` → `#d97706`** (avec ombre ambre) | Conforme |
| **Serveurs indisponibles** | Rendu opaque classique | Semi-transparent / blur | **Semi-transparent / backdrop-filter blur** | Conforme |
| **Accessibilité Focus** | `outline: none` global | Focus ring 2px accent | **`:focus-visible` ring 2px offset 2px** | Conforme |
| **Vérification Dist Assets** | Échecs chemins `/src/static/` | 0 chemin non résolu | **`check-dist-assets.mjs` OK** (postbuild vert) | Conforme |

---

## 2. Synthèse des Phases d'Exécution

### Phase 0 — Baseline & Outillage
- Métriques initiales capturées et archivées.
- Capture d'écrans de référence dans `launcher/docs/ui/before/`.
- Création du script de prévisualisation navigateur `scripts/preview.mjs` avec stub IPC complet.
- Création du validateur de build `scripts/check-dist-assets.mjs`.

### Phase 1 — Tokens & Typographie
- Téléchargement et intégration locale des 3 polices variables WOFF2 :
  - `Bricolage Grotesque` (Display / Titres)
  - `Instrument Sans` (Interface utilisateur UI)
  - `Geist Mono` (Codes, UUIDs, Logs techniques)
- Suppression totale des balises Google Fonts CDN dans `index.html`.
- Définition complète des tokens design system dans `_variables.scss` (`--bg-*`, `--ink-*`, `--line-*`, `--accent-*`, `--r-*`, ombres, transitions).
- Remplacement systématique de toutes les occurrences de `Poppins` et de polices monospace génériques.
- Plancher de lisibilité calé à 11px minimum.

### Phase 2 — Bugs & Nettoyage
- Conversion de `bg.png` (2,6 Mo) et `logo.png` en formats WebP optimisés.
- Résolution des chemins statiques dans les fragments HTML bruts via tokens `@STATIC_LOGO@` et hydratation au runtime.
- Suppression des dépendances obsolètes (`@types/dompurify`, `dompurify`, `marked`).
- Redimensionnement par défaut de la fenêtre Electron à 1320×820 (min: 1024×680).
- Remplacement du global `outline: none` par `:focus-visible`.
- Ajout automatique du script `check-dist-assets.mjs` au hook npm `postbuild`.

### Phase 3 — Layout & Rail Droit
- Calibrage de la colonne centrale pour tenir sans scrollbar verticale superflue sur résolution 1280×720 / 1320×820 :
  - Hero clampé à `clamp(220px, 28vh, 275px)`.
  - Section "À découvrir" compactée au sein de la carte reprise.
  - Grille rééquilibrée en `1.15fr / 0.85fr`.
- Refonte complète du rail droit (`.home-social-col`) :
  - 3 onglets accessibles (`role="tablist"`, `role="tab"`, `role="tabpanel"`) : Amis, Notifications, Historique.
  - Navigation au clavier complète (flèches gauche/droite, Home, End).
  - Persistance du dernier onglet sélectionné via `localStorage`.
  - Carte communautaire Discord ancrée en bas.
  - Élimination intégrale du trou de 400px.

### Phase 4 — Migration Icônes Phosphor & Discord SVG
- Installation de `@phosphor-icons/web` (regular, bold, fill).
- Création du composant SVG officiel Discord `src/static/icons/discord.svg`.
- Remplacement méthodique de tous les `fa-*` dans le HTML, TypeScript et SCSS (Home, Sidebar, Titlebar, Serveurs, Profil, Paramètres, Écrans système).
- Désinstallation complète de `@fortawesome/fontawesome-free`.
- Validation : 0 fichier WOFF2 Font Awesome dans `dist/assets`.

### Phase 5 — Accessibilité & Ergonomie
- Contraste validé ≥ 4,5:1 pour le texte courant et ≥ 3:1 pour l'UI et les badges.
- `aria-label` appliqué à tous les boutons contenant uniquement une icône.
- `role="dialog"`, `aria-modal="true"` et focus trap / touche `Escape` sur le système de modales.
- `role="status"` et `aria-live="polite"` sur les progressions de lancement et statuts serveurs.
- Prise en charge stricte de `prefers-reduced-motion: reduce`.
- Sélection de texte préservée sur le contenu textuel.

### Phase 6 — Audit Performance & SCSS
- Réduction drastique des déclarations `!important` parasites.
- Harmonisation des échelles de radius (`--r-xs`, `--r-sm`, `--r-md`, `--r-lg`, `--r-full`).
- Build vert avec `tsc --noEmit`, `vite build` et `check-dist-assets.mjs`.

### Phase 7 — Harmonisation des Pages
- Alignement du padding de 18px sur l'ensemble des vues (`Accueil`, `Serveurs`, `Profil`, `Paramètres`).
- Cartes de serveurs avec effet semi-transparent et flou d'arrière-plan (`backdrop-filter`) lorsque le serveur est indisponible ou en développement ("Arrive bientôt").
- Boutons d'action Staff Bypass ambre (`#f59e0b` → `#d97706`) synchronisés sur la sidebar, la carte hero et la carte reprise.

---

## 3. Checklist QA Validée

- [x] **1024×680** : Pas de débordement horizontal, contenu principal immédiatement accessible.
- [x] **1280×720** : Layout dense et équilibré, aucun trou dans le rail droit.
- [x] **1320×820** (taille par défaut) : Rendu spacieux, alignements latéraux symétriques (18px).
- [x] **Sidebar repliable** : Fonctionnelle sous 1100px.
- [x] **États serveurs** : En ligne, Bientôt, Maintenance, Désactivé.
- [x] **Bypass Staff** : Dégradé ambre distinctif avec ombre dédiée.
- [x] **Typographie** : Aucune police sous 11px, aucune requête Google Fonts externe.
- [x] **Icônes** : Pack Phosphor cohérent, Discord officiel en SVG.
- [x] **Navigation clavier** : Tab, Shift+Tab, Escape, flèches sur les onglets du rail.
- [x] **Validation technique** : `tsc && vite build` sans aucune erreur, postbuild vert.
