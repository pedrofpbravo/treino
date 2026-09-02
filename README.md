# Treino

Registro de treinos na academia, para uma pessoa.

Select a program (PPL + Upper Lower or Full Body + Upper Lower, both editable), pick the day, and check off each exercise as you finish it. Checking logs the session instantly with the sets pre-filled from the last time you did that exercise; edit reps and weight in place. Machine positions and adjustments live as a comment on each exercise. History keeps every session, a weekly frequency chart and a per-exercise weight progression chart. A rest timer (60/90/120s) shows above the tab bar while running.

Same architecture as `03. app mercado` (MercadoJá): no build step, plain JS modules, Firebase SDK from the CDN, one config file, installable iPhone PWA, works fully offline.

## How it works day to day

1. **Treino**: pick the program and the day. Tap the circle on a card to mark it done; the sets appear pre-filled from your last session (or from the day's target, e.g. 3×10, at the reference weight when there is no history). Adjust reps/kg inline; every change saves. Tap again to unmark. Tap the card body to edit that exercise's target, reference weight and comment. "Finalizar treino" shows the session summary and stops the rest timer.
2. **Descanso**: tap 60s / 90s / 120s in the bar above the tabs. It vibrates/beeps at zero and survives app reloads.
3. **Exercícios**: the full catalog with reference weight, machine adjustments and muscle groups. Search is accent-insensitive; chips filter by muscle. This is the reference list; days only contain the exercises you assigned to them.
4. **Histórico**: sessions by date, workouts per week, and weight progression per exercise.
5. **Ajustes**: muscle groups, JSON backup (export/import), logout.

Programs, days, targets and exercises are all editable in the app (Gerenciar / ✎ Editar dia). The two starting programs and the 27-exercise catalog are seeded automatically on first login.

## One-time setup

All keys go in one file: `js/config.js`.

### 1. Firebase project (~10 min)

1. Go to console.firebase.google.com and create a project (e.g. `treino`). Google Analytics can be disabled.
2. **Authentication**: Build > Authentication > Get started > enable **Email/Password**. Then in the Users tab, click **Add user** and create your account (e.g. `voce@exemplo.com` + a password). Log in once per device.
3. **Firestore**: Build > Firestore Database > Create database. Pick a region near you (e.g. `southamerica-east1`). Start in **production mode**.
4. **Rules**: open the Rules tab, replace the contents with the contents of `firestore.rules` from this repo, and click **Publish**.
5. **Config**: Project Overview > web icon (`</>`) > register an app (no hosting needed) > copy the `firebaseConfig` values into `js/config.js`.

There is no sign-up screen and no password reset in the app; both are managed in the Firebase console. Muscle groups, the exercise catalog and the two programs are seeded automatically on first login.

### 1b. Security hardening (5 min, do this before publishing the repo)

The web config in `js/config.js` is public by design (every browser that opens the app receives it), so the protection comes from these settings, not from hiding the key:

1. **Disable sign-up** (important): Authentication > Settings > User actions > uncheck "Enable create (sign-up)" > Save. Without this, anyone with the public key could create an account via Google's API and would pass the `request.auth != null` rule.
2. **Pin the rules to your UID** (optional, strongest): copy your UID from Authentication > Users, put it in the commented line in `firestore.rules`, comment out the generic line, and publish the rules again.
3. **Restrict the API key** (optional): console.cloud.google.com > APIs & Services > Credentials > "Browser key (auto created by Firebase)" > Application restrictions > Websites > add `<user>.github.io/*` and `localhost:8081/*`.

### 2. Hosting

**Option A - GitHub Pages (~5 min):**

1. Create a public repository and push this folder's files to `main`.
2. Repo Settings > Pages > Deploy from a branch > `main`, `/ (root)` > Save.
3. The app goes live at `https://<user>.github.io/<repo>/`. Every push redeploys.

**Option B - Firebase Hosting** (needs Node.js on some machine):

```bash
npm install -g firebase-tools
firebase login
firebase use <your-project-id>
firebase deploy
```

`firebase.json` is already set up (hosting root = this folder, plus the Firestore rules, so `firebase deploy` publishes both).

## Install on iPhone

Open the live URL in Safari, tap the Share button, then **Adicionar à Tela de Início**. Log in once; the session persists on the device.

## Deploying changes

1. Bump the cache version in `sw.js` (`treino-v1` to `treino-v2`, and so on) and `APP_VERSION` in `js/main.js`.
2. Push (or `firebase deploy`). On the phone, force-close and reopen the app once.

## Local development

Serve the folder and open http://localhost:8081:

```bash
python -m http.server 8081
```

Open http://localhost:8081/#debug to preview every screen and flow with in-memory sample data (six weeks of generated history), no Firebase keys needed.

## Notes on keys and offline behavior

- The Firebase web config in `js/config.js` is visible in the browser and in a public repo. That is by design for Firebase web apps: access control lives in `firestore.rules`, which denies everything to anyone not logged into your account.
- Offline: the app shell is cached by the service worker and the data by Firestore's persistent local cache, so checking exercises and editing sets work with no connection and sync on reconnect. A banner at the top shows when you're offline.
- The bathroom log (Bristol scale) that used to live in this app moved to its own app, Intest (`05. app intest`), in Sep 2026.
