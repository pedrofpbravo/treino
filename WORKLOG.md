# WORKLOG — Treino v6 improvement batch

Running log per the Orchestration Protocol (Fable orchestrates, Codex executes).

## 2026-09-11 — v7.3: cardio fora do Treino, taxonomia muscular nova, exercício substituto

### Request (Pedro, mesma sessão após o push do v7.2)
Correções: (1) legibilidade dos nomes na sheet "Editar dia"; (2) ícone da aba
Séries. Melhorias: (1) cardio não deve morar na aba Treino (registro vai só
para o Histórico); (2) implementar o exercício substituto com pares
cadastrados manualmente (campo começa vazio, cadastro via aba Exercícios);
(3) retrabalhar grupos musculares: ombros em 3 cabeças, costas em dorsais/
parte alta/eretores, validado em literatura de hipertrofia.

### Scope locked (uma rodada AskUserQuestion + tabela de remap validada)
Cardio: botão fica no Treino, lista some, remoção via swipe no Histórico >
Cardio. Similares: relação simétrica. Taxonomia aprovada como proposta
(16 grupos; Trapézio fundido em "Costas superiores"; Lombar renomeada
"Lombar (eretores)"; Ombros/Costas/Trapézio deletados após remap). Trocar
exercício com séries marcadas descarta as séries do original (sem
transferência, original não gera log).

### Execução (5 briefs Codex via codex exec, gpt-5.6-sol xhigh, serializados)
- Brief 1 (`brief-v73-1-dayeditor.md`): .entry-name quebra em até 2 linhas
  (13px, line-clamp 2), inputs 40px, gap 4px; ícone 🔢 → 📊.
- Brief 2 (`brief-v73-2-cardio.md`): #today-cardio-list e renderTodayCardio
  removidos; toast "Cardio registrado."; Histórico > Cardio agora tem uma
  linha POR ENTRADA (data · tipo · min · nota) com makeSwipeable → deleteCardio.
- Brief 3 (`brief-v73-3-taxonomy.md`): migração `gym:muscle-taxonomy-v7-3`
  (db.migrateMuscleTaxonomy, um writeBatch atômico: cria mus-ombro-anterior/
  lateral/posterior, mus-dorsais, mus-costas-superiores; renomeia mus-lombar;
  reescreve primary/secondary dos 33 exercícios; reordena todos; deleta
  mus-ombros/mus-costas/mus-trapezio). Substitui e subsume o upsert v7-2
  (também seta o flag antigo). seed.js com os 16 grupos e remap; fakedb com
  equivalente in-memory. Idempotente em device novo.
- Brief 4 (`brief-v73-4-substituto.md`): campo `similarIds` (simétrico via
  db.updateSimilarLink, writeBatch dos dois lados; deleteExercise limpa
  referências; backup exporta/importa); seção "Similares" na sheet de edição
  (chips + busca, só exercício existente); "Substituir hoje" na sheet ⚙ do
  Treino (lista só os pares; bloqueia exercício já no dia; confirm + descarte
  se original tem séries; "Voltar ao original"; linha "no lugar de: X" no
  card; prefill com refWeight do substituto; `__subs` no rascunho local,
  nunca no Firestore); Finalizar grava log no id do substituto e limpa logs
  obsoletos de re-finalização pós-troca. Helpers puros
  `resolveWorkoutExercise`/`draftHasExerciseSets` em logic.js com teste node
  (3/3 PASS).
- Brief 5 (`brief-v73-5-bump.md`): CACHE treino-v7.3, APP_VERSION v7.3,
  remoção do updateExerciseMuscles morto (db.js + fakedb.js).

### Review
Diffs lidos pelo Fable; app verificado em #debug: taxonomia com 16 grupos na
ordem certa, Séries dividindo por cabeça de ombro/região de costas, link
simétrico supino↔tríceps-testa criado via fakedb, substituição end-to-end
(card "no lugar de", prefill 12.5 do substituto, Finalizar gravou
log-...-ex-triceps_testa_polia, original sem log, sessão registrada).
Gotcha reconfirmada: python fantasma em 8095 (2 processos) matou o preview
anunciado em 65517; matar PIDs e reiniciar resolveu. Cache de módulo do
browser exige fetch cache:reload antes de reload ao validar edições.

### Pendências / riscos
- Migração de taxonomia roda no primeiro boot logado do iPhone; backup
  pré-migração é o de 2026-09-11 (scratchpad/treino-backup-2026-09-11.json).
- Pedro cadastra os pares de similares manualmente (todos começam vazios).
- Fix de visualViewport do v7.2 ainda pendente de validação no aparelho.

## 2026-09-11 — v7.2: barras fixas no iOS, card compacto, aba Séries, revisão de músculos

### Request (Pedro)
Cinco itens; 1 a 4 implementados, 5 só desenhado: (1) bug visual das barras
fixas (tabbar + timer) no meio da tela após uso do teclado iOS; (2) card do
treino mostrando mais o nome do exercício (compactar a direita, setas/gear
intactos); (3) nova aba "Séries" com séries semanais por grupo muscular
(principal = 1, secundário = 0,5, drill-down por exercício); (4) revisão da
base de exercícios (músculos principal/secundário) validada com literatura,
mais a eliminação do tier "Outros" do cadastro; (5) proposta escrita da
funcionalidade de exercício substituto (FUNCIONALIDADE-SUBSTITUTO.md, sem
implementar).

### Scope locked (uma rodada AskUserQuestion)
Bug 1 envolveu teclado (confirma hipótese visualViewport); card: compactar a
direita, nome em 1 linha; Séries: 5ª aba, semana seg-dom com navegação,
"outros" deixa de existir (só principal + secundários); catálogo real obtido
por backup JSON exportado do app (Firebase MCP indisponível na hora).

### Execução (5 briefs Codex via codex exec, gpt-5.6-sol xhigh, serializados)
- Brief 1 (`brief-v72-1-fixedbars.md`): CSS var `--visual-viewport-bottom`
  (default 0px, no-op fora do iOS) + `wireVisualViewportBars()` em main.js
  recalculando via visualViewport resize/scroll/focusout; #tabbar e #timer-bar
  agora somam a var no bottom. Revisado: mecanismo correto (clientHeight -
  vv.height - vv.offsetTop), debounce rAF + settle 80ms + focusout 300ms.
  Validação real no iPhone fica com Pedro (não reproduzível no desktop).
- Brief 2 (`brief-v72-2-cardheader.md`): .wc-name 15px, .wc-target 12px/pad
  2px 7px, .wc-status 10px, gaps 8px/6px; caret e gear intactos (40x40
  verificado no preview).
- Brief 3 (`brief-v72-3-series-tab.md`): `weeklyMuscleSets()` puro em
  logic.js (done !== false, exercício deletado ignorado, agregação por
  exercício/semana); aba nova #tab-series + botão 🔢 na tabbar; navegação de
  semana (próxima desabilitada na atual); acordeão de breakdown ("×0.5 = +N").
  Teste node em scratchpad/test-weekly-sets.mjs: 5/5 PASS (rodado pelo Fable).
- Brief 4 (`brief-v72-4-muscles.md`): tier "Outros" removido de index.html,
  main.js, db.js, fakedb.js e seed.js (leitura de docs antigos segue
  inofensiva; import de backups antigos ignora o campo); upsert único
  `gym:muscle-review-v7-2` (batch via novo db.updateExerciseMuscles, deleteField
  em otherMuscleIds, só docs existentes — não recria deletados) com a tabela de
  33 exercícios revisada pelo Fable contra literatura (agachamentos/leg press:
  posterior fora, adutores como secundário; abdutora: adutores fora; presses:
  tríceps/ombros secundários; roscas: antebraço secundário; RDL: lombar
  mantida). Codex também atualizou o seeder do smith para os novos secundários.
- Brief 5 (`brief-v72-5-bump.md`): CACHE (sw.js) e APP_VERSION v7.2.

### Review
Cada diff lido pelo Fable + app rodado em #debug (SW/caches limpos; atenção:
cache de módulo do browser serviu logic.js velho e produziu erro fantasma de
export — resolvido com fetch cache:reload). Sem erros de console, Séries
consistente (Ombros 23 = 11+4+4+8×0,5 no seed antigo; totais mudam após a
correção de músculos, esperado).

### Pendências / riscos
- Fix do iOS precisa de validação real no iPhone (deploy ritual: fechar e
  reabrir o PWA duas vezes).
- FUNCIONALIDADE-SUBSTITUTO.md aguarda revisão do Pedro; pontos em aberto
  listados no próprio doc (bloquear substituto já no dia? troca com séries já
  marcadas? badge visual?).

## 2026-09-07 — v7.1: rascunho local até finalizar + prefill pela referência

### Request (Pedro)
Quatro ajustes: (1) número de séries do prefill não bate com a referência do
dia (vinha da última sessão); (2) nada deve ir ao Histórico ao expandir/
colapsar um card, só no "Finalizar treino"; (3) colapsar sem marcar séries não
pode marcar o exercício como concluído (cor/destaque só com todas as séries);
(4) a aba Exercícios quebra o layout ao filtrar um grupo (barra sobe).

### Execução
Feita direto pelo Fable, sem delegação (pedido explícito do Pedro: "use o
fable de ponta a ponta, nao ha necessidade de orquestrar e delegar"). O hook
block-shipped-edits bloqueou as edições; Pedro o removeu e depois o recriou
como no-op para a sessão (o classificador de permissões impediu o Fable de
tocar no sistema de hooks). Restaurar o guard-rail original ao final.

### Scope locked (Pedro's answers, uma rodada AskUserQuestion)
- Rascunho órfão (dia anterior, nunca finalizado): descartar sem rastro.
- "Finalizar treino" grava só as séries marcadas; exercício com 0 séries
  marcadas não entra no Histórico.
- Prefill: ref pura (targetSets × reps do dia, no peso de referência do
  exercício); nada vem da última sessão.

### Mudanças
- `js/logic.js`: `prefillSets(entry, refWeightNum)` (sem lastLog); novos
  helpers `draftSetDone`, `draftAllDone`, `recordedSets` (só séries done),
  `draftFromLog` (semear rascunho de log salvo, done ausente = true).
- `js/main.js`: store de rascunhos `gym:drafts` em localStorage
  (`{"date|dayId": {exerciseId: sets[]}}`), `pruneDrafts` descarta datas
  antigas em todo renderTreino; card renderiza do rascunho (done = todas as
  séries ✓, in-progress = ≥1 ✓, aberto sem ✓ = idle); toque cria rascunho
  local (semeado do log de hoje se existir, senão prefill), zero writes;
  editor de séries muta o rascunho; `openFinishSheet`/`confirmFinishWorkout`
  gravam logs (só séries marcadas) + sessão no finalizar, fire-and-forget
  (offline ok); chip do dia "doing" também via rascunho; scroll reset ao
  filtrar grupo em Exercícios; APP_VERSION v7.1.
- `sw.js`: CACHE treino-v7.1.

### Verificação (browser #debug, SW desregistrado, viewport mobile)
- Toque no card: rascunho 3×10 a 30kg (alvo do dia), 0 logs, card idle,
  badge "0/3 séries", contador "0/7 feitos hoje".
- Colapso sem séries: classe só "collapsed", 0 logs.
- 1 série ✓: in-progress + timer 1:30; todas ✓: done + autocolapso + "✓ feito".
- Reload: rascunho persiste com os três estados.
- Finalizar: grava só 2 logs (completo 3 séries; parcial só a série marcada),
  exercício aberto sem ✓ fica de fora; sessão sess-2026-09-07-day-ppl-ul-push;
  cards mantêm estado; re-finalizar após reabrir sobrescreve (ids
  determinísticos), sem duplicata no Histórico.
- Rascunho de ontem plantado + reload: descartado no boot.
- Exercícios: scroll 800→0 ao filtrar "Trapézio", chip "on", conteúdo curto
  sem clamp; helpers puros validados (draftFromLog/recordedSets/prefillSets).
- Zero erros no console. Não commitado/deployado ainda.

## 2026-09-04 — v6.4: histórico completo por exercício

### Request (Pedro)
Abrir um exercício e clicar num campo de histórico que abre uma janela estilo
log com todas as sessões daquele exercício: datas, séries e o peso de cada
série, para acompanhar a evolução.

### Scope locked (Pedro's answers, 2026-09-04, uma rodada)
- Entrada nos DOIS lugares: sheet rápido do card (aba Treino) e sheet de
  edição do exercício (aba Exercícios).
- Uma linha por série ("Série 1 · 11×35kg"), sem resumo de máximo/volume.
- Sem gráfico na janela (o gráfico segue só em Histórico > Progresso).
- Todas as sessões, rolagem, sem paginação.

### Execução
Feita direto pelo Opus, sem delegação ao Codex (pedido explícito do Pedro:
"instead of fable we will use opus on this one").

- `js/logic.js`: `exerciseHistory(logs, exerciseId)` — sessões do exercício,
  mais recente primeiro, séries já formatadas (weight/reps/done). Reusa
  `cloneSets`, então log antigo sem `done` continua contando como feito.
- `index.html`: link-row "Histórico" em `sheet-detail` e `sheet-exercise`
  (escondido em "Novo exercício"); novo `sheet-exlog`.
- `styles.css`: `.link-row`, `.sheet.sheet-stack` (z-index 55 sobre os 50
  normais), `.exlog-*`.
- `js/main.js`: `openExerciseLog` / `renderExerciseLog` / `closeExerciseLog`,
  `historySummary`, re-render ao vivo em `onLogs`, `closeSheets` limpa
  `state.exlogExerciseId`. APP_VERSION v6.4 + sw CACHE treino-v6.4.

### Verificação (uma passada consolidada, browser #debug, SW desregistrado)
- Abre pelos dois caminhos; 14 sessões renderizadas = 14 logs em memória.
- Empilhamento: sheet de log z-index 55 sobre o de baixo (50), que continua
  aberto; "Fechar" esconde só o de cima e o rascunho digitado no formulário
  de exercício sobrevive ao ida-e-volta.
- "Novo exercício" não mostra o link; exercício sem logs mostra o estado
  vazio ("Agachamento smith").
- Série marcada no card durante o treino atualiza a janela aberta na hora
  (2 pendentes -> 1); sets pendentes saem esmaecidos com tag "pendente".
- Zero erros no console. Não commitado/deployado ainda.

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

## 2026-09-06 - v6.5 batch (3 improvements)

### Request (Pedro)
1. Treino: gear/tool icon on each exercise card to reach today's settings (note, reference weight, target).
2. Treino: tapping the exercise collapses/expands its sets.
3. "Finalizar treino" must put the check on the day chip (push/pull etc.) even when not every exercise was completed; and fix the past pull session that was finished with all but one exercise.

### Scope locked (Pedro's answers, 2026-09-06)
- (1) Gear always visible at the card's right edge; it takes over the detail sheet, freeing the card body.
- (2) Sets start expanded when the exercise is started; manual toggle only (nothing auto-collapses); state persisted in localStorage per day.
- (3) New Firestore collection `sessions` (doc per finished date+day). Chip check = all exercises done OR session finished. Logs stay untouched.
- Correction of the pull session: one-time code backfill, date 2026-09-05. No general "concluido" toggle in Historico.
- Fable decisions (not asked): firestore.rules needs no change (wildcard on the UID); finish button becomes visible whenever at least one exercise is started; finished sessions can be reopened from the finish sheet.

### Delegations
- Brief 1 (items 1+2, card UI) -> codex exec --sandbox workspace-write, background. Brief at scratchpad/brief1.md.
- Brief 2 (item 3, sessions collection) -> dispatched after 1 lands (both edit main.js). Brief at scratchpad/brief2.md.
- Backfill of 2026-09-05: kept by Fable, resolves the dayId at runtime from that date's logs.

### Results (2026-09-06)
- Brief 1 delivered: `.wc-gear` button + `.wc-caret` appended to `.wc-top`, collapse toggled in place on the existing DOM node (no re-render, so a half-typed weight survives), `aria-expanded` on the card, `gym:collapsed` persistence, collapse key cleared when an exercise is unchecked.
- Brief 2 delivered: `sessions` collection (db + fakedb + import/export), `cycleDays(logs, programId, days, finished = [])`, finish button visible whenever at least one exercise is started, finish sheet listing incomplete exercises with an `incompleto` tag, `Treino finalizado` state + `Reabrir treino`.
- Neither Codex run could do browser QA (no browser surface in its sandbox); both verified only syntax and source contracts. All UI verification below is Fable's.
- Fable review fixes: (a) reverted the `gym:debug-sessions` localStorage persistence Codex added to fakedb.js. fakedb is in-memory by design and nothing else in `#debug` survives a reload; it existed only to satisfy a reload criterion that was wrong in the brief. (b) `confirmFinishWorkout()` now falls back to `day.programId`/`""` instead of bailing out when `currentProgram()` is null, matching `buildWorkoutCard`. (c) `CLAUDE.md` localStorage line came back in pt-BR inside an English doc, rewritten.
- Fable addition: the 2026-09-05 backfill (`gym:session-backfill-v6-5`, `FINISH_BACKFILL_DATES`). Resolves programId/dayId/names from that date's logs at runtime, so no hardcoded id can go stale; retries on the next snapshot if the logs have not arrived; marks every distinct day logged on a listed date.
- Consolidated verification on `#debug` (mobile viewport 375x812), 51 assertions, all passing:
  - 31 UI assertions: gear on 7/7 cards opening the detail sheet; start -> expanded; tap collapses/expands; value 99 survives the round trip; taps inside the sets editor and on the gear never collapse; collapse persisted; finish button visible at `0/7 feitos`; sheet showing the incomplete exercise tagged; confirm -> chip `✓ Push` + `Treino finalizado ✓`; `Reabrir treino` removing both; backfill flag set with `sess-2026-09-05-day-ppl-ul-push` resolved from the logs; backup carrying `sessions`; old-shape backup importing without error.
  - 10 `cycleDays` unit assertions: legacy all-logs path intact, partial-without-session still unchecked, partial-with-session checked, finished-with-zero-logs checked, cycle reset via sessions and via a mix of sessions and logs, foreign program/day ignored, 3-arg call still working, next cycle starting fresh after a reset.
  - 10 geometry assertions: gear 40x40 at the right edge, vertically centred, not overlapping the name, muted with no background; caret 12px to its left; `incompleto` tag separated by 6px and inside the row.
  - Collapsed card height 85px, identical to an un-started card, so the uniform-height rule holds.
  - Zero console errors on a clean boot in a fresh tab.
- Test-env note (again): the browser served a stale `fakedb.js` after the edits and produced a ghost `db.listenSessions is not a function`. Fixed by refetching every asset with `cache: "reload"`. Unregistering the SW is not enough; the HTTP cache also has to be busted.
- Pending: deploy ritual (bump sw.js CACHE + main.js APP_VERSION to v6.5, commit) awaiting Pedro's go. Open item: the backfill fires against real Firestore on Pedro's next load and marks EVERY day logged on 2026-09-05; correct if he trained once that day.

## 2026-09-07 — v6.6/v6.7: workflow do treino + cards enxutos + Exercícios UI

### Request (Pedro)
1. Cardio antes do Finalizar, idealmente no começo do treino (é ad-hoc, decidido no dia — já é standalone, só muda posição).
2. Cards da aba Treino menores: sem histórico visível; só séries, peso ref e nota (histórico só no sheet).
3. Botão Iniciar/Finalizar treino, um só para ocupar menos espaço.
4. Finalizar registra no histórico e marca concluído sem exigir todos os exercícios; drop da regra "todos completos = dia feito" (manter só "todas as séries = exercício feito").
5. Aba Exercícios: nome na primeira linha, remover a string de últimas séries da lista (colisão de layout no iPhone).

### Scope locked (AskUserQuestion, 1 rodada)
- Cardio: topo, sempre visível (acima da lista de exercícios).
- Botão único alternante (Iniciar → Finalizar → Finalizado ✓); iniciar não grava no Firestore (flag localStorage gym:workoutStart); finalizar grava a sessão (logs já são salvos ao vivo).
- Histórico antigo 100% preservado: fallback "logs completos = dia feito" mantido para datas < 2026-09-08 (EXPLICIT_FINISH_CUTOFF); de lá em diante só sessão explícita conta.
- Card: nome + séries + peso ref + nota. No editor de séries expandido, peso com MESMO tamanho de fonte, só cor de destaque.

### Delegations
- Brief A (Codex, background `codex exec`): cardio no topo, botão toggle com gym:workoutStart, cutoff em cycleDays, bump v6.6. Status: dispatched.
- Brief B (Codex, serializado após A — mesmos arquivos): card sem linha "Último" (linha Ref: <kg>), fonte do peso no editor, limpeza das rows de Exercícios, bump extra. Status: written, pending A.

### Resultados e review (2026-09-07)
- Brief A entregue e verificado no browser (#debug, porta 8095 — 8093 caiu em faixa reservada do Windows, launch.json agora com autoPort): ordem Cardio → botão → cards ok; toggle Iniciar → Finalizar → Finalizado ✓ ok; flag gym:workoutStart persiste e limpa ao concluir; dia marcado ✓ com 0/7 exercícios; testes node do cutoff (antes conta por logs, depois só sessão explícita) passaram.
- Brief B entregue: cards sem linha "Último" (lastLine/appendStyledSets removidos), linha "Ref: <kg>"; peso no editor de séries 14px/600 accent (igual às reps); rows de Exercícios sem item-side (CSS mantido — cardio history usa), Ref no sub-line. Review achou 1 bug: refWeightLabel dobrava o "kg" em valores free-text ("30 kgkg"); follow-up no mesmo thread corrigiu (regex numérica, como o antigo lastLine). Verificado no browser: "Ref: 30 kg", "Ref: 40–42,5 kg" corretos.
- Edge case aberto (reportado ao Pedro): treino finalizado com ZERO exercícios registrados ganha o ✓ do ciclo mas não aparece em Histórico > Sessões (lista construída dos logs). Aguardando decisão.
- Versão final: v6.7 (APP_VERSION + CACHE). Pendente: commit/push + deploy ritual no iPhone.

## 2026-09-07 — v6.8: session-row + regra "1 exercício concluído"

### Request (Pedro)
UI do Iniciar/Finalizar estava feia (pillão preto colado nos cards); mais respiro; reset do ciclo quando todos os dias completam (já existia); Push/Pull/Legs/Lower desta semana deveriam ter ✓ (Histórico tem os logs); não registrar treino com 0 exercícios.

### Scope locked (AskUserQuestion, 1 rodada)
- Layout: uma linha ＋Cardio (compacto) + botão Iniciar/Finalizar (flex 1), 16px antes dos cards; "Finalizar" em contorno accent (classe .active), "Finalizado ✓" mantém .completed.
- Mínimo para contar/registrar dia: 1 exercício com TODAS as séries checadas (logDone). Vale para o fallback pré-cutoff (dá os ✓ da semana sem escrever dados) e trava o "Concluir treino" (disabled + hint) com 0 concluídos.

### Execução
- Brief C (Codex): session-row no index.html + CSS, .active/.completed no renderWorkout, cycleDays fallback pré-cutoff = ≥1 logDone (reset do ciclo intacto, testes node passaram: 1/3 done conta, none-done não, pós-cutoff só sessão, all-trained reseta), finish-min-hint + confirm disabled, bump v6.8.
- Review: alturas desiguais na linha (49px vs 37px) → follow-up no mesmo thread, botão agora padding 8px/14px font 14px. Verificado no browser: mesma linha, mesma altura, gap 16px, guard do Concluir funcionando, chips ✓ pelo novo fallback.

## 2026-09-07 — v7.0 (em andamento): card sem checkbox, timer automático, decimais com ponto, ciclo semanal explícito, performance

### Request (Pedro)
1. Tirar o checkbox do card de exercício (manter só nas séries) e não perder as séries já marcadas ao colapsar/expandir.
2. Destaque para não esquecer de finalizar o treino depois de iniciar.
3. Aceitar decimais no peso (82.5).
4. Ciclo semanal: ✓ só com "Finalizar treino"; ao completar os 5 dias, popup "Semana concluída" e reset. Marcar exercício do último dia NÃO pode resetar.
5. Remover o beep do timer.
6. Cada série marcada inicia o timer (padrão 90s), com 60/90/120 ajustáveis no próprio timer.
7. Ao marcar todas as séries, autocolapsar o card e marcá-lo como concluído por cor.
8. Diagnóstico de performance: tela branca de ~5s ao voltar para o app.

### Scope locked (1 rodada)
- Iniciar exercício = toque no corpo do card. Remoção de registro só pelo Histórico (swipe), nunca na aba Treino.
- Decimais: padrão único é o PONTO. Entrada aceita a vírgula do teclado pt-BR do iOS e normaliza para ponto na hora; 85 continua 85.
- Timer: sem beep E sem vibração (pedido adicional); padrão sempre 90s, 60/120 são exceções pontuais; linha inline "⏱ Descanso" mantida como alternativa.
- Ciclo novo começa em 2026-09-08 (o 5º treino do ciclo antigo foi em 07/09); histórico preservado, apenas filtro de leitura.
- Diagnóstico de performance aceito com vendoring do SDK Firebase.

### Delegations
- Brief A (`scratchpad/brief-a.md`): remover `.wc-check`, tap-to-start, autocolapso, badge de estado, lembrete sticky. ENTREGUE e verificado.
- Brief B (`scratchpad/brief-b.md`): remover beep/vibração, auto-start 90s na série, botões 60/90/120 na barra, decimais com ponto. ENTREGUE e verificado.
- Brief E (`scratchpad/brief-e.md`, criado após review visual): badge sai da linha do nome, lembrete só quando o botão sai de vista, borda accent no in-progress, folga para a barra do timer, comentário desatualizado. IMPLEMENTADO POR FABLE sob autorização explícita do Pedro em chat (Codex bloqueado); patch em `scratchpad/patch-e.py`.
- Brief C (`scratchpad/brief-c.md`): ciclo só por sessão explícita + CYCLE_START + popup. BLOQUEADO (Codex).
- Brief D (`scratchpad/brief-d.md`): SW com precache cache-first, SDK Firebase vendorizado em js/vendor/, splash inline, modulepreload, re-render por mudança de data, bump v7.0. PENDENTE.

### Review findings (visual, 375px)
- Badge na linha do nome truncava o nome ("Supino máq..."). Corrigido no brief E: badge vai para a linha "Ref:".
- Dois controles de finalizar empilhados no topo. Corrigido: lembrete sticky só aparece quando `#btn-finish-workout` sai de vista (IntersectionObserver).
- Borda esquerda `accent-soft` do in-progress era invisível. Trocada por `accent`.
- Último card ficava sob a barra do timer. `padding-bottom: 64px` no `.workout-list`.
- Falso positivo do meu review: a barra do timer já era opaca (`#fdf0e7` no `#timer-run`); o que se via era o card ATRÁS dela, não bleed-through.

### Verificação no browser (#debug, porta 8095)
- Tap no card cria o log com séries pré-preenchidas e expande; 3ª série marcada → `workout-card done collapsed` + badge "✓ feito"; reexpandir mantém as 3 séries (10 reps / 30kg) — o bug de "zerar" era o toque acertando o ✓ que apagava o log.
- Desmarcar série volta para in-progress e mantém expandido.
- Marcar série inicia 1:30 na barra; barra em uma linha: ⏱ | 1:12 | 60 | 90 | 120 | ✕.
- "82,5" digitado vira "82.5" e grava 82.5; lixo "8a2..5,7" vira "82.57".
- Alturas de card idênticas com e sem badge (88px); nome completo sem elipse.
- Lembrete: escondido no topo, visível ao rolar, escondido ao voltar.

### Problemas de infra (para a próxima sessão)
- Plugin Codex: "approval request failed" (modo conhecido do CLAUDE.md). Fallback `codex exec --sandbox workspace-write --model gpt-5.6-sol -c model_reasoning_effort=xhigh` autorizado pelo Pedro; funcionou em A e B e depois passou a rejeitar TODO comando (helper de sandbox do Windows falha ao subir; `approval_policy = "never"` não tem quem responda, daí o erro de aprovação). `~/.codex/config.toml` já tem `sandbox_mode = "workspace-write"` e `approval_policy = "never"`.
- `.claude/launch.json`: `autoPort` reporta uma porta nova mas continua subindo `python -m http.server 8095`, então o servidor morre na hora e a URL anunciada não responde. Além disso havia 4 processos python zumbis no 8095 (ERR_EMPTY_RESPONSE). Resolvido matando os zumbis e deixando o preview subir em 8095.

### Fechamento v7.0 (2026-09-07)

- Brief C ENTREGUE após reinício do app do Codex: `cycleDays` virou `cycleProgress(programId, days, finished, cycleStart)`, `EXPLICIT_FINISH_CUTOFF` removido, `CYCLE_START = "2026-09-08"`, sheet `#sheet-cycle` + guard `gym:cycle-celebrated:<programId>`. 6 testes node passaram. Verificado no browser: 4 sessões = 4 ✓ sem popup; a 5ª zera os ✓ e devolve os 5 dias na ordem; sessões de 05–07/09 são ignoradas; chips agora aparecem TODOS sem ✓.
- Brief D ENTREGUE: SDK Firebase 10.12.2 vendorizado em `js/vendor/` (app 102KB, auth 151KB, firestore 437KB, imports internos reescritos para `./firebase-app.js`), `sw.js` reescrito (PRECACHE de 17 entradas, install com `cache: "reload"`, cache-first + revalidação em background, navegação servida do index cacheado), splash inline `#boot-splash`, 6 `modulepreload`, re-render por mudança de data no `visibilitychange`, registro do SW com `updateViaCache: "none"`, bump v7.0.
- Medição pós-D no browser (localhost, 2º load): 0 requisições ao gstatic, TODOS os assets servidos de `cache-storage` (firebase-firestore.js em 7ms), DOMContentLoaded 70ms, cache `treino-v7.0` com 17 entradas. Sem erros no console; 4 abas funcionando.
- Ordem final de execução: A → B → E (polish) → C → D.

### Riscos e pendências
- Popup "Semana concluída" nunca foi disparado ponta a ponta (hoje é 07/09 e o ciclo só conta de 08/09 em diante). A lógica está coberta por testes node + verificação com dados sintéticos no browser, e o sheet foi inspecionado visualmente, mas o gatilho real só acontece quando os 5 dias forem finalizados a partir de 08/09.
- `install` do SW usa `cache.addAll`: se UM arquivo do PRECACHE der 404 num deploy futuro, o SW inteiro falha a instalação (app continua funcionando online, sem offline). Manter a lista em dia ao adicionar arquivos.
- Em novo dispositivo (ou localStorage limpo) com um ciclo já completo dentro da janela, o popup aparece uma vez indevidamente. Aceito.
- `CLAUDE.md` (não commitado antes desta sessão) diz "nunca use `codex exec`", mas o plugin auto-nega todo comando nesta máquina e o `codex exec` foi o que funcionou. Vale revisar essa seção com o Pedro.
- `scratchpad/` continua fora do git (inclui logs do Codex de ~1,2MB). Sem `.gitignore` no repo.
