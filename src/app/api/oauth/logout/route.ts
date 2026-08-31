import { NextResponse } from "next/server";
import { endSession } from "@/lib/session";
import { isSameOrigin, jsonError } from "@/lib/http";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return jsonError(403, "Cross-origin request rejected");
  await endSession();
  return NextResponse.redirect(new URL("/?disconnected=1", request.url), { status: 303 });
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
