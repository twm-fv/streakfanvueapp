import { NextResponse } from "next/server";

/** Liveness probe. Reports no configuration values and no creator data. */
export async function GET() {
  return NextResponse.json({ status: "ok" });
}

export const dynamic = "force-dynamic";
