import "server-only";
import { leggiGiornaliBancari } from "./odoo";
import { updateLogGiornaliero, getLogGiornalieroRange } from "./store";
import { oggiISO, giorniFa } from "./date";

// Il caricamento della pagina non chiama mai questa funzione: parte solo
// dal pulsante di aggiornamento (stessa regola ferrea del Polso di prima).
export async function aggiornaPolsoFinanziario() {
  const conti = await leggiGiornaliBancari();
  if (conti.length === 0) {
    throw new Error("[odoo] nessun giornale bancario trovato — controlla la configurazione Odoo");
  }

  const totale_personale = conti
    .filter((c) => c.ambito === "personale")
    .reduce((tot, c) => tot + c.saldo, 0);
  const totale_lavoro = conti
    .filter((c) => c.ambito === "lavoro")
    .reduce((tot, c) => tot + c.saldo, 0);

  const istantanea = {
    generato_alle: new Date().toISOString(),
    conti,
    totale_personale,
    totale_lavoro,
  };

  const oggi = oggiISO();
  await updateLogGiornaliero(oggi, { finanze: istantanea });
  return istantanea;
}

// Legge sempre l'ultima istantanea salvata — mai Odoo in diretta. Il
// delta è calcolato separatamente per personale e lavoro, contro la
// istantanea valida più recente trovata negli ultimi 30 giorni.
export async function leggiUltimoPolso() {
  const oggi = oggiISO();
  const righe = await getLogGiornalieroRange(giorniFa(oggi, 30), oggi);
  const conSnapshot = righe.filter(
    (r) => r.finanze && typeof r.finanze.totale_personale === "number"
  );

  if (conSnapshot.length === 0) {
    return { istantanea: null, deltaPersonale: null, deltaLavoro: null, dataConfronto: null };
  }

  conSnapshot.sort((a, b) => b.data.localeCompare(a.data));
  const ultima = conSnapshot[0].finanze;
  const precedente = conSnapshot[1];

  const deltaPersonale = precedente
    ? ultima.totale_personale - precedente.finanze.totale_personale
    : null;
  const deltaLavoro = precedente
    ? ultima.totale_lavoro - precedente.finanze.totale_lavoro
    : null;

  return {
    istantanea: ultima,
    deltaPersonale,
    deltaLavoro,
    dataConfronto: precedente?.data || null,
  };
}
