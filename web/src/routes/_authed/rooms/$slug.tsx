import { RoomDetailPage } from "@/pages/rooms/RoomDetailPage";

interface Props {
  slug?: string;
}

export function RoomSlug({ slug = "unknown" }: Props) {
  return <RoomDetailPage slug={slug} />;
}
