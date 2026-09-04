# WORKLOG — Treino v6 improvement batch

Running log per the Orchestration Protocol (Fable orchestrates, Codex executes).

## 2026-09-04 — v6.3: cleaner set-summary lines

### Request (Pedro)
The bold weight in the "Último" line looks ugly (font-weight 800 repeated per
set, reps shrunk to 11px).

### Scope locked (Pedro's answers, 2026-09-04)
- Group the weight when all sets share it: "12kg · 12/9/8/8"; per-set fallback
  when weights differ. Soften bold 800 -> 600; no font-size difference between
  reps and weight. Apply app-wide (setsLabel propagates to Histórico, day
  summary, Progresso). No broader UI audit for now.

### Delegation
- Brief "sets-restyle" sent to Codex (background, codex exec
  --sandbox workspace-write): new groupedSetsParts in logic.js, setsLabel
  rewrite, appendStyledSets grouped rendering in main.js, styles.css softening,
  version bump v6.2 -> v6.3 (APP_VERSION + sw CACHE).
- Review findings: diff minimal and to spec (4 files, ~35 lines). Node sanity
  checks pass (uniform, mixed fallback, weightless, decimal comma, single set,
  empty). Browser #debug pass: cards render "35kg · 11/11", one weight span per
  card, weight 600/13px, reps 400/13px, version v6.3; catalog/history rows pick
  the format up via setsLabel. No fixes needed. Side change: dev port moved
  8087 -> 8093 in .claude/launch.json (8087 newly unbindable, 8090 taken by
  Intest's server). Not yet committed/deployed.

### Pedro feedback round (2026-09-04, pre-deploy)
- (1) "History changed" — false alarm: he saw localhost #debug FAKE data
  (fakedb logs generated off seed refWeight "20 kg" for Tríceps pushdown).
  Real Firestore data untouched, nothing deployed. Explained.
- (2) Notes showing "-5"-style negative weights: leftover of the v6 refWeight
  migration ("5–6 kg" -> refWeight 5, note line "–6 kg"). Fix: one-time boot
  migration gym:fix-note-dash-v6-3 stripping a leading dash before a digit per
  note line (ranges like "pós. 6–7" untouched). Delegated to Codex.
- (3) Grouped "12kg · 11/11" format scrapped ("11/11" reads like a date).
  Reverted by Fable in review: setsLabel/appendStyledSets back to per-set
  "12×12kg · ...". KEPT: font softening (weight 600, no 11px reps shrink).
  groupedSetsParts removed. Node checks confirm exact pre-v6.3 strings.

### Verification round 2 (post-fixes)
- Codex delivered fixNoteDashes to spec (main.js only: flag
  gym:fix-note-dash-v6-3, per-line /^\s*[-–—]\s*(?=\d)/ strip, same field set
  as migrateRefWeights, called after it in onExercises). logic.js back to HEAD.
- Node: 6 regex cases pass (range "6–7" kept, "-5"/"–42,5 kg" stripped,
  text-dash kept, idempotent). node --check main.js ok.
- Browser #debug: per-set "11×35kg · 11×35kg" restored, weight 600/13px,
  reps 400/13px, v6.3, migration flag sets, zero console errors.
- Final v6.3 contents: font softening (styles.css), note-dash migration
  (main.js), version/CACHE bump. Awaiting Pedro's OK to commit + deploy.

## 2026-09-03 — Session start

### Setup
- CLAUDE.md updated with the Orchestration Protocol.
- Codex verified ready: codex-cli 0.152.1, ChatGPT login active, direct runtime.

### Request (Pedro)
Batch of improvements, labeled a-i and z:
- (a) Cardio logging per workout: type dropdown (bike, elíptico, esteira, ...), duration, comments.
- (b) Exercise cards: emphasize weight over sets/reps.
- (c) Histórico: weekly cardio time (per-day within a week, plus per-week aggregate).
- (d) Rest timer: visible on iOS lock screen, single "ding" at end, bar keeps blinking until dismissed.
- (e) History rows with 4+ sets overflow the layout: smaller, grey sets font.
- (f) Per-set check marks inside each exercise; exercise check only unlocks when all sets are done (or deleted).
- (g) Drag-and-drop reordering of the day's exercises (replace up/down arrows).
- (h) Day chips show check for days completed in the current program cycle; reset when all days of the program are done.
- (i) refWeight becomes numeric-only with a fixed "kg" suffix in the UI.
- (z) Add exercise "Agachamento smith" to the catalog (not added to any day).

### Scope locked (Pedro's answers, 2026-09-03)
- (d) Timer: NO wake lock, NO push backend (both dropped by Pedro). Single ding
  at zero, bar blinks until dismissed. Dismiss = tap X, start a new timer, or
  check an exercise/set. Bar stays Treino-tab-only.
- (a) Cardio: "+ Cardio" button opens a bottom sheet (type, minutes, comments).
  Type list is EDITABLE in-app (managed in Ajustes, like muscle groups); seed
  with Bike, Elíptico, Esteira, Escada, Corrida, Remo, Outro. Whole minutes.
  Standalone OK: tied to the date only, works without program/day. A cardio-only
  day COUNTS as a session in "Treinos por semana".
- (c) Histórico: weekly cardio time view. Aggregate minutes per week; within a
  week, minutes per day.
- (b) Emphasis flips to weight (big/bold) in the "Último" line and sets editor;
  target pill ("3×12") unchanged.
- (e) History session rows: sets string in smaller, grey font so 4+ sets fit.
- (f) Per-set checks: circle tap = start (saves log, sets unchecked), check sets
  one by one, circle auto-fills when ALL sets checked (or extra sets deleted).
  Uncheck circle = delete log. Only fully-done exercises count in "X/Y feitos".
- (g) Drag-and-drop on the Treino cards: long-press lifts, drag reorders, saves
  to the day entries immediately. Replaces nothing else (tap-to-open stays).
- (h) Day-chip cycle checks: completion-based, per program (independent cycles).
  Chip gets a check once trained; when all the program's days are checked, all
  clear and a new cycle starts. Same day twice = one check.
- (i) refWeight numeric-only, "kg" suffix rendered outside the field. One-time
  migration: strip "kg", keep number; non-numeric text moves into the note.
- (z) New exercise "Agachamento smith": primary quadríceps, secondary glúteos +
  posterior de coxa, no refWeight/note, not in any day. Delivered via idempotent
  boot upsert (fixed id) + added to seed.js for fresh installs.

### Phases (each = one Codex delegation, sequential, verified in #debug preview)
1. Quick wins: (e), (i), (z), (b).
2. Workout flow: (f), (g), (h).
3. Cardio: (a) + (c).
4. Timer: (d).
Deploy once at the end: bump CACHE (sw.js) + APP_VERSION (main.js).

### Delegations sent
- Phase 1 → Codex (background): quick wins (e) history-row sets overflow fix,
  (i) numeric refWeight + kg suffix + one-time migration, (z) Agachamento smith
  seed + boot upsert, (b) weight-first emphasis in Último line and sets editor.
  Brief includes acceptance criteria, do-not list, #debug test instructions.

### Results / review findings
- Phase 1, attempt 1 (task-mtm0gfik-djro7w): FAILED, no files changed. Codex's
  shared runtime had been spawned from a sandboxed shell, so every command it
  tried (even read-only) was auto-denied ("approval request failed";
  approvalPolicy is "never" in the companion, so denials are silent).
- Remediation: killed the contaminated broker (pid 33036), relaunched the same
  Codex thread from an unsandboxed shell as task-mtm0mtr7-wgy8u3. Lesson for
  future sessions: launch codex-companion jobs with sandbox disabled so the
  on-demand broker inherits a clean environment.
- Phase 1, attempt 2 (task-mtm0mtr7-wgy8u3): FAILED the same way even with a
  clean broker. Diagnosis: `codex exec` in workspace-write sandbox works fine on
  this machine; only the plugin's app-server path rejects every CreateProcess
  ("approval request failed" under approvalPolicy "never"). Plugin-level bug,
  not a Codex install problem (doctor is clean except unverified Defender
  exclusions).
- Workaround adopted: delegate via `codex exec --sandbox workspace-write` in a
  background shell, brief piped from a file, output captured to scratchpad.
- Phase 1, attempt 3 (codex exec): SUCCESS. All 4 changes implemented across
  index.html, styles.css, js/main.js, js/logic.js, js/db.js, js/fakedb.js,
  js/seed.js. Codex also split setsLabel into setsParts (structured) +
  setsLabel (plain text), added db.createExerciseWithId mirrored in fakedb.
- Fable verification (in #debug preview, 375px viewport): PASS on all criteria.
  - History rows: 5-set string wraps below the name, grey 11px, no overlap, no
    horizontal overflow.
  - refWeight: migration converted all 27 seeds to numeric ("40–42,5 kg" -> 40
    + remainder in note); detail sheet shows type=number step=0.5 with external
    kg label.
  - Smith: exists (mus-quadriceps primary, gluteos+posterior secondary), in no
    day, boot-upsert flags work.
  - Emphasis: Último line renders bold 35kg spans with muted ×reps; sets editor
    rows are kg-first (17px/800) with muted reps (14px/600).
- Fable review fix: migration left a dangling "kg" in notes ("12 kg cada" ->
  note "kg cada"). Added a leading-unit strip in migrateRefWeights; re-ran
  migration with cleared flags, note now "cada", no leading-kg notes remain.
- Phase 1 CLOSED. Not deployed yet (single deploy at the end).

### Phase 2 delegation (sent)
- Codex exec (background): (f) per-set done flags with logDone() as the
  fully-done rule (old logs = done at read time, no migration), (g) long-press
  drag-and-drop on workout cards persisting entry order via updateDay, (h)
  cycleDays() in logic.js deriving per-program cycle state from logs, check
  markers on day chips. Brief: scratchpad/phase2-brief.md.

### Phase 2 results / review
- Codex delivered all 3 features (logic.js, main.js, fakedb.js, styles.css).
  logDone() treats old logs (no done field) as complete; cycleDays() walks
  (date, day) sessions chronologically and resets on full-cycle completion;
  drag = long-press 350ms + placeholder + pointer events.
- Fable review found and fixed 2 bugs:
  1. makeDraggableList was re-wired on every renderWorkout onto the persistent
     #workout-list, stacking duplicate listeners with stale day captures.
     Fixed: wire once (dataset.dragWired guard), resolve currentDay() at drop.
  2. lift() called setPointerCapture before setting the drag object; if the
     pointer died at the hold boundary it threw and left the card stuck in
     position:fixed with an orphan placeholder. Fixed: set drag first,
     capture inside try/catch. Reproduced the stuck state before the fix,
     clean after.
- Verified in #debug preview (375px): per-set checks (partial = not done, 0/7;
  all checked = done, 1/7 + Finalizar visible), set-row order
  check|n|kg|reps|remove, chip shows "✓ Push" mid-cycle (fake data legitimately
  completed a cycle on 09-02, verified by walking the session sequence), drag
  reorders and persists via updateDay (state matches DOM), tap-to-open detail
  sheet still works after drag wiring.
- Phase 2 CLOSED.

### Phase 3 delegation + results
- Codex exec: cardio feature per brief (scratchpad/phase3-brief.md). Delivered:
  cardioTypes + cardio collections (db/fakedb/seed), "+ Cardio" sheet on
  Treino (standalone, date-only), today-list with remove, Histórico third view
  "Cardio" (weekly bar chart + per-week day rows), weeklyCardio() +
  weeklyFrequency date-union in logic.js, "Tipos de cardio" manager in
  Ajustes, backup export/import with old-backup compatibility. Codex self-ran
  headless #debug checks this time.
- Behavior change accepted in review: weeklyFrequency now counts unique DATES
  (was date+day session pairs); needed for the cardio union, equivalent for
  single-workout days.
- Fable verification in #debug preview: all PASS. Create Esteira 25min ->
  saved, listed, removable (20->19). Histórico: chart renders, "Semana de
  31/08 · 85 min" headers, per-day rows. Frequency union: 30 -> 35 trained
  days with cardio dates. Manager: delete of referenced type blocked with
  toast '"Esteira" está em uso por registros de cardio.' Backup contains
  cardio (20) + cardioTypes (7). No fixes needed.
- Phase 3 CLOSED.

### Phase 4 delegation + results
- Codex exec: timer end behavior per brief (scratchpad/phase4-brief.md).
  Delivered: single bell-like ding (two harmonics, ~1s decay) replacing the
  three beeps; persistent finished state (bar blinks at 0:00, Treino-tab-only,
  survives tab switches, not reloads); dismissal via X, new preset, exercise
  check, or set check (clearFinishedTimer()).
- Verification detour: two "bugs" (finished state clearing between checks,
  flash surviving a restart) turned out to be the SERVICE WORKER serving a
  stale main.js in the dev preview (stack-trace line numbers didn't match the
  disk file). After unregistering the SW and clearing the treino-v5 cache,
  every scenario passed: countdown, finish (0:00 + blink), hidden on other
  tabs / restored on return, preset restart clears blink, X dismisses,
  set/exercise check dismisses, running timer survives reload. No code fixes
  needed. Lesson recorded in CLAUDE.md (local dev section).
- Phase 4 CLOSED.

### Phase 5 (follow-up request, 2026-09-03)
- Scope (Pedro, confirmed via popups): split Bike into "Bike s/ suporte"
  (note "banco ruim · pos. 13, banco pos. 4", keeps ct-bike id + history) and
  "Bike c/ suporte" (note "pos. 25"); cardioTypes gain a `note` shown as a
  muted hint in the "+ Cardio" sheet and editable in the Ajustes manager;
  backfill 02/09 Bike s/ suporte 20min and 03/09 Elíptico 30min, both note
  "dificuldade 8".
- Codex exec delivered; Fable review confirmed the critical bits: batch
  upsert uses set(...,{merge:true}) so order-only renumbers keep names/notes;
  upsert runs after the empty-collection seed guard; backup export/import
  carry the note. No fixes needed.
- Verified in #debug: 8 types in order (both bikes on top, correct notes),
  backfill docs exact (dates/minutes/notes/typeName snapshots), sheet hint
  shows for bike / hides for esteira, manager rows have name + note inputs,
  flag set after success.
- Versions bumped to v6.1 (APP_VERSION + CACHE), CLAUDE.md updated, deployed.

### Batch close-out (2026-09-03)
- Versions bumped: APP_VERSION v6 (js/main.js), CACHE treino-v6 (sw.js).
- CLAUDE.md updated to describe v6 (tabs, data model, behaviors, dev port).
- node --check clean on all 8 JS files; final smoke test in #debug clean
  (boots as v6, cards render, cardio button present, drag clean, no console
  errors from fresh code).
- Summary: Codex implemented all 4 phases (10 features); Fable fixed 3 issues
  in review (migration "kg" remainder, drag listener stacking + stale day,
  setPointerCapture race) and diagnosed 1 environment issue (plugin app-server
  path auto-denies commands; workaround: codex exec) + 1 test-env issue (SW
  staleness). Open items: real-device (iPhone) pass on drag and the timer
  ding; deploy ritual on the phone (force-close + reopen the PWA).

## 2026-09-04 — v6.2 batch (5 improvements)

### Request (Pedro)
1. Cardio chart granularity: Dia / Semana / Mês selector.
2. Day chip ✓ only when the whole day is done; distinct color while in progress.
3. Drag-to-reorder only in an explicit edit mode.
4. Invert set display: reps first, then weight ("12×40kg").
5. Searchable dropdowns (combobox) for primary/secondary muscles in the exercise sheet.

### Scope locked (Pedro's answers, 2026-09-04)
- (2) Only a COMPLETE day counts, for both the ✓ and the cycle reset. Partial day = "doing" color only.
- (3) "Ordenar" toggle button on the Treino tab next to "Editar dia"; drag immediate while on; tap/check suppressed.
- (4) reps×weight everywhere (Último, Histórico, Progresso, finish summary) AND reps input before kg in the sets editor. Weight keeps bold emphasis. Target pill "3×12" untouched.
- (5) Primary = single-select combobox; secondary and others = multi with removable tags; accent-insensitive filtering via normalize().
- (1) Defaults accepted: chips Dia/Semana/Mês above the cardio chart, default Semana; Dia = 14 days, Semana = 12 weeks (range labels, ends only), Mês = 6 months ("set/26"). Weeks list below unchanged.

### Delegations
- Brief A (items 1+2) → codex exec --sandbox workspace-write, background. Brief at scratchpad/brief-a.md.
- Brief B (items 3+4+5) → dispatched after A lands (both edit main.js). Brief at scratchpad/brief-b.md.

### Results (2026-09-04)
- Brief A delivered: dailyCardio/monthlyCardio helpers, Dia/Semana/Mês chips, cycleDays rewritten to complete-sessions-only, .chip.doing style, fakedb complete-session seed. Reviewed and approved; deviation accepted (new fmtDateShortMonth instead of changing fmtDate).
- Brief B delivered: reorderMode + "Ordenar" button (immediate drag, tap/check suppressed), reps-first set format (setsLabel, appendStyledSets, sets editor input order), three searchable muscle comboboxes with tags replacing the select + chip grids.
- Fable review fix: primary combobox input now snaps back to the picked muscle name on blur (typed leftover text no longer desyncs from the stored pick).
- Consolidated browser verification on #debug: all five acceptance sets passed. Cardio chart 14/12/6 bars with correct labels and titles, weeks list untouched; day chip doing -> ✓ -> doing verified (early false alarm was the test script clicking detached DOM nodes, not an app bug); drag inert with Ordenar off, immediate with it on; "Último" and history render 12×40kg with weight bold; sets editor reps-before-kg; comboboxes filter accent-insensitively, tags add/remove, exclusivity kept. Zero console errors.
- Pending: deploy ritual (bump sw.js CACHE + main.js APP_VERSION, commit) awaiting Pedro's go.
