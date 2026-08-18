import DashboardGrid from "@/components/DashboardGrid";
import CrmOdooBoard from "@/components/CrmOdooBoard";

export default function CrmScreen() {
  return (
    <DashboardGrid cols={1}>
      <CrmOdooBoard />
    </DashboardGrid>
  );
}
