import DashboardGrid from "@/components/DashboardGrid";
import PolsoFinanziarioCard from "@/components/PolsoFinanziarioCard";

export default function FinanzeScreen() {
  return (
    <DashboardGrid cols={2}>
      <PolsoFinanziarioCard />
    </DashboardGrid>
  );
}
