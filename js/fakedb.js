// In-memory stand-in for db.js, used when the page is opened with #debug
// (same trick as MercadoJa): lets every tab and flow be exercised locally
// with sample data, no Firebase needed. Ships the full real seed catalog
// plus ~6 weeks of generated training history so prefill, history and all
// charts render meaningfully.

import { normalize, logDocId, todayStr, addDaysStr, entryReps, parseRefWeight } from "./logic.js";
import { DEFAULT_MUSCLES, SEED_EXERCISES, SEED_PROGRAMS } from "./seed.js";

const ts = (ms = Date.now()) => ({ toMillis: () => ms });
let nextId = 1;
const id = (p) => `${p}-${nextId++}`;

// Small deterministic LCG so the sample data is stable across reloads.
let rngState = 42;
function rng() {
  rngState = (rngState * 1103515245 + 12345) % 2147483648;
  return rngState / 2147483648;
}

// ---------- seed catalog (same ids as the real seeders in db.js) ----------

const store = {
  muscles: DEFAULT_MUSCLES.map(({ key, name }, i) => ({ id: `mus-${key}`, name, order: i })),
  exercises: SEED_EXERCISES.map((ex) => ({
    id: `ex-${ex.slug}`,
    name: ex.name,
    nameLower: normalize(ex.name),
    primaryMuscleId: `mus-${ex.primary}`,
    secondaryMuscleIds: ex.secondary.map((k) => `mus-${k}`),
    otherMuscleIds: ex.others.map((k) => `mus-${k}`),
    refWeight: ex.refWeight || "",
    note: ex.note || "",
    createdAt: ts(),
    updatedAt: ts(),
  })),
  programs: SEED_PROGRAMS.map((prog, pi) => ({
    id: `prog-${prog.slug}`,
    name: prog.name,
    nameLower: normalize(prog.name),
    order: pi,
    createdAt: ts(),
  })),
  days: SEED_PROGRAMS.flatMap((prog) =>
    prog.days.map((day, di) => ({
      id: `day-${prog.slug}-${day.slug}`,
      programId: `prog-${prog.slug}`,
      name: day.name,
      order: di,
      entries: day.entries.map(([slug, targetSets, reps]) => ({
        exerciseId: `ex-${slug}`,
        targetSets,
        reps,
      })),
    }))
  ),
  logs: [],
};

// ---------- generated history ----------

// Base working weight: first number in refWeight ("40–42,5 kg" -> 40).
function baseWeight(exerciseId) {
  const ex = store.exercises.find((e) => e.id === exerciseId);
  return parseRefWeight(ex?.refWeight) ?? 20;
}

// Six weeks of the PPL + Upper Lower program: Mon..Fri = its five days,
// with a little progression every two weeks and one skipped exercise here
// and there. Nothing is generated for today, so the check flow starts clean.
(function generateLogs() {
  const prog = store.programs[0];
  const days = store.days.filter((d) => d.programId === prog.id);
  const today = todayStr();
  for (let back = 42; back >= 1; back--) {
    const date = addDaysStr(today, -back);
    const dow = new Date(date + "T12:00").getDay(); // 1..5 = Mon..Fri
    if (dow < 1 || dow > 5) continue;
    const day = days[dow - 1];
    const weekIdx = Math.floor((42 - back) / 7);
    day.entries.forEach((entry, i) => {
      if (rng() < 0.12) return; // occasionally skipped
      const weight = baseWeight(entry.exerciseId) + Math.floor(weekIdx / 2) * 2.5;
      const sets = Array.from({ length: entry.targetSets }, () => ({
        reps: Math.max(1, entryReps(entry) - Math.floor(rng() * 3)),
        weight,
      }));
      const ex = store.exercises.find((e) => e.id === entry.exerciseId);
      const log = {
        date,
        programId: prog.id,
        dayId: day.id,
        exerciseId: entry.exerciseId,
        exerciseName: ex.name,
        dayName: day.name,
        programName: prog.name,
        sets,
      };
      store.logs.push({
        id: logDocId(log),
        ...log,
        ts: ts(new Date(date + "T08:00").getTime() + i * 60000),
      });
    });
  }
})();

// ---------- listener plumbing (same contract as db.js) ----------

const listeners = { muscles: [], exercises: [], programs: [], days: [], logs: [] };
const emit = {};
for (const key of Object.keys(listeners)) {
  emit[key] = () => listeners[key].forEach((cb) => cb(store[key].map((x) => ({ ...x }))));
}
const listen = (key) => (cb) => {
  listeners[key].push(cb);
  cb(store[key].map((x) => ({ ...x })));
};

export const isConfigured = () => true;
export const init = () => {};
export const watchAuth = (cb) => cb({ uid: "debug" });
export const login = async () => {};
export const logout = async () => location.reload();

export const listenMuscles = listen("muscles");
export const listenExercises = listen("exercises");
export const listenPrograms = listen("programs");
export const listenDays = listen("days");
export const listenLogs = listen("logs");

export async function seedMuscles() {}
export async function seedExercises() {}
export async function seedPrograms() {}

// ---------- muscles ----------

export async function addMuscle(name, order) {
  store.muscles.push({ id: id("mus"), name, order });
  emit.muscles();
}
export async function renameMuscle(mid, name) {
  store.muscles.find((m) => m.id === mid).name = name;
  emit.muscles();
}
export async function swapMuscleOrder(a, b) {
  const ma = store.muscles.find((m) => m.id === a.id);
  const mb = store.muscles.find((m) => m.id === b.id);
  [ma.order, mb.order] = [b.order, a.order];
  emit.muscles();
}
export async function deleteMuscle(mid) {
  store.muscles = store.muscles.filter((m) => m.id !== mid);
  emit.muscles();
}

// ---------- exercises ----------

const exerciseData = (data) => ({
  name: data.name,
  nameLower: normalize(data.name),
  primaryMuscleId: data.primaryMuscleId,
  secondaryMuscleIds: data.secondaryMuscleIds || [],
  otherMuscleIds: data.otherMuscleIds || [],
  refWeight: data.refWeight || "",
  note: data.note || "",
});

export async function createExercise(data) {
  store.exercises.push({ id: id("ex"), ...exerciseData(data), createdAt: ts(), updatedAt: ts() });
  emit.exercises();
}
export async function updateExercise(eid, data) {
  Object.assign(store.exercises.find((e) => e.id === eid), exerciseData(data), { updatedAt: ts() });
  emit.exercises();
}
export async function deleteExercise(eid, dayPatches) {
  (dayPatches || []).forEach(({ dayId, entries }) => {
    const day = store.days.find((d) => d.id === dayId);
    if (day) day.entries = entries;
  });
  store.exercises = store.exercises.filter((e) => e.id !== eid);
  emit.days();
  emit.exercises();
}

// ---------- programs / days ----------

export async function addProgram(name, order) {
  store.programs.push({ id: id("prog"), name, nameLower: normalize(name), order, createdAt: ts() });
  emit.programs();
}
export async function renameProgram(pid, name) {
  Object.assign(store.programs.find((p) => p.id === pid), { name, nameLower: normalize(name) });
  emit.programs();
}
export async function deleteProgram(pid, dayIds) {
  store.days = store.days.filter((d) => !(dayIds || []).includes(d.id));
  store.programs = store.programs.filter((p) => p.id !== pid);
  emit.days();
  emit.programs();
}

export async function addDay(programId, name, order, entries) {
  store.days.push({ id: id("day"), programId, name, order, entries: entries || [] });
  emit.days();
}
export async function updateDay(did, { name, entries }) {
  Object.assign(store.days.find((d) => d.id === did), { name, entries });
  emit.days();
}
export async function swapDayOrder(a, b) {
  const da = store.days.find((d) => d.id === a.id);
  const db_ = store.days.find((d) => d.id === b.id);
  [da.order, db_.order] = [b.order, a.order];
  emit.days();
}
export async function deleteDay(did) {
  store.days = store.days.filter((d) => d.id !== did);
  emit.days();
}

// ---------- logs ----------

export async function saveLog(log) {
  const lid = logDocId(log);
  const data = { id: lid, ...log, ts: ts() };
  const idx = store.logs.findIndex((l) => l.id === lid);
  if (idx >= 0) store.logs[idx] = { ...store.logs[idx], ...data, ts: store.logs[idx].ts };
  else store.logs.push(data);
  emit.logs();
}
export async function deleteLog(lid) {
  store.logs = store.logs.filter((l) => l.id !== lid);
  emit.logs();
}

// ---------- backup ----------

export async function importBackup(data) {
  const upsert = (list, item) => {
    const cur = list.find((x) => x.id === item.id);
    if (cur) Object.assign(cur, item);
    else list.push(item);
  };
  (data.muscles || []).forEach((m) => upsert(store.muscles, { ...m }));
  (data.exercises || []).forEach((e) =>
    upsert(store.exercises, { ...e, nameLower: normalize(e.name), createdAt: ts(), updatedAt: ts() })
  );
  (data.programs || []).forEach((p) =>
    upsert(store.programs, { ...p, nameLower: normalize(p.name), createdAt: ts() })
  );
  (data.days || []).forEach((d) => upsert(store.days, { ...d }));
  (data.logs || []).forEach((l) => upsert(store.logs, { ...l, ts: ts() }));
  Object.values(emit).forEach((fn) => fn());
}
