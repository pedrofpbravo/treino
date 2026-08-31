# CLAUDE.md - "Treino" (Gym tracking PWA)

Architecture notes for future sessions. This describes the app as it actually is.

## Architecture (same as `03. app mercado` / MercadoJá)

- **Vanilla JS, no build step.** ES modules loaded directly by the browser; Firebase SDK 10.12.2 as ESM from the gstatic CDN. Do NOT introduce Vite/React/npm.
- **Firebase**: Auth (one personal email/password account, `browserLocalPersistence`) + Firestore with `persistentLocalCache({tabManager: persistentMultipleTabManager()})` for full offline. Keys are hardcoded in `js/config.js` (no build step, no env vars); security lives in `firestore.rules` (any authed user).
- **Reads**: one `onSnapshot` per root collection, whole collection pulled, sorted/filtered client-side in `logic.js`. **Writes**: small targeted `setDoc`/`updateDoc`/`writeBatch` with `serverTimestamp()`, optimistic UI (the local cache fires the snapshot immediately).
- **`#debug`**: `main.js` swaps `db.js` for `fakedb.js` (`const db = location.hash === "#debug" ? fakeDb : realDb`). fakedb mirrors every export and ships the real seed catalog plus ~6 weeks of generated logs, so every screen works with zero Firebase.
- **Seeding**: triggered from a snapshot handler when a collection comes back empty, guarded by `state.seededX` flags, fixed doc ids so concurrent seeding is idempotent. Seed data lives in `js/seed.js` (pure data).
- **SW** (`sw.js`): network-first, opportunistic cache (origin + gstatic), `cache: "no-cache"` revalidation. DEPLOY RITUAL: bump `CACHE` and `APP_VERSION` (main.js) on every deploy.
- Hosting: GitHub Pages from repo root, or `firebase deploy`.

## Files

- `js/config.js`: firebaseConfig only ("the only file you edit").
- `js/seed.js`: pure data. 14 muscle groups, 27 exercises (owner's real catalog with refWeight + machine-adjustment notes), 2 programs with per-day entries.
- `js/logic.js`: pure helpers (no DOM/Firebase): normalize, local date handling, logDocId, lastLogFor, prefillSets, setsLabel, groupSessions, progressionSeries, weeklyFrequency, bristolStats.
- `js/charts.js`: pure SVG-string builders (lineChart, barChart). No chart libraries.
- `js/db.js`: the only file touching Firebase. Flat verb-named API.
- `js/fakedb.js`: same exports, in-memory.
- `js/main.js`: all UI. State object + renderers + wiring + boot, section banners.

## Data model (Firestore root collections)

- `muscles/mus-<key>`: `{name, order}`
- `exercises/ex-<slug>` (seeded) or random id: `{name, nameLower, primaryMuscleId, secondaryMuscleIds[], otherMuscleIds[], refWeight, note, createdAt, updatedAt}`
- `programs/prog-<slug>`: `{name, nameLower, order, createdAt}`
- `days/day-<prog>-<slug>`: `{programId, name, order, entries: [{exerciseId, targetSets, repMin, repMax}]}` (flat collection, NOT a subcollection; entry order = card order; targets are per day because the same exercise has different targets on different days)
- `logs/log-<date>-<dayId>-<exerciseId>`: `{date "YYYY-MM-DD" LOCAL, programId, dayId, exerciseId, exerciseName, dayName, programName, sets: [{reps, weight|null}], ts}`. Deterministic id: check = setDoc, uncheck = deleteDoc, edit = same-doc overwrite. Name snapshots keep history working after deletions.
- `bathroom/<autoId>`: `{at "YYYY-MM-DDTHH:mm" local, bristol 1-7, note, createdAt, updatedAt}`

## Key behaviors and decisions

- Dates are always LOCAL strings built from getFullYear/Month/Date. Never `toISOString()` for dates (UTC shifts the date in Brazil after 21:00). A workout crossing midnight logs the remaining exercises on the new date (accepted).
- Check pre-fills from the last log for that exercise (any day, date < today); with no history it uses the day entry's target (targetSets rows of repMin reps, weight null). Saved immediately on check.
- "Último" weight everywhere is derived from logs (fallback: exercise `refWeight` string). Never stored on the exercise.
- Deleting an exercise removes it from all days in one batch and keeps logs (soft-orphan). Deleting a muscle is blocked while referenced. Deleting a program cascades its days, keeps logs.
- Rest timer stores the absolute end time in `localStorage["gym:timerEnd"]`; survives reloads. AudioContext is unlocked on the preset tap (iOS).
- localStorage keys: `gym:program`, `gym:day`, `gym:timerEnd` (UI prefs only; all data lives in Firestore).
- UI text is pt-BR.

## Local dev

`python -m http.server 8081` (also in `.claude/launch.json`), then http://localhost:8081/#debug. Debug hooks: `window.__state`, `window.__buildBackup`.
