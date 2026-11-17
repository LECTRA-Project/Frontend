import { useEffect, useId, useRef, useState } from "react";

import { t, useI18n } from "../../i18n/i18n.js";
import { dayLabel, minutesText, weekdayDateLabel } from "./overviewText.js";
import "./statistics.css";

/*
  Study time per day for the last 4 weeks, as a small bar chart in plain SVG (no chart
  library), from GET /api/stats/overview → study_time.by_day (oldest first, 28 days).

    days: [{ day: "2026-10-21", minutes: 0 }, …]

  - One series, so no legend: the title names it. Thin bars with rounded tops on a zero
    baseline, 2 px apart; a day without reading has no bar.
  - Only the longest day carries its value ("48 min"); the first day of each week names its
    date on the axis. Hovering (or tapping) a day shows "Tue 11 Nov · 12 min".
  - The SVG has a text alternative (the total and the longest day), and "Show as a table"
    lists every day with reading.
  - Drawn in screen pixels (its width follows the box), so the labels keep their size.
*/

const HEIGHT = 150;
const DEFAULT_WIDTH = 560;
const PAD = { top: 22, right: 8, bottom: 26, left: 8 };
const GAP = 2;
const RADIUS = 4;

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

/* A bar with rounded top corners, standing on the baseline. */
function barPath(x, y, width, height) {
  const r = Math.min(RADIUS, width / 2, height);
  const bottom = y + height;
  return `M${x},${bottom} V${y + r} Q${x},${y} ${x + r},${y} H${x + width - r} Q${x + width},${y} ${x + width},${y + r} V${bottom} Z`;
}

export default function StudyTimeChart({ days }) {
  useI18n(); // re-render in a new interface language
  const box = useRef(null);
  const width = useWidth(box);
  const [hovered, setHovered] = useState(null);
  const titleId = useId();

  const max = Math.max(...days.map((item) => item.minutes), 0);
  const total = days.reduce((sum, item) => sum + item.minutes, 0);
  const longest = days.findIndex((item) => item.minutes === max);
  const plotWidth = Math.max(width - PAD.left - PAD.right, 1);
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const column = plotWidth / days.length;
  const barWidth = Math.max(column - GAP, 1);
  const baseline = PAD.top + plotHeight;
  const heightOf = (minutes) => (max > 0 ? (minutes / max) * plotHeight : 0);

  const summary = t("Study time per day over the last 4 weeks: {total} in all, the longest day {day} with {time}.", {
    total: minutesText(total),
    day: max > 0 ? weekdayDateLabel(days[longest].day) : "—",
    time: minutesText(max),
  });

  return (
    <figure className="chart study-chart" aria-labelledby={titleId}>
      <figcaption id={titleId} className="study-chart__title">{t("Study time per day, last 4 weeks")}</figcaption>
      <div className="chart__box study-chart__box" ref={box} onPointerLeave={() => setHovered(null)}>
        <svg width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} role="img" aria-label={summary}>
          <line className="chart__grid" x1={PAD.left} x2={width - PAD.right} y1={baseline} y2={baseline} />
          {days.map((item, index) => {
            const x = PAD.left + index * column + GAP / 2;
            const height = heightOf(item.minutes);
            return (
              <g key={item.day}>
                {height > 0 && (
                  <path
                    className={`study-chart__bar ${hovered === index ? "study-chart__bar--hover" : ""}`}
                    d={barPath(x, baseline - height, barWidth, height)}
                  />
                )}
                {index % 7 === 0 && (
                  <text className="chart__tick" x={x} y={HEIGHT - 8}>
                    {dayLabel(item.day)}
                  </text>
                )}
                {index === longest && max > 0 && (
                  // Kept inside the box: near an edge the label lines up with the bar's side.
                  <text
                    className="chart__value"
                    x={x > width - 60 ? x + barWidth : x < 60 ? x : x + barWidth / 2}
                    y={baseline - height - 6}
                    textAnchor={x > width - 60 ? "end" : x < 60 ? "start" : "middle"}
                  >
                    {minutesText(item.minutes)}
                  </text>
                )}
                {/* The whole column reacts to the pointer, not only the (thin) bar. */}
                <rect
                  className="study-chart__hit"
                  x={PAD.left + index * column}
                  y={PAD.top}
                  width={column}
                  height={plotHeight}
                  onPointerEnter={() => setHovered(index)}
                  onPointerDown={() => setHovered(index)}
                />
              </g>
            );
          })}
        </svg>
        {hovered !== null && (
          <div
            className="study-chart__tooltip"
            role="presentation"
            style={{ left: Math.min(Math.max(PAD.left + (hovered + 0.5) * column, 70), width - 70) }}
          >
            {weekdayDateLabel(days[hovered].day)} · {minutesText(days[hovered].minutes)}
          </div>
        )}
      </div>
      <details className="chart__table">
        <summary>{t("Show as a table")}</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">{t("Day")}</th>
              <th scope="col">{t("Study time")}</th>
            </tr>
          </thead>
          <tbody>
            {days
              .filter((item) => item.minutes > 0)
              .map((item) => (
                <tr key={item.day}>
                  <th scope="row">{weekdayDateLabel(item.day)}</th>
                  <td>{minutesText(item.minutes)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
