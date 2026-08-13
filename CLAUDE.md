@AGENTS.md

# Elyra Memoria — regole di casa

Percorso Completo (Supabase + Vercel + Telegram), costruito seguendo PersonalOS
(guida completa in `docs/PersonalOS.pdf`, mockup di riferimento in `design/mockup.html`).

- **Linguaggio**: JavaScript, non TypeScript. Scelta deliberata — vedi guida Parte 1.2.
- **Dati**: Supabase (Postgres + pgvector). Unico punto di accesso è `lib/store.js`,
  usato solo da codice server. Nessuna rotta o componente tocca il database direttamente.
- **Modello**: nome letto da `ANTHROPIC_MODEL` / `OPENAI_EMBEDDING_MODEL`, mai scritto a
  mano nel codice (solo un valore predefinito per quando la variabile manca).
- **Niente ragionamento esteso** sulle chiamate di classificazione (`lib/classify.js`) e
  di smistamento — non serve e allunga l'attesa.
- **Il caricamento di una pagina non chiama mai il modello.** Solo cattura, domanda,
  pulsante di aggiornamento, o cron.
- **"Oggi" ha una sola funzione** nel codice, che usa `USER_TIMEZONE` — mai il fuso del
  server (UTC su Vercel). Vedi guida Parte 5.3.
- **Obiettivi**: le due liste (settimana/mese) vivono nel log giornaliero su una riga
  con data sentinella fissa `2000-01-01`, che non scade mai. È un trucco intenzionale,
  non un bug — non "correggerlo".
- **Il cancello si chiama `proxy.js`, non `middleware.js`.** Su questa serie di Next
  (16) `middleware` è deprecato a favore di `proxy` — stessa cosa, nome nuovo. Vedi
  `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`.
- **Ogni pagina che legge dati veri da `lib/store.js` deve esportare
  `export const dynamic = "force-dynamic"`.** Senza, Next la prerenderizza come
  statica al momento della build e i dati restano congelati a quel momento — non
  è un bug del database, è la cache di Next (Parte 8).
