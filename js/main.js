// Treino: UI layer. Same architecture as MercadoJa: one main module,
// direct DOM, hash-free tab navigation, optimistic writes through db.js.
// Firestore's local cache gives latency compensation: every write below
// fires the relevant onSnapshot immediately, so the UI re-renders from a
// single source of truth and still feels instant (and works offline).

// Open the app with #debug to preview every screen and flow with sample
// in-memory data (six weeks of history), no Firebase needed.
import * as realDb from "./db.js";
import * as fakeDb from "./fakedb.js";
const db = location.hash === "#debug" ? fakeDb : realDb;
import {
  normalize,
  todayStr,
  fmtDate,
  fmtDateShortMonth,
  fmtDateFull,
  addDaysStr,
  weekStartStr,
  logDocId,
  prefillSets,
  resolveWorkoutExercise,
  draftHasExerciseSets,
  draftSetDone,
  draftAllDone,
  recordedSets,
  draftFromLog,
  cycleProgress,
  entryReps,
  normalizeDecimalInput,
  parseDecimal,
  parseRefWeight,
  targetLabel,
  setsLabel,
  groupSessions,
  progressionSeries,
  exercisesFromLogs,
  exerciseHistory,
  weeklyFrequency,
  weeklyMuscleSets,
  weeklyCardio,
  dailyCardio,
  monthlyCardio,
  sortByOrder,
  sortExercises,
} from "./logic.js";
import { lineChart, barChart } from "./charts.js";

// Shown in Ajustes so anyone can tell which deploy a phone is running.
// Keep in sync with CACHE in sw.js.
const APP_VERSION = "v7.3";

const $ = (id) => document.getElementById(id);

const COLLAPSED_KEY = "gym:collapsed";
let collapsedCards = new Set();
try {
  const stored = JSON.parse(localStorage.getItem(COLLAPSED_KEY) || "[]");
  collapsedCards = new Set(Array.isArray(stored) ? stored.filter((key) => typeof key === "string") : []);
} catch {
  collapsedCards = new Set();
}

function saveCollapsedCards() {
  localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsedCards]));
}

// ---------- workout drafts ----------
// A workout in progress lives ONLY here (localStorage) until "Finalizar
// treino" writes it to Firestore: expanding/collapsing cards and checking
// sets never touch the history. Shape:
// { "date|dayId": { exerciseId: sets[], __subs: { originalId: substituteId } } }.
// Drafts from previous dates are pruned: an unfinished workout is discarded.

const DRAFTS_KEY = "gym:drafts";
let drafts = {};
try {
  const stored = JSON.parse(localStorage.getItem(DRAFTS_KEY) || "{}");
  if (stored && typeof stored === "object" && !Array.isArray(stored)) drafts = stored;
} catch {
  drafts = {};
}

function saveDrafts() {
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
}

function pruneDrafts(today) {
  let changed = false;
  Object.keys(drafts).forEach((key) => {
    if (key.startsWith(`${today}|`)) return;
    delete drafts[key];
    changed = true;
  });
  if (changed) saveDrafts();
}

const draftKeyOf = (date, dayId) => `${date}|${dayId}`;

function dayDraftFor(date, dayId) {
  const dayDraft = drafts[draftKeyOf(date, dayId)];
  return dayDraft && typeof dayDraft === "object" && !Array.isArray(dayDraft) ? dayDraft : null;
}

function draftSetsFor(date, dayId, exerciseId) {
  const sets = dayDraftFor(date, dayId)?.[exerciseId];
  return Array.isArray(sets) ? sets : null;
}

function setDraftSets(date, dayId, exerciseId, sets) {
  const key = draftKeyOf(date, dayId);
  if (!drafts[key]) drafts[key] = {};
  drafts[key][exerciseId] = sets;
  saveDrafts();
}

function setDraftSubstitution(date, dayId, originalExerciseId, substituteExerciseId) {
  const key = draftKeyOf(date, dayId);
  if (substituteExerciseId) {
    if (!dayDraftFor(date, dayId)) drafts[key] = {};
    const subs = drafts[key].__subs;
    if (!subs || typeof subs !== "object" || Array.isArray(subs)) drafts[key].__subs = {};
    drafts[key].__subs[originalExerciseId] = substituteExerciseId;
  } else {
    const dayDraft = dayDraftFor(date, dayId);
    if (dayDraft?.__subs && typeof dayDraft.__subs === "object") {
      delete dayDraft.__subs[originalExerciseId];
      if (Object.keys(dayDraft.__subs).length === 0) delete dayDraft.__subs;
    }
    if (dayDraft && Object.keys(dayDraft).length === 0) delete drafts[key];
  }
  saveDrafts();
}

function discardDraftSets(date, dayId, exerciseId) {
  const key = draftKeyOf(date, dayId);
  const dayDraft = dayDraftFor(date, dayId);
  if (!dayDraft) return;
  delete dayDraft[exerciseId];
  if (Object.keys(dayDraft).length === 0) delete drafts[key];
}

function dayDraftStarted(date, dayId) {
  return draftHasExerciseSets(dayDraftFor(date, dayId));
}

function workoutStarted(date, dayId) {
  const stored = localStorage.getItem("gym:workoutStart");
  if (!stored) return false;
  const separator = stored.indexOf("|");
  if (separator < 0 || stored.slice(0, separator) !== date) {
    localStorage.removeItem("gym:workoutStart");
    return false;
  }
  return stored === `${date}|${dayId}`;
}

// ---------- state ----------

const state = {
  muscles: [], // sorted by order
  exercises: [],
  exercisesById: new Map(),
  programs: [], // sorted by order
  days: [],
  logs: [],
  logsById: new Map(),
  sessions: [],
  cardioTypes: [], // sorted by order
  cardio: [],
  tab: "treino",
  programId: localStorage.getItem("gym:program") || null,
  dayId: localStorage.getItem("gym:day") || null,
  search: "",
  muscleFilters: new Set(),
  histView: "sessoes",
  cardioChartView: "week",
  seriesWeekOffset: 0,
  seriesOpenMuscleId: null,
  progExerciseId: null,
  editingExerciseId: null,
  editingDayId: null,
  detailExerciseId: null,
  detailEffectiveExerciseId: null,
  exlogExerciseId: null, // exercise shown in the full-log sheet
  reorderMode: false,
  draftEntries: [], // day sheet: [{exerciseId, targetSets, repMin, repMax}]
  draftPrimaryMuscleId: null,
  draftSecondary: new Set(), // exercise sheet muscle picks
  draftSimilarIds: new Set(), // immediate-save links shown in the exercise sheet
  seededMuscles: false,
  seededExercises: false,
  seededPrograms: false,
  seededCardioTypes: false,
  listenersStarted: false,
  lastTreinoRenderDate: null,
};

// ---------- tiny UI helpers ----------

let toastTimer = null;
function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2600);
}

function openSheet(id) {
  $("sheet-backdrop").hidden = false;
  $(id).hidden = false;
}

function closeSheets() {
  state.exlogExerciseId = null;
  state.detailExerciseId = null;
  state.detailEffectiveExerciseId = null;
  $("sheet-backdrop").hidden = true;
  document.querySelectorAll(".sheet").forEach((s) => (s.hidden = true));
}

function muscleName(id) {
  return state.muscles.find((m) => m.id === id)?.name || "";
}

function muscleSummary(ex) {
  const extras = (ex.secondaryMuscleIds || []).map(muscleName).filter(Boolean);
  const main = muscleName(ex.primaryMuscleId);
  if (!main) return extras.join(", ");
  return extras.length > 0 ? `${main} · ${extras.join(", ")}` : main;
}

const currentProgram = () => state.programs.find((p) => p.id === state.programId) || null;
const currentDay = () => state.days.find((d) => d.id === state.dayId) || null;
const daysOf = (programId) =>
  sortByOrder(state.days.filter((d) => d.programId === programId));
const sessionId = (date, dayId) => `sess-${date}-${dayId}`;
const finishedSession = (date, dayId) =>
  state.sessions.find((session) => session.id === sessionId(date, dayId)) || null;

function refWeightLabel(refWeight) {
  if (!refWeight) return "";
  const value = String(refWeight).trim();
  const parsed = parseDecimal(value);
  return /^\d+(?:[.,]\d+)?$/.test(value) && parsed !== null ? `${String(parsed)}kg` : value;
}

function numericRefWeight(id) {
  const normalized = normalizeDecimalInput($(id).value.trim());
  const value = parseDecimal(normalized);
  return normalized === "" || value === null ? "" : String(Math.max(0, value));
}

// ---------- treino ----------

function selectDefaults() {
  const previousProgramId = state.programId;
  const previousDayId = state.dayId;
  // Heal stale localStorage selections (deleted program/day).
  if (!currentProgram()) {
    state.programId = state.programs[0]?.id || null;
    localStorage.setItem("gym:program", state.programId || "");
  }
  const days = state.programId ? daysOf(state.programId) : [];
  if (!days.some((d) => d.id === state.dayId)) {
    state.dayId = days[0]?.id || null;
    localStorage.setItem("gym:day", state.dayId || "");
  }
  if (state.programId !== previousProgramId || state.dayId !== previousDayId) {
    state.reorderMode = false;
  }
}

function renderTreino() {
  selectDefaults();
  const today = todayStr();
  state.lastTreinoRenderDate = today;
  pruneDrafts(today);

  const select = $("program-select");
  select.innerHTML = "";
  state.programs.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    if (p.id === state.programId) opt.selected = true;
    select.appendChild(opt);
  });

  const chipsEl = $("day-chips");
  chipsEl.innerHTML = "";
  const days = state.programId ? daysOf(state.programId) : [];
  const trainedDays = cycleProgress(state.programId, days, state.sessions).trained;
  days.forEach((day) => {
    const chip = document.createElement("button");
    chip.type = "button";
    const inProgress =
      !trainedDays.has(day.id) &&
      (workoutStarted(today, day.id) || dayDraftStarted(today, day.id));
    chip.className = "chip" + (day.id === state.dayId ? " on" : "") + (inProgress ? " doing" : "");
    chip.textContent = trainedDays.has(day.id) ? `✓ ${day.name}` : day.name;
    chip.addEventListener("click", () => {
      state.reorderMode = false;
      state.dayId = day.id;
      localStorage.setItem("gym:day", day.id);
      renderTreino();
    });
    chipsEl.appendChild(chip);
  });
  const addChip = document.createElement("button");
  addChip.type = "button";
  addChip.className = "chip";
  addChip.textContent = "＋ dia";
  addChip.disabled = !state.programId;
  addChip.addEventListener("click", () => openDaySheet(null));
  chipsEl.appendChild(addChip);

  $("btn-edit-day").hidden = !state.dayId;
  const reorderBtn = $("btn-reorder");
  const canReorder = !!state.dayId && (currentDay()?.entries || []).length >= 2;
  if (!canReorder) state.reorderMode = false;
  reorderBtn.hidden = !canReorder;
  reorderBtn.classList.toggle("on", state.reorderMode);
  reorderBtn.setAttribute("aria-pressed", String(state.reorderMode));
  renderWorkout();
}

function openCardioSheet() {
  const select = $("cardio-type");
  select.innerHTML = "";
  state.cardioTypes.forEach((type) => {
    const option = document.createElement("option");
    option.value = type.id;
    option.textContent = type.name;
    select.appendChild(option);
  });
  updateCardioTypeNote();
  $("cardio-minutes").value = "";
  $("cardio-note").value = "";
  openSheet("sheet-cardio");
}

function updateCardioTypeNote() {
  const type = state.cardioTypes.find((item) => item.id === $("cardio-type").value);
  const note = $("cardio-type-note");
  note.textContent = type?.note || "";
  note.hidden = !type?.note;
}

function submitCardio(e) {
  e.preventDefault();
  const type = state.cardioTypes.find((item) => item.id === $("cardio-type").value);
  const minutes = Math.floor(Number($("cardio-minutes").value));
  if (!type || !(minutes > 0)) return;
  db.createCardio({
    date: todayStr(),
    typeId: type.id,
    typeName: type.name,
    minutes,
    note: $("cardio-note").value.trim(),
  })
    .then(() => {
      closeSheets();
      toast("Cardio registrado.");
    })
    .catch(() => toast("Erro ao registrar cardio."));
}

// The reminder duplicates the session-row button, so it is only worth showing
// once that button has scrolled out of view. finishBtnVisible starts true when
// IntersectionObserver exists (the button is on screen at the top of the tab);
// without the API it stays false and the reminder falls back to always showing.
let reminderAllowed = false;
let finishBtnVisible = typeof IntersectionObserver === "function";
let finishBtnObserver = null;

function watchFinishButton() {
  if (finishBtnObserver || typeof IntersectionObserver !== "function") return;
  finishBtnObserver = new IntersectionObserver((entries) => {
    finishBtnVisible = entries.some((entry) => entry.isIntersecting);
    updateReminderVisibility();
  });
  finishBtnObserver.observe($("btn-finish-workout"));
}

function updateReminderVisibility() {
  const reminder = $("workout-finish-reminder");
  if (reminder) reminder.hidden = !reminderAllowed || finishBtnVisible;
}

function ensureWorkoutReminder(listEl) {
  let reminder = $("workout-finish-reminder");
  if (reminder) return reminder;

  reminder = document.createElement("div");
  reminder.id = "workout-finish-reminder";
  reminder.className = "workout-reminder";

  const text = document.createElement("span");
  text.className = "workout-reminder-text";
  const finish = document.createElement("button");
  finish.type = "button";
  finish.className = "workout-reminder-finish";
  finish.textContent = "Finalizar";
  finish.addEventListener("click", toggleWorkout);
  reminder.append(text, finish);
  listEl.before(reminder);
  watchFinishButton();
  return reminder;
}

function renderWorkout() {
  const listEl = $("workout-list");
  const reminder = ensureWorkoutReminder(listEl);
  listEl.innerHTML = "";
  listEl.classList.toggle("reordering", state.reorderMode);
  const day = currentDay();
  const today = todayStr();
  const finishBtn = $("btn-finish-workout");
  const startedByTap = workoutStarted(today, day?.id);
  finishBtn.hidden = !day;

  $("workout-noday").hidden = !!day || state.programs.length === 0;
  if (!day) {
    reminderAllowed = false;
    updateReminderVisibility();
    $("workout-empty").hidden = true;
    $("day-progress").textContent = "";
    if (state.programs.length === 0) {
      $("workout-noday").hidden = false;
      $("workout-noday").textContent = "Crie um programa em Gerenciar.";
    }
    return;
  }

  const entries = day.entries || [];
  $("workout-empty").hidden = entries.length > 0;

  let done = 0;
  entries.forEach((entry) => {
    if (draftAllDone(draftSetsFor(today, day.id, entry.exerciseId))) done++;
    listEl.appendChild(buildWorkoutCard(entry, day));
  });
  $("day-progress").textContent =
    entries.length > 0 ? `${done}/${entries.length} feitos hoje` : "";
  const hasLogs = state.logs.some((log) =>
    log.date === today && log.programId === day.programId && log.dayId === day.id
  );
  const isFinished = !!finishedSession(today, day.id);
  const isStarted = startedByTap || dayDraftStarted(today, day.id) || hasLogs;
  finishBtn.textContent = isFinished
    ? "Treino finalizado ✓"
    : isStarted ? "Finalizar treino" : "Iniciar treino";
  finishBtn.classList.toggle("active", isStarted && !isFinished);
  finishBtn.classList.toggle("completed", isFinished);
  const allDone = done === entries.length && entries.length > 0;
  reminderAllowed = isStarted && !isFinished;
  updateReminderVisibility();
  reminder.classList.toggle("complete", allDone);
  reminder.querySelector(".workout-reminder-text").textContent = allDone
    ? "Todos os exercícios feitos"
    : "Treino em andamento";
  makeDraggableList(listEl);
}

// Edit-mode reorder for workout cards. A placeholder stays in the flex list
// while the lifted card follows the pointer, so mouse and touch share the same
// compact implementation. renderWorkout() calls this on every render, so the
// listeners are wired to the persistent #workout-list only once; the day is
// re-resolved at drop time (a captured one would go stale across renders).
function makeDraggableList(list) {
  if (list.dataset.dragWired) return;
  list.dataset.dragWired = "1";
  let pending = null;
  let drag = null;

  const clearPending = () => {
    if (!pending) return;
    pending = null;
  };

  const lift = () => {
    if (!pending || !pending.card.isConnected) return;
    const { card, pointerId, y } = pending;
    const rect = card.getBoundingClientRect();
    const placeholder = document.createElement("div");
    placeholder.className = "workout-placeholder";
    placeholder.style.height = `${rect.height}px`;
    card.before(placeholder);
    card.classList.add("dragging");
    Object.assign(card.style, {
      position: "fixed",
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      margin: "0",
    });
    drag = { card, placeholder, pointerId, offsetY: y - rect.top };
    pending = null;
    // Pointer capture can throw if the pointer ended during setup; finish() still
    // cleans up via the drag object, so the card can never stay stuck.
    try { card.setPointerCapture?.(pointerId); } catch { /* keep dragging uncaptured */ }
  };

  const movePlaceholder = (clientY) => {
    const center = clientY - drag.offsetY + drag.card.offsetHeight / 2;
    const cards = [...list.querySelectorAll(".workout-card:not(.dragging)")];
    const before = cards.find((card) => center < card.getBoundingClientRect().top + card.offsetHeight / 2);
    if (before) list.insertBefore(drag.placeholder, before);
    else list.appendChild(drag.placeholder);
  };

  const finish = () => {
    clearPending();
    if (!drag) return;
    const { card, placeholder } = drag;
    placeholder.replaceWith(card);
    card.classList.remove("dragging");
    card.removeAttribute("style");
    card.dataset.suppressClick = "true";
    setTimeout(() => delete card.dataset.suppressClick, 400);
    drag = null;

    const day = currentDay();
    if (!day) return;
    const byExercise = new Map((day.entries || []).map((entry) => [entry.exerciseId, entry]));
    const entries = [...list.querySelectorAll(".workout-card")]
      .map((item) => byExercise.get(item.dataset.exerciseId))
      .filter(Boolean);
    if (entries.some((entry, index) => entry !== day.entries[index])) {
      db.updateDay(day.id, { name: day.name, entries }).catch(() => toast("Erro ao salvar ordem."));
    }
  };

  list.addEventListener("pointerdown", (e) => {
    if (!state.reorderMode) return;
    if (e.button !== undefined && e.button !== 0) return;
    if (e.target.closest("button, input, select, textarea, a, .sets-editor")) return;
    const card = e.target.closest(".workout-card");
    if (!card || !list.contains(card)) return;
    clearPending();
    pending = {
      card,
      pointerId: e.pointerId,
      y: e.clientY,
    };
    lift();
  });

  list.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    e.preventDefault();
    drag.card.style.top = `${e.clientY - drag.offsetY}px`;
    movePlaceholder(e.clientY);
  }, { passive: false });

  // iOS needs a non-passive touch listener to stop page scrolling after lift.
  list.addEventListener("touchmove", (e) => {
    if (drag) e.preventDefault();
  }, { passive: false });
  list.addEventListener("pointerup", finish);
  list.addEventListener("pointercancel", finish);
  list.addEventListener("pointerleave", (e) => {
    if (pending && e.pointerId === pending.pointerId) clearPending();
  });
}

// Compact card, uniform height: name + target, reference line, one-line
// note. The card body toggles its sets; the gear opens the detail sheet.
// The card renders from the local draft, never from saved logs: "done"
// (peach fill) needs every set checked, the in-progress accent edge needs
// at least one; a merely opened card looks idle.
function buildWorkoutCard(entry, day) {
  const today = todayStr();
  const resolved = resolveWorkoutExercise(entry, dayDraftFor(today, day.id), state.exercisesById);
  const ex = resolved.exercise;
  const sets = draftSetsFor(today, day.id, entry.exerciseId);
  const started = !!sets;
  const doneCount = started ? sets.filter(draftSetDone).length : 0;
  const isDone = started && draftAllDone(sets);
  const inProgress = started && doneCount > 0 && !isDone;
  const collapsedKey = `${day.id}|${entry.exerciseId}`;
  const isCollapsed = started && collapsedCards.has(collapsedKey);

  const card = document.createElement("div");
  card.className = "workout-card" + (isDone ? " done" : inProgress ? " in-progress" : "") + (isCollapsed ? " collapsed" : "");
  card.dataset.exerciseId = entry.exerciseId;
  card.setAttribute("aria-expanded", String(!isCollapsed));

  const top = document.createElement("div");
  top.className = "wc-top";

  const main = document.createElement("div");
  main.className = "wc-main";

  const nameLine = document.createElement("div");
  nameLine.className = "wc-nameline";
  const name = document.createElement("span");
  name.className = "wc-name";
  name.textContent = ex?.name || "(exercício removido)";
  nameLine.appendChild(name);
  const target = targetLabel(entry);
  if (target) {
    const t = document.createElement("span");
    t.className = "wc-target";
    t.textContent = target;
    nameLine.appendChild(t);
  }
  main.appendChild(nameLine);

  if (resolved.substituted) {
    const substitution = document.createElement("span");
    substitution.className = "wc-substitution";
    substitution.textContent = `no lugar de: ${resolved.originalExercise?.name || entry.exerciseId}`;
    main.appendChild(substitution);
  }

  // Reference line carries the status badge on its right: the name line stays
  // free so a long exercise name is not truncated by a badge.
  const ref = document.createElement("span");
  ref.className = "wc-ref";
  const refText = document.createElement("span");
  refText.className = "wc-ref-text";
  const refWeight = refWeightLabel(ex?.refWeight);
  refText.textContent = refWeight ? `Ref: ${refWeight}` : "";
  if (!refWeight) refText.innerHTML = "&nbsp;";
  ref.appendChild(refText);
  if (started) {
    const status = document.createElement("span");
    status.className = "wc-status";
    status.textContent = isDone ? "✓ feito" : `${doneCount}/${sets.length} séries`;
    ref.appendChild(status);
  }
  main.appendChild(ref);

  // always rendered (possibly empty) so every card has the same height
  const note = document.createElement("span");
  note.className = "wc-note";
  note.textContent = ex?.note ? ex.note.replace(/\n/g, " · ") : "";
  if (!ex?.note) note.innerHTML = "&nbsp;";
  main.appendChild(note);

  top.append(main);

  const caret = document.createElement("span");
  caret.className = "wc-caret";
  caret.textContent = "⌄";
  caret.setAttribute("aria-hidden", "true");
  top.appendChild(caret);

  if (ex) {
    const gear = document.createElement("button");
    gear.type = "button";
    gear.className = "wc-gear";
    gear.textContent = "⚙";
    gear.setAttribute("aria-label", `Ajustes de ${ex.name}`);
    gear.addEventListener("click", (e) => {
      e.stopPropagation();
      openDetailSheet(entry.exerciseId);
    });
    top.appendChild(gear);
  }

  card.appendChild(top);

  card.addEventListener("click", (e) => {
    if (state.reorderMode) return;
    if (card.dataset.suppressClick) return;
    if (e.target.closest(".sets-editor, .wc-gear")) return;
    if (!started) {
      if (collapsedCards.delete(collapsedKey)) saveCollapsedCards();
      clearFinishedTimer();
      // Local draft only, no Firestore write. Seed from today's already-saved
      // log when there is one (finished + reopened day), else from the target.
      const savedLog = state.logsById.get(
        logDocId({ date: today, dayId: day.id, exerciseId: resolved.exerciseId })
      );
      const seed = savedLog && Array.isArray(savedLog.sets) && savedLog.sets.length > 0
        ? draftFromLog(savedLog)
        : prefillSets(entry, parseRefWeight(ex?.refWeight));
      setDraftSets(today, day.id, entry.exerciseId, seed);
      renderTreino();
      return;
    }

    const collapsed = card.classList.toggle("collapsed");
    card.setAttribute("aria-expanded", String(!collapsed));
    if (collapsed) collapsedCards.add(collapsedKey);
    else collapsedCards.delete(collapsedKey);
    saveCollapsedCards();
  });

  if (started) card.appendChild(buildSetsEditor(entry, day, sets));
  return card;
}

// ---------- quick-detail sheet (tap on a workout card) ----------
// Edits the things you touch mid-workout: this day's target (sets x reps),
// the reference weight and the machine-adjustment note. Name and muscles
// are edited in the Exercícios tab.

function openDetailSheet(exerciseId) {
  const day = currentDay();
  const entry = (day?.entries || []).find((e) => e.exerciseId === exerciseId);
  if (!day || !entry) return;
  const resolved = resolveWorkoutExercise(entry, dayDraftFor(todayStr(), day.id), state.exercisesById);
  const ex = resolved.exercise;
  if (!ex) return;
  state.detailExerciseId = exerciseId;
  state.detailEffectiveExerciseId = resolved.exerciseId;
  $("sheet-detail-title").textContent = ex.name;
  $("detail-muscles").textContent = muscleSummary(ex);
  $("det-sets").value = entry.targetSets || 3;
  $("det-reps").value = entryReps(entry);
  $("det-refweight").value = ex.refWeight || "";
  $("det-note").value = ex.note || "";
  $("detail-history-sub").textContent = historySummary(resolved.exerciseId);
  renderDetailSubstitute(entry, resolved);
  openSheet("sheet-detail");
}

function renderDetailSubstitute(entry, resolved) {
  const select = $("detail-substitute-select");
  const undo = $("btn-detail-substitute-undo");
  const hint = $("detail-substitute-hint");
  select.innerHTML = "";

  if (resolved.requestedSubstituteId) {
    select.hidden = true;
    undo.hidden = false;
    hint.hidden = false;
    hint.textContent = resolved.missingSubstitute
      ? "O substituto foi removido. Volte ao original para continuar."
      : `${resolved.exercise.name} no lugar de ${resolved.originalExercise?.name || entry.exerciseId}.`;
    return;
  }

  undo.hidden = true;
  const similar = [...new Set(resolved.originalExercise?.similarIds || [])]
    .map((id) => state.exercisesById.get(id))
    .filter((exercise) => exercise && exercise.id !== entry.exerciseId);
  if (similar.length === 0) {
    select.hidden = true;
    hint.hidden = false;
    hint.textContent = "Cadastre similares na aba Exercícios.";
    return;
  }

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Escolha um exercício…";
  select.appendChild(placeholder);
  sortExercises(similar).forEach((exercise) => {
    const option = document.createElement("option");
    option.value = exercise.id;
    option.textContent = exercise.name;
    select.appendChild(option);
  });
  select.value = "";
  select.hidden = false;
  hint.hidden = true;
}

function chooseSubstituteToday(substituteExerciseId) {
  const day = currentDay();
  const originalExerciseId = state.detailExerciseId;
  if (!day || !originalExerciseId || !substituteExerciseId) return;
  const select = $("detail-substitute-select");
  if ((day.entries || []).some((entry) => entry.exerciseId === substituteExerciseId)) {
    select.value = "";
    toast("Esse exercício já faz parte do dia.");
    return;
  }

  const today = todayStr();
  const sets = draftSetsFor(today, day.id, originalExerciseId);
  if (sets?.some(draftSetDone) && !confirm("Descartar as séries do exercício original?")) {
    select.value = "";
    return;
  }

  discardDraftSets(today, day.id, originalExerciseId);
  setDraftSubstitution(today, day.id, originalExerciseId, substituteExerciseId);
  collapsedCards.delete(`${day.id}|${originalExerciseId}`);
  saveCollapsedCards();
  renderTreino();
  openDetailSheet(originalExerciseId);
  toast("Substituição aplicada hoje.");
}

function restoreOriginalToday() {
  const day = currentDay();
  const originalExerciseId = state.detailExerciseId;
  if (!day || !originalExerciseId) return;
  const today = todayStr();
  const sets = draftSetsFor(today, day.id, originalExerciseId);
  if (sets?.some(draftSetDone) && !confirm("Descartar as séries do exercício substituto?")) return;

  discardDraftSets(today, day.id, originalExerciseId);
  setDraftSubstitution(today, day.id, originalExerciseId, null);
  collapsedCards.delete(`${day.id}|${originalExerciseId}`);
  saveCollapsedCards();
  renderTreino();
  openDetailSheet(originalExerciseId);
  toast("Exercício original restaurado.");
}

function submitDetailForm(e) {
  e.preventDefault();
  const day = currentDay();
  const entry = (day?.entries || []).find((item) => item.exerciseId === state.detailExerciseId);
  if (!day || !entry) return;
  const resolved = resolveWorkoutExercise(entry, dayDraftFor(todayStr(), day.id), state.exercisesById);
  const ex = resolved.exercise;
  if (!ex) return;

  const targetSets = Math.max(1, Math.floor(Number($("det-sets").value)) || 3);
  const reps = Math.max(1, Math.floor(Number($("det-reps").value)) || 10);
  const entries = (day.entries || []).map((en) =>
    en.exerciseId === entry.exerciseId ? { exerciseId: entry.exerciseId, targetSets, reps } : en
  );
  db.updateDay(day.id, { name: day.name, entries }).catch(() => toast("Erro ao salvar."));

  db.updateExercise(ex.id, {
    name: ex.name,
    primaryMuscleId: ex.primaryMuscleId,
    secondaryMuscleIds: ex.secondaryMuscleIds || [],
    similarIds: ex.similarIds || [],
    refWeight: numericRefWeight("det-refweight"),
    note: $("det-note").value.trim(),
  }).catch(() => toast("Erro ao salvar."));

  closeSheets();
}

// ---------- full log of one exercise ----------
// Opened from the quick-detail sheet (Treino) or the edit sheet (Exercícios).
// It stacks ON TOP of the sheet that opened it (higher z-index), so closing
// it returns to that sheet with whatever was typed there still in place.
// Every session ever logged, newest first, one line per set: this is the
// screen for reading progression set by set.

function exerciseLogName(exerciseId) {
  const ex = state.exercisesById.get(exerciseId);
  if (ex) return ex.name;
  // deleted exercise: the log snapshots still carry the name
  return state.logs.find((log) => log.exerciseId === exerciseId)?.exerciseName || "Exercício";
}

function historySummary(exerciseId) {
  const n = state.logs.filter((log) => log.exerciseId === exerciseId).length;
  if (n === 0) return "Nenhum registro ainda";
  return n === 1 ? "1 sessão registrada" : `${n} sessões registradas`;
}

function openExerciseLog(exerciseId) {
  if (!exerciseId) return;
  state.exlogExerciseId = exerciseId;
  renderExerciseLog();
  openSheet("sheet-exlog");
  $("sheet-exlog").scrollTop = 0;
}

function closeExerciseLog() {
  state.exlogExerciseId = null;
  $("sheet-exlog").hidden = true;
}

function renderExerciseLog() {
  const exerciseId = state.exlogExerciseId;
  if (!exerciseId) return;

  const sessions = exerciseHistory(state.logs, exerciseId);
  $("sheet-exlog-title").textContent = exerciseLogName(exerciseId);
  $("exlog-sub").textContent =
    sessions.length === 0
      ? ""
      : `${historySummary(exerciseId)} · de ${fmtDate(sessions[sessions.length - 1].date)} a ${fmtDate(sessions[0].date)}`;

  const listEl = $("exlog-list");
  listEl.innerHTML = "";
  sessions.forEach((session) => {
    const group = document.createElement("section");
    group.className = "group";

    const head = document.createElement("div");
    head.className = "group-head session-head";
    const line1 = document.createElement("span");
    line1.textContent = [fmtDateFull(session.date), session.dayName].filter(Boolean).join(" · ");
    head.appendChild(line1);
    if (session.programName) {
      const line2 = document.createElement("span");
      line2.className = "session-prog";
      line2.textContent = session.programName;
      head.appendChild(line2);
    }

    const ul = document.createElement("ul");
    ul.className = "group-items";
    if (session.sets.length === 0) {
      const li = document.createElement("li");
      li.className = "exlog-set";
      li.textContent = "Sem séries registradas";
      ul.appendChild(li);
    }
    session.sets.forEach((set, idx) => {
      const li = document.createElement("li");
      li.className = "exlog-set" + (set.done ? "" : " pending");

      const n = document.createElement("span");
      n.className = "exlog-set-n";
      n.textContent = `Série ${idx + 1}`;

      const val = document.createElement("span");
      val.className = "exlog-set-val";
      const reps = document.createElement("span");
      reps.className = "exlog-set-reps";
      reps.textContent = set.weight ? `${set.reps}×` : `${set.reps} reps`;
      val.appendChild(reps);
      if (set.weight) {
        const weight = document.createElement("span");
        weight.className = "exlog-set-weight";
        weight.textContent = set.weight;
        val.appendChild(weight);
      }
      if (!set.done) {
        const flag = document.createElement("span");
        flag.className = "exlog-set-pending";
        flag.textContent = "pendente";
        val.appendChild(flag);
      }

      li.append(n, val);
      ul.appendChild(li);
    });

    group.append(head, ul);
    listEl.appendChild(group);
  });

  $("exlog-empty").hidden = sessions.length > 0;
}

// ---------- finish workout (summary of today's session) ----------

// The summary previews exactly what "Concluir treino" will record: the
// checked sets of each started exercise. An exercise with no checked set is
// not listed and will not be written to the history.
function openFinishSheet() {
  const day = currentDay();
  if (!day) return;
  const today = todayStr();
  const dayDraft = dayDraftFor(today, day.id);
  const items = (day.entries || [])
    .map((en) => {
      const sets = draftSetsFor(today, day.id, en.exerciseId);
      const recorded = recordedSets(sets);
      if (recorded.length === 0) return null;
      const resolved = resolveWorkoutExercise(en, dayDraft, state.exercisesById);
      return {
        name: resolved.missingSubstitute
          ? `${resolved.originalExercise?.name || en.exerciseId} (substituto removido)`
          : resolved.exercise?.name || en.exerciseId,
        recorded,
        complete: !resolved.missingSubstitute && draftAllDone(sets),
      };
    })
    .filter(Boolean);
  const done = items.filter((item) => item.complete).length;
  const session = finishedSession(today, day.id);

  $("finish-sub").textContent =
    `${fmtDateFull(today)} · ${day.name} · ${done} de ${(day.entries || []).length} exercícios`;

  const ul = $("finish-list");
  ul.innerHTML = "";
  items.forEach((item) => {
    const li = document.createElement("li");
    li.className = "row-line";
    const name = document.createElement("span");
    name.className = "row-name";
    name.textContent = item.name;
    const sub = document.createElement("span");
    sub.className = "row-sub";
    sub.textContent = setsLabel(item.recorded) || "feito";
    if (!item.complete) {
      const flag = document.createElement("span");
      flag.className = "exlog-set-pending";
      flag.textContent = "incompleto";
      sub.appendChild(flag);
    }
    li.append(name, sub);
    ul.appendChild(li);
  });

  const confirmBtn = $("btn-finish-confirm");
  confirmBtn.hidden = !!session;
  confirmBtn.disabled = done === 0;
  $("finish-min-hint").hidden = done > 0 || !!session;
  $("btn-finish-reopen").hidden = !session;

  openSheet("sheet-finish");
}

function toggleWorkout() {
  const day = currentDay();
  if (!day) return;
  const today = todayStr();
  const hasLogs = state.logs.some((log) =>
    log.date === today && log.programId === day.programId && log.dayId === day.id
  );
  const started = dayDraftStarted(today, day.id) || hasLogs || workoutStarted(today, day.id);
  if (!finishedSession(today, day.id) && !started) {
    localStorage.setItem("gym:workoutStart", `${today}|${day.id}`);
    renderWorkout();
    return;
  }
  openFinishSheet();
}

function confirmFinishWorkout() {
  const day = currentDay();
  if (!day) return;
  const program = currentProgram();
  const today = todayStr();
  const dayDraft = dayDraftFor(today, day.id);
  const plans = (day.entries || []).map((entry) => ({
    entry,
    resolved: resolveWorkoutExercise(entry, dayDraft, state.exercisesById),
    recorded: recordedSets(draftSetsFor(today, day.id, entry.exerciseId)),
  }));
  const protectedExerciseIds = new Set(
    plans
      .filter(({ resolved }) => !resolved.missingSubstitute)
      .map(({ resolved }) => resolved.exerciseId)
      .filter(Boolean)
  );
  const substitutionRelatedIds = new Set();
  plans.forEach(({ resolved }) => {
    if (resolved.originalExerciseId) substitutionRelatedIds.add(resolved.originalExerciseId);
    if (resolved.requestedSubstituteId) substitutionRelatedIds.add(resolved.requestedSubstituteId);
    (resolved.originalExercise?.similarIds || []).forEach((id) => substitutionRelatedIds.add(id));
  });

  // Re-finishing after a substitution/undo removes stale logs for the known
  // alternatives while preserving every exercise that is effective today.
  state.logs
    .filter((log) =>
      log.date === today &&
      log.dayId === day.id &&
      substitutionRelatedIds.has(log.exerciseId) &&
      !protectedExerciseIds.has(log.exerciseId)
    )
    .forEach((log) => db.deleteLog(log.id).catch(() => toast("Erro ao atualizar exercícios do treino.")));

  // This is the only moment a workout reaches the history: one log per
  // exercise with at least one checked set, holding the checked sets only.
  // Deterministic ids make re-finishing after a reopen an overwrite, not a
  // duplicate. Fire-and-forget like every other write: the local cache
  // applies them immediately and syncs later, so finishing works offline.
  let missingSubstitutes = 0;
  plans.forEach(({ entry, resolved, recorded }) => {
    if (recorded.length === 0) return;
    if (resolved.missingSubstitute) {
      missingSubstitutes++;
      return;
    }
    const ex = resolved.exercise;
    db.saveLog({
      date: today,
      programId: program?.id || day.programId,
      dayId: day.id,
      exerciseId: resolved.exerciseId,
      exerciseName: ex?.name || resolved.exerciseId,
      dayName: day.name,
      programName: program?.name || "",
      sets: recorded,
    }).catch(() => toast("Erro ao salvar exercícios do treino."));
  });
  const pendingSessionId = sessionId(today, day.id);
  pendingFinishToastId = pendingSessionId;
  pendingFinishSkippedCount = missingSubstitutes;
  db.finishSession({
    date: today,
    programId: program?.id || day.programId,
    dayId: day.id,
    dayName: day.name,
    programName: program?.name || "",
  }).catch(() => {
    if (pendingFinishToastId === pendingSessionId) {
      pendingFinishToastId = null;
      pendingFinishSkippedCount = 0;
    }
    toast("Erro ao finalizar treino.");
  });
  if (localStorage.getItem("gym:workoutStart") === `${today}|${day.id}`) {
    localStorage.removeItem("gym:workoutStart");
  }
  cancelTimer();
  closeSheets();
}

function unfinishWorkout() {
  const day = currentDay();
  if (!day) return;
  db.unfinishSession(sessionId(todayStr(), day.id))
    .catch(() => toast("Erro ao reabrir treino."));
  closeSheets();
}

// The sets editor lives inside a started card and mutates the local draft in
// place; nothing is written to Firestore until "Finalizar treino".
function buildSetsEditor(entry, day, sets) {
  const wrap = document.createElement("div");
  wrap.className = "sets-editor";
  const collapsedKey = `${day.id}|${entry.exerciseId}`;

  const syncCollapsedState = () => {
    if (draftAllDone(sets)) collapsedCards.add(collapsedKey);
    else collapsedCards.delete(collapsedKey);
    saveCollapsedCards();
  };

  const save = () => {
    saveDrafts();
    renderTreino();
  };

  sets.forEach((set, idx) => {
    const row = document.createElement("div");
    row.className = "set-row";

    const n = document.createElement("span");
    n.className = "set-n";
    n.textContent = `Série ${idx + 1}`;

    const done = document.createElement("button");
    done.type = "button";
    done.className = "set-check" + (set.done ? " on" : "");
    done.textContent = "✓";
    done.setAttribute("aria-label", set.done ? `Desmarcar série ${idx + 1}` : `Concluir série ${idx + 1}`);
    done.addEventListener("click", () => {
      sets[idx].done = !sets[idx].done;
      if (sets[idx].done) startTimer(DEFAULT_REST_SECS);
      syncCollapsedState();
      save();
    });

    const repsLab = document.createElement("label");
    repsLab.className = "set-reps";
    const reps = document.createElement("input");
    reps.type = "number";
    reps.min = "0";
    reps.step = "1";
    reps.inputMode = "numeric";
    reps.placeholder = "reps";
    reps.value = set.reps ?? "";
    reps.addEventListener("change", () => {
      const v = Math.floor(Number(reps.value));
      sets[idx].reps = reps.value === "" || !Number.isFinite(v) ? null : Math.max(0, v);
      save();
    });
    repsLab.append(reps, document.createTextNode("reps"));

    const wLab = document.createElement("label");
    wLab.className = "set-weight";
    const weight = document.createElement("input");
    weight.type = "text";
    weight.inputMode = "decimal";
    weight.autocomplete = "off";
    weight.placeholder = "kg";
    weight.value = set.weight ?? "";
    weight.addEventListener("input", () => {
      const normalized = normalizeDecimalInput(weight.value);
      if (normalized !== weight.value) weight.value = normalized;
    });
    weight.addEventListener("change", () => {
      const value = parseDecimal(weight.value);
      sets[idx].weight = value === null ? null : Math.max(0, value);
      save();
    });
    wLab.append(weight, document.createTextNode("kg"));

    const rm = document.createElement("button");
    rm.type = "button";
    rm.className = "set-remove";
    rm.textContent = "✕";
    rm.setAttribute("aria-label", `Remover série ${idx + 1}`);
    rm.disabled = sets.length <= 1;
    rm.addEventListener("click", () => {
      sets.splice(idx, 1);
      syncCollapsedState();
      save();
    });

    row.append(done, n, repsLab, wLab, rm);
    wrap.appendChild(row);
  });

  const add = document.createElement("button");
  add.type = "button";
  add.className = "btn-add-set";
  add.textContent = "＋ série";
  add.addEventListener("click", () => {
    const prev = sets[sets.length - 1];
    sets.push({ reps: prev?.reps ?? entryReps(entry), weight: prev?.weight ?? null, done: false });
    syncCollapsedState();
    save();
  });
  wrap.appendChild(add);

  return wrap;
}

// ---------- day sheet (new / edit) ----------

function openDaySheet(dayId) {
  state.editingDayId = dayId || null;
  const day = dayId ? state.days.find((d) => d.id === dayId) : null;
  $("sheet-day-title").textContent = day ? "Editar dia" : "Novo dia";
  $("day-name").value = day ? day.name : "";
  state.draftEntries = (day?.entries || []).map((e) => ({ ...e }));
  $("day-ex-search").value = "";
  $("day-ex-results").hidden = true;
  $("btn-day-delete").hidden = !day;
  renderDayEntries();
  openSheet("sheet-day");
}

function renderDayEntries() {
  const ul = $("day-entries");
  ul.innerHTML = "";
  state.draftEntries.forEach((entry, idx) => {
    const li = document.createElement("li");
    li.className = "entry-line";

    const name = document.createElement("span");
    name.className = "entry-name";
    name.textContent = state.exercisesById.get(entry.exerciseId)?.name || "(removido)";

    const numInput = (value, min, onChange) => {
      const input = document.createElement("input");
      input.type = "number";
      input.min = String(min);
      input.step = "1";
      input.inputMode = "numeric";
      input.value = value;
      input.addEventListener("change", () => {
        const v = Math.floor(Number(input.value));
        onChange(Number.isFinite(v) ? Math.max(min, v) : min);
      });
      return input;
    };
    const sets = numInput(entry.targetSets, 1, (v) => (entry.targetSets = v));
    const reps = numInput(entryReps(entry), 1, (v) => (entry.reps = v));

    const x1 = document.createElement("span");
    x1.className = "x";
    x1.textContent = "×";

    const up = document.createElement("button");
    up.type = "button";
    up.className = "icon-btn";
    up.textContent = "▲";
    up.disabled = idx === 0;
    up.addEventListener("click", () => {
      [state.draftEntries[idx - 1], state.draftEntries[idx]] =
        [state.draftEntries[idx], state.draftEntries[idx - 1]];
      renderDayEntries();
    });

    const down = document.createElement("button");
    down.type = "button";
    down.className = "icon-btn";
    down.textContent = "▼";
    down.disabled = idx === state.draftEntries.length - 1;
    down.addEventListener("click", () => {
      [state.draftEntries[idx], state.draftEntries[idx + 1]] =
        [state.draftEntries[idx + 1], state.draftEntries[idx]];
      renderDayEntries();
    });

    const rm = document.createElement("button");
    rm.type = "button";
    rm.className = "icon-btn del";
    rm.textContent = "✕";
    rm.setAttribute("aria-label", "Remover do dia");
    rm.addEventListener("click", () => {
      state.draftEntries.splice(idx, 1);
      renderDayEntries();
    });

    li.append(name, sets, x1, reps, up, down, rm);
    ul.appendChild(li);
  });
}

function renderDayExResults() {
  const box = $("day-ex-results");
  const q = normalize($("day-ex-search").value);
  box.innerHTML = "";
  const chosen = new Set(state.draftEntries.map((e) => e.exerciseId));
  const matches = q
    ? sortExercises(state.exercises).filter(
        (e) => !chosen.has(e.id) && (e.nameLower || normalize(e.name)).includes(q)
      ).slice(0, 6)
    : [];
  box.hidden = matches.length === 0;
  matches.forEach((ex) => {
    const row = document.createElement("div");
    row.className = "picker-result";
    const name = document.createElement("span");
    name.textContent = ex.name;
    const sub = document.createElement("span");
    sub.className = "sub";
    sub.textContent = muscleName(ex.primaryMuscleId);
    // pointerdown beats the input's blur, so the tap always lands
    row.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      state.draftEntries.push({ exerciseId: ex.id, targetSets: 3, reps: 10 });
      $("day-ex-search").value = "";
      box.hidden = true;
      renderDayEntries();
      $("day-ex-search").focus();
    });
    row.append(name, sub);
    box.appendChild(row);
  });
}

function submitDayForm(e) {
  e.preventDefault();
  const name = $("day-name").value.trim();
  if (!name || !state.programId) return;
  const entries = state.draftEntries.map((en) => ({
    exerciseId: en.exerciseId,
    targetSets: Math.max(1, Number(en.targetSets) || 1),
    reps: entryReps(en),
  }));
  let op;
  if (state.editingDayId) {
    op = db.updateDay(state.editingDayId, { name, entries });
  } else {
    const maxOrder = daysOf(state.programId).reduce((m, d) => Math.max(m, d.order ?? 0), -1);
    op = db.addDay(state.programId, name, maxOrder + 1, entries);
  }
  op.catch(() => toast("Erro ao salvar o dia."));
  closeSheets();
}

// ---------- programs sheet ----------

function renderProgramsList() {
  const ul = $("programs-list");
  ul.innerHTML = "";
  state.programs.forEach((prog) => {
    const li = document.createElement("li");
    li.className = "row-line";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = prog.name;
    nameInput.maxLength = 60;
    nameInput.addEventListener("change", () => {
      const name = nameInput.value.trim();
      if (!name) {
        nameInput.value = prog.name;
        return;
      }
      db.renameProgram(prog.id, name).catch(() => toast("Erro ao renomear."));
    });

    const sub = document.createElement("span");
    sub.className = "row-sub";
    const n = daysOf(prog.id).length;
    sub.textContent = `${n} ${n === 1 ? "dia" : "dias"}`;

    const del = document.createElement("button");
    del.type = "button";
    del.className = "icon-btn del";
    del.textContent = "✕";
    del.setAttribute("aria-label", "Excluir programa");
    del.addEventListener("click", () => {
      const dayIds = daysOf(prog.id).map((d) => d.id);
      if (
        confirm(
          `Excluir o programa "${prog.name}" e seus ${dayIds.length} dias?\nO histórico de treinos é mantido.`
        )
      ) {
        db.deleteProgram(prog.id, dayIds).catch(() => toast("Erro ao excluir."));
      }
    });

    li.append(nameInput, sub, del);
    ul.appendChild(li);
  });
}

// ---------- exercícios tab ----------

function exerciseMatches(ex) {
  const q = normalize(state.search);
  if (q && !(ex.nameLower || normalize(ex.name)).includes(q)) return false;
  if (state.muscleFilters.size === 0) return true;
  const ids = [ex.primaryMuscleId, ...(ex.secondaryMuscleIds || [])];
  return ids.some((id) => state.muscleFilters.has(id));
}

function renderMuscleChips() {
  const wrap = $("muscle-chips");
  wrap.innerHTML = "";
  state.muscles.forEach((m) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip" + (state.muscleFilters.has(m.id) ? " on" : "");
    chip.textContent = m.name;
    chip.addEventListener("click", () => {
      if (state.muscleFilters.has(m.id)) state.muscleFilters.delete(m.id);
      else state.muscleFilters.add(m.id);
      renderMuscleChips();
      renderExercises();
      // Filtering can shrink the list below the current scroll offset; the
      // abrupt clamp reads as a broken layout. Deterministic: back to the top.
      window.scrollTo(0, 0);
    });
    wrap.appendChild(chip);
  });
}

function renderExercises() {
  const listEl = $("exercises-list");
  listEl.innerHTML = "";

  const visible = sortExercises(state.exercises.filter(exerciseMatches));
  const byMuscle = new Map();
  visible.forEach((ex) => {
    const key = ex.primaryMuscleId || "none";
    if (!byMuscle.has(key)) byMuscle.set(key, []);
    byMuscle.get(key).push(ex);
  });

  const orderedIds = [
    ...state.muscles.map((m) => m.id),
    ...[...byMuscle.keys()].filter((id) => !state.muscles.some((m) => m.id === id)),
  ];

  orderedIds.forEach((musId) => {
    const items = byMuscle.get(musId);
    if (!items || items.length === 0) return;

    const group = document.createElement("section");
    group.className = "group";
    const head = document.createElement("div");
    head.className = "group-head";
    head.innerHTML = `<span></span><span class="count">${items.length}</span>`;
    head.querySelector("span").textContent = muscleName(musId) || "Outros";

    const ul = document.createElement("ul");
    ul.className = "group-items";
    items.forEach((ex) => {
      const li = document.createElement("li");
      li.className = "item-row";

      const main = document.createElement("div");
      main.className = "item-main";
      const name = document.createElement("span");
      name.className = "item-name";
      name.textContent = ex.name;
      main.appendChild(name);
      const subParts = [];
      const extras = (ex.secondaryMuscleIds || []).map(muscleName).filter(Boolean);
      if (extras.length > 0) subParts.push(extras.join(", "));
      const refWeight = refWeightLabel(ex.refWeight);
      if (refWeight) subParts.push(`Ref: ${refWeight}`);
      if (ex.note) subParts.push(ex.note.split("\n")[0]);
      if (subParts.length > 0) {
        const sub = document.createElement("span");
        sub.className = "item-sub";
        sub.textContent = subParts.join(" · ");
        main.appendChild(sub);
      }

      li.appendChild(main);
      li.addEventListener("click", () => openExerciseSheet(ex.id));
      ul.appendChild(li);
    });

    group.append(head, ul);
    listEl.appendChild(group);
  });

  $("exercises-empty").hidden = visible.length > 0;
}

// ---------- exercise sheet (new / edit) ----------

const exerciseMuscleComboboxes = {};
let exerciseSimilarCombobox = null;

function muscleCombobox({ inputEl, listEl, tagsEl, multi, getPicked, getExcluded, onPick }) {
  const hideOptions = () => {
    listEl.hidden = true;
    inputEl.setAttribute("aria-expanded", "false");
  };

  const choose = (muscle) => {
    inputEl.value = multi ? "" : muscle.name;
    onPick(muscle.id, true);
    if (multi) {
      inputEl.focus();
      renderOptions();
    } else {
      hideOptions();
    }
  };

  const renderOptions = () => {
    const query = normalize(inputEl.value);
    const excluded = getExcluded ? getExcluded() : new Set();
    const picked = multi ? getPicked() : new Set();
    const matches = state.muscles.filter((muscle) =>
      !excluded.has(muscle.id) && !picked.has(muscle.id) && normalize(muscle.name).includes(query)
    );
    listEl.innerHTML = "";
    matches.forEach((muscle) => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "muscle-option";
      option.setAttribute("role", "option");
      option.dataset.muscleId = muscle.id;
      option.textContent = muscle.name;
      // Preventing focus loss lets the choice land before iOS hides the list.
      option.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        choose(muscle);
      });
      listEl.appendChild(option);
    });
    if (matches.length === 0) {
      const empty = document.createElement("span");
      empty.className = "muscle-option empty";
      empty.textContent = "Nenhum músculo encontrado";
      listEl.appendChild(empty);
    }
    listEl.hidden = false;
    inputEl.setAttribute("aria-expanded", "true");
  };

  const renderTags = () => {
    tagsEl.innerHTML = "";
    if (!multi) return;
    getPicked().forEach((id) => {
      const muscle = state.muscles.find((item) => item.id === id);
      if (!muscle) return;
      const tag = document.createElement("span");
      tag.className = "muscle-tag";
      tag.appendChild(document.createTextNode(muscle.name));
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "×";
      remove.setAttribute("aria-label", `Remover ${muscle.name}`);
      remove.addEventListener("click", () => onPick(id, false));
      tag.appendChild(remove);
      tagsEl.appendChild(tag);
    });
  };

  inputEl.addEventListener("focus", renderOptions);
  inputEl.addEventListener("input", renderOptions);
  inputEl.addEventListener("blur", () => {
    hideOptions();
    // Single mode: leftover typed text is not a pick; snap back to the pick.
    if (!multi) inputEl.value = muscleName(getPicked());
  });
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hideOptions();
    if (e.key !== "Enter") return;
    const firstId = listEl.querySelector(".muscle-option[role=option]")?.dataset.muscleId;
    const muscle = state.muscles.find((item) => item.id === firstId);
    if (!muscle) return;
    e.preventDefault();
    choose(muscle);
  });

  return {
    render() {
      renderTags();
      if (document.activeElement === inputEl) renderOptions();
      else hideOptions();
    },
  };
}

function similarExerciseCombobox({ inputEl, listEl, tagsEl }) {
  const hideOptions = () => {
    listEl.hidden = true;
    inputEl.setAttribute("aria-expanded", "false");
  };

  const changeLink = (similarId, linked) => {
    const exerciseId = state.editingExerciseId;
    if (!exerciseId || exerciseId === similarId) return;
    const previous = new Set(state.draftSimilarIds);
    if (linked) state.draftSimilarIds.add(similarId);
    else state.draftSimilarIds.delete(similarId);
    inputEl.value = "";
    render();
    db.updateSimilarLink(exerciseId, similarId, linked).catch(() => {
      if (state.editingExerciseId === exerciseId) {
        state.draftSimilarIds = previous;
        render();
      }
      toast("Erro ao atualizar exercícios similares.");
    });
  };

  const renderOptions = () => {
    const query = normalize(inputEl.value);
    const matches = sortExercises(state.exercises.filter((exercise) =>
      exercise.id !== state.editingExerciseId &&
      !state.draftSimilarIds.has(exercise.id) &&
      normalize(exercise.name).includes(query)
    ));
    listEl.innerHTML = "";
    matches.forEach((exercise) => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "muscle-option";
      option.setAttribute("role", "option");
      option.dataset.exerciseId = exercise.id;
      option.textContent = exercise.name;
      option.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        changeLink(exercise.id, true);
        inputEl.focus();
      });
      listEl.appendChild(option);
    });
    if (matches.length === 0) {
      const empty = document.createElement("span");
      empty.className = "muscle-option empty";
      empty.textContent = "Nenhum exercício encontrado";
      listEl.appendChild(empty);
    }
    listEl.hidden = false;
    inputEl.setAttribute("aria-expanded", "true");
  };

  const renderTags = () => {
    tagsEl.innerHTML = "";
    state.draftSimilarIds.forEach((id) => {
      const exercise = state.exercisesById.get(id);
      if (!exercise) return;
      const tag = document.createElement("span");
      tag.className = "muscle-tag";
      tag.appendChild(document.createTextNode(exercise.name));
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "×";
      remove.setAttribute("aria-label", `Desvincular ${exercise.name}`);
      remove.addEventListener("click", () => changeLink(id, false));
      tag.appendChild(remove);
      tagsEl.appendChild(tag);
    });
  };

  const render = () => {
    renderTags();
    if (document.activeElement === inputEl) renderOptions();
    else hideOptions();
  };

  inputEl.addEventListener("focus", renderOptions);
  inputEl.addEventListener("input", renderOptions);
  inputEl.addEventListener("blur", hideOptions);
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hideOptions();
    if (e.key !== "Enter") return;
    const firstId = listEl.querySelector(".muscle-option[role=option]")?.dataset.exerciseId;
    if (!firstId) return;
    e.preventDefault();
    changeLink(firstId, true);
  });

  return { render };
}

function renderExerciseSheetGrids() {
  const primary = state.draftPrimaryMuscleId;
  state.draftSecondary.delete(primary);
  Object.values(exerciseMuscleComboboxes).forEach((combobox) => combobox.render());
  exerciseSimilarCombobox?.render();
}

function openExerciseSheet(exerciseId) {
  state.editingExerciseId = exerciseId || null;
  const ex = exerciseId ? state.exercisesById.get(exerciseId) : null;

  $("sheet-exercise-title").textContent = ex ? "Editar exercício" : "Novo exercício";
  $("ex-name").value = ex ? ex.name : "";

  state.draftPrimaryMuscleId = ex?.primaryMuscleId || null;
  $("ex-primary").value = muscleName(state.draftPrimaryMuscleId);
  $("ex-secondary").value = "";
  state.draftSecondary = new Set(ex?.secondaryMuscleIds || []);
  state.draftSimilarIds = new Set(ex?.similarIds || []);
  $("ex-similar-field").hidden = !ex;
  $("ex-similar").value = "";
  renderExerciseSheetGrids();

  $("ex-refweight").value = ex?.refWeight || "";
  $("ex-note").value = ex?.note || "";
  $("ex-error").hidden = true;
  $("btn-exercise-delete").hidden = !ex;
  $("btn-exercise-history").hidden = !ex;
  if (ex) $("exercise-history-sub").textContent = historySummary(ex.id);

  openSheet("sheet-exercise");
}

function submitExerciseForm(e) {
  e.preventDefault();
  const name = $("ex-name").value.trim();
  const primaryMuscleId = state.draftPrimaryMuscleId;
  const errEl = $("ex-error");
  if (!name || !primaryMuscleId) {
    errEl.textContent = "Preencha o nome e o músculo principal.";
    errEl.hidden = false;
    return;
  }
  const data = {
    name,
    primaryMuscleId,
    secondaryMuscleIds: [...state.draftSecondary].filter((id) => id !== primaryMuscleId),
    similarIds: [...state.draftSimilarIds],
    refWeight: numericRefWeight("ex-refweight"),
    note: $("ex-note").value.trim(),
  };
  const op = state.editingExerciseId
    ? db.updateExercise(state.editingExerciseId, data)
    : db.createExercise(data);
  op.catch(() => toast("Erro ao salvar exercício."));
  closeSheets();
}

function deleteCurrentExercise() {
  const ex = state.exercisesById.get(state.editingExerciseId);
  if (!ex) return;
  const affected = state.days.filter((d) =>
    (d.entries || []).some((e) => e.exerciseId === ex.id)
  );
  const msg =
    affected.length > 0
      ? `Excluir "${ex.name}"?\nUsado em ${affected.length} ${affected.length === 1 ? "dia" : "dias"} de treino; será removido deles. O histórico é mantido.`
      : `Excluir "${ex.name}"?\nO histórico é mantido.`;
  if (!confirm(msg)) return;
  const dayPatches = affected.map((d) => ({
    dayId: d.id,
    entries: (d.entries || []).filter((e) => e.exerciseId !== ex.id),
  }));
  const similarExerciseIds = [...new Set([
    ...(ex.similarIds || []),
    ...state.exercises
      .filter((exercise) => (exercise.similarIds || []).includes(ex.id))
      .map((exercise) => exercise.id),
  ])].filter((id) => id !== ex.id && state.exercisesById.has(id));
  db.deleteExercise(ex.id, dayPatches, similarExerciseIds).catch(() => toast("Erro ao excluir."));
  closeSheets();
}

// ---------- swipe-to-delete rows ----------
// Wraps a row's content in a sliding layer over a fixed "Remover" button.
// Swipe left to reveal, tap the button to delete; only one row open at a
// time; a vertical scroll cancels the gesture.

let closeOpenSwipe = null;

function makeSwipeable(row, onDelete) {
  row.classList.add("swipe-row");
  const content = document.createElement("div");
  content.className = "swipe-content";
  while (row.firstChild) content.appendChild(row.firstChild);

  const action = document.createElement("button");
  action.type = "button";
  action.className = "swipe-action";
  action.textContent = "Remover";
  action.addEventListener("click", (e) => {
    e.stopPropagation();
    onDelete();
  });
  row.append(action, content);

  const OPEN_X = -96;
  const close = () => {
    content.style.transform = "";
    row.classList.remove("open");
    if (closeOpenSwipe === close) closeOpenSwipe = null;
  };

  let startX = 0;
  let startY = 0;
  let dx = 0;
  let dragging = false;

  row.addEventListener("touchstart", (e) => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    dx = 0;
    dragging = true;
    if (closeOpenSwipe && closeOpenSwipe !== close) closeOpenSwipe();
  }, { passive: true });

  row.addEventListener("touchmove", (e) => {
    if (!dragging) return;
    const dy = e.touches[0].clientY - startY;
    dx = e.touches[0].clientX - startX;
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
      // vertical scroll wins
      dragging = false;
      content.style.transform = row.classList.contains("open") ? `translateX(${OPEN_X}px)` : "";
      return;
    }
    const base = row.classList.contains("open") ? OPEN_X : 0;
    const x = Math.min(0, Math.max(OPEN_X - 24, base + dx));
    content.style.transform = `translateX(${x}px)`;
  }, { passive: true });

  row.addEventListener("touchend", () => {
    if (!dragging) return;
    dragging = false;
    const base = row.classList.contains("open") ? OPEN_X : 0;
    if (base + dx < OPEN_X / 2) {
      content.style.transform = `translateX(${OPEN_X}px)`;
      row.classList.add("open");
      closeOpenSwipe = close;
    } else {
      close();
    }
  });

  // desktop fallback: right-click reveals the same button
  row.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    if (closeOpenSwipe && closeOpenSwipe !== close) closeOpenSwipe();
    content.style.transform = `translateX(${OPEN_X}px)`;
    row.classList.add("open");
    closeOpenSwipe = close;
  });
}

// ---------- séries ----------

function fmtSeriesNumber(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function renderSeries() {
  if (!$("tab-series")) return;

  const currentWeek = weekStartStr(todayStr());
  const weekStart = addDaysStr(currentWeek, state.seriesWeekOffset * 7);
  const weekEnd = addDaysStr(weekStart, 6);
  $("series-week-label").textContent = `${fmtDate(weekStart)} – ${fmtDate(weekEnd)}`;
  $("series-next").disabled = state.seriesWeekOffset >= 0;

  const rows = weeklyMuscleSets(state.logs, state.exercisesById, weekStart)
    .filter((muscle) => muscle.total > 0)
    .map((muscle) => ({ ...muscle, name: muscleName(muscle.muscleId) || muscle.muscleId }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "pt"));

  const list = $("series-list");
  list.innerHTML = "";
  $("series-card").hidden = rows.length === 0;
  $("series-empty").hidden = rows.length > 0;
  if (!rows.some((muscle) => muscle.muscleId === state.seriesOpenMuscleId)) {
    state.seriesOpenMuscleId = null;
  }

  rows.forEach((muscle, index) => {
    const expanded = state.seriesOpenMuscleId === muscle.muscleId;
    const breakdownId = `series-breakdown-${index}`;
    const item = document.createElement("li");
    item.className = "series-item";

    const row = document.createElement("button");
    row.className = "series-row";
    row.type = "button";
    row.setAttribute("aria-expanded", String(expanded));
    row.setAttribute("aria-controls", breakdownId);
    const name = document.createElement("span");
    name.className = "series-muscle-name";
    name.textContent = muscle.name;
    const total = document.createElement("span");
    total.className = "series-total";
    total.textContent = fmtSeriesNumber(muscle.total);
    row.append(name, total);
    row.addEventListener("click", () => {
      state.seriesOpenMuscleId = expanded ? null : muscle.muscleId;
      renderSeries();
    });

    const breakdown = document.createElement("div");
    breakdown.id = breakdownId;
    breakdown.className = "series-breakdown";
    breakdown.hidden = !expanded;
    [...muscle.exercises]
      .sort((a, b) => b.contribution - a.contribution || a.name.localeCompare(b.name, "pt"))
      .forEach((exercise) => {
        const detail = document.createElement("div");
        detail.className = "series-breakdown-row";
        const setLabel = exercise.sets === 1 ? "série" : "séries";
        const contribution = fmtSeriesNumber(exercise.contribution);
        detail.textContent = exercise.factor === 1
          ? `${exercise.name} · ${exercise.sets} ${setLabel} · +${contribution}`
          : `${exercise.name} · ${exercise.sets} ${setLabel} · ×0.5 = +${contribution}`;
        breakdown.appendChild(detail);
      });

    item.append(row, breakdown);
    list.appendChild(item);
  });
}

// ---------- histórico ----------

function renderHist() {
  $("hist-sessoes").hidden = state.histView !== "sessoes";
  $("hist-cardio").hidden = state.histView !== "cardio";
  $("hist-progresso").hidden = state.histView !== "progresso";
  document.querySelectorAll("#hist-seg .seg-btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.view === state.histView)
  );
  if (state.histView === "sessoes") renderSessions();
  else if (state.histView === "cardio") renderCardio();
  else renderProgress();
}

function renderSessions() {
  const weeks = weeklyFrequency(state.logs, 12, todayStr(), state.cardio.map((entry) => entry.date));
  $("freq-chart").innerHTML = barChart(
    weeks.map((w) => ({ label: w.label, value: w.count })),
    { showLabels: "ends" }
  );

  const listEl = $("sessions-list");
  listEl.innerHTML = "";
  const sessions = groupSessions(state.logs);
  sessions.forEach((session) => {
    const group = document.createElement("section");
    group.className = "group";

    const head = document.createElement("div");
    head.className = "group-head session-head";
    const line1 = document.createElement("span");
    line1.textContent = `${fmtDateFull(session.date)} · ${session.dayName}`;
    head.appendChild(line1);
    if (session.programName) {
      const line2 = document.createElement("span");
      line2.className = "session-prog";
      line2.textContent = session.programName;
      head.appendChild(line2);
    }

    const ul = document.createElement("ul");
    ul.className = "group-items";
    session.logs.forEach((log) => {
      const li = document.createElement("li");
      li.className = "item-row session-log-row";
      const main = document.createElement("div");
      main.className = "item-main";
      const name = document.createElement("span");
      name.className = "item-name";
      name.textContent = log.exerciseName || "(exercício)";
      main.appendChild(name);
      const sets = document.createElement("span");
      sets.className = "item-sub session-sets";
      sets.textContent = setsLabel(log.sets) || "feito";
      main.appendChild(sets);
      li.appendChild(main);
      // swipe left (or right-click on desktop) to remove a wrong entry
      makeSwipeable(li, () => {
        db.deleteLog(log.id).catch(() => toast("Erro ao remover."));
        toast("Registro removido.");
      });
      ul.appendChild(li);
    });

    group.append(head, ul);
    listEl.appendChild(group);
  });

  $("sessions-empty").hidden = sessions.length > 0;
}

function renderCardio() {
  const weeks = weeklyCardio(state.cardio, 12, todayStr());
  const chartEl = $("cardio-chart");
  let controls = $("cardio-chart-controls");
  if (!controls) {
    controls = document.createElement("div");
    controls.id = "cardio-chart-controls";
    controls.className = "chips cardio-chart-controls";
    chartEl.before(controls);
  }
  controls.innerHTML = "";
  [["day", "Dia"], ["week", "Semana"], ["month", "Mês"]].forEach(([view, label]) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip" + (state.cardioChartView === view ? " on" : "");
    chip.textContent = label;
    chip.addEventListener("click", () => {
      state.cardioChartView = view;
      renderCardio();
    });
    controls.appendChild(chip);
  });

  let bars;
  let showLabels;
  let title;
  if (state.cardioChartView === "day") {
    bars = dailyCardio(state.cardio, 14, todayStr())
      .map((day) => ({ label: day.label, value: day.minutes }));
    showLabels = "ends";
    title = "Cardio por dia";
  } else if (state.cardioChartView === "month") {
    bars = monthlyCardio(state.cardio, 6, todayStr())
      .map((month) => ({ label: month.label, value: month.minutes }));
    showLabels = "all";
    title = "Cardio por mês";
  } else {
    bars = weeks.map((week) => ({
      label: `${week.weekStart.slice(8)}-${fmtDateShortMonth(addDaysStr(week.weekStart, 6))}`,
      value: week.totalMinutes,
    }));
    showLabels = "ends";
    title = "Cardio por semana";
  }
  chartEl.closest(".chart-card").querySelector(".chart-title").textContent = title;
  chartEl.innerHTML = barChart(bars, { showLabels, color: "var(--accent)" });

  const list = $("cardio-history-list");
  list.innerHTML = "";
  const visibleWeeks = weeks.filter((week) => week.totalMinutes > 0).reverse();
  visibleWeeks.forEach((week) => {
    const group = document.createElement("section");
    group.className = "group";
    const head = document.createElement("div");
    head.className = "group-head cardio-week-head";
    const title = document.createElement("span");
    title.textContent = `Semana de ${fmtDate(week.weekStart)}`;
    const total = document.createElement("span");
    total.className = "count";
    total.textContent = `${week.totalMinutes} min`;
    head.append(title, total);

    const ul = document.createElement("ul");
    ul.className = "group-items";
    [...week.days].reverse().forEach((day) => {
      const entries = state.cardio.filter((entry) => entry.date === day.date);
      entries.forEach((entry) => {
        const li = document.createElement("li");
        li.className = "item-row cardio-entry-row";
        const main = document.createElement("div");
        main.className = "item-main";
        const title = document.createElement("span");
        title.className = "item-name";
        title.textContent = `${fmtDateFull(entry.date)} · ${entry.typeName || "Cardio"}`;
        main.appendChild(title);
        if (entry.note) {
          const note = document.createElement("span");
          note.className = "item-sub cardio-entry-note";
          note.textContent = entry.note;
          main.appendChild(note);
        }
        const minutes = document.createElement("span");
        minutes.className = "item-side";
        minutes.innerHTML = `<b>${entry.minutes} min</b>`;
        li.append(main, minutes);
        makeSwipeable(li, () => {
          db.deleteCardio(entry.id).catch(() => toast("Erro ao remover cardio."));
          toast("Cardio removido.");
        });
        ul.appendChild(li);
      });
    });
    group.append(head, ul);
    list.appendChild(group);
  });
  $("cardio-history-empty").hidden = visibleWeeks.length > 0;
}

function renderProgress() {
  const options = exercisesFromLogs(state.logs);
  const select = $("prog-exercise");
  if (!options.some((o) => o.exerciseId === state.progExerciseId)) {
    state.progExerciseId = options[0]?.exerciseId || null;
  }
  select.innerHTML = "";
  options.forEach((o) => {
    const opt = document.createElement("option");
    opt.value = o.exerciseId;
    opt.textContent = o.name;
    if (o.exerciseId === state.progExerciseId) opt.selected = true;
    select.appendChild(opt);
  });

  const series = state.progExerciseId
    ? progressionSeries(state.logs, state.progExerciseId)
    : [];
  const chartEl = $("prog-chart");
  chartEl.innerHTML = lineChart(
    series.slice(-24).map((p) => ({ label: fmtDate(p.date), value: p.weight }))
  );
  chartEl.parentElement.hidden = series.length === 0;

  const table = $("prog-table");
  table.innerHTML = "";
  const recent = state.logs
    .filter((l) => l.exerciseId === state.progExerciseId)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 10);
  recent.forEach((log) => {
    const li = document.createElement("li");
    const d = document.createElement("span");
    d.className = "d";
    d.textContent = `${fmtDate(log.date)} · ${log.dayName || ""}`;
    const v = document.createElement("b");
    v.textContent = setsLabel(log.sets) || "feito";
    li.append(d, v);
    table.appendChild(li);
  });
  $("prog-table-card").hidden = recent.length === 0;
  $("prog-empty").hidden = series.length > 0 || recent.length > 0;
}

// ---------- ajustes ----------

function muscleInUse(muscleId) {
  return state.exercises.some(
    (ex) =>
      ex.primaryMuscleId === muscleId ||
      (ex.secondaryMuscleIds || []).includes(muscleId)
  );
}

function renderMusclesManager() {
  const ul = $("muscles-list");
  ul.innerHTML = "";
  state.muscles.forEach((mus, idx) => {
    const li = document.createElement("li");
    li.className = "row-line";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = mus.name;
    nameInput.maxLength = 40;
    nameInput.addEventListener("change", () => {
      const name = nameInput.value.trim();
      if (!name) {
        nameInput.value = mus.name;
        return;
      }
      db.renameMuscle(mus.id, name).catch(() => toast("Erro ao renomear."));
    });

    const up = document.createElement("button");
    up.type = "button";
    up.className = "icon-btn";
    up.textContent = "▲";
    up.disabled = idx === 0;
    up.setAttribute("aria-label", "Mover para cima");
    up.addEventListener("click", () =>
      db.swapMuscleOrder(mus, state.muscles[idx - 1]).catch(() => toast("Erro ao reordenar."))
    );

    const down = document.createElement("button");
    down.type = "button";
    down.className = "icon-btn";
    down.textContent = "▼";
    down.disabled = idx === state.muscles.length - 1;
    down.setAttribute("aria-label", "Mover para baixo");
    down.addEventListener("click", () =>
      db.swapMuscleOrder(mus, state.muscles[idx + 1]).catch(() => toast("Erro ao reordenar."))
    );

    const del = document.createElement("button");
    del.type = "button";
    del.className = "icon-btn del";
    del.textContent = "✕";
    del.setAttribute("aria-label", "Excluir grupo");
    del.addEventListener("click", () => {
      if (muscleInUse(mus.id)) {
        toast(`"${mus.name}" está em uso por exercícios. Edite-os antes de excluir.`);
        return;
      }
      if (confirm(`Excluir o grupo "${mus.name}"?`)) {
        db.deleteMuscle(mus.id).catch(() => toast("Erro ao excluir."));
      }
    });

    li.append(nameInput, up, down, del);
    ul.appendChild(li);
  });
}

function cardioTypeInUse(typeId) {
  return state.cardio.some((entry) => entry.typeId === typeId);
}

function renderCardioTypesManager() {
  const ul = $("cardio-types-list");
  ul.innerHTML = "";
  state.cardioTypes.forEach((type, idx) => {
    const li = document.createElement("li");
    li.className = "row-line";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = type.name;
    nameInput.maxLength = 40;
    const noteInput = document.createElement("input");
    noteInput.type = "text";
    noteInput.className = "cardio-type-note-input";
    noteInput.value = type.note || "";
    noteInput.maxLength = 200;
    noteInput.placeholder = "nota (posição, ajustes…)";

    const save = () => {
      const name = nameInput.value.trim();
      if (!name) {
        nameInput.value = type.name;
        return;
      }
      db.updateCardioType(type.id, { name, note: noteInput.value.trim() })
        .catch(() => toast("Erro ao atualizar tipo."));
    };
    nameInput.addEventListener("change", save);
    noteInput.addEventListener("change", save);

    const fields = document.createElement("div");
    fields.className = "cardio-type-fields";
    fields.append(nameInput, noteInput);

    const up = document.createElement("button");
    up.type = "button";
    up.className = "icon-btn";
    up.textContent = "▲";
    up.disabled = idx === 0;
    up.setAttribute("aria-label", "Mover para cima");
    up.addEventListener("click", () =>
      db.swapCardioTypeOrder(type, state.cardioTypes[idx - 1]).catch(() => toast("Erro ao reordenar."))
    );

    const down = document.createElement("button");
    down.type = "button";
    down.className = "icon-btn";
    down.textContent = "▼";
    down.disabled = idx === state.cardioTypes.length - 1;
    down.setAttribute("aria-label", "Mover para baixo");
    down.addEventListener("click", () =>
      db.swapCardioTypeOrder(type, state.cardioTypes[idx + 1]).catch(() => toast("Erro ao reordenar."))
    );

    const del = document.createElement("button");
    del.type = "button";
    del.className = "icon-btn del";
    del.textContent = "✕";
    del.setAttribute("aria-label", "Excluir tipo");
    del.addEventListener("click", () => {
      if (cardioTypeInUse(type.id)) {
        toast(`"${type.name}" está em uso por registros de cardio.`);
        return;
      }
      if (confirm(`Excluir o tipo "${type.name}"?`)) {
        db.deleteCardioType(type.id).catch(() => toast("Erro ao excluir."));
      }
    });

    li.append(fields, up, down, del);
    ul.appendChild(li);
  });
}

// ---------- backup ----------

function buildBackup() {
  const iso = (t) => (t && typeof t.toDate === "function" ? t.toDate().toISOString() : null);
  return {
    app: "Treino",
    version: APP_VERSION,
    exportedAt: new Date().toISOString(),
    muscles: state.muscles.map(({ id, name, order }) => ({ id, name, order })),
    cardioTypes: state.cardioTypes.map(({ id, name, note, order }) => ({
      id,
      name,
      note: note || "",
      order,
    })),
    exercises: state.exercises.map((e) => ({
      id: e.id,
      name: e.name,
      primaryMuscleId: e.primaryMuscleId || null,
      secondaryMuscleIds: e.secondaryMuscleIds || [],
      similarIds: e.similarIds || [],
      refWeight: e.refWeight || "",
      note: e.note || "",
      createdAt: iso(e.createdAt),
      updatedAt: iso(e.updatedAt),
    })),
    programs: state.programs.map(({ id, name, order }) => ({ id, name, order })),
    days: state.days.map(({ id, programId, name, order, entries }) => ({
      id,
      programId,
      name,
      order,
      entries: entries || [],
    })),
    logs: state.logs.map((l) => ({
      id: l.id,
      date: l.date,
      programId: l.programId || null,
      dayId: l.dayId || null,
      exerciseId: l.exerciseId,
      exerciseName: l.exerciseName || "",
      dayName: l.dayName || "",
      programName: l.programName || "",
      sets: l.sets || [],
    })),
    sessions: state.sessions.map((session) => ({
      id: session.id,
      date: session.date,
      programId: session.programId || null,
      dayId: session.dayId,
      dayName: session.dayName || "",
      programName: session.programName || "",
      finishedAt: iso(session.finishedAt),
    })),
    cardio: state.cardio.map((entry) => ({
      id: entry.id,
      date: entry.date,
      typeId: entry.typeId,
      typeName: entry.typeName || "",
      minutes: entry.minutes,
      note: entry.note || "",
    })),
  };
}

async function exportBackup() {
  const data = buildBackup();
  const json = JSON.stringify(data, null, 2);
  const filename = `treino-backup-${data.exportedAt.slice(0, 10)}.json`;

  // iOS standalone: the share sheet ("Salvar em Arquivos") is the reliable
  // path; plain downloads are flaky there. Elsewhere, a regular download.
  const file = new File([json], filename, { type: "application/json" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (ex) {
      if (ex.name === "AbortError") return; // user closed the sheet
      // fall through to download
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  toast("Backup exportado.");
}

function importBackupFile(file) {
  file
    .text()
    .then((text) => {
      const data = JSON.parse(text);
      if (!data || !Array.isArray(data.exercises) || !Array.isArray(data.logs)) {
        throw new Error("formato");
      }
      const when = (data.exportedAt || "").slice(0, 10) || "data desconhecida";
      if (
        !confirm(
          `Importar backup de ${when}?\n${data.exercises.length} exercícios e ${data.logs.length} registros de treino serão restaurados. Docs atuais com o mesmo id serão sobrescritos; nada é apagado.`
        )
      ) {
        return;
      }
      db.importBackup(data)
        .then(() => toast("Backup restaurado."))
        .catch(() => toast("Erro ao restaurar o backup."));
    })
    .catch(() => toast("Arquivo de backup inválido."));
}

// ---------- rest timer ----------
// The absolute end time lives in localStorage, so the countdown survives
// reloads and tab switches; the interval just recomputes from Date.now().
// Checking a set auto-starts DEFAULT_REST_SECS. The floating bar stays up for
// the running countdown AND for the finished (blinking) state, and carries its
// own 60/90/120 buttons; the inline preset row on the Treino tab is the
// alternative entry point when no countdown is running.

const TIMER_KEY = "gym:timerEnd";
const DEFAULT_REST_SECS = 90;
let timerInterval = null;
let timerActive = false;
let timerFinished = false;

function startTimer(secs) {
  timerFinished = false;
  $("timer-bar").classList.remove("flash");
  localStorage.setItem(TIMER_KEY, String(Date.now() + secs * 1000));
  runTimer();
}

function clearFinishedTimer() {
  if (!timerFinished) return;
  timerFinished = false;
  $("timer-bar").classList.remove("flash");
  updateTimerVisibility();
}

function cancelTimer() {
  localStorage.removeItem(TIMER_KEY);
  clearInterval(timerInterval);
  timerInterval = null;
  timerActive = false;
  timerFinished = false;
  $("timer-bar").classList.remove("flash");
  updateTimerVisibility();
}

function runTimer() {
  timerActive = true;
  updateTimerVisibility();
  clearInterval(timerInterval);
  const tick = () => {
    const end = Number(localStorage.getItem(TIMER_KEY) || 0);
    const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
    $("timer-display").textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
    if (left <= 0) {
      clearInterval(timerInterval);
      timerInterval = null;
      localStorage.removeItem(TIMER_KEY);
      timerActive = false;
      timerFinished = true;
      $("timer-bar").classList.add("flash");
      updateTimerVisibility();
    }
  };
  tick();
  timerInterval = setInterval(tick, 250);
}

// The bar shows for an active or finished countdown, only on the Treino tab.
function updateTimerVisibility() {
  $("timer-bar").hidden = (!timerActive && !timerFinished) || state.tab !== "treino";
}

// ---------- snapshot handlers ----------

const REFWEIGHT_MIGRATION_KEY = "gym:migrate-refweight-v6";
const NOTE_DASH_FIX_KEY = "gym:fix-note-dash-v6-3";
const SMITH_SEED_KEY = "gym:seed-smith-v6";
const CARDIO_BIKES_KEY = "gym:cardio-bikes-v6-1";
const FINISH_BACKFILL_KEY = "gym:session-backfill-v6-5";
const MUSCLE_REVIEW_KEY = "gym:muscle-review-v7-2";
const MUSCLE_TAXONOMY_KEY = "gym:muscle-taxonomy-v7-3";
const FINISH_BACKFILL_DATES = ["2026-09-05"];
const MUSCLE_TAXONOMY = [
  ["mus-peito", "Peito"],
  ["mus-ombro-anterior", "Ombro anterior"],
  ["mus-ombro-lateral", "Ombro lateral"],
  ["mus-ombro-posterior", "Ombro posterior"],
  ["mus-dorsais", "Dorsais"],
  ["mus-costas-superiores", "Costas superiores"],
  ["mus-biceps", "Bíceps"],
  ["mus-triceps", "Tríceps"],
  ["mus-antebraco", "Antebraço"],
  ["mus-quadriceps", "Quadríceps"],
  ["mus-posterior", "Posterior de coxa"],
  ["mus-gluteos", "Glúteos"],
  ["mus-panturrilha", "Panturrilha"],
  ["mus-abdomen", "Abdômen"],
  ["mus-lombar", "Lombar (eretores)"],
  ["mus-adutores", "Adutores/Abdutores"],
].map(([id, name], order) => ({ id, name, order }));
const MUSCLE_TAXONOMY_DELETIONS = ["mus-ombros", "mus-costas", "mus-trapezio"];
const MUSCLE_TAXONOMY_CORRECTIONS = [
  ["ex-supino_maquina", "mus-peito", ["mus-ombro-anterior", "mus-triceps"]],
  ["ex-supino_inclinado_halteres", "mus-peito", ["mus-ombro-anterior", "mus-triceps"]],
  ["fLUBCdfEvnJrwimwXUfG", "mus-peito", ["mus-triceps"]],
  ["ex-crucifixo_maquina", "mus-peito", ["mus-ombro-anterior"]],
  ["ex-desenvolvimento_ombros_maquina", "mus-ombro-anterior", ["mus-ombro-lateral", "mus-triceps"]],
  ["ex-elevacao_lateral_unilateral_polia", "mus-ombro-lateral", []],
  ["vfXcO0ys5my91L1gGg3c", "mus-ombro-lateral", []],
  ["ex-face_pull", "mus-ombro-posterior", ["mus-costas-superiores"]],
  ["ex-puxada_alta_maquina", "mus-dorsais", ["mus-biceps"]],
  ["wUvgBaVruroejSdT6qJy", "mus-dorsais", ["mus-biceps"]],
  ["ex-remada_fechada_unilateral_maquina", "mus-dorsais", ["mus-biceps", "mus-costas-superiores"]],
  ["ex-remada_alta_articulada_maquina", "mus-costas-superiores", ["mus-ombro-posterior", "mus-biceps"]],
  ["ex-biceps_maquina", "mus-biceps", ["mus-antebraco"]],
  ["ex-biceps_scott_unilateral_halter", "mus-biceps", ["mus-antebraco"]],
  ["ex-triceps_pushdown", "mus-triceps", []],
  ["qIWbCS3Tz8B249g7OMH5", "mus-triceps", []],
  ["ex-triceps_frances_unilateral_halter", "mus-triceps", []],
  ["ex-triceps_testa_polia", "mus-triceps", []],
  ["ex-agachamento_pendulo", "mus-quadriceps", ["mus-gluteos", "mus-adutores"]],
  ["ex-agachamento-smith", "mus-quadriceps", ["mus-gluteos", "mus-adutores"]],
  ["ex-agachamento_bulgaro", "mus-quadriceps", ["mus-gluteos"]],
  ["ex-leg_press_45", "mus-quadriceps", ["mus-gluteos", "mus-adutores"]],
  ["faPCuEBTOUqy3pbFVlhd", "mus-quadriceps", ["mus-gluteos", "mus-adutores"]],
  ["ex-cadeira_extensora", "mus-quadriceps", []],
  ["ex-cadeira_flexora_bilateral", "mus-posterior", []],
  ["ex-cadeira_flexora_unilateral", "mus-posterior", []],
  ["ex-rdl_stiff", "mus-posterior", ["mus-gluteos", "mus-lombar"]],
  ["ex-hip_thrust", "mus-gluteos", ["mus-posterior"]],
  ["ex-abdutora_maquina", "mus-gluteos", []],
  ["ex-panturrilha_smith", "mus-panturrilha", []],
  ["ex-panturrilha_leg_press", "mus-panturrilha", []],
  ["RaGL7etCaIjoUIA0tVje", "mus-panturrilha", []],
  ["ex-abdominal_maquina", "mus-abdomen", []],
];
let refWeightMigrationStarted = false;
let noteDashFixStarted = false;
let smithSeedStarted = false;
let cardioBikesStarted = false;
let finishBackfillStarted = false;
let muscleTaxonomyStarted = false;
let muscleSnapshotReady = false;
let exerciseSnapshotReady = false;

async function migrateRefWeights(exercises) {
  if (refWeightMigrationStarted || localStorage.getItem(REFWEIGHT_MIGRATION_KEY)) return;
  refWeightMigrationStarted = true;
  const numericOnly = /^\d+(?:[.,]\d+)?$/;
  const writes = [];

  exercises.forEach((ex) => {
    const oldRef = String(ex.refWeight || "").trim();
    if (!oldRef || numericOnly.test(oldRef)) return;

    const match = oldRef.match(/\d+(?:[.,]\d+)?/);
    const refWeight = match ? match[0].replace(",", ".") : "";
    // drop a leftover unit right after the number ("12 kg cada" -> "cada")
    const remainder = (match ? oldRef.replace(match[0], "") : oldRef)
      .replace(/^\s*kg\b\.?/i, "")
      .trim();
    const oldNote = String(ex.note || "").trim();
    const note = remainder ? [oldNote, remainder].filter(Boolean).join("\n") : oldNote;
    if (refWeight === oldRef && note === oldNote) return;

    writes.push(db.updateExercise(ex.id, {
      name: ex.name,
      primaryMuscleId: ex.primaryMuscleId,
      secondaryMuscleIds: ex.secondaryMuscleIds || [],
      similarIds: ex.similarIds || [],
      refWeight,
      note,
    }));
  });

  try {
    await Promise.all(writes);
    localStorage.setItem(REFWEIGHT_MIGRATION_KEY, "1");
  } catch {
    toast("Erro ao atualizar pesos de referência.");
  }
}

async function fixNoteDashes(exercises) {
  if (noteDashFixStarted || localStorage.getItem(NOTE_DASH_FIX_KEY)) return;
  noteDashFixStarted = true;
  const writes = [];

  exercises.forEach((ex) => {
    const oldNote = String(ex.note || "");
    const note = oldNote
      .split("\n")
      .map((line) => line.replace(/^\s*[-–—]\s*(?=\d)/, ""))
      .join("\n");
    if (note === oldNote) return;

    writes.push(db.updateExercise(ex.id, {
      name: ex.name,
      primaryMuscleId: ex.primaryMuscleId,
      secondaryMuscleIds: ex.secondaryMuscleIds || [],
      similarIds: ex.similarIds || [],
      refWeight: ex.refWeight,
      note,
    }));
  });

  try {
    await Promise.all(writes);
    localStorage.setItem(NOTE_DASH_FIX_KEY, "1");
  } catch {
    toast("Erro ao corrigir notas.");
  }
}

async function seedSmithExercise(exercises) {
  if (smithSeedStarted || localStorage.getItem(SMITH_SEED_KEY)) return;
  smithSeedStarted = true;
  if (exercises.some((ex) => ex.id === "ex-agachamento-smith")) {
    localStorage.setItem(SMITH_SEED_KEY, "1");
    return;
  }
  try {
    await db.createExerciseWithId("ex-agachamento-smith", {
      name: "Agachamento smith",
      primaryMuscleId: "mus-quadriceps",
      secondaryMuscleIds: ["mus-gluteos", "mus-adutores"],
      refWeight: "",
      note: "",
    });
    localStorage.setItem(SMITH_SEED_KEY, "1");
  } catch {
    toast("Erro ao adicionar Agachamento smith.");
  }
}

async function upsertCardioBikes(types) {
  if (cardioBikesStarted || localStorage.getItem(CARDIO_BIKES_KEY)) return;
  cardioBikesStarted = true;
  const orders = {
    "ct-eliptico": 2,
    "ct-esteira": 3,
    "ct-escada": 4,
    "ct-corrida": 5,
    "ct-remo": 6,
    "ct-outro": 7,
  };
  const typeWrites = [
    {
      id: "ct-bike",
      name: "Bike s/ suporte",
      note: "banco ruim · pos. 13, banco pos. 4",
      order: 0,
    },
    { id: "ct-bike-suporte", name: "Bike c/ suporte", note: "pos. 25", order: 1 },
    ...types
      .filter((type) => Object.hasOwn(orders, type.id))
      .map((type) => ({ id: type.id, order: orders[type.id] })),
  ];

  try {
    await db.upsertCardioTypes(typeWrites);
    await Promise.all([
      db.createCardioWithId("backfill-2026-09-02-bike", {
        date: "2026-09-02",
        typeId: "ct-bike",
        typeName: "Bike s/ suporte",
        minutes: 20,
        note: "dificuldade 8",
      }),
      db.createCardioWithId("backfill-2026-09-03-eliptico", {
        date: "2026-09-03",
        typeId: "ct-eliptico",
        typeName: "Elíptico",
        minutes: 30,
        note: "dificuldade 8",
      }),
    ]);
    localStorage.setItem(CARDIO_BIKES_KEY, "1");
  } catch {
    toast("Erro ao atualizar tipos e registros de cardio.");
  }
}

async function applyMuscleTaxonomy() {
  if (muscleTaxonomyStarted || localStorage.getItem(MUSCLE_TAXONOMY_KEY)) return;
  if (!muscleSnapshotReady || !exerciseSnapshotReady) return;
  muscleTaxonomyStarted = true;
  const corrections = MUSCLE_TAXONOMY_CORRECTIONS
    .filter(([id]) => state.exercisesById.has(id))
    .map(([id, primaryMuscleId, secondaryMuscleIds]) => ({
      id,
      primaryMuscleId,
      secondaryMuscleIds,
    }));

  try {
    await db.migrateMuscleTaxonomy({
      muscles: MUSCLE_TAXONOMY,
      corrections,
      deleteIds: MUSCLE_TAXONOMY_DELETIONS,
    });
    localStorage.setItem(MUSCLE_TAXONOMY_KEY, "1");
    localStorage.setItem(MUSCLE_REVIEW_KEY, "1");
  } catch {
    muscleTaxonomyStarted = false;
    toast("Erro ao atualizar a taxonomia muscular.");
  }
}

// Sessions finished before v6.5 left no record: "Finalizar treino" used to
// write nothing, so a day trained with one exercise left over never got its
// check. Marks those days as finished from the logs they do have, so the id
// is resolved at runtime and never goes stale.
async function backfillFinishedSessions(logs) {
  if (finishBackfillStarted || localStorage.getItem(FINISH_BACKFILL_KEY)) return;
  const dated = logs.filter((log) => FINISH_BACKFILL_DATES.includes(log.date) && log.dayId);
  if (dated.length === 0) return; // logs not in yet; the next snapshot retries
  finishBackfillStarted = true;

  const byDay = new Map();
  dated.forEach((log) => {
    const key = `${log.date}|${log.dayId}`;
    if (!byDay.has(key)) byDay.set(key, log);
  });

  try {
    await Promise.all([...byDay.values()].map((log) => db.finishSession({
      date: log.date,
      programId: log.programId || null,
      dayId: log.dayId,
      dayName: log.dayName || "",
      programName: log.programName || "",
    })));
    localStorage.setItem(FINISH_BACKFILL_KEY, "1");
  } catch {
    finishBackfillStarted = false; // let the next snapshot try again
  }
}

function onMuscles(muscles) {
  if (muscles.length === 0 && !state.seededMuscles) {
    state.seededMuscles = true;
    db.seedMuscles().catch(() => {});
    return;
  }
  state.muscles = sortByOrder(muscles);
  muscleSnapshotReady = true;
  applyMuscleTaxonomy();
  renderMuscleChips();
  renderMusclesManager();
  renderExercises();
  renderTreino();
  renderSeries();
}

function onExercises(exercises) {
  if (exercises.length === 0 && !state.seededExercises) {
    state.seededExercises = true;
    db.seedExercises().catch(() => toast("Erro ao criar exercícios iniciais."));
    return;
  }
  state.exercises = exercises;
  state.exercisesById = new Map(exercises.map((e) => [e.id, e]));
  exerciseSnapshotReady = true;
  migrateRefWeights(exercises);
  fixNoteDashes(exercises);
  seedSmithExercise(exercises);
  applyMuscleTaxonomy();
  renderExercises();
  renderTreino();
  renderSeries();
}

function onPrograms(programs) {
  if (programs.length === 0 && !state.seededPrograms) {
    state.seededPrograms = true;
    db.seedPrograms().catch(() => toast("Erro ao criar programas iniciais."));
    return;
  }
  state.programs = sortByOrder(programs);
  renderProgramsList();
  renderTreino();
}

function onDays(days) {
  state.days = days;
  renderProgramsList();
  renderTreino();
}

function onLogs(logs) {
  state.logs = logs;
  state.logsById = new Map(logs.map((l) => [l.id, l]));
  backfillFinishedSessions(logs);
  renderTreino();
  renderExercises();
  renderHist();
  renderSeries();
  if (!$("sheet-exlog").hidden) renderExerciseLog();
}

let pendingFinishToastId = null;
let pendingFinishSkippedCount = 0;

function showCompletedCycle(program, progress) {
  $("cycle-sub").textContent =
    `Você concluiu os ${progress.total} treinos de ${program.name}.`;
  const list = $("cycle-list");
  list.innerHTML = "";
  progress.completed.days.forEach((day) => {
    const li = document.createElement("li");
    li.className = "row-line";
    const name = document.createElement("span");
    name.className = "row-name";
    name.textContent = day.dayName;
    const date = document.createElement("span");
    date.className = "row-sub";
    date.textContent = fmtDate(day.date);
    li.append(name, date);
    list.appendChild(li);
  });
  openSheet("sheet-cycle");
}

function onSessions(sessions) {
  state.sessions = sessions;
  renderTreino();
  queueMicrotask(() => {
    if (state.sessions !== sessions) return;
    const program = currentProgram();
    const progress = cycleProgress(state.programId, daysOf(state.programId), sessions);
    const completed = progress.completed;
    const guardKey = `gym:cycle-celebrated:${state.programId}`;
    const shouldCelebrate =
      !!program && !!completed && localStorage.getItem(guardKey) !== completed.key;
    if (shouldCelebrate) {
      localStorage.setItem(guardKey, completed.key);
      showCompletedCycle(program, progress);
    }

    if (pendingFinishToastId && sessions.some((session) => session.id === pendingFinishToastId)) {
      const skipped = pendingFinishSkippedCount;
      pendingFinishToastId = null;
      pendingFinishSkippedCount = 0;
      if (skipped > 0) {
        toast(skipped === 1
          ? "Treino registrado; substituto removido ignorado."
          : `Treino registrado; ${skipped} substitutos removidos ignorados.`);
      } else if (!shouldCelebrate) {
        toast("Treino registrado. Bom descanso!");
      }
    }
  });
}

function onCardioTypes(types) {
  if (types.length === 0 && !state.seededCardioTypes) {
    state.seededCardioTypes = true;
    db.seedCardioTypes().catch(() => toast("Erro ao criar tipos de cardio iniciais."));
    return;
  }
  state.cardioTypes = sortByOrder(types);
  upsertCardioBikes(types);
  renderCardioTypesManager();
}

function onCardio(cardio) {
  state.cardio = cardio;
  renderCardioTypesManager();
  renderHist();
}

// ---------- tabs ----------

function switchTab(tab) {
  if (tab !== "treino" && state.reorderMode) {
    state.reorderMode = false;
    renderTreino();
  }
  state.tab = tab;
  document.querySelectorAll(".tab").forEach((s) => (s.hidden = s.id !== `tab-${tab}`));
  document.querySelectorAll(".tabbtn").forEach((b) =>
    b.classList.toggle("active", b.dataset.tab === tab)
  );
  if (tab === "series") renderSeries();
  updateTimerVisibility();
  window.scrollTo(0, 0);
}

// ---------- auth + boot ----------

function hideBootSplash() {
  const splash = $("boot-splash");
  if (!splash || splash.hidden || splash.classList.contains("is-hiding")) return;
  splash.classList.add("is-hiding");
  const finish = () => {
    splash.hidden = true;
  };
  splash.addEventListener("transitionend", finish, { once: true });
  window.setTimeout(finish, 220);
}

function showLogin() {
  hideBootSplash();
  $("screen-login").hidden = false;
  $("app-shell").hidden = true;
}

function showApp() {
  hideBootSplash();
  $("screen-login").hidden = true;
  $("app-shell").hidden = false;
  startListeners();
}

function startListeners() {
  if (state.listenersStarted) return;
  state.listenersStarted = true;
  const err = () => toast("Erro de conexão com o banco.");
  db.listenMuscles(onMuscles, err);
  db.listenExercises(onExercises, err);
  db.listenPrograms(onPrograms, err);
  db.listenDays(onDays, err);
  db.listenLogs(onLogs, err);
  db.listenSessions(onSessions, err);
  db.listenCardioTypes(onCardioTypes, err);
  db.listenCardio(onCardio, err);
}

const LOGIN_ERRORS = {
  "auth/invalid-email": "E-mail inválido.",
  "auth/user-not-found": "E-mail ou senha incorretos.",
  "auth/wrong-password": "E-mail ou senha incorretos.",
  "auth/invalid-credential": "E-mail ou senha incorretos.",
  "auth/too-many-requests": "Muitas tentativas. Aguarde um pouco.",
  "auth/network-request-failed": "Sem conexão. Tente novamente.",
};

async function handleLogin(e) {
  e.preventDefault();
  const btn = $("btn-login");
  const errEl = $("login-error");
  errEl.hidden = true;
  btn.disabled = true;
  btn.textContent = "Entrando…";
  try {
    await db.login($("login-email").value.trim(), $("login-password").value);
    // watchAuth flips the screens.
  } catch (ex) {
    errEl.textContent = LOGIN_ERRORS[ex.code] || "Não foi possível entrar. Tente novamente.";
    errEl.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = "Entrar";
  }
}

// ---------- offline indicator ----------

function updateOnline() {
  $("offline-banner").hidden = navigator.onLine;
}

function wireVisualViewportBars() {
  const viewport = window.visualViewport;
  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!viewport || !isIOS) return;

  let frame = 0;
  let settleTimer = 0;
  const update = () => {
    frame = 0;
    const bottom = Math.max(
      0,
      document.documentElement.clientHeight - viewport.height - viewport.offsetTop
    );
    document.documentElement.style.setProperty("--visual-viewport-bottom", `${Math.round(bottom)}px`);
  };
  const queueUpdate = () => {
    window.cancelAnimationFrame(frame);
    window.clearTimeout(settleTimer);
    frame = window.requestAnimationFrame(update);
    settleTimer = window.setTimeout(update, 80);
  };

  viewport.addEventListener("resize", queueUpdate);
  viewport.addEventListener("scroll", queueUpdate);
  document.addEventListener("focusout", (e) => {
    if (!e.target.matches("input, textarea, select")) return;
    window.setTimeout(queueUpdate, 300);
  });
  queueUpdate();
}

// ---------- wiring ----------

function wire() {
  wireVisualViewportBars();

  // login
  $("login-form").addEventListener("submit", handleLogin);

  // tabs
  document.querySelectorAll(".tabbtn").forEach((b) =>
    b.addEventListener("click", () => switchTab(b.dataset.tab))
  );

  // treino
  $("program-select").addEventListener("change", (e) => {
    state.reorderMode = false;
    state.programId = e.target.value;
    localStorage.setItem("gym:program", state.programId);
    state.dayId = null; // re-picked in selectDefaults
    renderTreino();
  });
  $("btn-programs").addEventListener("click", () => {
    renderProgramsList();
    openSheet("sheet-programs");
  });
  $("btn-edit-day").addEventListener("click", () => {
    if (state.dayId) openDaySheet(state.dayId);
  });
  $("btn-reorder").addEventListener("click", () => {
    state.reorderMode = !state.reorderMode;
    renderTreino();
  });
  $("btn-finish-workout").addEventListener("click", toggleWorkout);
  $("btn-finish-confirm").addEventListener("click", confirmFinishWorkout);
  $("btn-finish-reopen").addEventListener("click", unfinishWorkout);
  $("btn-add-cardio").addEventListener("click", openCardioSheet);
  $("cardio-type").addEventListener("change", updateCardioTypeNote);
  $("cardio-form").addEventListener("submit", submitCardio);
  $("detail-form").addEventListener("submit", submitDetailForm);
  $("detail-substitute-select").addEventListener("change", (e) => {
    if (e.target.value) chooseSubstituteToday(e.target.value);
  });
  $("btn-detail-substitute-undo").addEventListener("click", restoreOriginalToday);
  $("program-add-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("program-add-name").value.trim();
    if (!name) return;
    const maxOrder = state.programs.reduce((m, p) => Math.max(m, p.order ?? 0), -1);
    db.addProgram(name, maxOrder + 1).catch(() => toast("Erro ao adicionar programa."));
    $("program-add-name").value = "";
  });

  // day sheet
  $("day-form").addEventListener("submit", submitDayForm);
  $("day-ex-search").addEventListener("input", renderDayExResults);
  $("day-ex-search").addEventListener("keydown", (e) => {
    // Enter picks the first suggestion instead of submitting the form
    if (e.key !== "Enter") return;
    e.preventDefault();
    const first = $("day-ex-results").querySelector(".picker-result");
    if (first) first.dispatchEvent(new PointerEvent("pointerdown", { cancelable: true }));
  });
  $("day-ex-search").addEventListener("blur", () => {
    setTimeout(() => ($("day-ex-results").hidden = true), 200);
  });
  $("btn-day-delete").addEventListener("click", () => {
    const day = state.days.find((d) => d.id === state.editingDayId);
    if (day && confirm(`Excluir o dia "${day.name}"?\nO histórico é mantido.`)) {
      db.deleteDay(day.id).catch(() => toast("Erro ao excluir."));
      closeSheets();
    }
  });

  // exercícios
  $("ex-search").addEventListener("input", (e) => {
    state.search = e.target.value;
    renderExercises();
  });
  $("fab-new-exercise").addEventListener("click", () => openExerciseSheet(null));
  $("exercise-form").addEventListener("submit", submitExerciseForm);
  exerciseMuscleComboboxes.primary = muscleCombobox({
    inputEl: $("ex-primary"),
    listEl: $("ex-primary-list"),
    tagsEl: $("ex-primary-tags"),
    multi: false,
    getPicked: () => state.draftPrimaryMuscleId,
    onPick: (id) => {
      state.draftPrimaryMuscleId = id;
      renderExerciseSheetGrids();
    },
  });
  exerciseMuscleComboboxes.secondary = muscleCombobox({
    inputEl: $("ex-secondary"),
    listEl: $("ex-secondary-list"),
    tagsEl: $("ex-secondary-tags"),
    multi: true,
    getPicked: () => state.draftSecondary,
    getExcluded: () => new Set([state.draftPrimaryMuscleId]),
    onPick: (id, picked) => {
      if (picked) state.draftSecondary.add(id);
      else state.draftSecondary.delete(id);
      renderExerciseSheetGrids();
    },
  });
  exerciseSimilarCombobox = similarExerciseCombobox({
    inputEl: $("ex-similar"),
    listEl: $("ex-similar-list"),
    tagsEl: $("ex-similar-tags"),
  });
  $("btn-exercise-delete").addEventListener("click", deleteCurrentExercise);

  // histórico
  document.querySelectorAll("#hist-seg .seg-btn").forEach((b) =>
    b.addEventListener("click", () => {
      state.histView = b.dataset.view;
      renderHist();
    })
  );
  $("prog-exercise").addEventListener("change", (e) => {
    state.progExerciseId = e.target.value;
    renderProgress();
  });

  // séries
  $("series-prev").addEventListener("click", () => {
    state.seriesWeekOffset--;
    state.seriesOpenMuscleId = null;
    renderSeries();
  });
  $("series-next").addEventListener("click", () => {
    state.seriesWeekOffset = Math.min(0, state.seriesWeekOffset + 1);
    state.seriesOpenMuscleId = null;
    renderSeries();
  });

  // timer
  document.querySelectorAll(".timer-preset").forEach((b) =>
    b.addEventListener("click", () => startTimer(Number(b.dataset.secs)))
  );
  document.querySelectorAll(".timer-adjust").forEach((btn) =>
    btn.addEventListener("click", () => startTimer(Number(btn.dataset.secs)))
  );
  $("timer-cancel").addEventListener("click", cancelTimer);

  ["ex-refweight", "det-refweight"].forEach((id) => {
    const input = $(id);
    input.addEventListener("input", () => {
      const normalized = normalizeDecimalInput(input.value);
      if (normalized !== input.value) input.value = normalized;
    });
  });

  // ajustes
  $("muscle-add-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("muscle-add-name").value.trim();
    if (!name) return;
    const maxOrder = state.muscles.reduce((m, s) => Math.max(m, s.order ?? 0), -1);
    db.addMuscle(name, maxOrder + 1).catch(() => toast("Erro ao adicionar grupo."));
    $("muscle-add-name").value = "";
  });
  $("cardio-type-add-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("cardio-type-add-name").value.trim();
    if (!name) return;
    const maxOrder = state.cardioTypes.reduce((m, type) => Math.max(m, type.order ?? 0), -1);
    db.addCardioType(name, maxOrder + 1).catch(() => toast("Erro ao adicionar tipo."));
    $("cardio-type-add-name").value = "";
  });
  $("btn-export").addEventListener("click", exportBackup);
  $("btn-import").addEventListener("click", () => $("import-file").click());
  $("import-file").addEventListener("change", (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (file) importBackupFile(file);
  });
  $("btn-logout").addEventListener("click", () => {
    if (confirm("Sair da conta neste aparelho?")) db.logout();
  });

  // sheets
  $("btn-detail-history").addEventListener("click", () => openExerciseLog(state.detailEffectiveExerciseId));
  $("btn-exercise-history").addEventListener("click", () => openExerciseLog(state.editingExerciseId));
  $("btn-exlog-close").addEventListener("click", closeExerciseLog);
  $("sheet-backdrop").addEventListener("click", closeSheets);
  document.querySelectorAll("[data-close]").forEach((b) =>
    b.addEventListener("click", closeSheets)
  );

  // offline indicator
  window.addEventListener("online", updateOnline);
  window.addEventListener("offline", updateOnline);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    const today = todayStr();
    if (state.lastTreinoRenderDate && today !== state.lastTreinoRenderDate) renderTreino();
  });
  updateOnline();
}

function boot() {
  wire();
  $("app-version").textContent = `Treino · ${APP_VERSION}`;
  if (db === fakeDb) {
    // #debug test hooks
    window.__buildBackup = buildBackup;
    window.__state = state;
  }

  // iOS install hint (login screen only)
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  $("install-card").hidden = !!standalone;

  // resume a rest timer that survived a reload
  if (Number(localStorage.getItem(TIMER_KEY) || 0) > Date.now()) runTimer();
  else updateTimerVisibility();

  if (!db.isConfigured()) {
    hideBootSplash();
    showLogin();
    $("setup-warning").hidden = false;
    $("login-form").querySelectorAll("input, button").forEach((el) => (el.disabled = true));
    return;
  }

  db.init();
  db.watchAuth((user) => {
    if (user) showApp();
    else showLogin();
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).catch(() => {});
  }
}

boot();
