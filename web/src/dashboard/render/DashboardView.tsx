import { DashboardSkeleton } from "./DashboardSkeleton";
import { WidgetRenderer } from "./WidgetRenderer";

type Props = { slug: string };
export function DashboardView({ slug }: Props) {
  return (
    <div className="dashboard-view">
      <DashboardSkeleton />
      <h1>Dashboard: {slug}</h1>
      <WidgetRenderer
        id={`${slug}-entity-toggle`}
        classId="EntityToggle"
        props={{ entityId: "light.demo" }}
        pending={{ state: "idle" }}
      />
    </div>
  );
}
