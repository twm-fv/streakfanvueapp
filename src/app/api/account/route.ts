import { NextResponse } from "next/server";
import { getViewer } from "@/lib/app";
import { getStore } from "@/lib/store";
import { endSession } from "@/lib/session";
import { isSameOrigin, jsonError } from "@/lib/http";

/**
 * Data deletion on request. Removes every row Streak holds for this creator and
 * revokes the Fanvue token, so disconnecting is a real erasure and not just a
 * logout.
 */
export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) return jsonError(403, "Cross-origin request rejected");

  const viewer = await getViewer();
  if (!viewer) return jsonError(401, "Not connected");

  await getStore().deleteUser(viewer.userId);
  await endSession();
  return NextResponse.json({ ok: true, deleted: true });
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
