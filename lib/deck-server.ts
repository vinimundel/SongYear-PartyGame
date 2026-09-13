import "server-only";
import { SONGS_BY_ID } from "@/shared/deck";

export function getSongCard(id: string) {
  return SONGS_BY_ID.get(id) ?? null;
}
