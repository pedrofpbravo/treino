// Pure helpers: no DOM, no Firebase. Date handling, log math, grouping and
// formatting used across screens. Everything here is testable in isolation.

// Lowercase + strip accents, so "Bíceps" matches "biceps".
export function normalize(text) {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

const PROG3X_LATERAL_RAISE = {
  key: "lateral-raise",
  candidates: ["Elevação lateral na polia", "Elevação lateral unilateral na polia"],
};

const PROG3X_SLOTS = {
  "day-fb-ul-fullbody": [
    { candidates: ["Leg press 45°"], targetSets: 3, reps: 6 },
    { candidates: ["Supino máquina"], targetSets: 3, reps: 6 },
    {
      candidates: ["Remada baixa na máquina com apoio no peito"],
      create: {
        id: "ex-remada_baixa_apoio_peito",
        name: "Remada baixa na máquina com apoio no peito",
        primaryMuscleName: "Dorsais",
        secondaryMuscleNames: ["Bíceps", "Costas superiores"],
      },
      targetSets: 2,
      reps: 8,
    },
    { candidates: ["Puxada alta máquina"], targetSets: 2, reps: 8 },
    { candidates: ["Cadeira flexora máquina", "Cadeira flexora bilateral"], targetSets: 2, reps: 10 },
    { ...PROG3X_LATERAL_RAISE, targetSets: 2, reps: 12 },
    {
      candidates: ["Panturrilha no agachamento pendulo", "Panturrilha em pé no Smith"],
      targetSets: 2,
      reps: 8,
    },
  ],
  "day-fb-ul-upper": [
    { candidates: ["Supino inclinado com halteres"], targetSets: 3, reps: 5 },
    { candidates: ["Remada alta articulada máquina"], targetSets: 3, reps: 6 },
    { candidates: ["Puxada alta máquina"], targetSets: 3, reps: 8 },
    { candidates: ["Crucifixo máquina"], targetSets: 3, reps: 10 },
    { ...PROG3X_LATERAL_RAISE, targetSets: 4, reps: 12 },
    {
      candidates: ["Crucifixo inverso no peck deck"],
      create: {
        id: "ex-crucifixo_inverso_peck_deck",
        name: "Crucifixo inverso no peck deck",
        primaryMuscleName: "Ombro posterior",
        secondaryMuscleNames: ["Costas superiores"],
      },
      targetSets: 2,
      reps: 12,
    },
    {
      candidates: ["Bíceps Scott unilateral com halter"],
      targetSets: 2,
      reps: 8,
    },
    {
      candidates: ["Tríceps francês unilateral com halter"],
      targetSets: 2,
      reps: 10,
    },
  ],
  "day-fb-ul-lower": [
    {
      candidates: ["Hack squat"],
      create: {
        id: "ex-hack_squat",
        name: "Hack squat",
        primaryMuscleName: "Quadríceps",
        secondaryMuscleNames: ["Glúteos"],
      },
      targetSets: 3,
      reps: 5,
    },
    { candidates: ["RDL / Stiff"], targetSets: 3, reps: 6 },
    { candidates: ["Agachamento búlgaro"], targetSets: 2, reps: 8 },
    { candidates: ["Cadeira flexora máquina", "Cadeira flexora bilateral"], targetSets: 3, reps: 10 },
    { candidates: ["Cadeira extensora máquina", "Cadeira extensora"], targetSets: 2, reps: 10 },
    {
      candidates: ["Panturrilha sentado", "Panturrilha sentada"],
      create: {
        id: "ex-panturrilha_sentada",
        name: "Panturrilha sentada",
        primaryMuscleName: "Panturrilha",
        secondaryMuscleNames: [],
      },
      targetSets: 4,
      reps: 8,
    },
    { candidates: ["Abdominal máquina"], targetSets: 2, reps: 10 },
    {
      candidates: ["Reverse crunch no banco"],
      create: {
        id: "ex-reverse_crunch_banco",
        name: "Reverse crunch no banco",
        primaryMuscleName: "Abdômen",
        secondaryMuscleNames: [],
      },
      targetSets: 2,
      reps: 12,
    },
  ],
};

export function resolveProg3xEntries(exercises, muscles) {
  const exercisesByName = new Map(
    (exercises || []).map((exercise) => [exercise.nameLower, exercise])
  );
  const musclesByName = new Map(
    (muscles || []).map((muscle) => [normalize(muscle.name), muscle])
  );
  const createsById = new Map();
  const resolvedSlots = new Map();
  const errors = [];
  const errorKeys = new Set();

  const addError = (key, message) => {
    if (errorKeys.has(key)) return;
    errorKeys.add(key);
    errors.push(message);
  };

  const resolveSlot = (slot) => {
    const slotKey = slot.key || slot.create?.id || slot.candidates.map(normalize).join("|");
    if (resolvedSlots.has(slotKey)) return resolvedSlots.get(slotKey);

    const match = slot.candidates
      .map((candidate) => exercisesByName.get(normalize(candidate)))
      .find(Boolean);
    if (match) {
      resolvedSlots.set(slotKey, match.id);
      return match.id;
    }

    if (!slot.create) {
      addError(`exercise:${slotKey}`, `Exercício não encontrado: ${slot.candidates.join(" / ")}.`);
      resolvedSlots.set(slotKey, null);
      return null;
    }

    const requiredMuscles = [slot.create.primaryMuscleName, ...slot.create.secondaryMuscleNames];
    const missingMuscles = requiredMuscles.filter((name) => !musclesByName.has(normalize(name)));
    if (missingMuscles.length > 0) {
      missingMuscles.forEach((name) =>
        addError(`muscle:${normalize(name)}`, `Grupo muscular não encontrado: ${name}.`)
      );
      resolvedSlots.set(slotKey, null);
      return null;
    }

    if (!createsById.has(slot.create.id)) createsById.set(slot.create.id, { ...slot.create });
    resolvedSlots.set(slotKey, slot.create.id);
    return slot.create.id;
  };

  const entriesByDay = {};
  Object.entries(PROG3X_SLOTS).forEach(([dayId, slots]) => {
    entriesByDay[dayId] = slots.flatMap((slot) => {
      const exerciseId = resolveSlot(slot);
      return exerciseId
        ? [{ exerciseId, targetSets: slot.targetSets, reps: slot.reps }]
        : [];
    });
  });

  return { creates: [...createsById.values()], entriesByDay, errors };
}

// ---------- program "Upper Lower 4x" (v7.6 one-time migration) ----------
// Slot resolution order: (1) `ids` (exact doc id present in the catalog),
// (2) `candidates` (nameLower match), (3) `create` (only when the slot has one).
// Id-first keeps the match robust to renames. Existing exercises are never
// modified. Muscles for creates are referenced by muscle doc id.

export const PROG4X_PROGRAM_ID = "prog-ul4x";
export const PROG4X_PROGRAM_NAME = "Upper Lower 4x";

const PROG4X_LATERAL_RAISE = {
  key: "lateral-raise",
  ids: ["ex-elevacao_lateral_unilateral_polia"],
  candidates: ["Elevação lateral na polia", "Elevação lateral unilateral na polia"],
};

export const PROG4X_DAYS = [
  {
    id: "day-ul4x-upper-a",
    name: "Upper A · Costas",
    order: 0,
    slots: [
      {
        ids: ["ex-puxada_alta_maquina"],
        candidates: ["Puxada alta máquina"],
        targetSets: 4,
        reps: 8,
      },
      { candidates: ["T bar row", "T-bar row"], targetSets: 3, reps: 8 },
      {
        ids: ["ex-supino_inclinado_halteres"],
        candidates: ["Supino inclinado com halteres"],
        targetSets: 3,
        reps: 8,
      },
      { ...PROG4X_LATERAL_RAISE, targetSets: 4, reps: 12 },
      {
        candidates: ["Rosca inclinada com halteres"],
        create: {
          id: "ex-rosca_inclinada_halteres",
          name: "Rosca inclinada com halteres",
          primaryMuscleId: "mus-biceps",
          secondaryMuscleIds: ["mus-antebraco"],
        },
        targetSets: 3,
        reps: 10,
      },
      {
        ids: ["ex-triceps_testa_polia"],
        candidates: ["Tríceps testa na polia com barra reta"],
        targetSets: 2,
        reps: 12,
      },
    ],
  },
  {
    id: "day-ul4x-lower-a",
    name: "Lower A · Quadríceps",
    order: 1,
    slots: [
      {
        ids: ["ex-agachamento-smith"],
        candidates: ["Agachamento smith"],
        targetSets: 4,
        reps: 6,
      },
      {
        candidates: ["Afundo halteres"],
        create: {
          id: "ex-afundo_halteres",
          name: "Afundo halteres",
          primaryMuscleId: "mus-quadriceps",
          secondaryMuscleIds: ["mus-gluteos"],
        },
        targetSets: 3,
        reps: 8,
      },
      {
        ids: ["ex-cadeira_extensora"],
        candidates: ["Cadeira extensora máquina", "Cadeira extensora"],
        targetSets: 3,
        reps: 12,
      },
      {
        ids: ["ex-cadeira_flexora_bilateral"],
        candidates: ["Cadeira flexora máquina", "Cadeira flexora bilateral"],
        targetSets: 3,
        reps: 10,
      },
      {
        ids: ["ex-panturrilha_smith"],
        candidates: ["Panturrilha no agachamento pendulo", "Panturrilha em pé no Smith"],
        targetSets: 4,
        reps: 10,
      },
      {
        ids: ["ex-abdominal_maquina"],
        candidates: ["Abdominal máquina"],
        targetSets: 3,
        reps: 12,
      },
    ],
  },
  {
    id: "day-ul4x-upper-b",
    name: "Upper B · Peito",
    order: 2,
    slots: [
      {
        ids: ["ex-supino_maquina"],
        candidates: ["Supino máquina"],
        targetSets: 4,
        reps: 6,
      },
      {
        ids: ["ex-crucifixo_maquina"],
        candidates: ["Crucifixo máquina"],
        targetSets: 3,
        reps: 12,
      },
      {
        ids: ["ex-remada_fechada_unilateral_maquina"],
        candidates: ["Remada fechada unilateral máquina"],
        targetSets: 3,
        reps: 10,
      },
      { ...PROG4X_LATERAL_RAISE, targetSets: 3, reps: 12 },
      {
        ids: ["ex-crucifixo_inverso_peck_deck"],
        candidates: ["Crucifixo inverso no peck deck"],
        create: {
          id: "ex-crucifixo_inverso_peck_deck",
          name: "Crucifixo inverso no peck deck",
          primaryMuscleId: "mus-ombro-posterior",
          secondaryMuscleIds: ["mus-costas-superiores"],
        },
        targetSets: 4,
        reps: 15,
      },
      {
        candidates: ["Tríceps overhead na polia"],
        create: {
          id: "ex-triceps_overhead_polia",
          name: "Tríceps overhead na polia",
          primaryMuscleId: "mus-triceps",
          secondaryMuscleIds: [],
        },
        targetSets: 3,
        reps: 12,
      },
      {
        candidates: ["Rosca martelo com halteres"],
        create: {
          id: "ex-rosca_martelo_halteres",
          name: "Rosca martelo com halteres",
          primaryMuscleId: "mus-biceps",
          secondaryMuscleIds: ["mus-antebraco"],
        },
        targetSets: 2,
        reps: 12,
      },
    ],
  },
  {
    id: "day-ul4x-lower-b",
    name: "Lower B · Posterior",
    order: 3,
    slots: [
      {
        ids: ["ex-rdl_stiff"],
        candidates: ["RDL / Stiff"],
        targetSets: 3,
        reps: 6,
      },
      {
        ids: ["ex-cadeira_flexora_unilateral"],
        candidates: ["Cadeira flexora unilateral"],
        targetSets: 3,
        reps: 10,
      },
      {
        ids: ["ex-hip_thrust"],
        candidates: ["Hip thrust"],
        targetSets: 3,
        reps: 8,
      },
      {
        ids: ["ex-leg_press_45"],
        candidates: ["Leg press 45°"],
        targetSets: 3,
        reps: 10,
      },
      {
        // "Abdutora máquina" (ex-abdutora_maquina) is a different exercise and
        // must never match: candidates compare the full normalized name.
        candidates: ["Adutora máquina"],
        create: {
          id: "ex-adutora_maquina",
          name: "Adutora máquina",
          primaryMuscleId: "mus-adutores",
          secondaryMuscleIds: [],
        },
        targetSets: 2,
        reps: 12,
      },
      {
        ids: ["RaGL7etCaIjoUIA0tVje", "ex-panturrilha_sentada"],
        candidates: ["Panturrilha sentado", "Panturrilha sentada"],
        create: {
          id: "ex-panturrilha_sentada",
          name: "Panturrilha sentada",
          primaryMuscleId: "mus-panturrilha",
          secondaryMuscleIds: [],
        },
        targetSets: 4,
        reps: 15,
      },
      {
        ids: ["ex-reverse_crunch_banco"],
        candidates: ["Reverse crunch no banco"],
        create: {
          id: "ex-reverse_crunch_banco",
          name: "Reverse crunch no banco",
          primaryMuscleId: "mus-abdomen",
          secondaryMuscleIds: [],
        },
        targetSets: 2,
        reps: 12,
      },
    ],
  },
];

// Pure resolver. Returns { creates, days, errors }: `creates` are the new
// exercise docs (deduplicated by id), `days` are ready-to-write day docs
// ({id, name, order, entries}). Any error means nothing may be written.
export function resolveProg4x(exercises, muscles) {
  const exerciseIds = new Set((exercises || []).map((exercise) => exercise.id));
  const exercisesByName = new Map(
    (exercises || []).map((exercise) => [
      exercise.nameLower ?? normalize(exercise.name),
      exercise,
    ])
  );
  const muscleIds = new Set((muscles || []).map((muscle) => muscle.id));
  const createsById = new Map();
  const resolvedSlots = new Map();
  const errors = [];
  const errorKeys = new Set();

  const addError = (key, message) => {
    if (errorKeys.has(key)) return;
    errorKeys.add(key);
    errors.push(message);
  };

  const resolveSlot = (slot) => {
    const candidates = slot.candidates || [];
    const slotKey = slot.key || slot.create?.id || candidates.map(normalize).join("|");
    if (resolvedSlots.has(slotKey)) return resolvedSlots.get(slotKey);

    const idMatch = (slot.ids || []).find((id) => exerciseIds.has(id));
    if (idMatch) {
      resolvedSlots.set(slotKey, idMatch);
      return idMatch;
    }

    const nameMatch = candidates
      .map((candidate) => exercisesByName.get(normalize(candidate)))
      .find(Boolean);
    if (nameMatch) {
      resolvedSlots.set(slotKey, nameMatch.id);
      return nameMatch.id;
    }

    if (!slot.create) {
      addError(`exercise:${slotKey}`, `Exercício não encontrado: ${candidates.join(" / ")}.`);
      resolvedSlots.set(slotKey, null);
      return null;
    }

    const requiredMuscles = [slot.create.primaryMuscleId, ...slot.create.secondaryMuscleIds];
    const missingMuscles = requiredMuscles.filter((id) => !muscleIds.has(id));
    if (missingMuscles.length > 0) {
      missingMuscles.forEach((id) =>
        addError(`muscle:${id}`, `Grupo muscular não encontrado: ${id}.`)
      );
      resolvedSlots.set(slotKey, null);
      return null;
    }

    if (!createsById.has(slot.create.id)) {
      createsById.set(slot.create.id, {
        ...slot.create,
        secondaryMuscleIds: [...slot.create.secondaryMuscleIds],
      });
    }
    resolvedSlots.set(slotKey, slot.create.id);
    return slot.create.id;
  };

  const days = PROG4X_DAYS.map((day) => ({
    id: day.id,
    name: day.name,
    order: day.order,
    entries: day.slots.flatMap((slot) => {
      const exerciseId = resolveSlot(slot);
      return exerciseId
        ? [{ exerciseId, targetSets: slot.targetSets, reps: slot.reps }]
        : [];
    }),
  }));

  return { creates: [...createsById.values()], days, errors };
}

// ---------- dates (always LOCAL, never toISOString: UTC would shift the
// date in Brazil from 21:00 onwards) ----------

const pad = (n) => String(n).padStart(2, "0");

export function todayStr(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function dateFromStr(dateStr) {
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function fmtDate(dateStr) {
  const d = dateFromStr(dateStr);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

export const fmtDateShortMonth = (dateStr) => {
  const d = dateFromStr(dateStr);
  return `${pad(d.getDate())}/${MONTHS[d.getMonth()]}`;
};

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export function fmtDateFull(dateStr) {
  const d = dateFromStr(dateStr);
  return `${WEEKDAYS[d.getDay()]}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// Monday of the week containing dateStr, as a date string (BR weeks).
export function weekStartStr(dateStr) {
  const d = dateFromStr(dateStr);
  const dow = (d.getDay() + 6) % 7; // Mon=0 .. Sun=6
  d.setDate(d.getDate() - dow);
  return todayStr(d);
}

export function addDaysStr(dateStr, days) {
  const d = dateFromStr(dateStr);
  d.setDate(d.getDate() + days);
  return todayStr(d);
}

// ---------- logs ----------

export function logDocId({ date, dayId, exerciseId }) {
  return `log-${date}-${dayId}-${exerciseId}`;
}

const tsMillis = (log) =>
  log.ts && typeof log.ts.toMillis === "function" ? log.ts.toMillis() : 0;

// Newest log for an exercise strictly before `beforeDate` (any day/program),
// so today's own entry never feeds its own prefill.
export function lastLogFor(logs, exerciseId, beforeDate) {
  let best = null;
  for (const log of logs) {
    if (log.exerciseId !== exerciseId || log.date >= beforeDate) continue;
    if (!best || log.date > best.date || (log.date === best.date && tsMillis(log) > tsMillis(best))) {
      best = log;
    }
  }
  return best;
}

const cloneSets = (sets) =>
  (Array.isArray(sets) ? sets : []).map((s) => ({
    reps: Number.isFinite(Number(s.reps)) ? Number(s.reps) : null,
    weight: s.weight === null || s.weight === undefined || s.weight === "" ? null : Number(s.weight),
    done: s.done !== false,
  }));

// Logs written before per-set checks have no `done` field. They remain
// completed without a data migration; only an explicit false is pending.
export function logDone(log) {
  return Array.isArray(log?.sets) && log.sets.length > 0 && log.sets.every((s) => s.done !== false);
}

export const CYCLE_START = "2026-09-08";

// Progress is driven only by explicit finished-session documents. Historical
// sessions stay untouched; the start date is only a read-time cycle boundary.
export function cycleProgress(programId, days, finished, cycleStart = CYCLE_START) {
  const programDays = (days || []).filter((day) => day.programId === programId);
  const daysById = new Map(programDays.map((day) => [day.id, day]));
  const total = daysById.size;
  if (total === 0) {
    return { trained: new Set(), total, completed: null, currentCycleStart: cycleStart };
  }

  const sessions = new Map();
  for (const record of finished || []) {
    if (
      record.programId !== programId ||
      !daysById.has(record.dayId) ||
      !record.date ||
      record.date < cycleStart
    ) continue;

    const key = `${record.date}|${record.dayId}`;
    const stamp = record.finishedAt && typeof record.finishedAt.toMillis === "function"
      ? record.finishedAt.toMillis()
      : 0;
    const existing = sessions.get(key);
    if (!existing || stamp < existing.stamp) {
      sessions.set(key, { key, date: record.date, dayId: record.dayId, stamp });
    }
  }

  let trained = new Set();
  let currentDays = [];
  let completed = null;
  [...sessions.values()]
    .sort((a, b) =>
      a.date.localeCompare(b.date) || a.stamp - b.stamp || a.dayId.localeCompare(b.dayId)
    )
    .forEach((session) => {
      if (trained.has(session.dayId)) return;
      trained.add(session.dayId);
      currentDays.push({
        dayId: session.dayId,
        dayName: daysById.get(session.dayId)?.name || "",
        date: session.date,
      });
      if (trained.size === total) {
        completed = {
          key: session.key,
          date: session.date,
          dayId: session.dayId,
          days: currentDays,
        };
        trained = new Set();
        currentDays = [];
      }
    });

  return {
    trained,
    total,
    completed,
    currentCycleStart: completed?.date || cycleStart,
  };
}

// A day entry's rep target is a single number. New docs store `reps`;
// docs written before v2 carried a repMin-repMax range and are read as the
// range's top (no migration needed).
export function entryReps(entry) {
  return Number(entry?.reps) || Number(entry?.repMax) || Number(entry?.repMin) || 10;
}

export function normalizeDecimalInput(raw) {
  const cleaned = String(raw ?? "")
    .replace(/,/g, ".")
    .replace(/[^\d.]/g, "");
  const dot = cleaned.indexOf(".");
  if (dot < 0) return cleaned;
  return cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, "");
}

export function parseDecimal(raw) {
  const normalized = normalizeDecimalInput(raw);
  if (!normalized || normalized === ".") return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

// First number in a refWeight string: "40–42,5 kg" -> 40, "12 kg cada" -> 12,
// "carga a calibrar" -> null.
export function parseRefWeight(refWeight) {
  const m = String(refWeight || "").replace(",", ".").match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

export function referenceWeightFor(logs, exerciseId, beforeDate, refWeightStr) {
  const lastLog = lastLogFor(logs, exerciseId, beforeDate);
  const weights = (Array.isArray(lastLog?.sets) ? lastLog.sets : [])
    .filter((set) => set?.weight !== null && set?.weight !== undefined)
    .map((set) => Number(set.weight))
    .filter(Number.isFinite);
  return weights.length > 0 ? Math.max(...weights) : parseRefWeight(refWeightStr);
}

export function flagSuspiciousSets(sets, reference) {
  if (reference == null) return [];
  return (Array.isArray(sets) ? sets : []).reduce((flagged, set, index) => {
    if (set?.weight === null || set?.weight === undefined) return flagged;
    const difference = Math.abs(set.weight - reference);
    if (difference > 0.25 * reference && difference > 5) {
      flagged.push({ index, weight: set.weight });
    }
    return flagged;
  }, []);
}

export const MAX_SETS = 8;

export function clampTargetSets(v) {
  return Math.min(MAX_SETS, Math.max(1, Math.floor(Number(v)) || 1));
}

// Sets to pre-fill when an exercise is started: always the day entry's target
// (targetSets rows of the target reps) at the reference weight. The last
// session never changes the prefill; it lives only in the history.
export function prefillSets(entry, refWeightNum = null) {
  const n = Math.max(1, Number(entry?.targetSets) || 3);
  const reps = entryReps(entry);
  return Array.from({ length: n }, () => ({ reps, weight: refWeightNum, done: false }));
}

// Resolve the exercise shown and logged for a day entry. The entry keeps its
// original id as its stable draft key; a live __subs target redirects only the
// catalog data and eventual log. A stale target falls back for rendering while
// remaining identifiable through missingSubstitute so finishing can skip it.
export function resolveWorkoutExercise(entry, dayDraft, exercisesById) {
  const getExercise = (id) => {
    if (!id) return null;
    if (exercisesById && typeof exercisesById.get === "function") {
      return exercisesById.get(id) || null;
    }
    return exercisesById?.[id] || null;
  };
  const originalExerciseId = entry?.exerciseId || null;
  const originalExercise = getExercise(originalExerciseId);
  const subs = dayDraft?.__subs;
  const rawSubstituteId = subs && typeof subs === "object" && !Array.isArray(subs)
    ? subs[originalExerciseId]
    : null;
  const requestedSubstituteId =
    typeof rawSubstituteId === "string" && rawSubstituteId && rawSubstituteId !== originalExerciseId
      ? rawSubstituteId
      : null;
  const substituteExercise = getExercise(requestedSubstituteId);

  return {
    originalExerciseId,
    originalExercise,
    requestedSubstituteId,
    substituteExercise,
    exerciseId: substituteExercise?.id || originalExerciseId,
    exercise: substituteExercise || originalExercise,
    substituted: !!substituteExercise,
    missingSubstitute: !!requestedSubstituteId && !substituteExercise,
  };
}

export function swapBackSuggestion({
  entryExerciseId,
  logs,
  cycleStartDate,
  exercisesById,
  excludedIds,
  excludedLogKeys,
}) {
  if (!entryExerciseId || !cycleStartDate) return null;
  const eligibleLogs = (Array.isArray(logs) ? logs : []).filter((log) =>
    log?.date >= cycleStartDate &&
    !excludedLogKeys?.has(`${log.date}|${log.dayId}`)
  );
  const motivatingLog = eligibleLogs
    .filter((log) => log.substitutedForId && log.exerciseId === entryExerciseId)
    .sort((a, b) =>
      b.date.localeCompare(a.date) ||
      tsMillis(b) - tsMillis(a) ||
      String(b.dayId || "").localeCompare(String(a.dayId || ""))
    )[0];
  if (!motivatingLog) return null;

  const originalId = motivatingLog.substitutedForId;
  const original = exercisesById && typeof exercisesById.get === "function"
    ? exercisesById.get(originalId)
    : exercisesById?.[originalId];
  if (
    !original ||
    excludedIds?.has(originalId) ||
    eligibleLogs.some((log) => log.exerciseId === originalId)
  ) return null;

  return {
    originalId,
    originalName: original.name,
    date: motivatingLog.date,
  };
}

// Reserved draft metadata must never make a workout look started.
export function draftHasExerciseSets(dayDraft) {
  if (!dayDraft || typeof dayDraft !== "object" || Array.isArray(dayDraft)) return false;
  return Object.entries(dayDraft).some(([exerciseId, sets]) =>
    !exerciseId.startsWith("__") && Array.isArray(sets) && sets.length > 0
  );
}

export function effectiveDayEntries(day, dayDraft) {
  return Array.isArray(dayDraft?.__entries) ? dayDraft.__entries : day?.entries || [];
}

// Draft sets are the local working copy of a workout in progress (they only
// become logs on "Finalizar treino"). A set is recorded only when checked.
export function draftSetDone(set) {
  return set?.done === true;
}

export function draftAllDone(sets) {
  return Array.isArray(sets) && sets.length > 0 && sets.every(draftSetDone);
}

// The sets that "Finalizar treino" writes to the history: checked sets only.
export function recordedSets(sets) {
  return (Array.isArray(sets) ? sets : [])
    .filter(draftSetDone)
    .map((s) => ({
      reps: Number.isFinite(Number(s.reps)) ? Number(s.reps) : null,
      weight: s.weight === null || s.weight === undefined || s.weight === "" ? null : Number(s.weight),
      done: true,
    }));
}

// Seed a draft from an already-saved log (e.g. the day was finished, reopened
// and storage was cleared): keeps values and done flags (missing = done).
export function draftFromLog(log) {
  return cloneSets(log?.sets);
}

// "3×12": always a single rep number.
export function targetLabel(entry) {
  if (!entry || !entry.targetSets) return "";
  return `${entry.targetSets}×${entryReps(entry)}`;
}

const fmtKg = (w) => `${String(w)}kg`;

// Structured set summaries for renderers that style weight and reps separately.
// Weightless sets keep their useful reps value on its own.
export function setsParts(sets) {
  const list = cloneSets(sets).filter((s) => s.reps !== null || s.weight !== null);
  return list.map((s) => ({
    weight: s.weight === null ? "" : fmtKg(s.weight),
    reps: s.reps === null ? "?" : String(s.reps),
  }));
}

// Plain-text equivalent used by history, summaries and catalog rows.
export function setsLabel(sets) {
  return setsParts(sets)
    .map((s) => (s.weight ? `${s.reps}×${s.weight}` : s.reps))
    .join(" · ");
}

// Heaviest weight in a log's sets, or null if none are numeric.
export function topWeight(log) {
  let top = null;
  for (const s of log.sets || []) {
    const w = Number(s.weight);
    if (Number.isFinite(w) && s.weight !== null && s.weight !== "" && (top === null || w > top)) top = w;
  }
  return top;
}

// Group logs into sessions (one per date + dayId), newest first.
// Labels come from the log snapshots so deleted days/programs keep working.
export function groupSessions(logs) {
  const map = new Map();
  for (const log of logs) {
    const key = `${log.date}|${log.dayId}`;
    if (!map.has(key)) {
      map.set(key, {
        date: log.date,
        dayId: log.dayId,
        dayName: log.dayName || "Treino",
        programName: log.programName || "",
        logs: [],
      });
    }
    const s = map.get(key);
    s.logs.push(log);
    if (log.dayName) s.dayName = log.dayName;
    if (log.programName) s.programName = log.programName;
  }
  const sessions = [...map.values()];
  sessions.forEach((s) => s.logs.sort((a, b) => tsMillis(a) - tsMillis(b)));
  sessions.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.dayId.localeCompare(b.dayId)));
  return sessions;
}

// Every logged session for one exercise, newest first, with the sets kept
// separate (same formatting as setsParts) so the history can list them one
// per line. Labels come from the log snapshots, so a deleted day or program
// still reads correctly.
export function exerciseHistory(logs, exerciseId) {
  return (logs || [])
    .filter((log) => log.exerciseId === exerciseId)
    .sort((a, b) => (b.date || "").localeCompare(a.date || "") || tsMillis(b) - tsMillis(a))
    .map((log) => ({
      id: log.id,
      date: log.date,
      dayName: log.dayName || "",
      programName: log.programName || "",
      sets: cloneSets(log.sets).map((s) => ({
        weight: s.weight === null ? "" : fmtKg(s.weight),
        reps: s.reps === null ? "?" : String(s.reps),
        done: s.done,
      })),
    }));
}

// [{date, weight}] of the heaviest set per date for one exercise, ascending.
export function progressionSeries(logs, exerciseId) {
  const byDate = new Map();
  for (const log of logs) {
    if (log.exerciseId !== exerciseId) continue;
    const top = topWeight(log);
    if (top === null) continue;
    const cur = byDate.get(log.date);
    if (cur === undefined || top > cur) byDate.set(log.date, top);
  }
  return [...byDate.entries()]
    .map(([date, weight]) => ({ date, weight }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

// Distinct exercises present in the log history (works for deleted
// exercises too, via the name snapshot). Newest name wins.
export function exercisesFromLogs(logs) {
  const map = new Map(); // exerciseId -> {exerciseId, name, lastDate}
  for (const log of logs) {
    const cur = map.get(log.exerciseId);
    if (!cur || log.date > cur.lastDate) {
      map.set(log.exerciseId, {
        exerciseId: log.exerciseId,
        name: log.exerciseName || log.exerciseId,
        lastDate: log.date,
      });
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "pt"));
}

// Distinct trained days per week for the last nWeeks (including the current
// one), combining workout logs with optional extra date strings.
// oldest first: [{start, label, count}].
export function weeklyFrequency(logs, nWeeks, today, extraDates = []) {
  const trainedDates = new Set();
  for (const log of logs) if (log.date) trainedDates.add(log.date);
  for (const date of extraDates) if (date) trainedDates.add(date);
  const thisWeek = weekStartStr(today);
  const weeks = [];
  for (let i = nWeeks - 1; i >= 0; i--) {
    const start = addDaysStr(thisWeek, -7 * i);
    weeks.push({ start, label: fmtDate(start), count: 0 });
  }
  const first = weeks[0].start;
  for (const date of trainedDates) {
    const ws = weekStartStr(date);
    if (ws < first) continue;
    const w = weeks.find((x) => x.start === ws);
    if (w) w.count++;
  }
  return weeks;
}

// Completed set volume attributed to each muscle in an inclusive date range.
// The returned array is [{muscleId, total, exercises: [{exerciseId, name,
// sets, factor, contribution}]}]. Exercise names always come from the live
// catalog, and logs for exercises no longer in that catalog are ignored.
export function muscleSetsRange(logs, exercisesById, startDate, endDate) {
  const exerciseSets = new Map();

  for (const log of logs || []) {
    if (!log?.date || log.date < startDate || log.date > endDate) continue;
    const exercise = exercisesById?.get(log.exerciseId);
    if (!exercise) continue;
    const sets = (Array.isArray(log.sets) ? log.sets : [])
      .filter((set) => set?.done !== false).length;
    if (!sets) continue;

    const current = exerciseSets.get(log.exerciseId);
    if (current) current.sets += sets;
    else exerciseSets.set(log.exerciseId, { exercise, sets });
  }

  const byMuscle = new Map();
  const addContribution = (muscleId, exerciseId, exercise, sets, factor) => {
    if (!muscleId) return;
    if (!byMuscle.has(muscleId)) {
      byMuscle.set(muscleId, { muscleId, total: 0, exercises: [] });
    }
    const muscle = byMuscle.get(muscleId);
    const contribution = sets * factor;
    muscle.total += contribution;
    muscle.exercises.push({
      exerciseId,
      name: exercise.name || exerciseId,
      sets,
      factor,
      contribution,
    });
  };

  exerciseSets.forEach(({ exercise, sets }, exerciseId) => {
    addContribution(exercise.primaryMuscleId, exerciseId, exercise, sets, 1);
    (Array.isArray(exercise.secondaryMuscleIds) ? exercise.secondaryMuscleIds : [])
      .forEach((muscleId) => addContribution(muscleId, exerciseId, exercise, sets, 0.5));
  });

  return [...byMuscle.values()];
}

export function weeklyMuscleSets(logs, exercisesById, weekStart) {
  return muscleSetsRange(logs, exercisesById, weekStart, addDaysStr(weekStart, 6));
}

export function dailyMuscleSets(logs, exercisesById, date) {
  return muscleSetsRange(logs, exercisesById, date, date);
}

// Cardio minutes per week for the last nWeeks (including the current one),
// oldest first. Multiple entries on the same date are summed into one day.
export function weeklyCardio(cardio, nWeeks = 12, today = todayStr()) {
  const thisWeek = weekStartStr(today);
  const weeks = [];
  const byStart = new Map();
  for (let i = nWeeks - 1; i >= 0; i--) {
    const weekStart = addDaysStr(thisWeek, -7 * i);
    const week = { weekStart, totalMinutes: 0, days: [] };
    weeks.push(week);
    byStart.set(weekStart, week);
  }

  const daily = new Map();
  for (const entry of cardio || []) {
    if (!entry.date) continue;
    const minutes = Math.max(0, Math.floor(Number(entry.minutes)) || 0);
    if (!minutes) continue;
    daily.set(entry.date, (daily.get(entry.date) || 0) + minutes);
  }
  for (const [date, minutes] of daily) {
    const week = byStart.get(weekStartStr(date));
    if (!week) continue;
    week.days.push({ date, minutes });
    week.totalMinutes += minutes;
  }
  weeks.forEach((week) => week.days.sort((a, b) => a.date.localeCompare(b.date)));
  return weeks;
}

// Cardio minutes per day for the last nDays (including today), oldest first.
export function dailyCardio(cardio, nDays = 14, today = todayStr()) {
  const days = [];
  const byDate = new Map();
  for (let i = Math.max(0, Math.floor(nDays)) - 1; i >= 0; i--) {
    const date = addDaysStr(today, -i);
    const day = { date, label: fmtDateShortMonth(date), minutes: 0 };
    days.push(day);
    byDate.set(date, day);
  }
  for (const entry of cardio || []) {
    const day = byDate.get(entry.date);
    if (!day) continue;
    day.minutes += Math.max(0, Math.floor(Number(entry.minutes)) || 0);
  }
  return days;
}

// Cardio minutes per calendar month for the last nMonths (including the
// current month), oldest first. Month keys use local date parts.
export function monthlyCardio(cardio, nMonths = 6, today = todayStr()) {
  const current = dateFromStr(today);
  const months = [];
  const byKey = new Map();
  for (let i = Math.max(0, Math.floor(nMonths)) - 1; i >= 0; i--) {
    const date = new Date(current.getFullYear(), current.getMonth() - i, 1);
    const monthKey = `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
    const month = {
      monthKey,
      label: `${MONTHS[date.getMonth()]}/${String(date.getFullYear()).slice(-2)}`,
      minutes: 0,
    };
    months.push(month);
    byKey.set(monthKey, month);
  }
  for (const entry of cardio || []) {
    const month = byKey.get(String(entry.date || "").slice(0, 7));
    if (!month) continue;
    month.minutes += Math.max(0, Math.floor(Number(entry.minutes)) || 0);
  }
  return months;
}

// ---------- sorting ----------

export const sortByOrder = (list) =>
  [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.name || "").localeCompare(b.name || "", "pt"));

// Display-only ordering: the favorite program first, the rest by `order`.
// Never mutates `order`. If corrupt data carries several favorites, the one
// that sorts first by `order` wins and the others fall back to plain order.
export const sortProgramsFavoriteFirst = (programs) => {
  const ordered = sortByOrder(programs);
  const favorite = ordered.find((p) => p.favorite === true);
  if (!favorite) return ordered;
  return [favorite, ...ordered.filter((p) => p !== favorite)];
};

// Id of the favorite program in a list (same winner rule as above), or null.
export const favoriteProgramId = (programs) => {
  const favorite = sortByOrder(programs).find((p) => p.favorite === true);
  return favorite ? favorite.id : null;
};

export const sortExercises = (list) =>
  [...list].sort((a, b) => (a.nameLower || "").localeCompare(b.nameLower || "", "pt"));
