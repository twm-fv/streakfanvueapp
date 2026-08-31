import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { generatePkce, getAuthorizeUrl } from "@/lib/oauth";
import { randomId } from "@/lib/crypto";

export async function GET(request: Request) {
  const { verifier, challenge } = generatePkce();
  const state = randomId(16);

  let authUrl: string;
  try {
    authUrl = getAuthorizeUrl({ state, codeChallenge: challenge });
  } catch {
    return NextResponse.redirect(new URL("/?error=not_configured", request.url));
  }

  const secure = new URL(request.url).protocol === "https:";
  const cookieStore = await cookies();
  const options = {
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secure,
    maxAge: 600,
  };
  cookieStore.set("streak_oauth_state", state, options);
  cookieStore.set("streak_oauth_verifier", verifier, options);

  return NextResponse.redirect(authUrl);
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
