// Conta i giorni consecutivi, a ritroso da "oggi", con almeno
// un'abitudine completata (Parte 5.1). Aritmetica su Y/M/D via
// Date.UTC — mai sul fuso locale del processo — così il conteggio
// non dipende da dove gira il server.
function giornoPrecedente(dataISO) {
  const [y, m, d] = dataISO.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

export function calcolaStriscia(righeLog, oggi) {
  const perData = new Map(righeLog.map((r) => [r.data, r]));
  let streak = 0;
  let cursore = oggi;

  while (true) {
    const riga = perData.get(cursore);
    const almenoUna = riga && Object.values(riga.abitudini || {}).some(Boolean);
    if (!almenoUna) break;
    streak += 1;
    cursore = giornoPrecedente(cursore);
  }

  return streak;
}
