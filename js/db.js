// Firebase layer (same architecture as MercadoJa: one thin module, CDN SDK,
// no build step). Auth = one personal email/password account. Firestore with
// persistent local cache (multi-tab) so everything works offline and syncs
// on reconnect. All reads flow through onSnapshot listeners; all writes are
// small targeted sets/updates so the UI can stay optimistic.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { firebaseConfig } from "./config.js";
import { normalize, logDocId } from "./logic.js";
import { DEFAULT_MUSCLES, SEED_EXERCISES, SEED_PROGRAMS } from "./seed.js";

let app = null;
let auth = null;
let fs = null;

export function isConfigured() {
  return (
    firebaseConfig &&
    firebaseConfig.apiKey &&
    !/PASTE/.test(firebaseConfig.apiKey) &&
    firebaseConfig.projectId &&
    !/PASTE/.test(firebaseConfig.projectId)
  );
}

export function init() {
  if (app) return;
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  fs = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
}

// ---------- auth ----------

export function watchAuth(cb) {
  return onAuthStateChanged(auth, cb);
}

export async function login(email, password) {
  await setPersistence(auth, browserLocalPersistence);
  return signInWithEmailAndPassword(auth, email, password);
}

export function logout() {
  return signOut(auth);
}

// ---------- listeners (one per collection) ----------

const listenCollection = (name) => (cb, errCb) =>
  onSnapshot(collection(fs, name), (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, errCb);

export const listenMuscles = listenCollection("muscles");
export const listenExercises = listenCollection("exercises");
export const listenPrograms = listenCollection("programs");
export const listenDays = listenCollection("days");
export const listenLogs = listenCollection("logs");
export const listenBathroom = listenCollection("bathroom");

// ---------- first-run seeding (fixed doc IDs make it idempotent even if
// two devices seed at the same time) ----------

export function seedMuscles() {
  const batch = writeBatch(fs);
  DEFAULT_MUSCLES.forEach(({ key, name }, i) => {
    batch.set(doc(fs, "muscles", `mus-${key}`), { name, order: i });
  });
  return batch.commit();
}

export function seedExercises() {
  const batch = writeBatch(fs);
  SEED_EXERCISES.forEach((ex) => {
    batch.set(doc(fs, "exercises", `ex-${ex.slug}`), {
      name: ex.name,
      nameLower: normalize(ex.name),
      primaryMuscleId: `mus-${ex.primary}`,
      secondaryMuscleIds: ex.secondary.map((k) => `mus-${k}`),
      otherMuscleIds: ex.others.map((k) => `mus-${k}`),
      refWeight: ex.refWeight || "",
      note: ex.note || "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
  return batch.commit();
}

// Programs and their days seed together (the days listener has no guard of
// its own; an empty /programs is the signal for both).
export function seedPrograms() {
  const batch = writeBatch(fs);
  SEED_PROGRAMS.forEach((prog, pi) => {
    batch.set(doc(fs, "programs", `prog-${prog.slug}`), {
      name: prog.name,
      nameLower: normalize(prog.name),
      order: pi,
      createdAt: serverTimestamp(),
    });
    prog.days.forEach((day, di) => {
      batch.set(doc(fs, "days", `day-${prog.slug}-${day.slug}`), {
        programId: `prog-${prog.slug}`,
        name: day.name,
        order: di,
        entries: day.entries.map(([slug, targetSets, reps]) => ({
          exerciseId: `ex-${slug}`,
          targetSets,
          reps,
        })),
      });
    });
  });
  return batch.commit();
}

// ---------- muscles ----------

export function addMuscle(name, order) {
  return setDoc(doc(collection(fs, "muscles")), { name, order });
}

export function renameMuscle(id, name) {
  return updateDoc(doc(fs, "muscles", id), { name });
}

// Swap the `order` of two muscles in one batch (up/down arrows).
export function swapMuscleOrder(a, b) {
  const batch = writeBatch(fs);
  batch.update(doc(fs, "muscles", a.id), { order: b.order });
  batch.update(doc(fs, "muscles", b.id), { order: a.order });
  return batch.commit();
}

export function deleteMuscle(id) {
  return deleteDoc(doc(fs, "muscles", id));
}

// ---------- exercises ----------

const exerciseData = ({ name, primaryMuscleId, secondaryMuscleIds, otherMuscleIds, refWeight, note }) => ({
  name,
  nameLower: normalize(name),
  primaryMuscleId,
  secondaryMuscleIds: secondaryMuscleIds || [],
  otherMuscleIds: otherMuscleIds || [],
  refWeight: refWeight || "",
  note: note || "",
  updatedAt: serverTimestamp(),
});

export function createExercise(data) {
  return setDoc(doc(collection(fs, "exercises")), {
    ...exerciseData(data),
    createdAt: serverTimestamp(),
  });
}

export function updateExercise(id, data) {
  return updateDoc(doc(fs, "exercises", id), exerciseData(data));
}

// One batch: remove the exercise from every day that references it, then
// delete the doc. Logs are left untouched; their name snapshots keep the
// history and progression charts working.
// dayPatches: [{ dayId, entries }] with the exercise already filtered out.
export function deleteExercise(id, dayPatches) {
  const batch = writeBatch(fs);
  (dayPatches || []).forEach(({ dayId, entries }) => {
    batch.update(doc(fs, "days", dayId), { entries });
  });
  batch.delete(doc(fs, "exercises", id));
  return batch.commit();
}

// ---------- programs / days ----------

export function addProgram(name, order) {
  return setDoc(doc(collection(fs, "programs")), {
    name,
    nameLower: normalize(name),
    order,
    createdAt: serverTimestamp(),
  });
}

export function renameProgram(id, name) {
  return updateDoc(doc(fs, "programs", id), { name, nameLower: normalize(name) });
}

// Cascade: the program and all of its days go in one batch.
export function deleteProgram(id, dayIds) {
  const batch = writeBatch(fs);
  (dayIds || []).forEach((dayId) => batch.delete(doc(fs, "days", dayId)));
  batch.delete(doc(fs, "programs", id));
  return batch.commit();
}

export function addDay(programId, name, order, entries) {
  return setDoc(doc(collection(fs, "days")), {
    programId,
    name,
    order,
    entries: entries || [],
  });
}

// Day edits (rename + entry list/targets/order) save as one write.
export function updateDay(id, { name, entries }) {
  return updateDoc(doc(fs, "days", id), { name, entries });
}

export function swapDayOrder(a, b) {
  const batch = writeBatch(fs);
  batch.update(doc(fs, "days", a.id), { order: b.order });
  batch.update(doc(fs, "days", b.id), { order: a.order });
  return batch.commit();
}

export function deleteDay(id) {
  return deleteDoc(doc(fs, "days", id));
}

// ---------- logs ----------

// Deterministic id: checking twice (or editing sets after checking)
// overwrites the same doc, so "check" and "edit" are both a single setDoc.
export function saveLog(log) {
  return setDoc(doc(fs, "logs", logDocId(log)), {
    date: log.date,
    programId: log.programId,
    dayId: log.dayId,
    exerciseId: log.exerciseId,
    exerciseName: log.exerciseName,
    dayName: log.dayName,
    programName: log.programName,
    sets: log.sets,
    ts: serverTimestamp(),
  });
}

export function deleteLog(logId) {
  return deleteDoc(doc(fs, "logs", logId));
}

// ---------- bathroom ----------

export function createBathroomEvent({ at, bristol, note }) {
  return setDoc(doc(collection(fs, "bathroom")), {
    at,
    bristol,
    note: note || "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export function updateBathroomEvent(id, { at, bristol, note }) {
  return updateDoc(doc(fs, "bathroom", id), {
    at,
    bristol,
    note: note || "",
    updatedAt: serverTimestamp(),
  });
}

export function deleteBathroomEvent(id) {
  return deleteDoc(doc(fs, "bathroom", id));
}

// ---------- backup ----------
// Restores a backup produced by "Exportar backup". Writes preserve the
// original doc ids so every cross-reference stays intact. Existing docs
// with the same id are overwritten; extra docs are left alone
// (non-destructive merge). Chunked to respect the 500-op batch limit.

export async function importBackup(data) {
  const writes = [];

  (data.muscles || []).forEach((m) => {
    if (!m.id || !m.name) return;
    writes.push([doc(fs, "muscles", m.id), { name: m.name, order: m.order ?? 0 }]);
  });

  (data.exercises || []).forEach((e) => {
    if (!e.id || !e.name) return;
    writes.push([doc(fs, "exercises", e.id), {
      name: e.name,
      nameLower: normalize(e.name),
      primaryMuscleId: e.primaryMuscleId || null,
      secondaryMuscleIds: e.secondaryMuscleIds || [],
      otherMuscleIds: e.otherMuscleIds || [],
      refWeight: e.refWeight || "",
      note: e.note || "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }]);
  });

  (data.programs || []).forEach((p) => {
    if (!p.id || !p.name) return;
    writes.push([doc(fs, "programs", p.id), {
      name: p.name,
      nameLower: normalize(p.name),
      order: p.order ?? 0,
      createdAt: serverTimestamp(),
    }]);
  });

  (data.days || []).forEach((d) => {
    if (!d.id || !d.name || !d.programId) return;
    writes.push([doc(fs, "days", d.id), {
      programId: d.programId,
      name: d.name,
      order: d.order ?? 0,
      entries: Array.isArray(d.entries) ? d.entries : [],
    }]);
  });

  (data.logs || []).forEach((l) => {
    if (!l.id || !l.date || !l.exerciseId) return;
    writes.push([doc(fs, "logs", l.id), {
      date: l.date,
      programId: l.programId || null,
      dayId: l.dayId || null,
      exerciseId: l.exerciseId,
      exerciseName: l.exerciseName || "",
      dayName: l.dayName || "",
      programName: l.programName || "",
      sets: Array.isArray(l.sets) ? l.sets : [],
      ts: serverTimestamp(),
    }]);
  });

  (data.bathroom || []).forEach((b) => {
    if (!b.id || !b.at) return;
    writes.push([doc(fs, "bathroom", b.id), {
      at: b.at,
      bristol: Number(b.bristol) || 4,
      note: b.note || "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }]);
  });

  for (let i = 0; i < writes.length; i += 400) {
    const batch = writeBatch(fs);
    writes.slice(i, i + 400).forEach(([ref, d]) => batch.set(ref, d));
    await batch.commit();
  }
}
