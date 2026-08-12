import DashboardGrid from "@/components/DashboardGrid";

// Dati scritti a mano — A4. I dati veri si collegano in A13.x, quando
// ogni scheda legge dalle sue rotte API sopra lib/store.js.
export default function HomeScreen() {
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
            <div className="op-name">Davide</div>
            <div className="op-role">Odontotecnico digitale · AD Service</div>
            <div className="op-city">Consulenza CAD/CAM &amp; stampa 3D dentale</div>
          </div>
          <div className="streak">
            <b className="num">6</b> giorni di fila
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
          <span className="plate-meta">martedì</span>
        </div>
        <div className="card-body">
          <div className="greet">Buongiorno, Davide.</div>
          <div className="clock-row">
            <span className="clock num">07:42</span>
            <span className="date-full">martedì 12 agosto</span>
          </div>
          <hr className="rule" />
          <ul className="today-list">
            <li className="today-item">
              <span className="idx num">01</span>
              <span className="band late">In ritardo</span> Preventivo Studio Rossi
              <span className="who">Marco</span>
            </li>
            <li className="today-item">
              <span className="idx num">02</span>
              <span className="band today">Oggi</span> Richiamare fornitore resine
              <span className="who">Voxeldent</span>
            </li>
            <li className="today-item">
              <span className="idx num">03</span>
              <span className="band today">Oggi</span> Slide corso RealGuide venerdì
              <span className="who">—</span>
            </li>
          </ul>
        </div>
      </section>

      <section className="card" id="card-calendario">
        <div className="card-plate">
          <span className="plate-name">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
              <rect x="2" y="3.5" width="12" height="10.5" rx="1.4" />
              <path d="M2 6.5h12M5.5 2v3M10.5 2v3" />
            </svg>
            Calendario
          </span>
          <span className="plate-meta">7 impegni</span>
        </div>
        <div className="card-body">
          <div className="week-strip">
            {["L", "M", "M", "G", "V", "S", "D"].map((d, i) => {
              const dayNum = 10 + i;
              const isToday = dayNum === 12;
              return (
                <button
                  type="button"
                  key={i}
                  className={`week-day${isToday ? " is-today" : ""}`}
                >
                  {d}
                  <span className="d-num num">{dayNum}</span>
                </button>
              );
            })}
          </div>
          <div className="now-line" style={{ marginTop: 2 }} />
          <div className="agenda">
            <div className="agenda-item">
              <time className="num">09:00</time> Scan intraorale — cliente Bianchi
            </div>
            <div className="agenda-item">
              <time className="num">14:30</time> Call fornitore resine
            </div>
            <div className="agenda-item">
              <time className="num">18:00</time> Prova stampante — laboratorio
            </div>
          </div>
        </div>
      </section>

      <section className="card" id="card-abitudini">
        <div className="card-plate">
          <span className="plate-name">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
              <path d="M8 2v3M8 11v3M2 8h3M11 8h3" />
              <circle cx="8" cy="8" r="2.4" />
            </svg>
            Abitudini
          </span>
          <span className="plate-meta">oggi</span>
        </div>
        <div className="card-body">
          <div className="ring-row">
            <svg className="ring" width="52" height="52" viewBox="0 0 52 52">
              <circle cx="26" cy="26" r="21" fill="none" stroke="var(--ink-800)" strokeWidth="6" />
              <circle
                cx="26"
                cy="26"
                r="21"
                fill="none"
                stroke="var(--brass)"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray="132"
                strokeDashoffset="46"
                transform="rotate(-90 26 26)"
              />
            </svg>
            <div className="ring-label">
              completate
              <br />
              <b className="num">65%</b>
            </div>
          </div>
          <div className="habit-list">
            <div className="habit done">
              <span className="chk">✓</span> Allenamento
            </div>
            <div className="habit">
              <span className="chk" /> Lettura
            </div>
            <div className="habit done">
              <span className="chk">✓</span> Acqua <span className="cnt num">6/8</span>
            </div>
          </div>
        </div>
      </section>

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

      <section className="card" id="card-nutrizione">
        <div className="card-plate">
          <span className="plate-name">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
              <path d="M5 2v6a2 2 0 004 0V2M9 2v12M13 2c-1.5 1-1.5 3.5 0 5" />
            </svg>
            Nutrizione
          </span>
          <span className="plate-meta">1.840 / 2.200 kcal</span>
        </div>
        <div className="card-body">
          <div className="macro-row">
            <div className="macro">
              <div className="m-label">Prot</div>
              <div className="m-val num">112g</div>
            </div>
            <div className="macro">
              <div className="m-label">Carb</div>
              <div className="m-val num">168g</div>
            </div>
            <div className="macro">
              <div className="m-label">Grassi</div>
              <div className="m-val num">54g</div>
            </div>
          </div>
          <div className="meal-list">
            <div className="meal">
              <time className="num">08:10</time> Yogurt e avena{" "}
              <span className="pill-est">stima</span>
              <span className="kcal num">320</span>
            </div>
            <div className="meal">
              <time className="num">13:00</time> Petto di pollo, riso, mela{" "}
              <span className="pill-est">stima</span>
              <span className="kcal num">610</span>
            </div>
          </div>
        </div>
      </section>

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
            media su <b className="num">22</b> giorni registrati
          </div>
          <table className="health-table">
            <thead>
              <tr>
                <th>Giorno</th>
                <th>kcal</th>
                <th>Prot</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>11 ago</td>
                <td className="num">2.140</td>
                <td className="num">118</td>
              </tr>
              <tr>
                <td>10 ago</td>
                <td className="num">1.980</td>
                <td className="num">104</td>
              </tr>
              <tr>
                <td>09 ago</td>
                <td className="num">2.260</td>
                <td className="num">121</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="card" id="card-obiettivi">
        <div className="card-plate">
          <span className="plate-name">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
              <path d="M8 2a6 6 0 100 12 6 6 0 000-12z" />
              <circle cx="8" cy="8" r="1.6" fill="currentColor" stroke="none" />
            </svg>
            Obiettivi
          </span>
        </div>
        <div className="card-body">
          <div className="goal-group">
            <h4>Questa settimana</h4>
            <div className="goal done">
              <span className="chk">✓</span>
              <span className="g-text">Chiudere preventivo Rossi</span>
            </div>
            <div className="goal">
              <span className="chk" />
              <span className="g-text">Slide corso RealGuide</span>
              <span className="g-prog num">3/5</span>
            </div>
            <button type="button" className="goal-add">
              + aggiungi
            </button>
          </div>
          <div className="goal-group">
            <h4>Questo mese</h4>
            <div className="goal">
              <span className="chk" />
              <span className="g-text">Firmare rinnovo fornitore resine</span>
            </div>
            <button type="button" className="goal-add">
              + aggiungi
            </button>
          </div>
        </div>
      </section>
    </DashboardGrid>
  );
}
