import "server-only";
import ICAL from "ical.js";
import { dataISO } from "./date";

function giornoDiEvento(startDate) {
  // Un evento "tutto il giorno" in iCal è una DATA pura, senza fuso: se la
  // fai passare per toJSDate() (che assume mezzanotte UTC) e poi la
  // riconverti nel fuso dell'utente, può scivolare al giorno dopo. Per
  // quelli si legge Y/M/D direttamente, senza nessuna conversione.
  if (startDate.isDate) {
    return `${startDate.year}-${String(startDate.month).padStart(2, "0")}-${String(startDate.day).padStart(2, "0")}`;
  }
  return dataISO(startDate.toJSDate());
}

// Parser iCal in puro JavaScript (Parte 5.2, Parte 8): alcune librerie più
// diffuse si appoggiano a funzioni native di Node che il bundler
// serverless rompe in fase di deploy. ical.js — quello di Mozilla — no.
export function espandiEventi(icsText, finestraInizio, finestraFine) {
  const jcalData = ICAL.parse(icsText);
  const comp = new ICAL.Component(jcalData);
  const nomeCalendario = comp.getFirstPropertyValue("x-wr-calname") || "Calendario";
  const vevents = comp.getAllSubcomponents("vevent");
  const limite = ICAL.Time.fromJSDate(finestraFine, false);

  const eventi = [];

  const aggiungiSeNellaFinestra = (id, titolo, startDate, endDate) => {
    const inizio = startDate.toJSDate();
    if (inizio >= finestraInizio && inizio <= finestraFine) {
      eventi.push({
        id,
        titolo,
        inizio: inizio.toISOString(),
        fine: endDate.toJSDate().toISOString(),
        giorno: giornoDiEvento(startDate),
        tuttoIlGiorno: startDate.isDate,
        calendario: nomeCalendario,
      });
    }
  };

  for (const vevent of vevents) {
    const event = new ICAL.Event(vevent);

    if (event.isRecurring()) {
      const iterator = event.iterator();
      let occorrenza;
      // Una regola "ogni lunedì" senza data di fine genera occorrenze
      // all'infinito — ci si ferma da soli appena si esce dalla finestra.
      while ((occorrenza = iterator.next())) {
        if (occorrenza.compare(limite) > 0) break;
        const dettagli = event.getOccurrenceDetails(occorrenza);
        aggiungiSeNellaFinestra(
          `${event.uid}-${occorrenza.toString()}`,
          event.summary,
          dettagli.startDate,
          dettagli.endDate
        );
      }
    } else {
      aggiungiSeNellaFinestra(event.uid, event.summary, event.startDate, event.endDate);
    }
  }

  return eventi.sort((a, b) => new Date(a.inizio) - new Date(b.inizio));
}
