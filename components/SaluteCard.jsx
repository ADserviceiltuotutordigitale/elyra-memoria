"use client";

import { Fragment, useEffect, useState } from "react";

function formattaData(iso) {
  const [, m, d] = iso.split("-");
  const mesi = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
  return `${d} ${mesi[Number(m) - 1]}`;
}

export default function SaluteCard() {
  const [giorni, setGiorni] = useState([]);
  const [giorniRegistrati, setGiorniRegistrati] = useState(0);
  const [medie, setMedie] = useState({ calorie: 0, proteine: 0 });
  const [espansa, setEspansa] = useState(null);

  useEffect(() => {
    fetch("/api/salute")
      .then((res) => res.json())
      .then((body) => {
        setGiorni(body.giorni || []);
        setGiorniRegistrati(body.giorniRegistrati || 0);
        setMedie(body.medie || {});
      })
      .catch(() => {});
  }, []);

  return (
    <section className="card" id="card-salute">
      <div className="card-plate">
        <span className="plate-name">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
            <path d="M2 9h3l1.5-4 2 8 1.5-4H14" />
          </svg>
          Salute
        </span>
        <span className="plate-meta">30 giorni</span>
      </div>
      <div className="card-body">
        <div className="avg-row">
          <span>
            <b className="num">{medie.calorie}</b> kcal
          </span>
          <span>
            <b className="num">{medie.proteine}</b>g prot
          </span>
          <span>
            <b className="num">{medie.carboidrati}</b>g carb
          </span>
          <span>
            <b className="num">{medie.grassi}</b>g grassi
          </span>
        </div>
        <div style={{ fontSize: 11, color: "var(--paper-faint)", marginTop: -6 }}>
          media su <b className="num">{giorniRegistrati}</b> giorni registrati
        </div>
        {giorni.length === 0 ? (
          <div style={{ color: "var(--paper-faint)", fontSize: 12.5 }}>
            Ancora nessun giorno registrato.
          </div>
        ) : (
          <table className="health-table">
            <thead>
              <tr>
                <th>Giorno</th>
                <th>kcal</th>
                <th>Prot</th>
              </tr>
            </thead>
            <tbody>
              {giorni.map((g) => (
                <Fragment key={g.data}>
                  <tr
                    style={{ cursor: "pointer" }}
                    onClick={() => setEspansa(espansa === g.data ? null : g.data)}
                  >
                    <td>{formattaData(g.data)}</td>
                    <td className="num">{g.calorie}</td>
                    <td className="num">{g.proteine}</td>
                  </tr>
                  {espansa === g.data && (
                    <tr>
                      <td colSpan={3} style={{ padding: "4px 0 10px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {g.pasti.map((p) => (
                            <div
                              key={p.id}
                              style={{
                                display: "flex",
                                gap: 8,
                                fontSize: 11.5,
                                color: "var(--paper-dim)",
                              }}
                            >
                              <span className="num" style={{ color: "var(--paper-faint)" }}>
                                {p.ora}
                              </span>
                              <span style={{ flex: 1 }}>{p.nome}</span>
                              <span className="num">{p.calorie} kcal</span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
