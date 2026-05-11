import { DeviceDetailPage } from "@/pages/devices/DeviceDetailPage";

interface Props {
  id?: string;
}

export function DeviceDetail({ id = "unknown" }: Props) {
  return <DeviceDetailPage id={id} />;
}
