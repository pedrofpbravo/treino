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

// ---------- one-time workout backfill (v7.7) ----------
// The 2026-10-04 lower-body workout never reached Firestore (the owner did not
// press "Finalizar treino"). This spec is replayed once at boot, writing what
// "Finalizar treino" would have written: one log per exercise, the finished
// session, and the refWeight bump (never lowering it).
export const BACKFILL_2026_10_04 = {
  date: "2026-10-04",
  programId: "prog-fb-ul",
  dayId: "day-fb-ul-lower",
  items: [
    { exerciseId: "ex-leg_press_45", sets: 4, reps: 10, weight: 120, substitutedForId: "ex-hack_squat" },
    { exerciseId: "ex-hip_thrust", sets: 3, reps: 12, weight: 40, substitutedForId: "ex-rdl_stiff" },
    { exerciseId: "ex-cadeira_extensora", sets: 3, reps: 10, weight: 60, substitutedForId: null },
    { exerciseId: "ex-cadeira_flexora_bilateral", sets: 3, reps: 10, weight: 57.5, substitutedForId: null },
    { exerciseId: "ex-abdominal_maquina", sets: 3, reps: 10, weight: 62.5, substitutedForId: null },
    { exerciseId: "ex-biceps_maquina", sets: 2, reps: 10, weight: 22.5, substitutedForId: null },
  ],
};

// Pure resolver. Returns { logs, session, refWeightUpdates, errors }. Any error
// means nothing may be written. Logs whose deterministic id already exists are
// skipped (never overwritten); `session` is null when its id already exists.
// refWeightUpdates carry the numeric max; db.backfillWorkout stores String(max),
// the same format the "Finalizar treino" bump writes.
export function resolveWorkoutBackfill(spec, { exercises, programs, days, logs, sessions } = {}) {
  const exercisesById = new Map((exercises || []).map((exercise) => [exercise.id, exercise]));
  const program = (programs || []).find((item) => item.id === spec.programId);
  const day = (days || []).find((item) => item.id === spec.dayId);
  const existingLogIds = new Set((logs || []).map((log) => log.id));
  const errors = [];

  if (!program) errors.push(`Programa não encontrado: ${spec.programId}.`);
  if (!day) errors.push(`Dia não encontrado: ${spec.dayId}.`);
  spec.items.forEach((item) => {
    if (!exercisesById.has(item.exerciseId)) {
      errors.push(`Exercício não encontrado: ${item.exerciseId}.`);
    }
    if (item.substitutedForId && !exercisesById.has(item.substitutedForId)) {
      errors.push(`Exercício original não encontrado: ${item.substitutedForId}.`);
    }
  });
  if (errors.length > 0) return { logs: [], session: null, refWeightUpdates: [], errors };

  const programName = program.name || "Full Body + Upper Lower";
  const dayName = day.name || "Lower";
  const outLogs = [];
  const refWeightUpdates = [];

  spec.items.forEach((item) => {
    const exercise = exercisesById.get(item.exerciseId);
    const log = {
      date: spec.date,
      programId: spec.programId,
      dayId: spec.dayId,
      exerciseId: item.exerciseId,
      substitutedForId: item.substitutedForId || null,
      exerciseName: exercise.name || item.exerciseId,
      dayName,
      programName,
      sets: Array.from({ length: item.sets }, () => ({
        reps: item.reps,
        weight: item.weight,
        done: true,
      })),
    };
    if (existingLogIds.has(logDocId(log))) return;
    outLogs.push(log);

    const currentRefWeight = parseRefWeight(exercise.refWeight);
    if (currentRefWeight === null || item.weight > currentRefWeight) {
      refWeightUpdates.push({ id: item.exerciseId, refWeight: item.weight });
    }
  });

  const sessionId = `sess-${spec.date}-${spec.dayId}`;
  const session = (sessions || []).some((item) => item.id === sessionId)
    ? null
    : { date: spec.date, programId: spec.programId, dayId: spec.dayId, dayName, programName };

  return { logs: outLogs, session, refWeightUpdates, errors };
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

// Chart label for the Monday-to-Sunday week starting at weekStart:
// "05-11/10" inside one month, "28/09-04/10" across a month or year boundary.
export function weekRangeLabel(weekStart) {
  const weekEnd = addDaysStr(weekStart, 6);
  if (weekStart.slice(0, 7) === weekEnd.slice(0, 7)) {
    return `${weekStart.slice(8, 10)}-${fmtDate(weekEnd)}`;
  }
  return `${fmtDate(weekStart)}-${fmtDate(weekEnd)}`;
}

// How many chart periods ("day" | "week" | "month") to draw: from the period
// of the earliest valid date up to the one of `today`, clamped to [min, max].
// With no valid date it returns min.
export function chartPeriodCount(dates, today, unit, min = 5, max = 52) {
  let earliest = null;
  for (const date of dates || []) {
    if (typeof date !== "string" || date.length < 10) continue;
    if (earliest === null || date < earliest) earliest = date;
  }
  if (earliest === null) return min;
  const a = dateFromStr(earliest);
  const b = dateFromStr(today);
  const utcDay = (d) => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
  let span;
  if (unit === "month") {
    span = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + 1;
  } else if (unit === "week") {
    const weekA = dateFromStr(weekStartStr(earliest));
    const weekB = dateFromStr(weekStartStr(today));
    span = (utcDay(weekB) - utcDay(weekA)) / 7 + 1;
  } else {
    span = utcDay(b) - utcDay(a) + 1;
  }
  return Math.max(min, Math.min(max, span));
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
    ...(s.warmup === true ? { warmup: true } : {}),
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
    .filter((set) => !isWarmupSet(set))
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

// ---------- warm-up set (v7.8) ----------
// A day entry may carry `warmup: true|false`. A warm-up set is the first row of
// the card (`warmup: true` on the set); it never counts as training volume.

export const WARMUP_MAX_PER_DAY = 2;
export const WARMUP_REPS = 12;
export const WARMUP_REST_SECS = 60;

export const isWarmupSet = (set) => set?.warmup === true;

// The working (non-warm-up) sets of a draft or log.
export const workingSets = (sets) =>
  (Array.isArray(sets) ? sets : []).filter((set) => !isWarmupSet(set));

const WARMUP_PUSH = new Set(["mus-peito", "mus-ombro-anterior"]);
const WARMUP_PULL = new Set(["mus-dorsais", "mus-costas-superiores"]);
const WARMUP_LOWER = new Set(["mus-quadriceps", "mus-posterior", "mus-gluteos"]);

// Exercise ids of a day that get a warm-up set (max 2). Explicit booleans on
// the entries win: if ANY entry carries one, the day is "manual" and entries
// without the field count as false. Otherwise the default rule applies, by the
// exercise's primary muscle: W1 = first compound entry (push, pull or lower);
// W2 = first later entry from the complementary upper group (after a push
// comes a pull, after a pull a push, after a lower push or pull). Computed at
// read time, never written. exercisesById may be a Map or a plain object.
export function warmupEntryIds(entries, exercisesById) {
  const list = Array.isArray(entries) ? entries : [];
  if (list.some((entry) => typeof entry?.warmup === "boolean")) {
    return new Set(
      list
        .filter((entry) => entry?.warmup === true && entry.exerciseId)
        .map((entry) => entry.exerciseId)
        .slice(0, WARMUP_MAX_PER_DAY)
    );
  }

  const getExercise = (id) =>
    exercisesById && typeof exercisesById.get === "function"
      ? exercisesById.get(id)
      : exercisesById?.[id];
  const primaryOf = (entry) => getExercise(entry?.exerciseId)?.primaryMuscleId || null;
  const inUpper = (id) => WARMUP_PUSH.has(id) || WARMUP_PULL.has(id);

  const firstIndex = list.findIndex((entry) => {
    const primary = primaryOf(entry);
    return inUpper(primary) || WARMUP_LOWER.has(primary);
  });
  if (firstIndex < 0) return new Set();

  const first = primaryOf(list[firstIndex]);
  const wantsSecond = WARMUP_PUSH.has(first)
    ? (id) => WARMUP_PULL.has(id)
    : WARMUP_PULL.has(first)
      ? (id) => WARMUP_PUSH.has(id)
      : inUpper;
  const ids = new Set([list[firstIndex].exerciseId]);
  const second = list.slice(firstIndex + 1).find((entry) => wantsSecond(primaryOf(entry)));
  if (second) ids.add(second.exerciseId);
  return ids;
}

// Suggested warm-up set: 30% of the Epley 1RM estimate, rounded DOWN to a
// multiple of 2.5 kg, 12 reps. No usable reference (or a result below 2.5 kg)
// leaves the weight empty. The 1RM stays internal; it is never displayed.
export function warmupSet(refWeightNum, targetReps) {
  const ref = Number(refWeightNum);
  const reps = Number(targetReps);
  let weight = null;
  if (refWeightNum !== null && refWeightNum !== undefined && refWeightNum !== "" &&
      Number.isFinite(ref) && ref > 0) {
    const oneRepMax = ref * (1 + (Number.isFinite(reps) && reps > 0 ? reps : 10) / 30);
    const rounded = Math.floor((oneRepMax * 0.3) / 2.5 + 1e-9) * 2.5;
    if (rounded >= 2.5) weight = rounded;
  }
  return { reps: WARMUP_REPS, weight, done: false, warmup: true };
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

// "Done" means every WORKING set is checked; the warm-up set is ignored.
export function draftAllDone(sets) {
  const working = workingSets(sets);
  return working.length > 0 && working.every(draftSetDone);
}

// The sets that "Finalizar treino" writes to the history: checked sets only.
// An exercise with no checked WORKING set records nothing (a lone checked
// warm-up is dropped); otherwise a checked warm-up set is kept, first.
export function recordedSets(sets) {
  const checked = (Array.isArray(sets) ? sets : []).filter(draftSetDone);
  if (!checked.some((s) => !isWarmupSet(s))) return [];
  const mapped = checked.map((s) => ({
    reps: Number.isFinite(Number(s.reps)) ? Number(s.reps) : null,
    weight: s.weight === null || s.weight === undefined || s.weight === "" ? null : Number(s.weight),
    done: true,
    ...(isWarmupSet(s) ? { warmup: true } : {}),
  }));
  return [...mapped.filter(isWarmupSet), ...mapped.filter((s) => !isWarmupSet(s))];
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
  // the warm-up set (if any) always reads first
  return [...list.filter(isWarmupSet), ...list.filter((s) => !isWarmupSet(s))].map((s) => ({
    weight: s.weight === null ? "" : fmtKg(s.weight),
    reps: s.reps === null ? "?" : String(s.reps),
    warmup: isWarmupSet(s),
  }));
}

// Plain-text equivalent used by history, summaries and catalog rows.
// The warm-up set reads "Aq 12×25kg".
export function setsLabel(sets) {
  return setsParts(sets)
    .map((s) => {
      const text = s.weight ? `${s.reps}×${s.weight}` : s.reps;
      return s.warmup ? `Aq ${text}` : text;
    })
    .join(" · ");
}

// Heaviest weight in a log's sets, or null if none are numeric.
export function topWeight(log) {
  let top = null;
  for (const s of log.sets || []) {
    if (isWarmupSet(s)) continue;
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
        warmup: isWarmupSet(s),
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
      .filter((set) => set?.done !== false && !isWarmupSet(set)).length;
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

// ---------- working load, reference proposals and load insights (v7.8-C) ----------

// Numeric weight of a checked, non-warm-up set, or null. A missing `done`
// counts as done (legacy logs); an explicit false is pending and ignored.
function workingWeight(set) {
  if (!set || set.done === false || isWarmupSet(set)) return null;
  const raw = set.weight;
  if (raw === null || raw === undefined || raw === "" || typeof raw === "boolean") return null;
  const weight = Number(raw);
  return Number.isFinite(weight) && weight > 0 ? weight : null;
}

const round2 = (n) => Math.round(n * 100) / 100;

// The load of one session of an exercise: the highest weight reached in at
// least 2 working sets (the SECOND highest weight); a single weighted set is
// its own load. [60,65,62.5] -> 62.5, [60,60,60] -> 60, [65,60] -> 60,
// [70] -> 70. Warm-up, pending and weightless sets are ignored; none -> null.
export function workingLoad(sets) {
  const weights = (Array.isArray(sets) ? sets : [])
    .map(workingWeight)
    .filter((weight) => weight !== null)
    .sort((a, b) => b - a);
  if (weights.length === 0) return null;
  return weights.length === 1 ? weights[0] : weights[1];
}

// Reference-weight proposals for a finished workout. Each plan is
// {exerciseId, name, refWeight, sets} (sets = the recorded sets). A proposal
// exists when at least 2 checked working sets are heavier than the current
// reference (every weighted set counts when there is no reference); the new
// reference is the workingLoad of the sets. One set above never proposes.
// Returns [{exerciseId, name, from (number|null), to, delta (number|null)}],
// plan order kept; if an exercise shows up twice the last plan wins, like
// the log it overwrites.
export function refProposals(plans) {
  const byExercise = new Map();
  for (const plan of plans || []) {
    if (!plan?.exerciseId) continue;
    const parsed = parseRefWeight(plan.refWeight);
    const from = parsed !== null && parsed > 0 ? parsed : null;
    const weights = (Array.isArray(plan.sets) ? plan.sets : [])
      .map(workingWeight)
      .filter((weight) => weight !== null);
    const above = from === null ? weights : weights.filter((weight) => weight > from);
    if (above.length < 2) {
      byExercise.set(plan.exerciseId, null);
      continue;
    }
    const to = workingLoad(plan.sets);
    byExercise.set(plan.exerciseId, {
      exerciseId: plan.exerciseId,
      name: plan.name || plan.exerciseId,
      from,
      to,
      delta: from === null ? null : round2(to - from),
    });
  }
  return [...byExercise.values()].filter(Boolean);
}

const DAY_MS = 86400000;
const dayNumber = (dateStr) => {
  const [y, m, d] = String(dateStr).slice(0, 10).split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / DAY_MS);
};

export const STALL_MIN_DAYS = 30; // best load set at least this long ago
export const STALL_RECENT_DAYS = 21; // and trained within this window
export const STALL_STEP = 2.5; // suggested next load

// Load history of every exercise, derived from the logs only.
//  progressions: sessions whose load is strictly above the best of all earlier
//    sessions of that exercise (the first session never counts, nor does a
//    return to an old load after a drop). Newest first.
//    [{date, exerciseId, name, from, to, delta}]
//  stalled: exercises last trained within STALL_RECENT_DAYS of `today`, whose
//    best load was reached at least STALL_MIN_DAYS ago (date of its last
//    progression, or of its first session) with >= 2 sessions since (the
//    session that set it included). Longest-stalled first.
//    [{exerciseId, name, load, since, days, sessions, suggestion}]
// Two logs of one exercise on the same date count as one session (the max).
// exercisesById may be a Map or a plain object; names fall back to the log
// snapshot.
export function loadInsights(logs, exercisesById, today) {
  const getExercise = (id) =>
    exercisesById && typeof exercisesById.get === "function"
      ? exercisesById.get(id)
      : exercisesById?.[id];

  const byExercise = new Map();
  for (const log of logs || []) {
    if (!log?.exerciseId || !log.date) continue;
    const load = workingLoad(log.sets);
    if (load === null) continue;
    let entry = byExercise.get(log.exerciseId);
    if (!entry) {
      entry = { sessions: new Map(), snapshotName: "", snapshotDate: "" };
      byExercise.set(log.exerciseId, entry);
    }
    const current = entry.sessions.get(log.date);
    if (current === undefined || load > current) entry.sessions.set(log.date, load);
    if (log.exerciseName && log.date >= entry.snapshotDate) {
      entry.snapshotName = log.exerciseName;
      entry.snapshotDate = log.date;
    }
  }

  const progressions = [];
  const stalled = [];
  const todayNumber = dayNumber(today);
  for (const [exerciseId, entry] of byExercise) {
    const name = getExercise(exerciseId)?.name || entry.snapshotName || exerciseId;
    const sessions = [...entry.sessions.entries()]
      .map(([date, load]) => ({ date, load }))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    let best = -Infinity;
    let bestDate = null;
    sessions.forEach((session, index) => {
      if (session.load <= best) return;
      if (index > 0) {
        progressions.push({
          date: session.date,
          exerciseId,
          name,
          from: best,
          to: session.load,
          delta: round2(session.load - best),
        });
      }
      best = session.load;
      bestDate = session.date;
    });

    const last = sessions[sessions.length - 1];
    const sinceLast = todayNumber - dayNumber(last.date);
    const days = todayNumber - dayNumber(bestDate);
    const sessionsSince = sessions.filter((session) => session.date >= bestDate).length;
    if (sinceLast <= STALL_RECENT_DAYS && days >= STALL_MIN_DAYS && sessionsSince >= 2) {
      stalled.push({
        exerciseId,
        name,
        load: best,
        since: bestDate,
        days,
        sessions: sessionsSince,
        suggestion: round2(best + STALL_STEP),
      });
    }
  }

  progressions.sort(
    (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0) || a.name.localeCompare(b.name, "pt")
  );
  stalled.sort((a, b) => b.days - a.days || a.name.localeCompare(b.name, "pt"));
  return { stalled, progressions };
}
