import "server-only";
import { classify } from "./classify";
import {
  addCattura,
  addMemoria,
  addTask,
  trovaOCreaPersona,
  getLogGiornaliero,
  updateLogGiornaliero,
} from "./store";

const DATA_SENTINELLA_OBIETTIVI = "2000-01-01"; // vedi CLAUDE.md — non scade mai

async function aggiungiObiettivo(titolo) {
  const log = await getLogGiornaliero(DATA_SENTINELLA_OBIETTIVI);
  const settimana = Array.isArray(log.obiettivi?.settimana)
    ? log.obiettivi.settimana
    : [];
  await updateLogGiornaliero(DATA_SENTINELLA_OBIETTIVI, {
    obiettivi: {
      ...log.obiettivi,
      settimana: [...settimana, { testo: titolo, fatto: false }],
    },
  });
}

// La stessa pipeline per dashboard e Telegram (Parte 4, A12): riceve un
// testo, lo classifica, scrive in catture + memoria, e se la destinazione
// ha una scrittura strutturata semplice aggiorna anche quella.
export async function eseguiCattura(testo, { provenienza = "dashboard" } = {}) {
  const risultato = await classify(testo);

  await addCattura({
    testoGrezzo: testo,
    provenienza,
    destinazione: risultato.destinazione,
    classificazione: risultato,
    viaClassificazione: risultato.via,
  });

  // L'embedding arriva con A15: per ora la voce si scrive comunque, senza
  // vettore — niente si perde nel frattempo, la ricerca semantica non c'è ancora.
  await addMemoria({ testo, provenienza: "cattura" });

  let task = null;
  if (risultato.destinazione === "task" || risultato.destinazione === "persone") {
    const personaId = await trovaOCreaPersona(risultato.persona);
    task = await addTask({
      titolo: risultato.titolo,
      fascia: risultato.urgenza,
      persona_id: personaId,
    });
  } else if (risultato.destinazione === "obiettivi") {
    await aggiungiObiettivo(risultato.titolo);
  }

  return { ...risultato, task };
}
