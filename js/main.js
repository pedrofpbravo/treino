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
  fmtDateFull,
  logDocId,
  lastLogFor,
  prefillSets,
  entryReps,
  parseRefWeight,
  targetLabel,
  setsLabel,
  groupSessions,
  progressionSeries,
  exercisesFromLogs,
  weeklyFrequency,
  sortByOrder,
  sortExercises,
} from "./logic.js";
import { lineChart, barChart } from "./charts.js";

// Shown in Ajustes so anyone can tell which deploy a phone is running.
// Keep in sync with CACHE in sw.js.
const APP_VERSION = "v5";

const $ = (id) => document.getElementById(id);

// ---------- state ----------

const state = {
  muscles: [], // sorted by order
  exercises: [],
  exercisesById: new Map(),
  programs: [], // sorted by order
  days: [],
  logs: [],
  logsById: new Map(),
  tab: "treino",
  programId: localStorage.getItem("gym:program") || null,
  dayId: localStorage.getItem("gym:day") || null,
  search: "",
  muscleFilters: new Set(),
  histView: "sessoes",
  progExerciseId: null,
  editingExerciseId: null,
  editingDayId: null,
  detailExerciseId: null,
  draftEntries: [], // day sheet: [{exerciseId, targetSets, repMin, repMax}]
  draftSecondary: new Set(), // exercise sheet muscle picks
  draftOthers: new Set(),
  seededMuscles: false,
  seededExercises: false,
  seededPrograms: false,
  listenersStarted: false,
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
  $("sheet-backdrop").hidden = true;
  document.querySelectorAll(".sheet").forEach((s) => (s.hidden = true));
}

function muscleName(id) {
  return state.muscles.find((m) => m.id === id)?.name || "";
}

function muscleSummary(ex) {
  const extras = [...(ex.secondaryMuscleIds || []), ...(ex.otherMuscleIds || [])]
    .map(muscleName)
    .filter(Boolean);
  const main = muscleName(ex.primaryMuscleId);
  if (!main) return extras.join(", ");
  return extras.length > 0 ? `${main} · ${extras.join(", ")}` : main;
}

const currentProgram = () => state.programs.find((p) => p.id === state.programId) || null;
const currentDay = () => state.days.find((d) => d.id === state.dayId) || null;
const daysOf = (programId) =>
  sortByOrder(state.days.filter((d) => d.programId === programId));

// Reference line for an exercise: last logged weight wins, refWeight as
// fallback before any history exists. The workout card passes today as
// beforeDate so it always compares against the PREVIOUS session.
function lastLine(exerciseId, refWeight, beforeDate = "9999-99-99") {
  const last = lastLogFor(state.logs, exerciseId, beforeDate);
  if (last) return { label: "Último", text: setsLabel(last.sets), date: fmtDate(last.date) };
  if (refWeight) return { label: "Ref", text: refWeight, date: "" };
  return null;
}

// ---------- treino ----------

function selectDefaults() {
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
}

function renderTreino() {
  selectDefaults();

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
  days.forEach((day) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip" + (day.id === state.dayId ? " on" : "");
    chip.textContent = day.name;
    chip.addEventListener("click", () => {
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
  renderWorkout();
}

function renderWorkout() {
  const listEl = $("workout-list");
  listEl.innerHTML = "";
  const day = currentDay();

  $("workout-noday").hidden = !!day || state.programs.length === 0;
  if (!day) {
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

  const today = todayStr();
  let done = 0;
  entries.forEach((entry) => {
    const logId = logDocId({ date: today, dayId: day.id, exerciseId: entry.exerciseId });
    if (state.logsById.has(logId)) done++;
    listEl.appendChild(buildWorkoutCard(entry, day, logId));
  });
  $("day-progress").textContent =
    entries.length > 0 ? `${done}/${entries.length} feitos hoje` : "";
  $("btn-finish-workout").hidden = done === 0;
}

// Compact card, uniform height: name + target, reference line, one-line
// note. Muscles live in the Exercícios tab and the detail sheet. Tapping
// the card body opens the quick-detail sheet; the circle toggles done.
function buildWorkoutCard(entry, day, logId) {
  const ex = state.exercisesById.get(entry.exerciseId);
  const log = state.logsById.get(logId);
  const program = currentProgram();

  const card = document.createElement("div");
  card.className = "workout-card" + (log ? " done" : "");

  const top = document.createElement("div");
  top.className = "wc-top";

  const check = document.createElement("button");
  check.type = "button";
  check.className = "wc-check";
  check.textContent = "✓";
  check.setAttribute("aria-label", log ? "Desmarcar" : "Marcar como feito");
  check.addEventListener("click", (e) => {
    e.stopPropagation();
    if (log) {
      db.deleteLog(logId).catch(() => toast("Erro ao remover."));
      toast("Registro removido.");
    } else {
      const last = lastLogFor(state.logs, entry.exerciseId, todayStr());
      db.saveLog({
        date: todayStr(),
        programId: program?.id || day.programId,
        dayId: day.id,
        exerciseId: entry.exerciseId,
        exerciseName: ex?.name || entry.exerciseId,
        dayName: day.name,
        programName: program?.name || "",
        sets: prefillSets(last, entry, parseRefWeight(ex?.refWeight)),
      }).catch(() => toast("Erro ao salvar."));
    }
  });

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

  const ref = lastLine(entry.exerciseId, ex?.refWeight, todayStr());
  const lastEl = document.createElement("span");
  lastEl.className = "wc-last";
  if (ref) {
    lastEl.innerHTML = `${ref.label}: <b></b>${ref.date ? ` · ${ref.date}` : ""}`;
    lastEl.querySelector("b").textContent = ref.text;
  } else {
    lastEl.innerHTML = "&nbsp;";
  }
  main.appendChild(lastEl);

  // always rendered (possibly empty) so every card has the same height
  const note = document.createElement("span");
  note.className = "wc-note";
  note.textContent = ex?.note ? ex.note.replace(/\n/g, " · ") : "";
  if (!ex?.note) note.innerHTML = "&nbsp;";
  main.appendChild(note);

  top.append(check, main);
  card.appendChild(top);

  if (ex) {
    card.addEventListener("click", (e) => {
      if (e.target.closest(".wc-check") || e.target.closest(".sets-editor")) return;
      openDetailSheet(entry.exerciseId);
    });
  }

  if (log) card.appendChild(buildSetsEditor(entry, day, log));
  return card;
}

// ---------- quick-detail sheet (tap on a workout card) ----------
// Edits the things you touch mid-workout: this day's target (sets x reps),
// the reference weight and the machine-adjustment note. Name and muscles
// are edited in the Exercícios tab.

function openDetailSheet(exerciseId) {
  const ex = state.exercisesById.get(exerciseId);
  const day = currentDay();
  const entry = (day?.entries || []).find((e) => e.exerciseId === exerciseId);
  if (!ex || !entry) return;
  state.detailExerciseId = exerciseId;
  $("sheet-detail-title").textContent = ex.name;
  $("detail-muscles").textContent = muscleSummary(ex);
  $("det-sets").value = entry.targetSets || 3;
  $("det-reps").value = entryReps(entry);
  $("det-refweight").value = ex.refWeight || "";
  $("det-note").value = ex.note || "";
  openSheet("sheet-detail");
}

function submitDetailForm(e) {
  e.preventDefault();
  const ex = state.exercisesById.get(state.detailExerciseId);
  const day = currentDay();
  if (!ex || !day) return;

  const targetSets = Math.max(1, Math.floor(Number($("det-sets").value)) || 3);
  const reps = Math.max(1, Math.floor(Number($("det-reps").value)) || 10);
  const entries = (day.entries || []).map((en) =>
    en.exerciseId === ex.id ? { exerciseId: ex.id, targetSets, reps } : en
  );
  db.updateDay(day.id, { name: day.name, entries }).catch(() => toast("Erro ao salvar."));

  db.updateExercise(ex.id, {
    name: ex.name,
    primaryMuscleId: ex.primaryMuscleId,
    secondaryMuscleIds: ex.secondaryMuscleIds || [],
    otherMuscleIds: ex.otherMuscleIds || [],
    refWeight: $("det-refweight").value.trim(),
    note: $("det-note").value.trim(),
  }).catch(() => toast("Erro ao salvar."));

  closeSheets();
}

// ---------- finish workout (summary of today's session) ----------

function openFinishSheet() {
  const day = currentDay();
  if (!day) return;
  const today = todayStr();
  const doneLogs = (day.entries || [])
    .map((en) => state.logsById.get(logDocId({ date: today, dayId: day.id, exerciseId: en.exerciseId })))
    .filter(Boolean);
  if (doneLogs.length === 0) return;

  $("finish-sub").textContent =
    `${fmtDateFull(today)} · ${day.name} · ${doneLogs.length} de ${(day.entries || []).length} exercícios`;

  const ul = $("finish-list");
  ul.innerHTML = "";
  doneLogs.forEach((log) => {
    const li = document.createElement("li");
    li.className = "row-line";
    const name = document.createElement("span");
    name.className = "row-name";
    name.textContent = log.exerciseName;
    const sub = document.createElement("span");
    sub.className = "row-sub";
    sub.textContent = setsLabel(log.sets) || "feito";
    li.append(name, sub);
    ul.appendChild(li);
  });

  openSheet("sheet-finish");
}

function confirmFinishWorkout() {
  // Every check already saved its log; concluding just wraps up the session.
  cancelTimer();
  closeSheets();
  toast("Treino registrado. Bom descanso!");
}

// The sets editor lives inside a checked card. Every change re-saves the
// same log doc (deterministic id), so editing stays a single write.
function buildSetsEditor(entry, day, log) {
  const wrap = document.createElement("div");
  wrap.className = "sets-editor";
  const sets = (log.sets || []).map((s) => ({ ...s }));

  const save = () => {
    db.saveLog({ ...log, sets }).catch(() => toast("Erro ao salvar."));
  };

  sets.forEach((set, idx) => {
    const row = document.createElement("div");
    row.className = "set-row";

    const n = document.createElement("span");
    n.className = "set-n";
    n.textContent = `Série ${idx + 1}`;

    const repsLab = document.createElement("label");
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
    const weight = document.createElement("input");
    weight.type = "number";
    weight.min = "0";
    weight.step = "0.5";
    weight.inputMode = "decimal";
    weight.placeholder = "kg";
    weight.value = set.weight ?? "";
    weight.addEventListener("change", () => {
      const v = Number(weight.value);
      sets[idx].weight = weight.value === "" || !Number.isFinite(v) ? null : v;
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
      save();
    });

    row.append(n, repsLab, wLab, rm);
    wrap.appendChild(row);
  });

  const add = document.createElement("button");
  add.type = "button";
  add.className = "btn-add-set";
  add.textContent = "＋ série";
  add.addEventListener("click", () => {
    const prev = sets[sets.length - 1];
    sets.push({ reps: prev?.reps ?? entryReps(entry), weight: prev?.weight ?? null });
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
  const ids = [ex.primaryMuscleId, ...(ex.secondaryMuscleIds || []), ...(ex.otherMuscleIds || [])];
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
      const extras = [...(ex.secondaryMuscleIds || []), ...(ex.otherMuscleIds || [])]
        .map(muscleName)
        .filter(Boolean);
      if (extras.length > 0) subParts.push(extras.join(", "));
      if (ex.note) subParts.push(ex.note.split("\n")[0]);
      if (subParts.length > 0) {
        const sub = document.createElement("span");
        sub.className = "item-sub";
        sub.textContent = subParts.join(" · ");
        main.appendChild(sub);
      }

      const side = document.createElement("div");
      side.className = "item-side";
      const ref = lastLine(ex.id, ex.refWeight);
      if (ref) {
        const b = document.createElement("b");
        b.textContent = ref.text;
        side.appendChild(b);
        side.appendChild(document.createTextNode(ref.date ? `${ref.label} · ${ref.date}` : ref.label));
      }

      li.append(main, side);
      li.addEventListener("click", () => openExerciseSheet(ex.id));
      ul.appendChild(li);
    });

    group.append(head, ul);
    listEl.appendChild(group);
  });

  $("exercises-empty").hidden = visible.length > 0;
}

// ---------- exercise sheet (new / edit) ----------

function renderMuscleGrid(container, picked, excluded) {
  container.innerHTML = "";
  state.muscles.forEach((m) => {
    if (excluded.has(m.id)) return;
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip" + (picked.has(m.id) ? " on" : "");
    chip.textContent = m.name;
    chip.addEventListener("click", () => {
      if (picked.has(m.id)) picked.delete(m.id);
      else picked.add(m.id);
      renderExerciseSheetGrids();
    });
    container.appendChild(chip);
  });
}

function renderExerciseSheetGrids() {
  const primary = $("ex-primary").value;
  state.draftSecondary.delete(primary);
  state.draftOthers.delete(primary);
  [...state.draftSecondary].forEach((id) => state.draftOthers.delete(id));
  renderMuscleGrid($("ex-secondary"), state.draftSecondary, new Set([primary]));
  renderMuscleGrid($("ex-others"), state.draftOthers, new Set([primary, ...state.draftSecondary]));
}

function openExerciseSheet(exerciseId) {
  state.editingExerciseId = exerciseId || null;
  const ex = exerciseId ? state.exercisesById.get(exerciseId) : null;

  $("sheet-exercise-title").textContent = ex ? "Editar exercício" : "Novo exercício";
  $("ex-name").value = ex ? ex.name : "";

  const primarySelect = $("ex-primary");
  primarySelect.innerHTML = "";
  state.muscles.forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.name;
    if (ex && m.id === ex.primaryMuscleId) opt.selected = true;
    primarySelect.appendChild(opt);
  });

  state.draftSecondary = new Set(ex?.secondaryMuscleIds || []);
  state.draftOthers = new Set(ex?.otherMuscleIds || []);
  renderExerciseSheetGrids();

  $("ex-refweight").value = ex?.refWeight || "";
  $("ex-note").value = ex?.note || "";
  $("ex-error").hidden = true;
  $("btn-exercise-delete").hidden = !ex;

  openSheet("sheet-exercise");
}

function submitExerciseForm(e) {
  e.preventDefault();
  const name = $("ex-name").value.trim();
  const primaryMuscleId = $("ex-primary").value;
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
    otherMuscleIds: [...state.draftOthers].filter(
      (id) => id !== primaryMuscleId && !state.draftSecondary.has(id)
    ),
    refWeight: $("ex-refweight").value.trim(),
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
  db.deleteExercise(ex.id, dayPatches).catch(() => toast("Erro ao excluir."));
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

// ---------- histórico ----------

function renderHist() {
  $("hist-sessoes").hidden = state.histView !== "sessoes";
  $("hist-progresso").hidden = state.histView !== "progresso";
  document.querySelectorAll("#hist-seg .seg-btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.view === state.histView)
  );
  if (state.histView === "sessoes") renderSessions();
  else renderProgress();
}

function renderSessions() {
  const weeks = weeklyFrequency(state.logs, 12, todayStr());
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
      li.className = "item-row";
      const main = document.createElement("div");
      main.className = "item-main";
      const name = document.createElement("span");
      name.className = "item-name";
      name.textContent = log.exerciseName || "(exercício)";
      main.appendChild(name);
      const side = document.createElement("div");
      side.className = "item-side";
      const b = document.createElement("b");
      b.textContent = setsLabel(log.sets) || "feito";
      side.appendChild(b);
      li.append(main, side);
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
      (ex.secondaryMuscleIds || []).includes(muscleId) ||
      (ex.otherMuscleIds || []).includes(muscleId)
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

// ---------- backup ----------

function buildBackup() {
  const iso = (t) => (t && typeof t.toDate === "function" ? t.toDate().toISOString() : null);
  return {
    app: "Treino",
    version: APP_VERSION,
    exportedAt: new Date().toISOString(),
    muscles: state.muscles.map(({ id, name, order }) => ({ id, name, order })),
    exercises: state.exercises.map((e) => ({
      id: e.id,
      name: e.name,
      primaryMuscleId: e.primaryMuscleId || null,
      secondaryMuscleIds: e.secondaryMuscleIds || [],
      otherMuscleIds: e.otherMuscleIds || [],
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
// The floating bar only exists while a countdown is active; the preset
// buttons are inline on the Treino tab.

const TIMER_KEY = "gym:timerEnd";
let timerInterval = null;
let timerActive = false;
let audioCtx = null;

function ensureAudio() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch {
    audioCtx = null;
  }
}

function beep() {
  if (!audioCtx) return;
  try {
    for (let i = 0; i < 3; i++) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.value = 880;
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      const t = audioCtx.currentTime + i * 0.25;
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.start(t);
      osc.stop(t + 0.2);
    }
  } catch {
    // sem áudio, sem problema
  }
}

function startTimer(secs) {
  ensureAudio(); // unlocked here, on the user's tap (iOS requirement)
  localStorage.setItem(TIMER_KEY, String(Date.now() + secs * 1000));
  runTimer();
}

function cancelTimer() {
  localStorage.removeItem(TIMER_KEY);
  clearInterval(timerInterval);
  timerInterval = null;
  timerActive = false;
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
      if (navigator.vibrate) navigator.vibrate([300, 100, 300]);
      beep();
      const bar = $("timer-bar");
      bar.classList.add("flash");
      setTimeout(() => {
        bar.classList.remove("flash");
        timerActive = false;
        updateTimerVisibility();
      }, 1400);
    }
  };
  tick();
  timerInterval = setInterval(tick, 250);
}

// The bar shows only while a countdown is active, and only on the Treino tab.
function updateTimerVisibility() {
  $("timer-bar").hidden = !timerActive || state.tab !== "treino";
}

// ---------- snapshot handlers ----------

function onMuscles(muscles) {
  if (muscles.length === 0 && !state.seededMuscles) {
    state.seededMuscles = true;
    db.seedMuscles().catch(() => {});
    return;
  }
  state.muscles = sortByOrder(muscles);
  renderMuscleChips();
  renderMusclesManager();
  renderExercises();
  renderTreino();
}

function onExercises(exercises) {
  if (exercises.length === 0 && !state.seededExercises) {
    state.seededExercises = true;
    db.seedExercises().catch(() => toast("Erro ao criar exercícios iniciais."));
    return;
  }
  state.exercises = exercises;
  state.exercisesById = new Map(exercises.map((e) => [e.id, e]));
  renderExercises();
  renderTreino();
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
  renderTreino();
  renderExercises();
  renderHist();
}

// ---------- tabs ----------

function switchTab(tab) {
  state.tab = tab;
  document.querySelectorAll(".tab").forEach((s) => (s.hidden = s.id !== `tab-${tab}`));
  document.querySelectorAll(".tabbtn").forEach((b) =>
    b.classList.toggle("active", b.dataset.tab === tab)
  );
  updateTimerVisibility();
  window.scrollTo(0, 0);
}

// ---------- auth + boot ----------

function showLogin() {
  $("screen-login").hidden = false;
  $("app-shell").hidden = true;
}

function showApp() {
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

// ---------- wiring ----------

function wire() {
  // login
  $("login-form").addEventListener("submit", handleLogin);

  // tabs
  document.querySelectorAll(".tabbtn").forEach((b) =>
    b.addEventListener("click", () => switchTab(b.dataset.tab))
  );

  // treino
  $("program-select").addEventListener("change", (e) => {
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
  $("btn-finish-workout").addEventListener("click", openFinishSheet);
  $("btn-finish-confirm").addEventListener("click", confirmFinishWorkout);
  $("detail-form").addEventListener("submit", submitDetailForm);
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
  $("ex-primary").addEventListener("change", renderExerciseSheetGrids);
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

  // timer
  document.querySelectorAll(".timer-preset").forEach((b) =>
    b.addEventListener("click", () => startTimer(Number(b.dataset.secs)))
  );
  $("timer-cancel").addEventListener("click", cancelTimer);

  // ajustes
  $("muscle-add-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("muscle-add-name").value.trim();
    if (!name) return;
    const maxOrder = state.muscles.reduce((m, s) => Math.max(m, s.order ?? 0), -1);
    db.addMuscle(name, maxOrder + 1).catch(() => toast("Erro ao adicionar grupo."));
    $("muscle-add-name").value = "";
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
  $("sheet-backdrop").addEventListener("click", closeSheets);
  document.querySelectorAll("[data-close]").forEach((b) =>
    b.addEventListener("click", closeSheets)
  );

  // offline indicator
  window.addEventListener("online", updateOnline);
  window.addEventListener("offline", updateOnline);
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
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

boot();
