import type { HeatCell } from "@/lib/streak/engine";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function label(cell: HeatCell): string {
  if (cell.future) return cell.date;
  if (cell.frozen) return `${cell.date}: freeze used`;
  if (cell.posts === 0) return `${cell.date}: no posts`;
  return `${cell.date}: ${cell.posts} post${cell.posts === 1 ? "" : "s"}`;
}

/**
 * Sunday-aligned columns with month labels along the top and weekday labels
 * down the side, so a cell can be read without hovering it.
 */
export function Heatmap({ weeks }: { weeks: HeatCell[][] }) {
  // A month label sits over the first column that starts in that month.
  const monthLabels = weeks.map((week, i) => {
    const month = Number(week[0].date.slice(5, 7)) - 1;
    const prev = i > 0 ? Number(weeks[i - 1][0].date.slice(5, 7)) - 1 : -1;
    return month !== prev ? MONTHS[month] : "";
  });

  return (
    <>
      <div className="heatmap-wrap">
        <div className="heatmap-days" aria-hidden>
          <span />
          <span>Mon</span>
          <span />
          <span>Wed</span>
          <span />
          <span>Fri</span>
          <span />
        </div>
        <div className="heatmap-scroll">
          <div className="heatmap-months" aria-hidden>
            {monthLabels.map((m, i) => (
              <span key={i}>{m}</span>
            ))}
          </div>
          <div className="heatmap" role="img" aria-label="Posting activity heatmap">
            {weeks.map((week, wi) => (
              <div className="week" key={week[0].date}>
                {week.map((cell, di) => (
                  <div
                    key={cell.date}
                    className="day pop"
                    style={{ animationDelay: `${Math.min(wi * 12 + di * 4, 480)}ms` }}
                    data-level={cell.frozen ? 0 : cell.level}
                    data-frozen={cell.frozen || undefined}
                    data-future={cell.future || undefined}
                    title={label(cell)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="heatmap-legend">
        Less
        <div className="day" data-level={0} />
        <div className="day" data-level={1} />
        <div className="day" data-level={2} />
        <div className="day" data-level={3} />
        More
        <span style={{ width: 12 }} />
        <div className="day" data-frozen="true" /> Freeze used
      </div>
    </>
  );
}
