"use client";

import { useEffect, useState } from "react";

export default function SicurezzaTotp() {
  const [abilitato, setAbilitato] = useState(null);
  const [configurazione, setConfigurazione] = useState(null);
  const [codice, setCodice] = useState("");
  const [passwordDisabilita, setPasswordDisabilita] = useState("");
  const [errore, setErrore] = useState("");
  const [messaggio, setMessaggio] = useState("");

  useEffect(() => {
    fetch("/api/account/totp")
      .then((res) => res.json())
      .then((body) => setAbilitato(body.totpAbilitato));
  }, []);

  async function iniziaConfigurazione() {
    setErrore("");
    setMessaggio("");
    const res = await fetch("/api/account/totp/inizia", { method: "POST" });
    const body = await res.json();
    if (!res.ok) {
      setErrore(body.error || "Errore, riprova.");
      return;
    }
    setConfigurazione(body);
  }

  async function confermaConfigurazione(e) {
    e.preventDefault();
    setErrore("");
    const res = await fetch("/api/account/totp/conferma", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codice }),
    });
    const body = await res.json();
    if (!res.ok || !body.ok) {
      setErrore(body.error || "Codice non valido.");
      return;
    }
    setAbilitato(true);
    setConfigurazione(null);
    setCodice("");
    setMessaggio("Autenticazione a due fattori attivata.");
  }

  async function disabilita(e) {
    e.preventDefault();
    setErrore("");
    const res = await fetch("/api/account/totp/disabilita", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: passwordDisabilita }),
    });
    const body = await res.json();
    if (!res.ok || !body.ok) {
      setErrore(body.error || "Password errata.");
      return;
    }
    setAbilitato(false);
    setPasswordDisabilita("");
    setMessaggio("Autenticazione a due fattori disattivata.");
  }

  if (abilitato === null) return null;

  const campoStile = {
    background: "var(--ink-850)",
    border: "1px solid var(--line-soft)",
    borderRadius: 7,
    padding: "9px 11px",
    color: "var(--paper)",
    fontSize: 13,
  };

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
        Autenticazione a due fattori
      </div>
      <div style={{ fontSize: 12.5, color: "var(--paper-dim)", marginBottom: 10 }}>
        {abilitato
          ? "Attiva — ogni accesso richiede anche il codice da Google Authenticator."
          : "Non attiva — configurala per proteggere l'accesso con un secondo codice."}
      </div>

      {errore && <div style={{ color: "var(--bad)", fontSize: 12.5, marginBottom: 8 }}>{errore}</div>}
      {messaggio && <div style={{ color: "var(--good)", fontSize: 12.5, marginBottom: 8 }}>{messaggio}</div>}

      {abilitato && !configurazione && (
        <form onSubmit={disabilita} style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 320 }}>
          <input
            type="password"
            placeholder="Password attuale"
            value={passwordDisabilita}
            onChange={(e) => setPasswordDisabilita(e.target.value)}
            style={campoStile}
          />
          <button type="submit" className="btn-refresh btn-danger" style={{ justifyContent: "center" }}>
            Disabilita
          </button>
        </form>
      )}

      {!abilitato && !configurazione && (
        <button type="button" className="btn-refresh btn-primary" onClick={iniziaConfigurazione}>
          Configura
        </button>
      )}

      {configurazione && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 320 }}>
          <img
            src={configurazione.qrDataUri}
            alt="QR per Google Authenticator"
            style={{ width: 200, height: 200 }}
          />
          <div style={{ fontSize: 11, color: "var(--paper-faint)" }}>
            Non riesci a scansionare? Inserisci a mano: <span className="num">{configurazione.segreto}</span>
          </div>
          <form onSubmit={confermaConfigurazione} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input
              type="text"
              inputMode="numeric"
              placeholder="Codice a 6 cifre"
              value={codice}
              onChange={(e) => setCodice(e.target.value)}
              style={campoStile}
            />
            <button type="submit" className="btn-refresh btn-primary" style={{ justifyContent: "center" }}>
              Conferma
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
