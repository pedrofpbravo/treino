// In-memory stand-in for db.js, used when the page is opened with #debug
// (same trick as MercadoJa): lets every tab and flow be exercised locally
// with sample data, no Firebase needed. Ships the full real seed catalog
// plus ~6 weeks of generated training history so prefill, history and all
// charts render meaningfully.

import { normalize, logDocId, todayStr, addDaysStr, entryReps, parseRefWeight } from "./logic.js";
import { DEFAULT_MUSCLES, DEFAULT_CARDIO_TYPES, SEED_EXERCISES, SEED_PROGRAMS } from "./seed.js";

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
  cardioTypes: DEFAULT_CARDIO_TYPES.map(({ key, name, note }, i) => ({
    id: `ct-${key}`,
    name,
    note: note || "",
    order: i,
  })),
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
  cardio: [],
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
        done: true,
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

// Keep one deterministic complete past session for every program so the
// completed-day chips remain visible even though the main history has skips.
(function ensureCompleteSessions() {
  const today = todayStr();
  store.programs.forEach((prog, pi) => {
    const day = store.days.find((item) => item.programId === prog.id && item.entries.length > 0);
    if (!day) return;
    const date = addDaysStr(today, -(1 + pi));
    day.entries.forEach((entry, i) => {
      const ex = store.exercises.find((item) => item.id === entry.exerciseId);
      const log = {
        date,
        programId: prog.id,
        dayId: day.id,
        exerciseId: entry.exerciseId,
        exerciseName: ex.name,
        dayName: day.name,
        programName: prog.name,
        sets: Array.from({ length: entry.targetSets }, () => ({
          reps: entryReps(entry),
          weight: baseWeight(entry.exerciseId),
          done: true,
        })),
      };
      const saved = { id: logDocId(log), ...log, ts: ts(new Date(date + "T08:00").getTime() + i * 60000) };
      const existing = store.logs.findIndex((item) => item.id === saved.id);
      if (existing >= 0) store.logs[existing] = saved;
      else store.logs.push(saved);
    });
  });
})();

(function generateCardio() {
  const today = todayStr();
  const types = store.cardioTypes.filter((type) => type.id !== "ct-outro");
  for (let week = 5; week >= 0; week--) {
    const count = 2 + Math.floor(rng() * 3);
    const usedDays = new Set();
    for (let i = 0; i < count; i++) {
      let back;
      do {
        back = week * 7 + 1 + Math.floor(rng() * 6);
      } while (usedDays.has(back));
      usedDays.add(back);
      if (back > 42) continue;
      const type = types[Math.floor(rng() * types.length)];
      const date = addDaysStr(today, -back);
      store.cardio.push({
        id: `cardio-demo-${week}-${i}`,
        date,
        typeId: type.id,
        typeName: type.name,
        minutes: 15 + Math.floor(rng() * 26),
        note: rng() < 0.25 ? "Ritmo moderado" : "",
        ts: ts(new Date(date + "T07:00").getTime() + i * 60000),
      });
    }
  }
})();

// ---------- listener plumbing (same contract as db.js) ----------

const listeners = { muscles: [], exercises: [], programs: [], days: [], logs: [], cardioTypes: [], cardio: [] };
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
export const listenCardioTypes = listen("cardioTypes");
export const listenCardio = listen("cardio");

export async function seedMuscles() {}
export async function seedExercises() {}
export async function seedPrograms() {}
export async function seedCardioTypes() {}

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

// ---------- cardio types ----------

export async function addCardioType(name, order) {
  store.cardioTypes.push({ id: id("ct"), name, note: "", order });
  emit.cardioTypes();
}
export async function updateCardioType(tid, { name, note }) {
  Object.assign(store.cardioTypes.find((type) => type.id === tid), { name, note: note || "" });
  emit.cardioTypes();
}
export async function upsertCardioTypes(types) {
  types.forEach(({ id: tid, ...data }) => {
    const type = store.cardioTypes.find((item) => item.id === tid);
    if (type) Object.assign(type, data);
    else store.cardioTypes.push({ id: tid, ...data });
  });
  emit.cardioTypes();
}
export async function swapCardioTypeOrder(a, b) {
  const ta = store.cardioTypes.find((type) => type.id === a.id);
  const tb = store.cardioTypes.find((type) => type.id === b.id);
  [ta.order, tb.order] = [b.order, a.order];
  emit.cardioTypes();
}
export async function deleteCardioType(tid) {
  store.cardioTypes = store.cardioTypes.filter((type) => type.id !== tid);
  emit.cardioTypes();
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
export async function createExerciseWithId(eid, data) {
  const existing = store.exercises.find((e) => e.id === eid);
  if (existing) Object.assign(existing, exerciseData(data), { updatedAt: ts() });
  else store.exercises.push({ id: eid, ...exerciseData(data), createdAt: ts(), updatedAt: ts() });
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

// ---------- cardio ----------

export async function createCardio(data) {
  store.cardio.push({ id: id("cardio"), ...data, minutes: Math.floor(Number(data.minutes)), note: data.note || "", ts: ts() });
  emit.cardio();
}
export async function createCardioWithId(cid, data) {
  const entry = { id: cid, ...data, minutes: Math.floor(Number(data.minutes)), note: data.note || "", ts: ts() };
  const idx = store.cardio.findIndex((item) => item.id === cid);
  if (idx >= 0) store.cardio[idx] = entry;
  else store.cardio.push(entry);
  emit.cardio();
}
export async function deleteCardio(cid) {
  store.cardio = store.cardio.filter((entry) => entry.id !== cid);
  emit.cardio();
}

// ---------- backup ----------

export async function importBackup(data) {
  const upsert = (list, item) => {
    const cur = list.find((x) => x.id === item.id);
    if (cur) Object.assign(cur, item);
    else list.push(item);
  };
  (data.muscles || []).forEach((m) => upsert(store.muscles, { ...m }));
  (data.cardioTypes || []).forEach((type) => upsert(store.cardioTypes, { ...type }));
  (data.exercises || []).forEach((e) =>
    upsert(store.exercises, { ...e, nameLower: normalize(e.name), createdAt: ts(), updatedAt: ts() })
  );
  (data.programs || []).forEach((p) =>
    upsert(store.programs, { ...p, nameLower: normalize(p.name), createdAt: ts() })
  );
  (data.days || []).forEach((d) => upsert(store.days, { ...d }));
  (data.logs || []).forEach((l) => upsert(store.logs, { ...l, ts: ts() }));
  (data.cardio || []).forEach((entry) => upsert(store.cardio, { ...entry, ts: ts() }));
  Object.values(emit).forEach((fn) => fn());
}
