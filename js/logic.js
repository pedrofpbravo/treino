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

// Value for <input type="datetime-local">: "YYYY-MM-DDTHH:mm" local.
export function nowLocalStr(d = new Date()) {
  return `${todayStr(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

// "2026-08-30T14:23" -> "30/08 14:23"
export function fmtDateTime(atStr) {
  return `${fmtDate(atStr)} ${atStr.slice(11, 16)}`;
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
  }));

// Sets to pre-fill when an exercise is checked: last session verbatim,
// else the day entry's target (repMin reps, empty weight).
export function prefillSets(lastLog, entry) {
  if (lastLog && Array.isArray(lastLog.sets) && lastLog.sets.length > 0) {
    return cloneSets(lastLog.sets);
  }
  const n = Math.max(1, Number(entry?.targetSets) || 3);
  const reps = Number(entry?.repMin) || 10;
  return Array.from({ length: n }, () => ({ reps, weight: null }));
}

// "3×6–10" (or "3×10" when the range collapses).
export function targetLabel(entry) {
  if (!entry || !entry.targetSets) return "";
  const { targetSets, repMin, repMax } = entry;
  const range = repMin === repMax ? `${repMin}` : `${repMin}–${repMax}`;
  return `${targetSets}×${range}`;
}

const fmtKg = (w) => `${String(w).replace(".", ",")}kg`;

// Compact sets summary: "3×10 @ 40kg", "10/10/8 @ 40kg", or per-set pairs
// when weights differ. Weightless sets show reps only.
export function setsLabel(sets) {
  const list = cloneSets(sets).filter((s) => s.reps !== null || s.weight !== null);
  if (list.length === 0) return "";
  const weights = [...new Set(list.map((s) => s.weight))];
  if (weights.length === 1) {
    const reps = list.map((s) => (s.reps === null ? "?" : s.reps));
    const sameReps = new Set(reps).size === 1;
    const repsPart = sameReps ? `${list.length}×${reps[0]}` : reps.join("/");
    return weights[0] === null ? repsPart : `${repsPart} @ ${fmtKg(weights[0])}`;
  }
  return list
    .map((s) => `${s.weight === null ? "?" : fmtKg(s.weight)}×${s.reps === null ? "?" : s.reps}`)
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

// Sessions per week for the last nWeeks (including the current one),
// oldest first: [{start, label, count}].
export function weeklyFrequency(logs, nWeeks, today) {
  const sessions = new Set();
  for (const log of logs) sessions.add(`${log.date}|${log.dayId}`);
  const thisWeek = weekStartStr(today);
  const weeks = [];
  for (let i = nWeeks - 1; i >= 0; i--) {
    const start = addDaysStr(thisWeek, -7 * i);
    weeks.push({ start, label: fmtDate(start), count: 0 });
  }
  const first = weeks[0].start;
  for (const key of sessions) {
    const ws = weekStartStr(key.slice(0, 10));
    if (ws < first) continue;
    const w = weeks.find((x) => x.start === ws);
    if (w) w.count++;
  }
  return weeks;
}

// ---------- bathroom ----------

export const BRISTOL_LABELS = {
  1: "Bolinhas duras",
  2: "Grumoso e firme",
  3: "Salsicha com fissuras",
  4: "Liso e macio",
  5: "Pedaços macios",
  6: "Pastoso",
  7: "Líquido",
};

// 1-2 constipated (warn), 3-4 normal (ok), 5-7 loose (bad).
export function bristolClass(n) {
  if (n <= 2) return "warn";
  if (n <= 4) return "ok";
  return "bad";
}

// {week, perDay, avg4w, dist:[7]} for the stats card.
export function bristolStats(events, today) {
  const thisWeek = weekStartStr(today);
  const fourWeeksAgo = addDaysStr(thisWeek, -21);
  let week = 0;
  let last4 = 0;
  const dist = [0, 0, 0, 0, 0, 0, 0];
  for (const e of events) {
    const date = (e.at || "").slice(0, 10);
    if (!date) continue;
    const ws = weekStartStr(date);
    if (ws === thisWeek) week++;
    if (ws >= fourWeeksAgo) last4++;
    const b = Number(e.bristol);
    if (b >= 1 && b <= 7) dist[b - 1]++;
  }
  const dow = (dateFromStr(today).getDay() + 6) % 7; // days elapsed this week
  return {
    week,
    perDay: week / (dow + 1),
    avg4w: last4 / 4,
    dist,
  };
}

// ---------- sorting ----------

export const sortByOrder = (list) =>
  [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.name || "").localeCompare(b.name || "", "pt"));

export const sortExercises = (list) =>
  [...list].sort((a, b) => (a.nameLower || "").localeCompare(b.nameLower || "", "pt"));

export const sortBathroom = (list) =>
  [...list].sort((a, b) => (a.at < b.at ? 1 : -1));
