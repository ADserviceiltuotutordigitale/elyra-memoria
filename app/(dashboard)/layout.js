import TopBar from "@/components/TopBar";
import CaptureBar from "@/components/CaptureBar";

// Il chrome della dashboard (barra in alto + barra di cattura) vive solo
// qui, non nel layout radice: /login non deve mostrare tab verso pagine
// protette né una barra di cattura che punta a rotte dietro il cancello.
export default function DashboardLayout({ children }) {
  return (
    <>
      <TopBar />
      {children}
      <CaptureBar />
    </>
  );
}
