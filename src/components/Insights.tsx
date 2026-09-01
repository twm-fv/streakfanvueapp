import type { Insight } from "@/lib/streak/insights";

const ACTION_HREF: Record<NonNullable<Insight["action"]>["kind"], string> = {
  // Posting happens on Fanvue itself; Streak has no write access and wants none.
  post: "https://www.fanvue.com/",
  freeze: "#streak",
  remind: "#reminders",
};

/**
 * Ranked, actionable observations. Each card is one measured fact and one
 * thing to do about it. The tone drives colour, not the other way round.
 */
export function Insights({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) return null;
  return (
    <section className="insights" aria-label="Insights">
      {insights.map((insight, i) => (
        <article
          key={insight.id}
          className={`insight-card tone-${insight.tone} rise`}
          style={{ animationDelay: `${80 + i * 60}ms` }}
        >
          <div className="insight-head">
            <span className="insight-kicker">
              {insight.tone === "urgent"
                ? "Act today"
                : insight.tone === "positive"
                  ? "Going well"
                  : insight.tone === "locked"
                    ? "Locked"
                    : "Worth knowing"}
            </span>
            {insight.metric && <span className="insight-metric">{insight.metric}</span>}
          </div>
          <h3>{insight.title}</h3>
          <p>{insight.body}</p>
          {insight.action && (
            <a
              className="insight-action"
              href={ACTION_HREF[insight.action.kind]}
              {...(insight.action.kind === "post"
                ? { target: "_blank", rel: "noopener noreferrer" }
                : {})}
            >
              {insight.action.label} →
            </a>
          )}
        </article>
      ))}
    </section>
  );
}
