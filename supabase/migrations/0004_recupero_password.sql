alter table account_auth
  add column if not exists reset_token_hash text,
  add column if not exists reset_token_scade timestamptz,
  add column if not exists reset_richiesto_il timestamptz;
