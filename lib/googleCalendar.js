import "server-only";
import crypto from "crypto";

const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const SERVICE_ACCOUNT_KEY = (process.env.GOOGLE_SERVICE_ACCOUNT_KEY || "").replace(/\\n/g, "\n");
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;
const FUSO = process.env.USER_TIMEZONE || "Europe/Rome";

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Autenticazione a account di servizio (RFC 7523): un JWT firmato con la
// chiave privata scambiato con un access token — niente libreria googleapis,
// solo crypto nativo e fetch, come lib/odoo.js per Odoo.
async function ottieniAccessToken() {
  const ora = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: SERVICE_ACCOUNT_EMAIL,
    scope: "https://www.googleapis.com/auth/calendar.events",
    aud: "https://oauth2.googleapis.com/token",
    iat: ora,
    exp: ora + 3600,
  };
  const datiFirmati = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const firma = crypto.createSign("RSA-SHA256").update(datiFirmati).sign(SERVICE_ACCOUNT_KEY);
  const jwt = `${datiFirmati}.${base64url(firma)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const body = await res.json();
  if (!body.access_token) {
    throw new Error(
      `[google-calendar] token non ottenuto: ${body.error_description || body.error || "errore sconosciuto"}`
    );
  }
  return body.access_token;
}

export async function creaEventoCalendario({ titolo, data, ora }) {
  const accessToken = await ottieniAccessToken();

  const evento = { summary: titolo };
  if (ora) {
    const inizio = `${data}T${String(ora.ore).padStart(2, "0")}:${String(ora.minuti).padStart(2, "0")}:00`;
    const fineDate = new Date(inizio);
    fineDate.setHours(fineDate.getHours() + 1);
    // La data di "fine" va presa da fineDate (che rolla correttamente al
    // giorno dopo per eventi che iniziano tra le 23:00 e le 23:59), non
    // dalla stringa "data" originale — altrimenti un evento delle 23:xx
    // produce una fine precedente all'inizio e Google rifiuta la creazione.
    const fineAnno = fineDate.getFullYear();
    const fineMese = String(fineDate.getMonth() + 1).padStart(2, "0");
    const fineGiorno = String(fineDate.getDate()).padStart(2, "0");
    const fine = `${fineAnno}-${fineMese}-${fineGiorno}T${String(fineDate.getHours()).padStart(2, "0")}:${String(fineDate.getMinutes()).padStart(2, "0")}:00`;
    evento.start = { dateTime: inizio, timeZone: FUSO };
    evento.end = { dateTime: fine, timeZone: FUSO };
  } else {
    const [y, m, d] = data.split("-").map(Number);
    const giornoDopo = new Date(Date.UTC(y, m - 1, d));
    giornoDopo.setUTCDate(giornoDopo.getUTCDate() + 1);
    evento.start = { date: data };
    evento.end = { date: giornoDopo.toISOString().slice(0, 10) };
  }

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(evento),
    }
  );
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`[google-calendar] creazione evento fallita: ${body.error?.message || res.status}`);
  }
  return { id: body.id, link: body.htmlLink };
}
