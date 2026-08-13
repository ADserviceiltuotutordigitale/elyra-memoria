import "server-only";
import { anthropic, MODEL, testoDaRisposta } from "./ai";
import { espandiEventi } from "./ical";
import { getTask, getLogGiornaliero, addRegistro, getRegistro } from "./store";
import { oggiISO } from "./date";

const DATA_SENTINELLA_OBIETTIVI = "2000-01-01";

async function eventiDiOggi() {
  const url = process.env.GOOGLE_CALENDAR_ICAL_URL;
  if (!url) return [];
  const res = await fetch(url);
  if (!res.ok) return [];
  const testo = await res.text();

  const oggi = new Date();
  const inizio = new Date(oggi);
  inizio.setDate(inizio.getDate() - 1);
  const fine = new Date(oggi);
  fine.setDate(fine.getDate() + 1);

  const oggiChiave = oggiISO();
  return espandiEventi(testo, inizio, fine).filter((e) => e.giorno === oggiChiave);
}

async function giaInviatoOggi(oggi) {
  const registro = await getRegistro({ limit: 30 });
  return registro.some((r) => r.evento === "briefing_inviato" && r.dettagli?.data === oggi);
}

// Idempotente (Parte 7.5): se per qualsiasi motivo il cron parte due
// volte, la seconda esce subito invece di mandare un doppione.
export async function generaEInviaBriefing() {
  const oggi = oggiISO();
  if (await giaInviatoOggi(oggi)) {
    return { inviato: false, motivo: "briefing di oggi già inviato" };
  }
  if (!anthropic) {
    return { inviato: false, motivo: "chiave Anthropic mancante" };
  }

  const [eventi, taskOggi, taskInRitardo, logObiettivi] = await Promise.all([
    eventiDiOggi(),
    getTask({ fascia: "oggi" }),
    getTask({ fascia: "in_ritardo" }),
    getLogGiornaliero(DATA_SENTINELLA_OBIETTIVI),
  ]);
  const obiettiviSettimana = (logObiettivi.obiettivi?.settimana || []).filter((o) => !o.fatto);

  const contesto = {
    eventi_di_oggi: eventi.map((e) => ({ titolo: e.titolo, tuttoIlGiorno: e.tuttoIlGiorno, inizio: e.inizio })),
    task_di_oggi: taskOggi.map((t) => ({ titolo: t.titolo, persona: t.persone?.nome || null })),
    slittato_da_ieri: taskInRitardo.map((t) => t.titolo),
    obiettivi_della_settimana: obiettiviSettimana.map((o) => o.testo),
  };

  const risposta = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 400,
    system: `Scrivi il briefing del mattino per l'utente: breve, in italiano, massimo dieci righe,
senza convenevoli ("buongiorno", "ecco il tuo riepilogo" e simili — vai dritto al punto).
Usa solo i dati forniti: eventi di oggi, task di oggi, cosa è slittato da ieri, obiettivi
della settimana ancora aperti. Se una categoria è vuota, saltala senza commentarlo.`,
    messages: [{ role: "user", content: JSON.stringify(contesto) }],
  });
  const messaggio = testoDaRisposta(risposta);

  const telegramRes = await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: process.env.TELEGRAM_USER_ID, text: messaggio }),
    }
  );

  await addRegistro({ evento: "briefing_inviato", dettagli: { data: oggi } });

  return { inviato: true, messaggio, telegramOk: telegramRes.ok };
}
