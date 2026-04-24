import type { Room as LivekitRoom } from 'livekit-client';

// Exposed so the UI layer can imperatively attach tracks to <video> / <audio>
// elements without threading the room through React props.

let activeRoom: LivekitRoom | null = null;

export function setActiveLivekitRoom(room: LivekitRoom | null): void {
  activeRoom = room;
}

export function getActiveLivekitRoom(): LivekitRoom | null {
  return activeRoom;
}
