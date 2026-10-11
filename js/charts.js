// Pure inline-SVG chart builders: no DOM APIs, no libraries. Each function
// returns a `.chart-scroll` wrapper (overflow-x: auto) holding one <svg>.
// Exactly CHART_SLOTS slots fit the visible width; extra slots overflow to the
// left and are reached by horizontal swipe (the page scrolls the wrapper fully
// to the right after each render, see setChart in main.js). Every item gets its
// own x label. Colors come from CSS custom properties so the charts follow the theme.

export const CHART_SLOTS = 5;

const SLOT_W = 64; // viewBox units per slot; ~1 CSS px per unit on a 375px phone
const H = 150;
const LABEL_SIZE = 9;
const VALUE_SIZE = 10;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

const fmtVal = (v) => String(Math.round(Number(v) * 10) / 10);

// The svg is (slots / CHART_SLOTS) times as wide as the scroll wrapper, so a
// slot is always 1/CHART_SLOTS of the visible width.
function wrapSvg(slots, body) {
  const W = slots * SLOT_W;
  return `<div class="chart-scroll"><svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" style="width:${(slots * 100) / CHART_SLOTS}%">${body}</svg></div>`;
}

// Line chart of {label, value} points (progression: label = date), one point
// per slot starting from the left. Every point shows its value above and its
// label below; dashed reference lines mark the min and the max of the series.
export function lineChart(points) {
  if (!points || points.length === 0) return "";
  const slots = Math.max(CHART_SLOTS, points.length);
  const W = slots * SLOT_W;
  const PAD = { top: 24, bottom: 22 };

  const values = points.map((p) => p.value);
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  let min = dataMin;
  let max = dataMax;
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const span = max - min;
  min -= span * 0.1;
  max += span * 0.1;

  const ih = H - PAD.top - PAD.bottom;
  const x = (i) => i * SLOT_W + SLOT_W / 2;
  const y = (v) => PAD.top + ih - ((v - min) / (max - min)) * ih;

  const grid = [dataMin, dataMax]
    .map(
      (v) =>
        `<line x1="0" y1="${y(v).toFixed(1)}" x2="${W}" y2="${y(v).toFixed(1)}" stroke="var(--line)" stroke-dasharray="3 3"/>`
    )
    .join("");
  const coords = points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const items = points
    .map(
      (p, i) =>
        `<circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="3.5" fill="var(--brand)"/>` +
        `<text class="chart-value" x="${x(i).toFixed(1)}" y="${(y(p.value) - 8).toFixed(1)}" text-anchor="middle" font-size="${VALUE_SIZE}" font-weight="700" fill="var(--ink)">${fmtVal(p.value)}</text>` +
        `<text class="chart-label" x="${x(i).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="${LABEL_SIZE}" fill="var(--muted)">${esc(p.label)}</text>`
    )
    .join("");

  return wrapSvg(
    slots,
    `${grid}<polyline points="${coords}" fill="none" stroke="var(--brand)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>${items}`
  );
}

// Bar chart of {label, value, color?} bars, oldest first. The value is printed
// above each bar when > 0 and the label under every real bar. The y scale is
// shared by all bars. Fewer than CHART_SLOTS bars are padded on the left with
// empty (unlabeled) slots so a slot never grows wider than 1/CHART_SLOTS.
export function barChart(bars, { color = "var(--brand)" } = {}) {
  if (!bars || bars.length === 0) return "";
  const padCount = Math.max(0, CHART_SLOTS - bars.length);
  const slotsData = [
    ...Array.from({ length: padCount }, () => ({ pad: true, value: 0 })),
    ...bars,
  ];
  const slots = slotsData.length;
  const W = slots * SLOT_W;
  const PAD = { top: 16, bottom: 22 };
  const max = Math.max(1, ...bars.map((b) => b.value));
  const ih = H - PAD.top - PAD.bottom;
  const bw = 30;
  const base = PAD.top + ih;

  const parts = slotsData.map((b, i) => {
    const cx = i * SLOT_W + SLOT_W / 2;
    if (b.pad) return `<g class="chart-slot chart-slot-pad" data-slot="${i}"></g>`;
    const h = (b.value / max) * ih;
    const yTop = base - h;
    const bar = `<rect x="${(cx - bw / 2).toFixed(1)}" y="${yTop.toFixed(1)}" width="${bw}" height="${Math.max(h, b.value > 0 ? 2 : 0).toFixed(1)}" rx="3" fill="${b.color || color}"/>`;
    const val =
      b.value > 0
        ? `<text class="chart-value" x="${cx.toFixed(1)}" y="${(yTop - 4).toFixed(1)}" text-anchor="middle" font-size="${VALUE_SIZE}" font-weight="700" fill="var(--muted)">${fmtVal(b.value)}</text>`
        : "";
    const label = `<text class="chart-label" x="${cx.toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="${LABEL_SIZE}" fill="var(--muted)">${esc(b.label)}</text>`;
    return `<g class="chart-slot" data-slot="${i}">${bar}${val}${label}</g>`;
  });

  return wrapSvg(
    slots,
    `<line x1="0" y1="${base}" x2="${W}" y2="${base}" stroke="var(--line)"/>${parts.join("")}`
  );
}
