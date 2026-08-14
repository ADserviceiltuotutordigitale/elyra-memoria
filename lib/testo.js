// Nessuna I/O qui dentro: usabile sia lato client (CaptureBar) sia lato
// server (webhook Telegram) — stesso riconoscimento in entrambi i posti.
const PAROLE_INTERROGATIVE = [
  "chi",
  "cosa",
  "come",
  "quando",
  "dove",
  "perché",
  "perche",
  "quale",
  "quali",
  "quanto",
  "quanti",
  "quanta",
  "quante",
];

// Non decidi in anticipo se quello che dici è un'informazione o una
// domanda — lo dici e basta (Parte 6, A17).
export function eDomanda(testo) {
  const t = testo.trim().toLowerCase();
  if (t.endsWith("?")) return true;
  const primaParola = t.split(/\s+/)[0]?.replace(/[^a-zàèéìòù]/gi, "");
  return PAROLE_INTERROGATIVE.includes(primaParola);
}
