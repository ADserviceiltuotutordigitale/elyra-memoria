import "server-only";

// "Che giorno è oggi?" ha una sola risposta nel codice (Parte 5, regola 5).
// Il server su Vercel vive in UTC: se ogni punto del codice chiedesse
// l'ora al proprio new Date(), la mezzanotte italiana e quella del
// server sarebbero due cose diverse, e le abitudini si azzererebbero
// mentre sei ancora sveglio. Questa funzione è l'unico posto che decide,
// usando USER_TIMEZONE — e va chiamata ovunque serva "oggi".
const FUSO = process.env.USER_TIMEZONE || "Europe/Rome";

export function oggiISO() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(new Date());
}

export function formattaDataPerEsteso(date = new Date()) {
  const testo = new Intl.DateTimeFormat("it-IT", {
    timeZone: FUSO,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
  return testo;
}

export function saluto(date = new Date()) {
  const ora = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: FUSO, hour: "2-digit", hour12: false }).format(date)
  );
  if (ora < 6) return "Buonanotte";
  if (ora < 12) return "Buongiorno";
  if (ora < 18) return "Buon pomeriggio";
  return "Buonasera";
}
