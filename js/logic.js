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

// ---------- dates (always LOCAL, never toISOString: UTC would shift the
// date in Brazil from 21:00 onwards) ----------

const pad = (n) => String(n).padStart(2, "0");

export function todayStr(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dateFromStr(dateStr) {
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function fmtDate(dateStr) {
  const d = dateFromStr(dateStr);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

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

// Days trained since the most recently completed program cycle. A session is
// one (date, day) pair; exercises within the same session count only once.
export function cycleDays(logs, programId, dayIds) {
  const validDays = new Set(dayIds || []);
  if (validDays.size === 0) return new Set();

  const sessions = new Map();
  for (const log of logs || []) {
    if (log.programId !== programId || !validDays.has(log.dayId) || !log.date) continue;
    const key = `${log.date}|${log.dayId}`;
    const stamp = tsMillis(log);
    const previous = sessions.get(key);
    if (!previous || stamp < previous.stamp) {
      sessions.set(key, { date: log.date, dayId: log.dayId, stamp });
    }
  }

  const trained = new Set();
  [...sessions.values()]
    .sort((a, b) =>
      a.date.localeCompare(b.date) || a.stamp - b.stamp || a.dayId.localeCompare(b.dayId)
    )
    .forEach(({ dayId }) => {
      trained.add(dayId);
      if (trained.size === validDays.size) trained.clear();
    });
  return trained;
}

// A day entry's rep target is a single number. New docs store `reps`;
// docs written before v2 carried a repMin-repMax range and are read as the
// range's top (no migration needed).
export function entryReps(entry) {
  return Number(entry?.reps) || Number(entry?.repMax) || Number(entry?.repMin) || 10;
}

// First number in a refWeight string: "40–42,5 kg" -> 40, "12 kg cada" -> 12,
// "carga a calibrar" -> null.
export function parseRefWeight(refWeight) {
  const m = String(refWeight || "").replace(",", ".").match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

// Sets to pre-fill when an exercise is checked: values from the last session,
// else the day entry's target reps at the reference weight. New sets are pending.
export function prefillSets(lastLog, entry, refWeightNum = null) {
  if (lastLog && Array.isArray(lastLog.sets) && lastLog.sets.length > 0) {
    return cloneSets(lastLog.sets).map((s) => ({ ...s, done: false }));
  }
  const n = Math.max(1, Number(entry?.targetSets) || 3);
  const reps = entryReps(entry);
  return Array.from({ length: n }, () => ({ reps, weight: refWeightNum, done: false }));
}

// "3×12": always a single rep number.
export function targetLabel(entry) {
  if (!entry || !entry.targetSets) return "";
  return `${entry.targetSets}×${entryReps(entry)}`;
}

const fmtKg = (w) => `${String(w).replace(".", ",")}kg`;

// Structured, weight-first set summaries for renderers that style weight and
// reps separately. Weightless sets keep their useful reps value on its own.
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
    .map((s) => (s.weight ? `${s.weight}×${s.reps}` : s.reps))
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

// ---------- sorting ----------

export const sortByOrder = (list) =>
  [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.name || "").localeCompare(b.name || "", "pt"));

export const sortExercises = (list) =>
  [...list].sort((a, b) => (a.nameLower || "").localeCompare(b.nameLower || "", "pt"));
