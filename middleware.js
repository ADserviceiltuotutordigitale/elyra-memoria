import { NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAME,
  verifySessionCookieValue,
  constantTimeEqual,
} from "@/lib/auth";

// Rotte che bussano senza un browser dietro: Telegram non conosce la tua
// password, e il cron della piattaforma nemmeno. Ognuna si protegge da
// sola con un proprio segreto — vedi i rispettivi route handler.
const PUBLIC_PREFIXES = [
  "/login",
  "/api/auth/",
  "/api/telegram/webhook",
  "/api/cron/",
];

function isPublic(pathname) {
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function withNoindex(response) {
  response.headers.set("X-Robots-Tag", "noindex");
  return response;
}

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) {
    return withNoindex(NextResponse.next());
  }

  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const hasValidSession = await verifySessionCookieValue(
    sessionCookie,
    process.env.AUTH_SECRET
  );

  if (hasValidSession) {
    return withNoindex(NextResponse.next());
  }

  // Le rotte API accettano in alternativa un segreto in intestazione,
  // per l'accesso da script (scorciatoie, cron esterni, curl a mano).
  if (pathname.startsWith("/api/")) {
    const apiSecret = request.headers.get("x-api-secret");
    if (apiSecret && constantTimeEqual(apiSecret, process.env.API_SECRET)) {
      return withNoindex(NextResponse.next());
    }
    return withNoindex(
      NextResponse.json({ error: "non autorizzato" }, { status: 401 })
    );
  }

  const loginUrl = new URL("/login", request.url);
  return withNoindex(NextResponse.redirect(loginUrl));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
