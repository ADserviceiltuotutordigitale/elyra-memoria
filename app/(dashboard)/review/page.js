import DashboardGrid from "@/components/DashboardGrid";

// Dati scritti a mano — A4. Diventa un'aggregazione vera (più cron del
// venerdì) quando le altre schede scrivono dati reali — vedi Parte 9.1.
export default function ReviewScreen() {
  return (
    <DashboardGrid cols={1}>
      <section className="card" id="card-review">
        <div className="card-plate">
          <span className="plate-name">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
              <rect x="2.5" y="2" width="11" height="12" rx="1.4" />
              <path d="M5 5.5h6M5 8h6M5 10.5h3.5" />
            </svg>
            Review
          </span>
          <span className="plate-meta">settimana del 5–11 agosto</span>
        </div>
        <div className="card-body">
          <div className="review-block">
            <h4>Chiuso</h4>
            <div className="review-line">4 task completati, tra cui il preventivo Bianchi</div>
          </div>
          <div className="review-block">
            <h4>Slittato</h4>
            <div className="review-line">Preventivo Studio Rossi — terza settimana di fila</div>
          </div>
          <div className="review-block">
            <h4>Persone in silenzio</h4>
            <div className="review-line">Fornitore Voxeldent non risponde da 9 giorni</div>
          </div>
          <div className="review-block">
            <h4>Abitudini &amp; pasti</h4>
            <div className="review-line">Allenamento 5/7 · media 2.080 kcal su 6 giorni registrati</div>
          </div>
          <div className="review-block">
            <h4>Le tre priorità della prossima settimana</h4>
            <div className="review-line">1. Chiudere Studio Rossi</div>
            <div className="review-line">2. Slide corso RealGuide</div>
            <div className="review-line">3. Rinnovo fornitore resine</div>
          </div>
        </div>
      </section>
    </DashboardGrid>
  );
}
