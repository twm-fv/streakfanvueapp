import { getStore } from "@/lib/store";
import { buildCalendar } from "@/lib/calendar";

/**
 * Private calendar feed. Calendar apps cannot send cookies, so the URL itself
 * is the credential: a random token that maps to one creator and can be rotated
 * from the dashboard. It exposes nothing but the reminder schedule.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const clean = token.replace(/\.ics$/, "");
  if (!/^[A-Za-z0-9_-]{20,}$/.test(clean)) return new Response("Not found", { status: 404 });

  const user = await getStore().findUserByCalendarToken(clean);
  if (!user) return new Response("Not found", { status: 404 });

  const body = buildCalendar({ nudge: user.nudge, timezone: user.timezone, userId: user.userId });
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="streak-reminders.ics"',
      "Cache-Control": "private, max-age=300",
      "X-Robots-Tag": "noindex",
    },
  });
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
