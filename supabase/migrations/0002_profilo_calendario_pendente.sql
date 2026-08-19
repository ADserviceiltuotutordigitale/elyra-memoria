-- Elyra Memoria — colonna calendario_pendente sulla riga profilo
-- (Parte 11, scrittura calendario da Telegram): tiene la richiesta di
-- evento in attesa dell'orario, finché l'utente non risponde o scade.
-- "if not exists" la rende sicura da rieseguire anche dove la colonna è
-- già stata aggiunta a mano in produzione.

alter table profilo add column if not exists calendario_pendente jsonb;
