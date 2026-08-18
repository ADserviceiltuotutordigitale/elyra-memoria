"use client";

import { useEffect, useRef, useState } from "react";
import { eDomanda } from "@/lib/testo";

const ETICHETTE_DESTINAZIONE = {
  task: "task",
  persone: "persone",
  finanze: "finanze",
  obiettivi: "obiettivi",
  memoria: "memoria",
  calendario: "calendario",
};

export default function CaptureBar() {
  const [testo, setTesto] = useState("");
  const [stato, setStato] = useState("riposo"); // riposo | ascolto | elaborazione | fatto
  const [messaggio, setMessaggio] = useState("a riposo");
  const [ascoltoSupportato, setAscoltoSupportato] = useState(false);
  const [risposta, setRisposta] = useState(null);
  const riconoscimentoRef = useRef(null);

  // Il browser sa già ascoltare — nessun servizio esterno (Parte 4).
  // Funziona bene nella famiglia Chrome, in modo disomogeneo altrove.
  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const riconoscimento = new SpeechRecognition();
    riconoscimento.lang = "it-IT";
    riconoscimento.interimResults = false;
    riconoscimento.maxAlternatives = 1;

    riconoscimento.onresult = (event) => {
      const trascrizione = event.results[0][0].transcript;
      setTesto(trascrizione);
      invia(trascrizione);
    };
    riconoscimento.onerror = () => {
      setStato("riposo");
      setMessaggio("a riposo");
    };
    riconoscimento.onend = () => {
      setStato((s) => (s === "ascolto" ? "riposo" : s));
    };

    riconoscimentoRef.current = riconoscimento;
    setAscoltoSupportato(true);
  }, []);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") setRisposta(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function toggleMic() {
    if (!riconoscimentoRef.current) return;
    if (stato === "ascolto") {
      riconoscimentoRef.current.stop();
      setStato("riposo");
      setMessaggio("a riposo");
      return;
    }
    setStato("ascolto");
    setMessaggio("in ascolto");
    riconoscimentoRef.current.start();
  }

  async function chiedi(domanda) {
    setStato("elaborazione");
    setMessaggio("in elaborazione");
    try {
      const res = await fetch("/api/domande", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domanda }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "errore");
      setRisposta(body.risposta);
      setTesto("");
    } catch {
      setRisposta("Non sono riuscita a rispondere — riprova.");
    } finally {
      setStato("riposo");
      setMessaggio("a riposo");
    }
  }

  async function archivia(testoDaInviare) {
    const valore = (testoDaInviare ?? testo).trim();
    if (!valore) return;

    setStato("elaborazione");
    setMessaggio("in elaborazione");

    try {
      const res = await fetch("/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testo: valore }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "errore");

      setStato("fatto");
      setMessaggio(`in ${ETICHETTE_DESTINAZIONE[body.destinazione] || body.destinazione}`);
      setTesto("");
    } catch {
      setStato("fatto");
      setMessaggio("non ci sono riuscita");
    } finally {
      setTimeout(() => {
        setStato("riposo");
        setMessaggio("a riposo");
      }, 2000);
    }
  }

  function invia(testoDaInviare) {
    const valore = (testoDaInviare ?? testo).trim();
    if (!valore) return;
    if (eDomanda(valore)) chiedi(valore);
    else archivia(valore);
  }

  function handleSubmit(e) {
    e.preventDefault();
    invia();
  }

  return (
    <div className="capture-bar">
      {risposta && (
        <div className="risposta-panel">
          <div className="risposta-panel-inner">
            <div className="risposta-panel-header">
              Risposta
              <button
                type="button"
                className="risposta-panel-close"
                onClick={() => setRisposta(null)}
                aria-label="Chiudi"
              >
                ✕
              </button>
            </div>
            <div className="risposta-panel-testo">{risposta}</div>
          </div>
        </div>
      )}
      <form className="capture-inner" onSubmit={handleSubmit}>
        <span className="capture-status">{messaggio}</span>
        <input
          type="text"
          placeholder="dì la cosa — scriverla o parlarla va bene uguale"
          value={testo}
          onChange={(e) => setTesto(e.target.value)}
          disabled={stato === "elaborazione"}
        />
        {ascoltoSupportato && (
          <button
            type="button"
            className={`mic-btn${stato === "ascolto" ? " listening" : ""}`}
            aria-label="Registra a voce"
            onClick={toggleMic}
            disabled={stato === "elaborazione"}
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
              <rect x="6" y="1.5" width="4" height="7" rx="2" />
              <path d="M3.5 7.5a4.5 4.5 0 009 0M8 12v2.5M6 14.5h4" />
            </svg>
          </button>
        )}
      </form>
    </div>
  );
}
