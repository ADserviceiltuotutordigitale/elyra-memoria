import { classify } from "@/lib/classify";
import {
  addCattura,
  addMemoria,
  addTask,
  getPersone,
  addPersona,
  getLogGiornaliero,
  updateLogGiornaliero,
} from "@/lib/store";

const DATA_SENTINELLA_OBIETTIVI = "2000-01-01"; // vedi CLAUDE.md — non scade mai

async function trovaOCreaPersona(nome) {
  if (!nome) return null;
  const persone = await getPersone();
  const esistente = persone.find(
    (p) => p.nome.toLowerCase() === nome.toLowerCase()
  );
  if (esistente) return esistente.id;
  const creata = await addPersona({ nome });
  return creata.id;
}

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

export async function POST(request) {
  const { testo, provenienza = "dashboard" } = await request.json().catch(() => ({}));
  if (!testo || !testo.trim()) {
    return Response.json({ error: "testo mancante" }, { status: 400 });
  }

  const risultato = await classify(testo);

  await addCattura({
    testoGrezzo: testo,
    provenienza,
    destinazione: risultato.destinazione,
    classificazione: risultato,
    viaClassificazione: risultato.via,
  });

  // L'embedding arriva con A15 (strato di memoria): per ora la voce si
  // scrive comunque, semplicemente senza vettore — la ricerca semantica
  // non c'è ancora, ma niente si perde nel frattempo.
  await addMemoria({ testo, provenienza: "cattura" });

  // Solo le destinazioni con una scrittura strutturata semplice
  // aggiornano già la loro scheda. Finanze/nutrizione/salute hanno le
  // loro rotte dedicate (Parte 5.5, 5.6, 5.8): la cattura generica le
  // raggiungerà quando quelle rotte esisteranno.
  if (risultato.destinazione === "task" || risultato.destinazione === "persone") {
    const personaId = await trovaOCreaPersona(risultato.persona);
    await addTask({
      titolo: risultato.titolo,
      fascia: risultato.urgenza,
      persona_id: personaId,
    });
  } else if (risultato.destinazione === "obiettivi") {
    await aggiungiObiettivo(risultato.titolo);
  }

  return Response.json({ destinazione: risultato.destinazione });
}
