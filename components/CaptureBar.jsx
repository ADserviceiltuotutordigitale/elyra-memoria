"use client";

import { useEffect, useRef, useState } from "react";

const ETICHETTE_DESTINAZIONE = {
  task: "task",
  persone: "persone",
  finanze: "finanze",
  nutrizione: "nutrizione",
  salute: "salute",
  obiettivi: "obiettivi",
  memoria: "memoria",
};

export default function CaptureBar() {
  const [testo, setTesto] = useState("");
  const [stato, setStato] = useState("riposo"); // riposo | ascolto | elaborazione | fatto
  const [messaggio, setMessaggio] = useState("a riposo");
  const [ascoltoSupportato, setAscoltoSupportato] = useState(false);
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
      inviaCattura(trascrizione);
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

  async function inviaCattura(testoDaInviare) {
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

  function handleSubmit(e) {
    e.preventDefault();
    inviaCattura();
  }

  return (
    <div className="capture-bar">
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
