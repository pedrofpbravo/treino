# CLAUDE.md - "Treino" (Gym tracking PWA)

Architecture notes for future sessions. This describes the app as it actually is (v6).

# Orchestration Protocol — Fable leads, Codex executes

You (Claude/Fable) are the **orchestrator and tech lead** for this project. You do not implement tasks yourself unless explicitly told to. Your job is to plan, delegate, verify, and integrate.

## Roles

- **Fable (you):** decompose the request, design the solution structure, write delegation briefs, review and verify all work, own final quality.
- **Codex (via the `codex:codex-rescue` subagent from the Codex plugin):** executes scoped implementation tasks — writing scripts, generating files, fixing bugs.

## Workflow (follow in order)

1. **Plan first.** When I give you a task, produce a short plan: objective, deliverable(s), task breakdown, what you will delegate vs. keep. Ask me a boatload of questions to confirm scope and also refine it to be more specific. Wait for my approval before delegating.
2. **Delegate to Codex.** Hand each implementation task to Codex through the rescue subagent, preferably as a background job. Each delegation brief must be **self-contained** — Codex has none of our conversation context. Include: exact deliverable and file path, inputs/assumptions, structure required, acceptance criteria, and what NOT to do.
3. **Monitor.** Check job status and collect results when done.
4. **Verify — never trust, always check.** Open and inspect what Codex produced. Run it if it's code. Check outputs against the acceptance criteria.
5. **Fix or re-delegate.** Small issues: fix them yourself. Structural issues: send a corrected brief back to Codex (resume the same thread when possible).
6. **Close out.** Summarize: what was built, what Codex did, what you changed in review, and remaining risks/open items.

## Rules

- Never present Codex output as done without your own verification pass.
- One delegation = one clearly scoped task. Don't send Codex vague multi-part briefs.
- If a slash command (e.g. `/codex:rescue`) is unavailable in this environment, delegate via natural language to the `codex:codex-rescue` subagent instead.
- Keep a running `WORKLOG.md` in the repo: plan, delegations sent, results received, review findings, fixes.
- If Codex is unreachable (not installed / not logged in), stop and tell me — do not silently do the work yourself.
- Code: runs cleanly from a fresh shell; minimal dependencies; brief README or header comment.
- **Token economy — batch everything.** Ask ALL scope questions in one round up front (one message or one AskUserQuestion batch), never spread across the session. Verify each phase in ONE consolidated pass: a single browser script that runs every acceptance check together and returns one result, instead of many small probes. One status report per phase, not per step. Prefer one big call that returns everything over five small ones.

## What it is

Personal gym-tracking app for one person (Pedro), UI in pt-BR, installed as a PWA on an iPhone from GitHub Pages (`pedrofpbravo/treino`). Owner is not a developer; keep changes simple and explain deploys.

Until v4 the app also carried a bathroom/Bristol log; that feature moved to its own app, Intest (`05. app intest`), in Sep 2026, together with its Firestore history.

## Functionality (4 tabs)

- **Treino**: pick a program (dropdown + Gerenciar sheet) and a day (chips). Day chips show a "✓" for days already trained in the current program cycle (`cycleDays()` derives this purely from logs; when all the program's days are trained the checks reset, per program). Each exercise is a compact uniform-height card: name + target pill ("3×12"), "Último" line (last logged sets, weight bold / reps muted), one-line note. Tapping the circle STARTS the exercise: saves the log immediately with sets pre-filled from the last session (or from the day target at the reference weight) but each set `done: false`; the inline sets editor (kg-first per set, per-set check toggle, add/remove set) then appears and every change re-saves. The exercise only counts as done (circle filled, "X/Y feitos", Finalizar visibility) when ALL sets are checked (`logDone()`); tapping the circle again deletes the log. Long-press (~350ms) a card to drag-reorder the day's exercises (persists entry order via updateDay). Tapping the card body opens a quick-detail sheet (day target + refWeight/note + a "Histórico" link row that opens the full exercise log). "＋ Cardio" (always visible, standalone) opens a sheet: type dropdown, whole minutes, note; today's cardio entries list below with a remove ×. Rest timer presets (60/90/120s) live inline; the floating bar (Treino tab only) counts down, and at zero plays ONE bell ding, vibrates, and stays blinking at 0:00 until dismissed (X, a new preset, or checking an exercise/set). A running timer survives reloads; a finished one doesn't.
- **Exercícios**: the full catalog grouped by primary muscle, accent-insensitive search, muscle-chip filters. Tapping opens the full edit sheet (name, primary/secondary/other muscles, refWeight, note, delete, plus a "Histórico" link row on existing exercises).
- **Histórico**: three views. "Sessões" = trained-days-per-week bar chart (union of workout and cardio dates) + sessions grouped by date/day with swipe-to-delete rows (sets string in small grey wrapping text). "Cardio" = minutes-per-week bar chart + weeks (newest first) with per-day minutes and types. "Progresso" = per-exercise max-weight line chart + last-10 table.
- **Ajustes**: muscle-group manager and cardio-type manager (rename, reorder, delete-if-unused), JSON backup export/import, logout, version label.

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
- `js/logic.js`: pure helpers (no DOM/Firebase): normalize, local date handling, logDocId, lastLogFor, prefillSets, entryReps, parseRefWeight, setsLabel, groupSessions, progressionSeries, exerciseHistory, weeklyFrequency, sorting.
- `js/charts.js`: pure SVG-string builders (lineChart, barChart). No chart libraries.
- `js/db.js`: the only file touching Firebase. Flat verb-named API.
- `js/fakedb.js`: same exports, in-memory.
- `js/main.js`: all UI. State object + renderers + wiring + boot.

## Data model (Firestore root collections)

- `muscles/mus-<key>`: `{name, order}`
- `exercises/ex-<slug>` (seeded) or random id: `{name, nameLower, primaryMuscleId, secondaryMuscleIds[], otherMuscleIds[], refWeight, note, createdAt, updatedAt}`
- `programs/prog-<slug>`: `{name, nameLower, order, createdAt}`
- `days/day-<prog>-<slug>`: `{programId, name, order, entries: [{exerciseId, targetSets, reps}]}` (flat collection, NOT a subcollection; entry order = card order; targets are per day because the same exercise has different targets on different days). Single rep number per entry ("3×12"). Docs written before v2 carried `repMin`/`repMax`; `entryReps()` in logic.js reads those as the range top, no migration.
- `logs/log-<date>-<dayId>-<exerciseId>`: `{date "YYYY-MM-DD" LOCAL, programId, dayId, exerciseId, exerciseName, dayName, programName, sets: [{reps, weight|null, done}], ts}`. Deterministic id: check = setDoc, uncheck = deleteDoc, edit = same-doc overwrite. Name snapshots keep history working after deletions. Logs written before v6 have no `done` per set; `logDone()`/`cloneSets()` treat a missing flag as done (no migration).
- `cardioTypes/ct-<key>`: `{name, order, note}` (seeded: bike "Bike s/ suporte", bike-suporte "Bike c/ suporte", eliptico, esteira, escada, corrida, remo, outro; managed in Ajustes like muscles, name + note editable per row). The note is a machine-adjustment description shown as a muted hint in the "+ Cardio" sheet when that type is selected.
- `cardio/<random id>`: `{date "YYYY-MM-DD" LOCAL, typeId, typeName (snapshot), minutes (int), note, ts}`. Standalone (no program/day); multiple entries per day allowed; delete-only editing (remove + re-add).
- (Removed in v5: the `bathroom` collection. Data migrated to the Intest app's Firebase project; the old collection is deleted from this project once migration is confirmed.)

## Key behaviors and decisions

- Dates are always LOCAL strings built from getFullYear/Month/Date. Never `toISOString()` for dates (UTC shifts the date in Brazil after 21:00). A workout crossing midnight logs the remaining exercises on the new date (accepted).
- Check pre-fills from the last log for that exercise (any day, date < today); with no history it uses the day entry's target (targetSets rows of `reps`, weight = `parseRefWeight(refWeight)`). Saved immediately on check, but with every set `done: false`; completion is per-set.
- "Último" weight everywhere is derived from logs (fallback: exercise `refWeight` string). Never stored on the exercise. refWeight is numeric-only since v6 ("kg" is rendered outside the input); a one-time client migration (localStorage flag `gym:migrate-refweight-v6`) extracted the number from old free-text values and moved leftovers into the note.
- One-time boot upserts guarded by localStorage flags: refWeight migration (`gym:migrate-refweight-v6`), the `ex-agachamento-smith` catalog add (`gym:seed-smith-v6`), and the bike split + 02-03/09 cardio backfill (`gym:cardio-bikes-v6-1`, fixed doc ids `backfill-2026-09-02-bike` / `backfill-2026-09-03-eliptico`).
- Backup: export builds `{app, version, exportedAt, muscles, exercises, programs, days, logs, cardio, cardioTypes}` and goes out via the iOS share sheet (fallback: blob download). Import preserves doc ids (non-destructive merge, overwrite-by-id), chunked 400 writes/batch. Old backups without `cardio`/`cardioTypes` import fine; a v4 `bathroom` array is silently ignored.
- Deleting an exercise removes it from all days in one batch and keeps logs (soft-orphan). Deleting a muscle is blocked while referenced. Deleting a program cascades its days, keeps logs.
- Exercise log sheet (v6.4): `sheet-exlog` lists every session ever logged for one exercise, newest first, one line per set ("Série 1 · 11×35kg"); unchecked sets render dimmed with a "pendente" tag. It is a STACKED sheet (`.sheet-stack`, z-index 55 over the normal 50): it opens on top of the sheet that launched it and its "Fechar" button hides only itself, so a half-typed exercise form survives the round trip. It re-renders live from `onLogs` while open. All sessions are rendered (no paging); the data is already in memory.
- Rest timer stores the absolute end time in `localStorage["gym:timerEnd"]`; a running countdown survives reloads. AudioContext is unlocked on the preset tap (iOS). At zero: one bell ding + vibrate, bar blinks at 0:00 until dismissed (X, new preset, or exercise/set check via `clearFinishedTimer()`); the finished state is in-memory only.
- localStorage keys: `gym:program`, `gym:day`, `gym:timerEnd`, plus one-time flags `gym:migrate-refweight-v6`, `gym:seed-smith-v6` (UI prefs/flags only; all data lives in Firestore).
- Theme (v2): cream `#f8f3ec` bg, ink `#1e1e1c`, peach accent `#f0916a`, pill buttons. Viewport is locked (`maximum-scale=1` + `touch-action: manipulation`) so double-tap never zooms.
- Swipe-to-delete (v4): `makeSwipeable()` in main.js wraps history rows; swipe left reveals "Remover", right-click on desktop.
- UI text is pt-BR.

## Local dev

`python -m http.server 8087` (also in `.claude/launch.json`; 8081 fell into a Windows reserved-port range), then http://localhost:8087/#debug. Debug hooks: `window.__state`, `window.__buildBackup`. Note: the SW caches aggressively even on localhost; when testing fresh edits, unregister the SW + delete caches or hard-reload, or stale JS will produce ghost bugs.
