// Pure inline-SVG chart builders: no DOM APIs, no libraries. Each function
// returns an <svg> string sized by viewBox; the page scales it via CSS.
// Colors come from CSS custom properties so the charts follow the theme.

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

const fmtVal = (v) => (Number.isInteger(v) ? String(v) : String(v).replace(".", ","));

// Line chart of {label, value} points (progression: label = date).
// Shows min/max on the y-axis, first/last labels on the x-axis and the
// value above the last point.
export function lineChart(points) {
  const W = 340;
  const H = 150;
  const PAD = { top: 18, right: 14, bottom: 20, left: 36 };
  if (!points || points.length === 0) return "";

  const values = points.map((p) => p.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const span = max - min;
  min -= span * 0.1;
  max += span * 0.1;

  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const x = (i) => PAD.left + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (v) => PAD.top + ih - ((v - min) / (max - min)) * ih;

  const coords = points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`);
  const last = points[points.length - 1];

  const dots = points
    .map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="3" fill="var(--brand)"/>`)
    .join("");

  const gridY = [Math.min(...values), Math.max(...values)];
  const grid = gridY
    .map(
      (v) =>
        `<line x1="${PAD.left}" y1="${y(v).toFixed(1)}" x2="${W - PAD.right}" y2="${y(v).toFixed(1)}" stroke="var(--line)" stroke-dasharray="3 3"/>` +
        `<text x="${PAD.left - 6}" y="${(y(v) + 3.5).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--muted)">${fmtVal(v)}</text>`
    )
    .join("");

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img">
    ${grid}
    <polyline points="${coords.join(" ")}" fill="none" stroke="var(--brand)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}
    <text x="${x(points.length - 1).toFixed(1)}" y="${(y(last.value) - 8).toFixed(1)}" text-anchor="end" font-size="11" font-weight="700" fill="var(--brand)">${fmtVal(last.value)}kg</text>
    <text x="${PAD.left}" y="${H - 5}" font-size="10" fill="var(--muted)">${esc(points[0].label)}</text>
    <text x="${W - PAD.right}" y="${H - 5}" text-anchor="end" font-size="10" fill="var(--muted)">${esc(last.label)}</text>
  </svg>`;
}

// Bar chart of {label, value} bars, value printed above each bar when > 0.
// showLabels: "ends" prints only first/last x labels, "all" prints every one.
export function barChart(bars, { showLabels = "all", color = "var(--brand)" } = {}) {
  const W = 340;
  const H = 150;
  const PAD = { top: 16, right: 8, bottom: 20, left: 8 };
  if (!bars || bars.length === 0) return "";

  const max = Math.max(1, ...bars.map((b) => b.value));
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const step = iw / bars.length;
  const bw = Math.min(28, step * 0.62);

  const parts = bars.map((b, i) => {
    const cx = PAD.left + step * i + step / 2;
    const h = (b.value / max) * ih;
    const yTop = PAD.top + ih - h;
    const bar = `<rect x="${(cx - bw / 2).toFixed(1)}" y="${yTop.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(h, b.value > 0 ? 2 : 0).toFixed(1)}" rx="3" fill="${b.color || color}"/>`;
    const val =
      b.value > 0
        ? `<text x="${cx.toFixed(1)}" y="${(yTop - 4).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="700" fill="var(--muted)">${fmtVal(b.value)}</text>`
        : "";
    const showLabel = showLabels === "all" || i === 0 || i === bars.length - 1;
    const label = showLabel
      ? `<text x="${cx.toFixed(1)}" y="${H - 5}" text-anchor="middle" font-size="9" fill="var(--muted)">${esc(b.label)}</text>`
      : "";
    return bar + val + label;
  });

  const base = PAD.top + ih;
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img">
    <line x1="${PAD.left}" y1="${base}" x2="${W - PAD.right}" y2="${base}" stroke="var(--line)"/>
    ${parts.join("")}
  </svg>`;
}
