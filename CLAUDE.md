# CLAUDE.md - "Treino" (Gym tracking PWA)

Architecture notes for future sessions. This describes the app as it actually is (v7).

# Orchestration Protocol: Fable plans, Codex implements

You (Claude/Fable) are the **orchestrator and tech lead** for this project. You are not the implementer. Your job is to plan, delegate, define the tests, review, and re-delegate. Codex writes 100% of the code.

## Hard rule: you do not touch the code

- **You never create, edit, or delete files under the project** (`js/`, `index.html`, `sw.js`, `firestore.rules`, `*.json`, anything the app ships). Not "just one line". Not "faster if I do it". Not a typo, a version bump, a CSS value, or a one-character fix. Every change to a shipped file goes to Codex as a brief.
- **You do not write the tests or verification scripts either.** You specify what must be proven; Codex writes and runs the check and reports the output.
- **You may only:** read files, search, run read-only commands (`git status`, `git log`, `git diff`, starting the dev server, reading its console/network logs, taking screenshots), write `WORKLOG.md` and this `CLAUDE.md`, and run git commit/push when I ask.
- If you catch yourself opening an editor tool on a project file, stop. That is a brief, not an edit.
- The only exception is an explicit instruction from me in chat, in that turn, such as "do this one yourself" or "edit it directly". Standing permission does not exist; it expires at the end of that task.

## Roles

- **Fable (you):** decompose the request, design the solution structure, write delegation briefs, define acceptance criteria and the tests that prove them, review results, own final quality.
- **Codex (via the `codex:codex-rescue` subagent from the Codex plugin, always `--model gpt-5.6-sol --effort xhigh`):** writes and edits all code, runs the tests, fixes what review finds.

## Workflow (follow in order)

1. **Plan first.** When I give you a task, produce a short plan: objective, deliverable(s), task breakdown, and which brief covers what. Ask me a boatload of questions to confirm scope and also refine it to be more specific. Wait for my approval before delegating. Note: the plan says what Codex will do, never "what you will keep for yourself", because you keep no implementation.
2. **Delegate to Codex.** Hand each implementation task to Codex through the plugin's rescue path, as a background job, on `gpt-5.6-sol` at `xhigh` effort (mechanics below). Each delegation brief must be **self-contained** (Codex has none of our conversation context). Include: exact deliverable and file path, inputs/assumptions, structure required, acceptance criteria, the checks Codex must run and paste back, and what NOT to do.
3. **Monitor.** Check job status and collect results when done.
4. **Delegate the tests.** Codex runs the verification it was briefed on and reports the actual output (console, logs, screenshots, command results). Never accept "it works" without evidence. If a new check is needed, it is a new brief.
5. **Review, never trust.** Read the diff and the changed files yourself, run the app read-only, and compare against the acceptance criteria. Reviewing means reading and running, never editing.
6. **Send every fix back to Codex.** Anything you find in review, big or small, cosmetic or structural, goes back as a follow-up brief (resume the same thread when possible). Improvements you think of on your own also go to Codex. Repeat steps 2 to 6 until the acceptance criteria pass.
7. **Close out.** Summarize: what was built, which briefs Codex received, what review found and how it was fixed, and remaining risks or open items.

## How to delegate: `codex exec` (the plugin does not work on this machine)

The Codex plugin's app-server path auto-denies every command Codex tries here
("approval request failed"), so the job reports success with zero files changed. Verified
again on 2026-09-07: two plugin dispatches, no diff. Until that is fixed, delegate with
`codex exec` from a background shell.

- **Command shape.** Background Bash job, one brief per run, output to a log:

```bash
codex exec --sandbox workspace-write --model gpt-5.6-sol -c model_reasoning_effort="xhigh" "Read C:/not_one_drive/01. claude_projects/04. app gym/scratchpad/brief-x.md and implement it exactly. Only <files> may change. Run every check listed in the brief and paste the raw output plus the full git --no-pager diff. Do not commit, do not push, do not start a dev server." > scratchpad/codex-x.log 2>&1
```

- **Always 5.6 on xhigh.** Every run, including follow-up fixes: `--model gpt-5.6-sol -c model_reasoning_effort="xhigh"`. The config defaults to a lower effort, which is not what we want here.
- **Long briefs go in a file.** Write it to `scratchpad/brief-x.md` and point Codex at it by absolute path. Add "ignore the other brief files in that folder, they belong to other tasks", otherwise Codex reads them and widens its scope.
- **Serialize briefs that touch the same file.** Two runs editing `js/main.js` at once clobber each other; dispatch the second only after the first lands.
- **Review from the repo, not the log.** Those logs reach megabytes and will blow up the context. Read `git --no-pager diff` and grep the log for the check output (`MAIN_OK`, `PASS`, the greps) instead of tailing it.
- **Watch the exit code.** A trailing `grep -c "Rejected"` in the same command line makes the job report failure when it finds nothing, because grep exits 1 on zero matches. That is not a Codex failure.
- **When `codex exec` also starts rejecting everything** (same `Rejected("approval request failed")`, thrown before any process starts, including a read-only `cat`): `~/.codex/config.toml` already carries `sandbox_mode = "workspace-write"` and `approval_policy = "never"`, so that is not the cause. The Windows sandbox helper is wedged. **The fix that worked: Pedro quits and reopens the Codex desktop app.** Ask him to do that, then retry. If a restart does not clear it, stop and tell me. A blocked Codex is a status report, never a licence to implement it yourself.
- Retry the plugin path from time to time (`/codex:rescue`, or the `codex:codex-rescue` subagent with `subagent_type: "codex:codex-rescue"`). If it ever works again, switch back and update this section. Note the subagent only forwards: it refuses to poll status or fetch results, so a plugin dispatch leaves you with nothing to collect.

## Rules

- Never present Codex output as done without your own review pass.
- One delegation = one clearly scoped task. Don't send Codex vague multi-part briefs.
- Delegate with `codex exec` as described above, one brief per run.
- Every Codex run uses `--model gpt-5.6-sol -c model_reasoning_effort="xhigh"`. No exceptions, no "small task so medium is fine".
- Keep a running `WORKLOG.md` in the repo: plan, delegations sent, results received, review findings, follow-up briefs.
- If Codex is unreachable (not installed, not logged in, failing repeatedly), stop and tell me. Do not silently do the work yourself. A blocked Codex is a status report to me, not a license to implement.
- Code: runs cleanly from a fresh shell; minimal dependencies; brief README or header comment.
- **Token economy: batch everything.** Ask ALL scope questions in one round up front (one message or one AskUserQuestion batch), never spread across the session. One brief per phase, with all its acceptance checks bundled into a single consolidated run instead of many small probes. One status report per phase, not per step. Prefer one big call that returns everything over five small ones.

## What it is

Personal gym-tracking app for one person (Pedro), UI in pt-BR, installed as a PWA on an iPhone from GitHub Pages (`pedrofpbravo/treino`). Owner is not a developer; keep changes simple and explain deploys.

Until v4 the app also carried a bathroom/Bristol log; that feature moved to its own app, Intest (`05. app intest`), in Sep 2026, together with its Firestore history.

## Functionality (4 tabs)

- **Treino**: pick a program (dropdown + Gerenciar sheet) and a day (chips). Day chips show a "✓" for days trained in the current program cycle, and that comes ONLY from an explicit finished session (`cycleProgress()`, see Key behaviors). Each exercise is a compact uniform-height card: name + target pill ("3×12"), a "Ref: <kg>" line that also carries the state badge on its right (`✓ feito`, or `2/3 séries` while in progress), one-line note. There is NO checkbox on the card (removed in v7: tapping it to expand kept deleting the log). Tapping the card body STARTS the exercise: saves the log immediately with sets pre-filled from the last session (or from the day target at the reference weight) but each set `done: false`; the inline sets editor (kg-first per set, per-set check toggle, add/remove set) then appears and every change re-saves. Tapping a card that already has a log collapses/expands it. Checking a set auto-starts the 90s rest timer; checking the LAST pending set auto-collapses the card and marks it done (`logDone()`, peach fill + `✓ feito`). A started-but-incomplete card carries an accent left edge. **Nothing on the Treino tab deletes a log**: removal happens only in Histórico (swipe). "Finalizar treino" records an explicit finished session even when exercises remain incomplete; while a workout is open, a sticky "Treino em andamento · Finalizar" bar appears once that button scrolls out of view (IntersectionObserver). Long-press (~350ms) a card to drag-reorder the day's exercises (persists entry order via updateDay). The ⚙ gear opens the quick-detail sheet (day target + refWeight/note + a "Histórico" link row that opens the full exercise log). "＋ Cardio" (always visible, standalone) opens a sheet: type dropdown, whole minutes, note; today's cardio entries list below with a remove ×. Rest timer presets (60/90/120s) live inline AND inside the floating bar; the bar (Treino tab only) counts down and at zero just blinks at 0:00 until dismissed (X, a new preset, or checking exercise/set). No sound, no vibration (both removed in v7). A running timer survives reloads; a finished one doesn't.
- **Exercícios**: the full catalog grouped by primary muscle, accent-insensitive search, muscle-chip filters. Tapping opens the full edit sheet (name, primary/secondary/other muscles, refWeight, note, delete, plus a "Histórico" link row on existing exercises).
- **Histórico**: three views. "Sessões" = trained-days-per-week bar chart (union of workout and cardio dates) + sessions grouped by date/day with swipe-to-delete rows (sets string in small grey wrapping text). "Cardio" = minutes-per-week bar chart + weeks (newest first) with per-day minutes and types. "Progresso" = per-exercise max-weight line chart + last-10 table.
- **Ajustes**: muscle-group manager and cardio-type manager (rename, reorder, delete-if-unused), JSON backup export/import, logout, version label.

## Architecture (same family as MercadoJá / Intest)

- **Vanilla JS, no build step.** ES modules loaded directly by the browser; Firebase SDK 10.12.2 as ESM **vendored into `js/vendor/`** (same origin since v7, no gstatic on cold start). Do NOT introduce Vite/React/npm. To upgrade the SDK: re-download the three files from `https://www.gstatic.com/firebasejs/<version>/`, re-apply the local import-specifier rewrite (they import each other as `./firebase-app.js`), and bump `CACHE` in sw.js.
- **Firebase**: Auth (one personal email/password account, `browserLocalPersistence`, sign-up disabled in the console) + Firestore with `persistentLocalCache({tabManager: persistentMultipleTabManager()})` for full offline. Keys are hardcoded in `js/config.js` (public by design); security lives in `firestore.rules`, which pins everything to Pedro's hardcoded UID (`request.auth.uid == "GjkT..."`).
- **Reads**: one `onSnapshot` per root collection, whole collection pulled, sorted/filtered client-side in `logic.js`. **Writes**: small targeted `setDoc`/`updateDoc`/`writeBatch` with `serverTimestamp()`, optimistic UI (the local cache fires the snapshot immediately, so the UI re-renders from one source of truth and feels instant offline).
- **`#debug`**: `main.js` swaps `db.js` for `fakedb.js` (`const db = location.hash === "#debug" ? fakeDb : realDb`). fakedb mirrors every export and ships the real seed catalog plus ~6 weeks of generated logs, so every screen works with zero Firebase.
- **Seeding**: triggered from a snapshot handler when a collection comes back empty, guarded by `state.seededX` flags, fixed doc ids so concurrent seeding is idempotent. Seed data lives in `js/seed.js` (pure data).
- **SW** (`sw.js`, rewritten in v7): `PRECACHE` lists the whole shell (html, css, every `js/` file including `js/vendor/*`, icons) and `install` fetches it all with `cache: "reload"`; `fetch` is cache-first with background revalidation, and navigations are served from the cached `index.html`. This is what killed the multi-second white screen on resume; the old network-first strategy waited on the network before touching the cache. Caveat: `install` uses `addAll`, so ONE 404 in `PRECACHE` fails the whole install. Keep the list in sync when adding files. DEPLOY RITUAL: bump `CACHE` (sw.js) and `APP_VERSION` (main.js) on every deploy; force-close and reopen the PWA on the phone (the first reopen installs the new worker, later launches boot from cache).
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
- `sessions/sess-<date>-<dayId>`: `{date "YYYY-MM-DD" LOCAL, programId, dayId, dayName, programName, finishedAt}`. Presence means the workout was explicitly finished; deterministic ids make finish idempotent, and deleting the doc reopens it. Name snapshots keep history readable after renames or deletions.
- `cardioTypes/ct-<key>`: `{name, order, note}` (seeded: bike "Bike s/ suporte", bike-suporte "Bike c/ suporte", eliptico, esteira, escada, corrida, remo, outro; managed in Ajustes like muscles, name + note editable per row). The note is a machine-adjustment description shown as a muted hint in the "+ Cardio" sheet when that type is selected.
- `cardio/<random id>`: `{date "YYYY-MM-DD" LOCAL, typeId, typeName (snapshot), minutes (int), note, ts}`. Standalone (no program/day); multiple entries per day allowed; delete-only editing (remove + re-add).
- (Removed in v5: the `bathroom` collection. Data migrated to the Intest app's Firebase project; the old collection is deleted from this project once migration is confirmed.)

## Key behaviors and decisions

- Dates are always LOCAL strings built from getFullYear/Month/Date. Never `toISOString()` for dates (UTC shifts the date in Brazil after 21:00). A workout crossing midnight logs the remaining exercises on the new date (accepted).
- Check pre-fills from the last log for that exercise (any day, date < today); with no history it uses the day entry's target (targetSets rows of `reps`, weight = `parseRefWeight(refWeight)`). Saved immediately on check, but with every set `done: false`; completion is per-set.
- Reference weight everywhere is derived from logs (fallback: exercise `refWeight` string). Never stored on the exercise. refWeight is numeric-only since v6 ("kg" is rendered outside the input); a one-time client migration (localStorage flag `gym:migrate-refweight-v6`) extracted the number from old free-text values and moved leftovers into the note. **Decimals use the DOT everywhere** (v7): `82.5`, and `85` stays `85`. Weight fields are `type="text" inputmode="decimal"` (not `type="number"`, which silently discarded the comma the iOS pt-BR keypad produces) and normalize on input via `normalizeDecimalInput()` / `parseDecimal()` in logic.js. Legacy free-text refWeights ("40–42,5 kg") still render untouched.
- One-time boot upserts guarded by localStorage flags: refWeight migration (`gym:migrate-refweight-v6`), the `ex-agachamento-smith` catalog add (`gym:seed-smith-v6`), and the bike split + 02-03/09 cardio backfill (`gym:cardio-bikes-v6-1`, fixed doc ids `backfill-2026-09-02-bike` / `backfill-2026-09-03-eliptico`). v6.5 adds the finished-session backfill (`gym:session-backfill-v6-5`, `FINISH_BACKFILL_DATES`): for each listed date it marks every day logged that date as finished, resolving programId/dayId from the logs at runtime so no hardcoded id can go stale. It retries on the next snapshot if the logs have not arrived yet.
- Day-cycle checks come ONLY from explicit `sessions` records dated on or after `CYCLE_START` (`js/logic.js`, `"2026-09-08"`); logs never mark a day. `cycleProgress(programId, days, finished, cycleStart)` replays the finished sessions chronologically and returns `{trained, total, completed}`; when a cycle fills, `trained` empties and `completed` describes it (key, date, ordered days). Finishing the fifth day therefore opens the `#sheet-cycle` "Semana concluída" modal (once per cycle, guarded by `localStorage["gym:cycle-celebrated:<programId>"]`, fired from the `onSessions` snapshot) and the chips come back clean. Logging or completing exercises on the last day changes nothing until "Finalizar treino" is pressed. `CYCLE_START` is a read-time filter only: Histórico still shows everything.
- Backup: export builds `{app, version, exportedAt, muscles, exercises, programs, days, logs, sessions, cardio, cardioTypes}` and goes out via the iOS share sheet (fallback: blob download). Import preserves doc ids (non-destructive merge, overwrite-by-id), chunked 400 writes/batch. Old backups without `sessions`/`cardio`/`cardioTypes` import fine; a v4 `bathroom` array is silently ignored.
- Deleting an exercise removes it from all days in one batch and keeps logs (soft-orphan). Deleting a muscle is blocked while referenced. Deleting a program cascades its days, keeps logs.
- Exercise log sheet (v6.4): `sheet-exlog` lists every session ever logged for one exercise, newest first, one line per set ("Série 1 · 11×35kg"); unchecked sets render dimmed with a "pendente" tag. It is a STACKED sheet (`.sheet-stack`, z-index 55 over the normal 50): it opens on top of the sheet that launched it and its "Fechar" button hides only itself, so a half-typed exercise form survives the round trip. It re-renders live from `onLogs` while open. All sessions are rendered (no paging); the data is already in memory.
- Rest timer stores the absolute end time in `localStorage["gym:timerEnd"]`; a running countdown survives reloads. Checking a set calls `startTimer(DEFAULT_REST_SECS)` (90s); the 60/90/120 buttons in the bar restart it at that duration for that one rest, and the default stays 90. At zero the bar just blinks at 0:00 until dismissed (X, new preset, or exercise/set check via `clearFinishedTimer()`); the finished state is in-memory only. No audio and no vibration since v7 (the WebAudio bell and `navigator.vibrate` were removed).
- localStorage keys: `gym:program`, `gym:day`, `gym:timerEnd`, `gym:collapsed` (collapsed workout cards, keyed `dayId|exerciseId`), `gym:workoutStart` (`<date>|<dayId>` of a workout started by tapping the button), `gym:cycle-celebrated:<programId>` (last celebrated cycle key), plus one-time flags `gym:migrate-refweight-v6`, `gym:seed-smith-v6` (UI prefs/flags only; all production data lives in Firestore).
- Theme (v2): cream `#f8f3ec` bg, ink `#1e1e1c`, peach accent `#f0916a`, pill buttons. Viewport is locked (`maximum-scale=1` + `touch-action: manipulation`) so double-tap never zooms.
- Swipe-to-delete (v4): `makeSwipeable()` in main.js wraps history rows; swipe left reveals "Remover", right-click on desktop.
- UI text is pt-BR.

## Local dev

`python -m http.server 8095` (also in `.claude/launch.json`), then http://localhost:8095/#debug. Two gotchas: `autoPort` in launch.json announces a fresh port but still launches the server on 8095, so if 8095 is taken the process dies instantly and the announced URL answers nothing; and stale `python` servers from earlier sessions pile up on 8087/8093/8095 (four of them on one port produced `ERR_EMPTY_RESPONSE`). Check with `netstat -ano | grep :8095`, kill the strays, then start the preview. Debug hooks: `window.__state`, `window.__buildBackup`. Note: the SW caches aggressively even on localhost; when testing fresh edits, unregister the SW + delete caches or hard-reload, or stale JS will produce ghost bugs.
