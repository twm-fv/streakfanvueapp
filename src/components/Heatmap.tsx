import type { HeatCell } from "@/lib/streak/engine";

function label(cell: HeatCell): string {
  if (cell.future) return cell.date;
  if (cell.frozen) return `${cell.date}: freeze used`;
  if (cell.posts === 0) return `${cell.date}: no posts`;
  return `${cell.date}: ${cell.posts} post${cell.posts === 1 ? "" : "s"}`;
}

export function Heatmap({ weeks }: { weeks: HeatCell[][] }) {
  return (
    <>
      <div className="heatmap" role="img" aria-label="Posting activity heatmap">
        {weeks.map((week) => (
          <div className="week" key={week[0].date}>
            {week.map((cell) => (
              <div
                key={cell.date}
                className="day"
                data-level={cell.frozen ? 0 : cell.level}
                data-frozen={cell.frozen || undefined}
                data-future={cell.future || undefined}
                title={label(cell)}
              />
            ))}
          </div>
        ))}
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
