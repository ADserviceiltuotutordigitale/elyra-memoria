-- Account per l'accesso a Elyra: email + password + 2FA. Riga singola,
-- separata da `profilo` apposta — `profilo` viene letta per intero in più
-- punti del codice, e tenere lì dentro segreti aumenterebbe il rischio che
-- finiscano per sbaglio in una risposta HTTP o in un prompt per il modello.
create table if not exists account_auth (
  id integer primary key default 1,
  email text not null,
  password_hash text not null,
  totp_secret text,
  totp_abilitato boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint account_auth_singola_riga check (id = 1)
);

alter table account_auth enable row level security;
-- Nessuna policy: solo la chiave di servizio (lato server, dentro
-- lib/store.js) vede questa tabella — stessa riga di sicurezza delle altre.
