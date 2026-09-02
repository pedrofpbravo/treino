# CLAUDE.md - "Treino" (Gym tracking PWA)

Architecture notes for future sessions. This describes the app as it actually is (v5).

## What it is

Personal gym-tracking app for one person (Pedro), UI in pt-BR, installed as a PWA on an iPhone from GitHub Pages (`pedrofpbravo/treino`). Owner is not a developer; keep changes simple and explain deploys.

Until v4 the app also carried a bathroom/Bristol log; that feature moved to its own app, Intest (`05. app intest`), in Sep 2026, together with its Firestore history.

## Functionality (4 tabs)

- **Treino**: pick a program (dropdown + Gerenciar sheet) and a day (chips). Each exercise is a compact uniform-height card: name + target pill ("3×12"), "Último" line (last logged sets, fallback: refWeight), one-line note. Tapping the circle checks the exercise and saves the log immediately with sets pre-filled from the last session (or from the day target at the reference weight); the card then shows an inline sets editor (reps/kg per set, add/remove set), every change re-saves. Tapping the card body opens a quick-detail sheet that edits this day's target plus the exercise's refWeight/note (two writes). "Finalizar treino" (visible when done > 0) shows a session summary; concluding only cancels the rest timer and toasts, since every check already saved. Rest timer presets (60/90/120s) live inline; a floating bar appears above the tab bar only while a countdown runs, beeps/vibrates at zero.
- **Exercícios**: the full catalog grouped by primary muscle, accent-insensitive search, muscle-chip filters. Tapping opens the full edit sheet (name, primary/secondary/other muscles, refWeight, note, delete).
- **Histórico**: two views. "Sessões" = workouts-per-week bar chart + sessions grouped by date/day with swipe-to-delete rows. "Progresso" = per-exercise max-weight line chart + last-10 table.
- **Ajustes**: muscle-group manager (rename, reorder, delete-if-unused), JSON backup export/import, logout, version label.

## Architecture (same family as MercadoJá / Intest)

- **Vanilla JS, no build step.** ES modules loaded directly by the browser; Firebase SDK 10.12.2 as ESM from the gstatic CDN. Do NOT introduce Vite/React/npm.
- **Firebase**: Auth (one personal email/password account, `browserLocalPersistence`, sign-up disabled in the console) + Firestore with `persistentLocalCache({tabManager: persistentMultipleTabManager()})` for full offline. Keys are hardcoded in `js/config.js` (public by design); security lives in `firestore.rules`, which pins everything to Pedro's hardcoded UID (`request.auth.uid == "GjkT..."`).
- **Reads**: one `onSnapshot` per root collection, whole collection pulled, sorted/filtered client-side in `logic.js`. **Writes**: small targeted `setDoc`/`updateDoc`/`writeBatch` with `serverTimestamp()`, optimistic UI (the local cache fires the snapshot immediately, so the UI re-renders from one source of truth and feels instant offline).
- **`#debug`**: `main.js` swaps `db.js` for `fakedb.js` (`const db = location.hash === "#debug" ? fakeDb : realDb`). fakedb mirrors every export and ships the real seed catalog plus ~6 weeks of generated logs, so every screen works with zero Firebase.
- **Seeding**: triggered from a snapshot handler when a collection comes back empty, guarded by `state.seededX` flags, fixed doc ids so concurrent seeding is idempotent. Seed data lives in `js/seed.js` (pure data).
- **SW** (`sw.js`): network-first, opportunistic cache (origin + gstatic), `cache: "no-cache"` revalidation (GitHub Pages serves 10-min max-age). DEPLOY RITUAL: bump `CACHE` (sw.js) and `APP_VERSION` (main.js) on every deploy; force-close and reopen the PWA on the phone.
- Hosting: GitHub Pages from repo root, or `firebase deploy` (firebase.json ships hosting + rules).

## Files

- `js/config.js`: firebaseConfig only ("the only file you edit").
- `js/seed.js`: pure data. 14 muscle groups, 27 exercises (owner's real catalog with refWeight + machine-adjustment notes), 2 programs with per-day entries.
- `js/logic.js`: pure helpers (no DOM/Firebase): normalize, local date handling, logDocId, lastLogFor, prefillSets, entryReps, parseRefWeight, setsLabel, groupSessions, progressionSeries, weeklyFrequency, sorting.
- `js/charts.js`: pure SVG-string builders (lineChart, barChart). No chart libraries.
- `js/db.js`: the only file touching Firebase. Flat verb-named API.
- `js/fakedb.js`: same exports, in-memory.
- `js/main.js`: all UI. State object + renderers + wiring + boot.

## Data model (Firestore root collections)

- `muscles/mus-<key>`: `{name, order}`
- `exercises/ex-<slug>` (seeded) or random id: `{name, nameLower, primaryMuscleId, secondaryMuscleIds[], otherMuscleIds[], refWeight, note, createdAt, updatedAt}`
- `programs/prog-<slug>`: `{name, nameLower, order, createdAt}`
- `days/day-<prog>-<slug>`: `{programId, name, order, entries: [{exerciseId, targetSets, reps}]}` (flat collection, NOT a subcollection; entry order = card order; targets are per day because the same exercise has different targets on different days). Single rep number per entry ("3×12"). Docs written before v2 carried `repMin`/`repMax`; `entryReps()` in logic.js reads those as the range top, no migration.
- `logs/log-<date>-<dayId>-<exerciseId>`: `{date "YYYY-MM-DD" LOCAL, programId, dayId, exerciseId, exerciseName, dayName, programName, sets: [{reps, weight|null}], ts}`. Deterministic id: check = setDoc, uncheck = deleteDoc, edit = same-doc overwrite. Name snapshots keep history working after deletions.
- (Removed in v5: the `bathroom` collection. Data migrated to the Intest app's Firebase project; the old collection is deleted from this project once migration is confirmed.)

## Key behaviors and decisions

- Dates are always LOCAL strings built from getFullYear/Month/Date. Never `toISOString()` for dates (UTC shifts the date in Brazil after 21:00). A workout crossing midnight logs the remaining exercises on the new date (accepted).
- Check pre-fills from the last log for that exercise (any day, date < today); with no history it uses the day entry's target (targetSets rows of `reps`, weight = `parseRefWeight(refWeight)`). Saved immediately on check.
- "Último" weight everywhere is derived from logs (fallback: exercise `refWeight` string). Never stored on the exercise.
- Backup: export builds `{app, version, exportedAt, muscles, exercises, programs, days, logs}` and goes out via the iOS share sheet (fallback: blob download). Import preserves doc ids (non-destructive merge, overwrite-by-id), chunked 400 writes/batch. Old v4 backups containing a `bathroom` array still import fine; that array is silently ignored.
- Deleting an exercise removes it from all days in one batch and keeps logs (soft-orphan). Deleting a muscle is blocked while referenced. Deleting a program cascades its days, keeps logs.
- Rest timer stores the absolute end time in `localStorage["gym:timerEnd"]`; survives reloads. AudioContext is unlocked on the preset tap (iOS).
- localStorage keys: `gym:program`, `gym:day`, `gym:timerEnd` (UI prefs only; all data lives in Firestore).
- Theme (v2): cream `#f8f3ec` bg, ink `#1e1e1c`, peach accent `#f0916a`, pill buttons. Viewport is locked (`maximum-scale=1` + `touch-action: manipulation`) so double-tap never zooms.
- Swipe-to-delete (v4): `makeSwipeable()` in main.js wraps history rows; swipe left reveals "Remover", right-click on desktop.
- UI text is pt-BR.

## Local dev

`python -m http.server 8081` (also in `.claude/launch.json`), then http://localhost:8081/#debug. Debug hooks: `window.__state`, `window.__buildBackup`.
