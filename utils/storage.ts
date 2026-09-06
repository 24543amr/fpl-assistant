import AsyncStorage from '@react-native-async-storage/async-storage';

export const FPL_TEAM_ID_KEY = 'fpl_team_id';

let inMemoryTeamId = '';
const listeners: Array<(teamId: string) => void> = [];
const savedPicksMap = new Map<string, any[]>();

/** Read the persisted team ID. Use this before every live FPL load. */
export async function getStoredTeamId(): Promise<string | null> {
  const teamId = await AsyncStorage.getItem(FPL_TEAM_ID_KEY);
  inMemoryTeamId = teamId?.trim() || '';
  return inMemoryTeamId || null;
}

/** Saves only a verified Team ID. There is deliberately no default ID. */
export async function setSavedTeamId(teamId: string): Promise<void> {
  const cleanId = String(teamId).trim();
  if (!/^\d+$/.test(cleanId)) throw new Error('A numeric Team ID is required.');
  inMemoryTeamId = cleanId;
  await AsyncStorage.setItem(FPL_TEAM_ID_KEY, cleanId);
  listeners.forEach((listener) => listener(cleanId));
}

// Kept for older screens; Home never uses this cached value.
export function getSavedTeamId(): string {
  return inMemoryTeamId;
}

export function getSavedPicks(teamId?: string): any[] | null {
  return savedPicksMap.get(teamId || inMemoryTeamId) || null;
}

export function setSavedPicks(teamId: string, picks: any[]): void {
  savedPicksMap.set(String(teamId).trim(), picks);
}

// ── OIDC Token & CSRF Storage ──────────────────────────────────────────────────
// FPL OAuth sessions store access_token, refresh_token, and csrftoken.

export const FPL_ACCESS_TOKEN_KEY = 'fpl_access_token';
export const FPL_REFRESH_TOKEN_KEY = 'fpl_refresh_token';
export const FPL_CSRF_TOKEN_KEY = 'fpl_csrf_token';

// Legacy key — kept only so we can remove it on first run during migration.
export const FPL_SESSION_COOKIE_KEY = 'fpl_session_cookie';

let inMemoryAccessToken = '';
let inMemoryRefreshToken = '';
let inMemoryCsrfToken = '';

export interface FplTokens {
  accessToken: string;
  refreshToken?: string;
  csrfToken?: string;
}

/** Read the persisted OIDC tokens & CSRF token. Returns null if not logged in. */
export async function getStoredFplToken(): Promise<FplTokens | null> {
  // Migrate: remove any legacy cookie entry silently
  await AsyncStorage.removeItem(FPL_SESSION_COOKIE_KEY).catch(() => {});

  if (inMemoryAccessToken) {
    return {
      accessToken: inMemoryAccessToken,
      refreshToken: inMemoryRefreshToken || undefined,
      csrfToken: inMemoryCsrfToken || undefined,
    };
  }
  const [access, refresh, csrf] = await Promise.all([
    AsyncStorage.getItem(FPL_ACCESS_TOKEN_KEY),
    AsyncStorage.getItem(FPL_REFRESH_TOKEN_KEY),
    AsyncStorage.getItem(FPL_CSRF_TOKEN_KEY),
  ]);
  inMemoryAccessToken = access?.trim() || '';
  inMemoryRefreshToken = refresh?.trim() || '';
  inMemoryCsrfToken = csrf?.trim() || '';

  return inMemoryAccessToken ? {
    accessToken: inMemoryAccessToken,
    refreshToken: inMemoryRefreshToken || undefined,
    csrfToken: inMemoryCsrfToken || undefined,
  } : null;
}

/**
 * Safely decodes a JWT payload without verifying signature (for timing/exp checks).
 */
export function decodeJwtPayload(token: string): any {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let output = '';
    for (let i = 0; i < base64.length;) {
      const enc1 = chars.indexOf(base64.charAt(i++));
      const enc2 = chars.indexOf(base64.charAt(i++));
      const enc3 = chars.indexOf(base64.charAt(i++));
      const enc4 = chars.indexOf(base64.charAt(i++));
      const chr1 = (enc1 << 2) | (enc2 >> 4);
      const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
      const chr3 = ((enc3 & 3) << 6) | enc4;
      output += String.fromCharCode(chr1);
      if (enc3 !== 64) output += String.fromCharCode(chr2);
      if (enc4 !== 64) output += String.fromCharCode(chr3);
    }
    return JSON.parse(output);
  } catch (e) {
    return null;
  }
}

/**
 * Checks whether an access_token's exp claim is expired or close to expiring (default buffer: 300s / 5 minutes).
 */
export function isTokenExpiringSoon(token: string, bufferSeconds = 300): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload || !payload.exp) return true; // If no payload or exp claim, treat as expiring to be safe
  const nowSec = Math.floor(Date.now() / 1000);
  return (payload.exp - nowSec) <= bufferSeconds;
}

/** Persist OIDC tokens & CSRF token after a successful OAuth login or refresh. 🔒 Never log token values. */
export async function setStoredFplToken({ accessToken, refreshToken, csrfToken }: FplTokens): Promise<void> {
  if (typeof accessToken !== 'string' || !accessToken.trim()) {
    console.error('[Storage] Token extraction returned null or empty for: accessToken');
    throw new Error('Token extraction returned null for: accessToken');
  }

  const cleanAccess = accessToken.trim();
  const cleanRefresh = (typeof refreshToken === 'string' && refreshToken.trim())
    || (refreshToken === undefined ? inMemoryRefreshToken : '');
  const cleanCsrf = (typeof csrfToken === 'string' && csrfToken.trim())
    || (csrfToken === undefined ? inMemoryCsrfToken : '');

  inMemoryAccessToken = cleanAccess;
  inMemoryRefreshToken = cleanRefresh;
  inMemoryCsrfToken = cleanCsrf;

  const pairs: [string, string][] = [
    [FPL_ACCESS_TOKEN_KEY, cleanAccess],
  ];

  if (cleanRefresh) {
    pairs.push([FPL_REFRESH_TOKEN_KEY, cleanRefresh]);
  }
  if (cleanCsrf) {
    pairs.push([FPL_CSRF_TOKEN_KEY, cleanCsrf]);
  }

  await AsyncStorage.multiSet(pairs);
}

/** Clear stored OIDC tokens, team ID, in-memory caches, and native cookies on logout or session expiry. */
export async function clearStoredFplToken(): Promise<void> {
  inMemoryAccessToken = '';
  inMemoryRefreshToken = '';
  inMemoryCsrfToken = '';
  inMemoryTeamId = '';
  savedPicksMap.clear();
  listeners.forEach((listener) => listener(''));

  try {
    const rawModule = require('@react-native-cookies/cookies');
    const CookieManager = rawModule?.default || rawModule;
    if (CookieManager?.clearAll) {
      await CookieManager.clearAll(true).catch(() => {});
      await CookieManager.clearAll(false).catch(() => {});
    }
  } catch (cookieErr) {
    console.warn('[Storage] CookieManager clear error:', cookieErr);
  }

  await AsyncStorage.multiRemove([
    FPL_ACCESS_TOKEN_KEY,
    FPL_REFRESH_TOKEN_KEY,
    FPL_CSRF_TOKEN_KEY,
    FPL_TEAM_ID_KEY,
    FPL_SESSION_COOKIE_KEY, // legacy cleanup
  ]);
}

export const clearAllSessionData = clearStoredFplToken;

// ── Legacy shims ──────────────────────────────────────────────────────────────

/** @deprecated Use getStoredFplToken() instead. */
export async function getStoredFplCookie(): Promise<string | null> {
  const tokens = await getStoredFplToken();
  return tokens?.accessToken || null;
}

/** @deprecated Use setStoredFplToken() instead. */
export async function setStoredFplCookie(value: string): Promise<void> {
  await setStoredFplToken({ accessToken: value });
}

/** @deprecated Use clearStoredFplToken() instead. */
export async function clearStoredFplCookie(): Promise<void> {
  await clearStoredFplToken();
}

// ── Team ID change subscription ───────────────────────────────────────────────

export function subscribeTeamId(listener: (teamId: string) => void): () => void {
  listeners.push(listener);
  return () => {
    const index = listeners.indexOf(listener);
    if (index >= 0) listeners.splice(index, 1);
  };
}
