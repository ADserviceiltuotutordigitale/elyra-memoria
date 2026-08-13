import { cookies } from "next/headers";
import {
  constantTimeEqual,
  createSessionCookieValue,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE,
} from "@/lib/auth";

export async function POST(request) {
  const { password } = await request.json().catch(() => ({}));

  const valida = constantTimeEqual(
    password ?? "",
    process.env.DASHBOARD_PASSWORD ?? ""
  );
  if (!valida) {
    return Response.json({ ok: false, error: "Password errata." }, { status: 401 });
  }

  const value = await createSessionCookieValue(process.env.AUTH_SECRET);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, value, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });

  return Response.json({ ok: true });
}
