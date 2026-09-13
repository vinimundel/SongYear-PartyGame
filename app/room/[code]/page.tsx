import { RoomEntry } from "@/components/room-controller";

export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <RoomEntry code={code.toUpperCase()} />;
}
