import DashboardGrid from "@/components/DashboardGrid";

// Dati scritti a mano — A4. Kanban interattivo (drag&drop, pannello di
// modifica, ricerca in linguaggio naturale) arriva in A13.4.
export default function CrmScreen() {
  return (
    <DashboardGrid cols={1}>
      <section className="card" id="card-crm">
        <div className="card-plate">
          <span className="plate-name">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
              <circle cx="8" cy="5.5" r="2.6" />
              <path d="M2.5 14c1-3.2 3.3-4.8 5.5-4.8s4.5 1.6 5.5 4.8" />
            </svg>
            CRM
          </span>
          <span className="plate-meta">chi aspetta cosa</span>
        </div>
        <div className="card-body">
          <div className="crm-toolbar">
            <div className="view-switch">
              <button type="button" className="active">
                Kanban
              </button>
              <button type="button">Per persona</button>
            </div>
            <div className="nl-search">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
                <circle cx="7" cy="7" r="4.5" />
                <path d="M13.5 13.5L10.5 10.5" />
              </svg>
              <input type="text" placeholder="cosa posso chiudere in dieci minuti?" />
            </div>
          </div>
          <div className="kanban">
            <div className="kcol">
              <div className="kcol-head">
                In ritardo <span className="kcount num">2</span>
              </div>
              <div className="kcard hot">
                <div className="kc-title">Preventivo Studio Rossi</div>
                <div className="kc-who">Marco</div>
              </div>
              <div className="kcard hot">
                <div className="kc-title">Firma contratto laboratorio</div>
                <div className="kc-who">—</div>
              </div>
            </div>
            <div className="kcol">
              <div className="kcol-head">
                Oggi <span className="kcount num">3</span>
              </div>
              <div className="kcard warm">
                <div className="kc-title">Richiamare fornitore resine</div>
                <div className="kc-who">Voxeldent</div>
              </div>
              <div className="kcard warm">
                <div className="kc-title">Slide corso RealGuide</div>
                <div className="kc-who">—</div>
              </div>
              <div className="kcard cold">
                <div className="kc-title">Rispondere email Bianchi</div>
                <div className="kc-who">Bianchi</div>
              </div>
            </div>
            <div className="kcol">
              <div className="kcol-head">
                Questa settimana <span className="kcount num">2</span>
              </div>
              <div className="kcard cold">
                <div className="kc-title">Ordinare resina biocompatibile</div>
                <div className="kc-who">—</div>
              </div>
              <div className="kcard cold">
                <div className="kc-title">Prova nuova stampante</div>
                <div className="kc-who">—</div>
              </div>
            </div>
            <div className="kcol">
              <div className="kcol-head">
                Più avanti <span className="kcount num">1</span>
              </div>
              <div className="kcard cold">
                <div className="kc-title">Aggiornare listino corsi</div>
                <div className="kc-who">—</div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </DashboardGrid>
  );
}
