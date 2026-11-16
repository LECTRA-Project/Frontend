import { useEffect, useRef, useState } from "react";

import { t, useI18n } from "../../i18n/i18n.js";
import { examsText, parseDay, percentText, weekLabel } from "./examStatsText.js";
import "./statistics.css";

/*
  The average exam score per week, as a small line chart drawn with plain SVG (no chart
  library), from GET /api/stats/exams → by_week (oldest first).

    weeks: [{ week_start: "2026-11-09", exams, average_percent }]

  - The weeks sit on a time axis: a week without an exam leaves a gap, so the line isn't
    stretched. One week is a single point in the middle.
  - Every point carries its value ("67%") and its week ("9 Nov"), so nothing needs a hover;
    when the points are too close the labels are thinned out (the last week always keeps
    them). The SVG has a text alternative with every week, and "Show as a table" lists the
    weeks with their number of exams.
  - The SVG is drawn in screen pixels (its width follows the box), so the labels keep their
    size on a phone instead of shrinking with the drawing.
*/

const HEIGHT = 220;
const DEFAULT_WIDTH = 560;
const PAD = { top: 24, right: 20, bottom: 30, left: 40 };
const INSET = 18; // keeps the first and last point off the edges
const Y_TICKS = [0, 25, 50, 75, 100];
const WEEK_MS = 7 * 86400000;
const MIN_LABEL_GAP = 52; // "29 Dec" at 11px
const MIN_VALUE_GAP = 34; // "100%"

/* The box's width in pixels (the default where it can't be measured, e.g. in tests). */
function useWidth(ref) {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.round(entry.contentRect.width);
      if (next > 0) setWidth(next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

/* The indexes of the points that keep a label: at least `gap` apart, the last one always. */
function spaced(points, gap) {
  const kept = [];
  points.forEach((point, index) => {
    if (kept.length === 0 || point.x - points[kept.at(-1)].x >= gap) kept.push(index);
  });
  const last = points.length - 1;
  if (last >= 0 && kept.at(-1) !== last) {
    if (kept.length > 1 && points[last].x - points[kept.at(-1)].x < gap) kept.pop();
    kept.push(last);
  }
  return new Set(kept);
}

export default function PerformanceChart({ weeks, titleId }) {
  useI18n(); // re-render in a new interface language
  const boxRef = useRef(null);
  const width = Math.max(240, useWidth(boxRef));

  const data = (weeks ?? []).filter((week) => parseDay(week.week_start) !== null && typeof week.average_percent === "number");
  if (data.length === 0) return null;

  const plotLeft = PAD.left + INSET;
  const plotWidth = width - plotLeft - PAD.right - INSET;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const first = parseDay(data[0].week_start);
  const span = (parseDay(data.at(-1).week_start) - first) / WEEK_MS;

  const xFor = (week) => (span === 0 ? plotLeft + plotWidth / 2 : plotLeft + (((parseDay(week.week_start) - first) / WEEK_MS) / span) * plotWidth);
  const yFor = (percent) => PAD.top + plotHeight - (Math.min(100, Math.max(0, percent)) / 100) * plotHeight;

  const points = data.map((week) => ({
    key: week.week_start,
    x: xFor(week),
    y: yFor(week.average_percent),
    label: weekLabel(week.week_start),
    percent: week.average_percent,
    exams: week.exams ?? 0,
  }));
  const withLabel = spaced(points, MIN_LABEL_GAP);
  const withValue = spaced(points, MIN_VALUE_GAP);
  const bottomY = yFor(0);
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath = `${linePath} L${points.at(-1).x},${bottomY} L${points[0].x},${bottomY} Z`;
  const description = t("Average score per week: {weeks}", {
    weeks: points.map((p) => t("week of {week}: {percent}%", { week: p.label, percent: p.percent })).join(", "),
  });

  return (
    <figure className="chart" aria-labelledby={titleId}>
      <div ref={boxRef} className="chart__box">
        <svg viewBox={`0 0 ${width} ${HEIGHT}`} width={width} height={HEIGHT} role="img" aria-label={description}>
          <defs>
            <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.16" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Horizontal grid lines and Y labels */}
          {Y_TICKS.map((tick) => (
            <g key={tick}>
              <line x1={PAD.left} x2={width - PAD.right} y1={yFor(tick)} y2={yFor(tick)} className="chart__grid" />
              <text x={PAD.left - 8} y={yFor(tick) + 4} textAnchor="end" className="chart__tick">
                {percentText(tick)}
              </text>
            </g>
          ))}

          {/* Area and line (from two weeks on) */}
          {points.length > 1 && (
            <>
              <path d={areaPath} fill="url(#chart-fill)" />
              <path d={linePath} className="chart__line" />
            </>
          )}

          {/* Points, with their value above and their week below */}
          {points.map((p, index) => (
            <g key={p.key}>
              <circle cx={p.x} cy={p.y} r={4} className="chart__point">
                <title>{`${t("Week of {week}", { week: p.label })}: ${percentText(p.percent)} (${examsText(p.exams)})`}</title>
              </circle>
              {withValue.has(index) && (
                <text x={p.x} y={p.y - 9} textAnchor="middle" className="chart__value">
                  {percentText(p.percent)}
                </text>
              )}
              {withLabel.has(index) && (
                <text x={p.x} y={bottomY + 18} textAnchor="middle" className="chart__tick">
                  {p.label}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>

      <details className="chart__table">
        <summary>{t("Show as a table")}</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">{t("Week starting")}</th>
              <th scope="col">{t("Exams")}</th>
              <th scope="col">{t("Average")}</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.key}>
                <th scope="row">{p.label}</th>
                <td>{p.exams}</td>
                <td>{percentText(p.percent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
