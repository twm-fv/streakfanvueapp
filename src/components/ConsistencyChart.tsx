type Week = { weekStart: string; posts: number; earnings: number | null };

/**
 * Server-rendered SVG rather than a canvas: it is crisp at any zoom, readable
 * by assistive tech, and needs no client JavaScript.
 */
export function ConsistencyChart({ weeks }: { weeks: Week[] }) {
  const data = weeks.slice(-12);
  if (data.length === 0) return <p className="muted-line">Not enough history yet.</p>;

  const W = 880;
  const H = 220;
  const pad = 34;
  const maxPosts = Math.max(...data.map((w) => w.posts), 1);
  const earningValues = data.map((w) => w.earnings).filter((v): v is number => v !== null);
  const maxEarnings = Math.max(...earningValues, 1);
  const step = (W - pad * 2) / data.length;
  const barW = step * 0.5;

  const points = data
    .map((w, i) =>
      w.earnings === null
        ? null
        : [pad + i * step + step * 0.45, H - pad - (w.earnings / maxEarnings) * (H - pad * 2)],
    )
    .filter((p): p is number[] => p !== null);

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label="Posts per week compared with earnings per week">
      <text x={pad} y={18} fontSize="11" fill="#cfc7f5">■ posts/week</text>
      {earningValues.length > 0 && (
        <text x={pad + 110} y={18} fontSize="11" fill="#ff7a3d">● earnings</text>
      )}

      {data.map((w, i) => {
        const h = (w.posts / maxPosts) * (H - pad * 2);
        return (
          <rect key={w.weekStart} x={pad + i * step + step * 0.2} y={H - pad - h}
            width={barW} height={h} fill="#cfc7f5" rx="2">
            <title>{`Week of ${w.weekStart}: ${w.posts} posts`}</title>
          </rect>
        );
      })}

      {points.length > 1 && (
        <polyline fill="none" stroke="#ff7a3d" strokeWidth="2.5" strokeLinejoin="round"
          points={points.map(([x, y]) => `${x},${y}`).join(" ")} />
      )}
      {points.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3.2" fill="#ff7a3d" />
      ))}

      <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="#e2e0ef" />
      {data.map((w, i) => (
        <text key={w.weekStart} x={pad + i * step + step * 0.35} y={H - pad + 16}
          fontSize="11" fill="#8b87a6" textAnchor="middle">
          {w.weekStart.slice(5)}
        </text>
      ))}
    </svg>
  );
}
