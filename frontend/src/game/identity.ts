/**
 * game/identity.ts
 *
 * Persistent player identity stored in localStorage.
 * Generated once, reused across every session, reload, and reconnect.
 */

const KEY_CLIENT_ID  = 'd2t_client_id';
const KEY_PLAYER_NAME = 'd2t_player_name';
const KEY_LAST_ROOM  = 'd2t_last_room';
const KEY_LAST_HERO  = 'd2t_last_hero';

/** Returns the persistent client UUID, creating it if this is the first run. */
export function getClientId(): string {
  let id = localStorage.getItem(KEY_CLIENT_ID);
  if (!id) {
    id = generateUUID();
    localStorage.setItem(KEY_CLIENT_ID, id);
  }
  return id;
}

export function getPlayerName(): string {
  return localStorage.getItem(KEY_PLAYER_NAME) ?? '';
}

export function savePlayerName(name: string): void {
  localStorage.setItem(KEY_PLAYER_NAME, name);
}

export function getLastRoom(): string {
  return localStorage.getItem(KEY_LAST_ROOM) ?? 'default';
}

export function saveLastRoom(room: string): void {
  localStorage.setItem(KEY_LAST_ROOM, room);
}

export function getLastHero(): string {
  return localStorage.getItem(KEY_LAST_HERO) ?? 'axe';
}

export function saveLastHero(hero: string): void {
  localStorage.setItem(KEY_LAST_HERO, hero);
}

// ---------------------------------------------------------------------------
// UUID v4 generator (no dependency)
// ---------------------------------------------------------------------------

function generateUUID(): string {
  // Use crypto.randomUUID if available (modern browsers)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback: manual UUID v4
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
