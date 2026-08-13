import DashboardGrid from "@/components/DashboardGrid";
import CrmBoard from "@/components/CrmBoard";

export default function CrmScreen() {
  return (
    <DashboardGrid cols={1}>
      <CrmBoard />
    </DashboardGrid>
  );
}
