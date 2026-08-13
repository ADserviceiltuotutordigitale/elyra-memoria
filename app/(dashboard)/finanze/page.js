import DashboardGrid from "@/components/DashboardGrid";

// Dati scritti a mano — A4. Lettura reale da Google Sheets in A13.8-bis.
export default function FinanzeScreen() {
  return (
    <DashboardGrid cols={2}>
      <section className="card span-2" id="card-finanze">
        <div className="card-plate">
          <span className="plate-name">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
              <path d="M2 12l3.5-5 2.5 3 4-6 2 3" />
            </svg>
            Finanze
          </span>
          <span className="plate-meta">storico mensile</span>
        </div>
        <div className="card-body">
          <div className="pulse-total">
            <span className="amount num" style={{ fontSize: 34 }}>
              € 84.320
            </span>
            <span className="delta up num">▲ 1.020 (30gg) · ▲ 9.400 (1a)</span>
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
          <table className="health-table">
            <thead>
              <tr>
                <th>Mese</th>
                <th>Patrimonio</th>
                <th>Δ</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Agosto</td>
                <td className="num">84.320</td>
                <td className="num" style={{ color: "var(--good)" }}>
                  +1.020
                </td>
              </tr>
              <tr>
                <td>Luglio</td>
                <td className="num">83.300</td>
                <td className="num" style={{ color: "var(--good)" }}>
                  +640
                </td>
              </tr>
              <tr>
                <td>Giugno</td>
                <td className="num">82.660</td>
                <td className="num" style={{ color: "var(--bad)" }}>
                  -210
                </td>
              </tr>
            </tbody>
          </table>
          <div className="updated-row">
            aggiornato alle <span className="num">09:41</span> · nota: nessuna ambiguità
            rilevata nel foglio
            <button type="button" className="btn-refresh">
              ↻ aggiorna
            </button>
          </div>
        </div>
      </section>
    </DashboardGrid>
  );
}
