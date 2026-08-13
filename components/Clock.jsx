"use client";

import { useEffect, useState } from "react";

// L'orologio parte solo lato client (Parte 5.1): lo stato iniziale è
// vuoto, il server disegna il segnaposto, e solo dopo il montaggio si
// popola. Se lo disegnasse anche il server, i due orari non
// coinciderebbero mai e React protesterebbe con un errore di hydration.
export default function Clock() {
  const [ora, setOra] = useState(null);

  useEffect(() => {
    function aggiorna() {
      setOra(
        new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })
      );
    }
    aggiorna();
    const interval = setInterval(aggiorna, 1000 * 15);
    return () => clearInterval(interval);
  }, []);

  return <span className="clock num">{ora ?? "--:--"}</span>;
}
