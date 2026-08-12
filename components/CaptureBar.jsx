"use client";

import { useState } from "react";

// Cosmetica per ora: microfono e invio non parlano ancora con nessuna
// rotta. Diventa reale in A9 (classificatore), A10 (rotta di cattura)
// e A11 (riconoscimento vocale del browser).
export default function CaptureBar() {
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState("a riposo");

  function toggleMic() {
    const next = !listening;
    setListening(next);
    setStatus(next ? "in ascolto" : "a riposo");
  }

  return (
    <div className="capture-bar">
      <div className="capture-inner">
        <span className="capture-status">{status}</span>
        <input
          type="text"
          placeholder="dì la cosa — scriverla o parlarla va bene uguale"
        />
        <button
          type="button"
          className={`mic-btn${listening ? " listening" : ""}`}
          aria-label="Registra a voce"
          onClick={toggleMic}
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
            <rect x="6" y="1.5" width="4" height="7" rx="2" />
            <path d="M3.5 7.5a4.5 4.5 0 009 0M8 12v2.5M6 14.5h4" />
          </svg>
        </button>
      </div>
    </div>
  );
}
