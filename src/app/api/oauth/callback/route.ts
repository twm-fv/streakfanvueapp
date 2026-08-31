import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeCodeForToken } from "@/lib/oauth";
import { createSession } from "@/lib/session";
import { FanvueSource } from "@/lib/fanvue/source";

function home(request: Request, params?: Record<string, string>) {
  const url = new URL("/", request.url);
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}

async function handle(
  request: Request,
  { code, state, error }: { code: string | null; state: string | null; error: string | null },
) {
  const cookieStore = await cookies();
  const storedState = cookieStore.get("streak_oauth_state")?.value;
  const verifier = cookieStore.get("streak_oauth_verifier")?.value;
  cookieStore.delete("streak_oauth_state");
  cookieStore.delete("streak_oauth_verifier");

  if (error) return home(request, { error });
  if (!code || !state || !storedState || !verifier || state !== storedState) {
    return home(request, { error: "oauth_state_mismatch" });
  }

  try {
    const token = await exchangeCodeForToken({ code, codeVerifier: verifier });
    // The user id comes from the API rather than the id_token so that stored
    // state is keyed on the same identifier every other call uses.
    const profile = await new FanvueSource(token.access_token, token.scope ?? "").getProfile();
    await createSession(profile.id, token);
    return NextResponse.redirect(new URL("/dashboard", request.url));
  } catch {
    return home(request, { error: "oauth_exchange_failed" });
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  return handle(request, {
    code: url.searchParams.get("code"),
    state: url.searchParams.get("state"),
    error: url.searchParams.get("error"),
  });
}

/** Supports response_mode=form_post if the app is configured that way. */
export async function POST(request: Request) {
  const form = await request.formData();
  return handle(request, {
    code: (form.get("code") as string) ?? null,
    state: (form.get("state") as string) ?? null,
    error: (form.get("error") as string) ?? null,
  });
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
