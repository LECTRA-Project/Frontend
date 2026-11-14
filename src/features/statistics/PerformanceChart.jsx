/*
  A small line chart drawn with plain SVG (no chart library).
  data: array of { label, score } where score is 0–100.

  How it works: every score is turned into an (x, y) position inside the drawing area,
  then the points are joined into a line, and the area under the line gets a soft fill.
*/
import { t, useI18n } from "../../i18n/i18n.js";

const WIDTH = 560;
const HEIGHT = 260;
const PAD = { top: 16, right: 24, bottom: 48, left: 56 };
const Y_TICKS = [0, 25, 50, 75, 100];

/* The sample data's "Week 3" labels, in the current interface language. */
function weekLabel(label) {
  const match = /^Week (\d+)$/.exec(label);
  return match ? t("Week {number}", { number: match[1] }) : label;
}

export default function PerformanceChart({ data }) {
  useI18n(); // re-render in a new interface language
  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;

  const xFor = (index) => PAD.left + (index / (data.length - 1)) * plotWidth;
  const yFor = (score) => PAD.top + plotHeight - (score / 100) * plotHeight;

  const points = data.map((item, index) => ({ x: xFor(index), y: yFor(item.score), ...item, text: weekLabel(item.label) }));
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const bottomY = yFor(0);
  const areaPath = `${linePath} L${points.at(-1).x},${bottomY} L${points[0].x},${bottomY} Z`;

  return (
    <figure className="chart">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={t("Line chart of sample scores: {scores}", { scores: points.map((p) => `${p.text} ${p.score}%`).join(", ") })}
      >
        <defs>
          <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.16" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Horizontal grid lines and Y labels */}
        {Y_TICKS.map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={WIDTH - PAD.right} y1={yFor(tick)} y2={yFor(tick)} className="chart__grid" />
            <text x={PAD.left - 10} y={yFor(tick) + 4} textAnchor="end" className="chart__tick">
              {tick}%
            </text>
          </g>
        ))}

        {/* X labels */}
        {points.map((p) => (
          <text key={p.label} x={p.x} y={bottomY + 18} textAnchor="middle" className="chart__tick">
            {p.text}
          </text>
        ))}

        {/* Axis titles */}
        <text x={PAD.left + plotWidth / 2} y={HEIGHT - 6} textAnchor="middle" className="chart__axis-title">
          {t("Week")}
        </text>
        <text
          x={14}
          y={PAD.top + plotHeight / 2}
          textAnchor="middle"
          transform={`rotate(-90 14 ${PAD.top + plotHeight / 2})`}
          className="chart__axis-title"
        >
          {t("Score (%)")}
        </text>

        {/* Area, line and points */}
        <path d={areaPath} fill="url(#chart-fill)" />
        <path d={linePath} className="chart__line" />
        {points.map((p) => (
          <circle key={p.label} cx={p.x} cy={p.y} r={4} className="chart__point">
            <title>{t("{label}: {score}% (sample)", { label: p.text, score: p.score })}</title>
          </circle>
        ))}
      </svg>
    </figure>
  );
}
