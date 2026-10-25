/**
 * One Supabase session for every *.th3scr1b3.art site.
 *
 * supabase-js keeps its session in localStorage, which is per-origin, so th3scr1b3.art,
 * pim.th3scr1b3.art and user.th3scr1b3.art each had their own login. This storage adapter
 * keeps auth items in cookies on `.th3scr1b3.art` instead, so signing in (or out) on any layer
 * applies to all of them.
 *
 * - Values are split across `<key>.0`, `<key>.1`, … cookies (browsers cap one cookie ~4 KB).
 * - First run after this ships: an existing per-site localStorage session is moved into the
 *   cookie and the local copy removed, so nobody is logged out and sign-out stays global.
 * - Falls back to plain localStorage where a domain cookie can't work: off the th3scr1b3.art
 *   domain (localhost, desktop builds) and inside third-party frames (e.g. Farcaster on web),
 *   where browsers block these cookies.
 *
 * Keep this file identical in the main site, PIM and the user hub.
 */

const DOMAIN = '.th3scr1b3.art';
const CHUNK_SIZE = 3000;
const MAX_CHUNKS = 10;
const MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

type AuthStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

function canUseSharedCookie(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  if (!/(^|\.)th3scr1b3\.art$/i.test(window.location.hostname)) return false;
  if (window.location.protocol !== 'https:') return false;
  try {
    if (window.self !== window.top) return false; // third-party frame: cookies blocked
  } catch {
    return false;
  }
  return true;
}

function readCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

function writeCookie(name: string, value: string, maxAge: number) {
  document.cookie =
    `${name}=${encodeURIComponent(value)}; domain=${DOMAIN}; path=/; max-age=${maxAge}; SameSite=Lax; Secure`;
}

function clearChunks(key: string, from = 0) {
  for (let i = from; i < MAX_CHUNKS; i++) {
    if (readCookie(`${key}.${i}`) === null) break;
    writeCookie(`${key}.${i}`, '', 0);
  }
}

function readShared(key: string): string | null {
  const first = readCookie(`${key}.0`);
  if (first === null) return null;
  let value = first;
  for (let i = 1; i < MAX_CHUNKS; i++) {
    const part = readCookie(`${key}.${i}`);
    if (part === null) break;
    value += part;
  }
  return value;
}

function writeShared(key: string, value: string) {
  const chunks: string[] = [];
  for (let i = 0; i < value.length; i += CHUNK_SIZE) chunks.push(value.slice(i, i + CHUNK_SIZE));
  if (chunks.length > MAX_CHUNKS) throw new Error('Auth session too large for shared cookies');
  chunks.forEach((chunk, i) => writeCookie(`${key}.${i}`, chunk, MAX_AGE_SECONDS));
  clearChunks(key, chunks.length); // drop leftovers from a previously longer value
}

function local(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Storage for `createClient(url, key, { auth: { storage: sharedAuthStorage() } })`. */
export function sharedAuthStorage(): AuthStorage | undefined {
  if (!canUseSharedCookie()) return undefined; // supabase-js default (localStorage)

  return {
    getItem(key) {
      const shared = readShared(key);
      if (shared !== null) {
        // The shared session wins; a leftover per-site copy must not resurrect after sign-out.
        local()?.removeItem(key);
        return shared;
      }
      // One-time move of this site's old per-origin session into the shared cookie.
      const legacy = local()?.getItem(key) ?? null;
      if (legacy !== null) {
        try {
          writeShared(key, legacy);
          local()?.removeItem(key);
        } catch {
          return legacy;
        }
      }
      return legacy;
    },
    setItem(key, value) {
      try {
        writeShared(key, value);
        local()?.removeItem(key);
      } catch {
        clearChunks(key); // never leave a stale shared session behind
        local()?.setItem(key, value); // oversized: keep it working on this site at least
      }
    },
    removeItem(key) {
      clearChunks(key);
      local()?.removeItem(key);
    },
  };
}
