import Link from "next/link";
import DashboardGrid from "@/components/DashboardGrid";
import Clock from "@/components/Clock";
import CalendarioCard from "@/components/CalendarioCard";
import AbitudiniCard from "@/components/AbitudiniCard";
import NutrizioneCard from "@/components/NutrizioneCard";
import SaluteCard from "@/components/SaluteCard";
import ObiettiviCard from "@/components/ObiettiviCard";
import { getProfilo, getTask, getLogGiornalieroRange } from "@/lib/store";
import { oggiISO, formattaDataPerEsteso, saluto } from "@/lib/date";
import { calcolaStriscia } from "@/lib/streak";

// Legge dati veri a ogni richiesta (profilo, task, log). Senza questo,
// Next la prerenderizza come statica al momento della build e la Home
// resterebbe congelata a quel momento — Parte 8, "Dopo un refresh vedi
// il dato di prima".
export const dynamic = "force-dynamic";

const ORDINE_FASCIA = { in_ritardo: 0, oggi: 1, settimana: 2, piu_avanti: 3 };
const ORDINE_TEMPERATURA = { caldo: 0, tiepido: 1, freddo: 2 };
const ETICHETTA_FASCIA = { in_ritardo: "In ritardo", oggi: "Oggi" };
const CLASSE_FASCIA = { in_ritardo: "late", oggi: "today" };

function trentaGiorniPrima(dataISO) {
  const [y, m, d] = dataISO.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 30);
  return dt.toISOString().slice(0, 10);
}

// Dati d'esempio ancora per Calendario, Blocchi, Polso, Nutrizione,
// Salute e Obiettivi — arrivano con A13.2 e successivi. Operator e
// Session sono già collegati ai dati veri (A13.1).
export default async function HomeScreen() {
  const oggi = oggiISO();

  const [profilo, taskAperti, logUltimiTrenta] = await Promise.all([
    getProfilo(),
    getTask(),
    getLogGiornalieroRange(trentaGiorniPrima(oggi), oggi),
  ]);

  const striscia = calcolaStriscia(logUltimiTrenta, oggi);

  const treTaskDiOggi = taskAperti
    .filter((t) => t.fascia === "in_ritardo" || t.fascia === "oggi")
    .sort((a, b) => {
      const f = ORDINE_FASCIA[a.fascia] - ORDINE_FASCIA[b.fascia];
      if (f !== 0) return f;
      const t = ORDINE_TEMPERATURA[a.temperatura] - ORDINE_TEMPERATURA[b.temperatura];
      if (t !== 0) return t;
      return a.posizione - b.posizione;
    })
    .slice(0, 3);

  return (
    <DashboardGrid cols={3}>
      <section className="card" id="card-operator">
        <div className="card-plate">
          <span className="plate-name">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
              <circle cx="8" cy="5.5" r="2.6" />
              <path d="M2.5 14c1-3.2 3.3-4.8 5.5-4.8s4.5 1.6 5.5 4.8" />
            </svg>
            Operator
          </span>
        </div>
        <div className="card-body">
          <div>
            <div className="op-name">{profilo.nome || "—"}</div>
            <div className="op-role">{profilo.ruolo}</div>
            <div className="op-city">{profilo.citta}</div>
          </div>
          {profilo.focus_del_giorno && (
            <div className="op-focus">
              <span className="op-focus-label">Focus di oggi</span>
              {profilo.focus_del_giorno}
            </div>
          )}
          <div className="streak">
            <b className="num">{striscia}</b> giorni di fila
          </div>
        </div>
      </section>

      <section className="card" id="card-session">
        <div className="card-plate">
          <span className="plate-name">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
              <circle cx="8" cy="8" r="6" />
              <path d="M8 4.5V8l3 1.6" />
            </svg>
            Session
          </span>
        </div>
        <div className="card-body">
          <div className="greet">
            {saluto()}, {profilo.nome || "—"}.
          </div>
          <div className="clock-row">
            <Clock />
            <span className="date-full">{formattaDataPerEsteso()}</span>
          </div>
          <hr className="rule" />
          {treTaskDiOggi.length === 0 ? (
            <div style={{ color: "var(--paper-faint)", fontSize: 13 }}>
              Niente in scadenza oggi.
            </div>
          ) : (
            <ul className="today-list">
              {treTaskDiOggi.map((t, i) => (
                <li className="today-item" key={t.id}>
                  <span className="idx num">{String(i + 1).padStart(2, "0")}</span>
                  <span className={`band ${CLASSE_FASCIA[t.fascia]}`}>
                    {ETICHETTA_FASCIA[t.fascia]}
                  </span>{" "}
                  <Link href={`/crm?task=${t.id}`} style={{ color: "inherit" }}>
                    {t.titolo}
                  </Link>
                  <span className="who">{t.persone?.nome || "—"}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <CalendarioCard />

      <AbitudiniCard />

      <section className="card" id="card-blocchi">
        <div className="card-plate">
          <span className="plate-name">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
              <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" />
              <path d="M5.5 8h5" />
            </svg>
            Blocchi
          </span>
          <span className="plate-meta">2 fermi</span>
        </div>
        <div className="card-body">
          <div className="block-item">
            Preventivo Studio Rossi <span className="days num">7gg</span>
          </div>
          <div className="block-item">
            Attesa risposta — commercialista <span className="days num">4gg</span>
          </div>
        </div>
      </section>

      <section className="card" id="card-polso">
        <div className="card-plate">
          <span className="plate-name">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
              <path d="M2 12l3.5-5 2.5 3 4-6 2 3" />
            </svg>
            Polso finanziario
          </span>
        </div>
        <div className="card-body">
          <div className="pulse-total">
            <span className="amount num">€ 84.320</span>
            <span className="delta up num">▲ 1.020 (30gg)</span>
          </div>
          <div className="pulse-bars">
            <div className="pbar-row">
              <span className="pbar-label">Liquidità</span>
              <div className="pbar-track">
                <div className="pbar-fill" style={{ width: "38%" }} />
              </div>
              <span className="pbar-val num">€ 22.400</span>
            </div>
            <div className="pbar-row">
              <span className="pbar-label">Investito</span>
              <div className="pbar-track">
                <div className="pbar-fill" style={{ width: "70%" }} />
              </div>
              <span className="pbar-val num">€ 66.100</span>
            </div>
            <div className="pbar-row">
              <span className="pbar-label">Debiti</span>
              <div className="pbar-track">
                <div className="pbar-fill debt" style={{ width: "15%" }} />
              </div>
              <span className="pbar-val num">€ 4.180</span>
            </div>
          </div>
          <div className="updated-row">
            aggiornato alle <span className="num">09:41</span>
            <button type="button" className="btn-refresh">
              ↻ aggiorna
            </button>
          </div>
        </div>
      </section>

      <NutrizioneCard />

      <SaluteCard />

      <ObiettiviCard />
    </DashboardGrid>
  );
}
