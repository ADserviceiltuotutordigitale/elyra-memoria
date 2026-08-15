import DashboardGrid from "@/components/DashboardGrid";
import FinanzeDettaglio from "@/components/FinanzeDettaglio";

export default function FinanzeScreen() {
  return (
    <DashboardGrid cols={2}>
      <FinanzeDettaglio />
    </DashboardGrid>
  );
}
