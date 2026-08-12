// Il contenitore per la griglia — uno per ogni schermata (A4).
// `cols` sceglie quante colonne: 3 (default, Home), 2 (Finanze) o 1 (Review).
export default function DashboardGrid({ cols = 3, children }) {
  const colClass = cols === 2 ? " g2" : cols === 1 ? " g1" : "";
  return (
    <main className="screen">
      <div className={`grid${colClass}`}>{children}</div>
    </main>
  );
}
