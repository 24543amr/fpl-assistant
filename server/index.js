/**
 * FPL Assistant — Node.js Backend Proxy Server
 *
 * 🔒 SECURITY MODEL:
 * - Password is used ONLY to authenticate with FPL's official servers.
 * - Password is NEVER stored, logged, or persisted anywhere.
 * - Only the FPL session cookie (pl_profile) is kept in memory per request.
 * - All FPL API calls are proxied server-side (bypasses CORS & reCAPTCHA).
 *
 * Endpoints:
 *   POST /api/auth/fpl-login        → Login with email+password, returns teamId + session
 *   GET  /api/bootstrap             → FPL bootstrap-static data
 *   GET  /api/team/:id              → Team entry data
 *   GET  /api/team/:id/history      → Season history
 *   GET  /api/team/:id/picks/:gw    → Gameweek picks
 *   GET  /api/fixtures              → All fixtures
 *   POST /api/team/transfers        → Submit transfers (needs session cookie)
 *   POST /api/team/squad            → Get squad for lineup editing
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { CookieJar } = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors({
  origin: '*', // Allow all origins (React Native app)
  methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-fpl-session', 'x-fpl-refresh', 'x-fpl-csrf'],
  exposedHeaders: ['x-fpl-new-access-token', 'x-fpl-new-refresh-token'],
}));
app.use(express.json());

// ── FPL Constants ───────────────────────────────────────────────────────────
const FPL_BASE = 'https://fantasy.premierleague.com/api';
const FPL_LOGIN_URL = 'https://fantasy.premierleague.com/accounts/login/';
const FPL_USER_AGENT = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36';

/**
 * Create an axios instance pre-configured with the correct FPL headers.
 *
 * @param {string|null} accessToken  OIDC Bearer token from account.premierleague.com.
 * @param {string|null} csrfToken   csrftoken value from fantasy.premierleague.com.
 *
 * 🔒 The token value is baked into axios defaults here; it is NEVER logged.
 */
function createFplClient(accessToken = null, csrfToken = null) {
  const jar = new CookieJar();

  // Base headers sent with every FPL request (authenticated or not)
  const baseHeaders = {
    'User-Agent': FPL_USER_AGENT,
    'Accept': 'application/json, text/html,*/*',
    'Accept-Language': 'en-GB,en;q=0.9',
    'Referer': 'https://fantasy.premierleague.com/',
    'Origin': 'https://fantasy.premierleague.com',
    'x-api-language': 'en',
  };

  // Authenticated headers — only added when we have a token (x-api-authorization is what official FPL app uses)
  if (accessToken) {
    baseHeaders['x-api-authorization'] = `Bearer ${accessToken}`;
  }

  // CSRF header & cookie for write requests
  if (csrfToken) {
    baseHeaders['x-csrftoken'] = csrfToken;
    try {
      jar.setCookieSync(`csrftoken=${csrfToken}`, 'https://fantasy.premierleague.com');
    } catch (_) {}
  }

  const client = wrapper(axios.create({
    jar,
    withCredentials: true,
    headers: baseHeaders,
    maxRedirects: 5,
    timeout: 15000,
  }));

  return { client, jar };
}

function validTeamId(teamId) {
  return /^\d+$/.test(String(teamId || ''));
}

function noStore(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}

// ── OIDC Token Refresh Helper ───────────────────────────────────────────────
function decodeJwtPayload(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = Buffer.from(base64, 'base64').toString('utf8');
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

function extractPingOneDetails(accessToken) {
  let envId = '68340de1-dfb9-412e-937c-20172986d129';
  let clientId = 'bfcbaf69-aade-4c1b-8f00-c1cb8a193030';

  if (accessToken) {
    const payload = decodeJwtPayload(accessToken);
    if (payload) {
      if (payload.client_id) clientId = payload.client_id;
      if (payload.env) {
        envId = payload.env;
      } else if (payload.iss && typeof payload.iss === 'string') {
        const match = payload.iss.match(/https:\/\/auth\.pingone\.eu\/([^/]+)\/as/);
        if (match && match[1]) envId = match[1];
      }
    }
  }

  return { envId, clientId };
}

async function refreshPingOneToken(refreshToken, accessToken = null) {
  if (!refreshToken || typeof refreshToken !== 'string') {
    throw new Error('REFRESH_EXPIRED');
  }

  const { envId, clientId } = extractPingOneDetails(accessToken);
  const pingOneTokenUrl = `https://auth.pingone.eu/${envId}/as/token`;

  console.log(`[Token Refresh] Refreshing token via PingOne (${pingOneTokenUrl}), client_id=${clientId}`);

  const bodyParams = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
  });

  try {
    const response = await axios.post(pingOneTokenUrl, bodyParams.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': FPL_USER_AGENT,
      },
      timeout: 15000,
    });

    if (response.data && response.data.access_token) {
      console.log('[Token Refresh] SUCCESS! Received new access_token.');
      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token || refreshToken,
        expiresIn: response.data.expires_in,
      };
    } else {
      throw new Error('REFRESH_EXPIRED');
    }
  } catch (err) {
    console.error(`[Token Refresh] PingOne request failed (${err.response?.status}):`, err.response?.data || err.message);
    throw new Error('REFRESH_EXPIRED');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/refresh
// Body: { refreshToken, accessToken }
// Returns: { accessToken, refreshToken }
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/auth/refresh', async (req, res) => {
  const refreshToken = req.body?.refreshToken || req.headers['x-fpl-refresh'];
  const accessToken = req.body?.accessToken || req.headers['x-fpl-session'];

  if (!refreshToken) {
    return res.status(400).json({ error: 'REFRESH_EXPIRED', message: 'refreshToken is required.' });
  }

  try {
    const result = await refreshPingOneToken(refreshToken, accessToken);
    return res.json(result);
  } catch (err) {
    return res.status(401).json({
      error: 'REFRESH_EXPIRED',
      message: 'Your refresh token has expired or is invalid. Please log in again.',
    });
  }
});

/**
 * Helper to run FPL requests with single automatic 401 retry via refresh token.
 */
async function executeAuthenticatedFplRequest(req, res, fplCallFn) {
  let accessToken = req.headers['x-fpl-session'] || req.body?.accessToken || null;
  const refreshToken = req.headers['x-fpl-refresh'] || req.body?.refreshToken || null;

  try {
    return await fplCallFn(accessToken);
  } catch (firstErr) {
    const status = firstErr.response?.status;
    const is401 = status === 401 || status === 403;

    if (is401 && refreshToken) {
      console.warn(`[FPL Proxy 401] FPL call returned ${status}. Attempting automatic token refresh...`);
      try {
        const newTokens = await refreshPingOneToken(refreshToken, accessToken);
        accessToken = newTokens.accessToken;

        res.setHeader('x-fpl-new-access-token', newTokens.accessToken);
        if (newTokens.refreshToken) {
          res.setHeader('x-fpl-new-refresh-token', newTokens.refreshToken);
        }

        console.log('[FPL Proxy 401] Refresh SUCCESS! Retrying original FPL call ONCE with new access_token...');
        return await fplCallFn(newTokens.accessToken);
      } catch (refreshErr) {
        console.error('[FPL Proxy 401] Internal token refresh or retry failed:', refreshErr.message);
        return res.status(401).json({
          error: 'REFRESH_EXPIRED',
          message: 'Your FPL session has expired. Please log in again.',
        });
      }
    }

    throw firstErr;
  }
}

// ── OIDC Token Session Verification ─────────────────────────────────────────
// POST /api/auth/fpl-session
// Body: { accessToken: string, refreshToken?: string }   ← OIDC Bearer token from account.premierleague.com
// Returns: { teamId, name }
// 🔒 Token value is NEVER logged — only length and 6-char prefix.
app.post('/api/auth/fpl-session', async (req, res) => {
  const { accessToken } = req.body || {};

  if (!accessToken || typeof accessToken !== 'string' || !accessToken.trim()) {
    return res.status(400).json({ error: 'An OIDC access_token string is required.' });
  }

  const cleanToken = accessToken.replace(/^Bearer\s+/i, '').trim();
  const jwtPayload = decodeJwtPayload(cleanToken);
  const nowSec = Math.floor(Date.now() / 1000);
  const expSec = jwtPayload?.exp || 0;
  const remainingSec = expSec ? (expSec - nowSec) : 'unknown';

  console.log(`[Session Verification] Received token: prefix="${cleanToken.substring(0, 20)}...", length=${cleanToken.length}, exp=${expSec}, remaining=${remainingSec}s`);
  console.log(`[Session Verification] Requesting FPL /me/ with header: x-api-authorization: "Bearer ${cleanToken.substring(0, 10)}...", x-api-language: "en"`);

  const { client } = createFplClient(cleanToken);

  let meRes = null;
  let meErrorStatus = null;
  let meErrorData = null;

  try {
    meRes = await client.get(`${FPL_BASE}/me/`);
    console.log(`[Session Verification] FPL /me/ SUCCESS! HTTP ${meRes.status}`);
  } catch (e1) {
    meErrorStatus = e1.response?.status;
    meErrorData = e1.response?.data;
    console.warn(`[Session Verification] FPL /me/ FAILED (HTTP ${meErrorStatus}): ${e1.message}`);
    if (meErrorData) {
      console.warn('[Session Verification] FPL /me/ response data:', JSON.stringify(meErrorData));
    }
  }

  if (!meRes) {
    console.error(`[Session Verification] Auth verification failed against FPL /me/ (HTTP ${meErrorStatus})`, meErrorData);
    return res.status(401).json({
      error: `Unable to verify FPL session: FPL /me/ returned HTTP ${meErrorStatus || '500'}. The token may have expired or was rejected by FPL.`,
      fplStatus: meErrorStatus,
      fplData: meErrorData,
      tokenRemainingSeconds: remainingSec,
    });
  }

  const player = meRes.data?.player;
  if (!player?.entry) {
    return res.status(401).json({ error: 'This FPL account does not have an active FPL team.' });
  }

  const playerName = `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'FPL manager';
  console.log(`[Session Verification] Verified manager: ${playerName}, Team ID: ${player.entry}`);

  return res.json({
    teamId: String(player.entry),
    name: playerName,
  });
});


app.get('/api/fpl/bootstrap', async (_req, res) => {
  noStore(res);
  try {
    const { client } = createFplClient();
    const response = await client.get(`${FPL_BASE}/bootstrap-static/`);
    return res.json(response.data);
  } catch (error) { return res.status(502).json({ error: 'Failed to fetch FPL bootstrap data.' }); }
});

app.get('/api/fpl/entry/:teamId', async (req, res) => {
  noStore(res);
  if (!validTeamId(req.params.teamId)) return res.status(400).json({ error: 'Invalid Team ID.' });
  try {
    const { client } = createFplClient();
    const response = await client.get(`${FPL_BASE}/entry/${req.params.teamId}/`);
    return res.json(response.data);
  } catch (error) {
    return res.status(error.response?.status === 404 ? 404 : 502).json({ error: 'This Team ID could not be found.' });
  }
});

app.get('/api/fpl/picks/:teamId/:gw', async (req, res) => {
  noStore(res);
  if (!validTeamId(req.params.teamId) || !/^\d+$/.test(req.params.gw)) return res.status(400).json({ error: 'Invalid Team ID or gameweek.' });
  try {
    const { client } = createFplClient();
    const response = await client.get(`${FPL_BASE}/entry/${req.params.teamId}/event/${req.params.gw}/picks/`);
    return res.json(response.data);
  } catch (error) {
    return res.status(error.response?.status || 502).json({ error: 'Failed to fetch current squad picks.' });
  }
});

app.get('/api/fpl/event/:gw/live', async (req, res) => {
  noStore(res);
  if (!/^\d+$/.test(req.params.gw)) return res.status(400).json({ error: 'Invalid gameweek.' });
  try {
    const { client } = createFplClient();
    const response = await client.get(`${FPL_BASE}/event/${req.params.gw}/live/`);
    return res.json(response.data);
  } catch (error) {
    return res.status(error.response?.status || 502).json({ error: 'Failed to fetch live gameweek points.' });
  }
});

// ── GET /api/fpl/element-summary/:playerId ──────────────────────────────────
app.get('/api/fpl/element-summary/:playerId', async (req, res) => {
  noStore(res);
  const playerId = req.params.playerId;
  if (!playerId || !/^\d+$/.test(playerId)) return res.status(400).json({ error: 'Invalid Player ID.' });
  try {
    const { client } = createFplClient();
    const response = await client.get(`${FPL_BASE}/element-summary/${playerId}/`);
    return res.json(response.data);
  } catch (error) {
    return res.status(error.response?.status || 502).json({ error: 'Failed to fetch player element summary.' });
  }
});


// ── GET /api/fpl/leagues-classic/:leagueId/standings ─────────────────────────
app.get('/api/fpl/leagues-classic/:leagueId/standings', async (req, res) => {
  noStore(res);
  const leagueId = req.params.leagueId;
  const page = req.query.page_standings || 1;
  const phase = req.query.phase || 1;
  try {
    const { client } = createFplClient();
    const response = await client.get(`${FPL_BASE}/leagues-classic/${leagueId}/standings/?page_standings=${page}&phase=${phase}`);
    return res.json(response.data);
  } catch (error) {
    console.warn(`[Leagues] Error fetching standings for ${leagueId}:`, error.message);
    return res.status(error.response?.status || 502).json({ error: 'Failed to fetch league standings.' });
  }
});

// ── POST /api/fpl/leagues/join ───────────────────────────────────────────────
app.post('/api/fpl/leagues/join', async (req, res) => {
  const { code } = req.body || {};
  if (!code || !code.trim()) {
    return res.status(400).json({ error: 'League code is required.' });
  }
  try {
    await executeAuthenticatedFplRequest(req, res, async (accessToken) => {
      if (!accessToken) {
        return res.status(401).json({
          error: 'NO_SESSION',
          message: 'Log in with FPL to join private leagues.',
        });
      }
      const { client } = createFplClient(accessToken);
      const joinRes = await client.post(`${FPL_BASE}/leagues/join/private/`, {
        code: code.trim(),
      });
      return res.json({ success: true, data: joinRes.data });
    });
  } catch (err) {
    console.error('[Leagues] Join error:', err.message);
    return res.status(err.response?.status || 500).json({
      error: 'JOIN_FAILED',
      message: err.response?.data?.detail || 'Failed to join league. Please check the code.',
    });
  }
});

const playerPhotoCache = new Map();
const sportsDbNameCache = new Map();
let cachedBootstrapElements = null;
let lastBootstrapFetch = 0;

async function getCachedElements() {
  if (cachedBootstrapElements && Date.now() - lastBootstrapFetch < 30 * 60 * 1000) {
    return cachedBootstrapElements;
  }
  try {
    const { client } = createFplClient();
    const res = await client.get(`${FPL_BASE}/bootstrap-static/`);
    cachedBootstrapElements = res.data?.elements || [];
    lastBootstrapFetch = Date.now();
    return cachedBootstrapElements;
  } catch (_) {
    return cachedBootstrapElements || [];
  }
}

async function searchTheSportsDbCutout(playerName, teamShortName = '') {
  if (!playerName || !playerName.trim()) return null;

  const raw = playerName.trim();
  const cacheKey = raw.toLowerCase();
  const cached = sportsDbNameCache.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.timestamp < 24 * 60 * 60 * 1000) {
    if (cached.notFound) return null;
    return cached.data;
  }

  const normalized = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^[A-Z]\.\s*/i, '')
    .trim();

  const queries = [raw];
  if (normalized && normalized !== raw) queries.push(normalized);

  const parts = normalized.split(/\s+/);
  if (parts.length > 2) {
    queries.push(`${parts[0]} ${parts[parts.length - 1]}`);
  }

  for (const q of queries) {
    try {
      const sUrl = `https://www.thesportsdb.com/api/v1/json/3/searchplayers.php?p=${encodeURIComponent(q)}`;
      const sRes = await axios.get(sUrl, { timeout: 6000 });
      const players = sRes.data?.player || [];
      if (!players || players.length === 0) continue;

      const soccer = players.filter(p => !p.strSport || p.strSport.toLowerCase() === 'soccer');
      if (soccer.length === 0) continue;

      let matchedPlayer = null;
      if (soccer.length === 1) {
        matchedPlayer = soccer[0];
      } else {
        const exactMatch = soccer.find(p => p.strPlayer && p.strPlayer.toLowerCase() === raw.toLowerCase());
        if (exactMatch) {
          matchedPlayer = exactMatch;
        } else if (teamShortName) {
          const teamMatch = soccer.find(p => p.strTeam && p.strTeam.toLowerCase().includes(teamShortName.toLowerCase()));
          if (teamMatch) matchedPlayer = teamMatch;
        }
      }

      if (matchedPlayer) {
        const imgUrl = matchedPlayer.strCutout || matchedPlayer.strRender || matchedPlayer.strThumb;
        if (imgUrl && imgUrl.startsWith('http')) {
          try {
            const imgRes = await axios.get(imgUrl, {
              responseType: 'arraybuffer',
              timeout: 8000,
              headers: { 'User-Agent': FPL_USER_AGENT },
            });
            if (imgRes.status === 200 && imgRes.data && imgRes.data.length > 500) {
              const result = {
                buffer: Buffer.from(imgRes.data),
                contentType: imgRes.headers['content-type'] || 'image/png',
                source: 'thesportsdb',
                matchedName: matchedPlayer.strPlayer,
                imgUrl,
              };
              sportsDbNameCache.set(cacheKey, { data: result, timestamp: now });
              return result;
            }
          } catch (imgErr) {
            console.warn(`[TheSportsDB] Image download failed from ${imgUrl}:`, imgErr.message);
          }
        }
      }
    } catch (err) {
      // lookup error
    }
  }

  sportsDbNameCache.set(cacheKey, { notFound: true, timestamp: now });
  return null;
}

app.get('/api/fpl/player-photo/:photoId', async (req, res) => {
  const cleanId = String(req.params.photoId || '').replace(/^p|\.png|\.jpg/gi, '').trim();
  const forceRefresh = req.query.force === 'true' || req.query.refresh === 'true';
  const version = String(req.query.v || 'v1').trim();

  if (!cleanId || !/^\d+$/.test(cleanId)) {
    return res.status(400).json({ error: 'Valid numeric photo ID is required.' });
  }

  const cacheKey = `${cleanId}_${version}`;
  const cached = playerPhotoCache.get(cacheKey);
  const now = Date.now();
  const ONE_HOUR_MS = 60 * 60 * 1000;

  // 1. Check existing cache (if cached from TheSportsDB or confirmed fallback)
  if (cached && !forceRefresh && (now - cached.timestamp < ONE_HOUR_MS)) {
    res.setHeader('Content-Type', cached.contentType || 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
    res.setHeader('X-Photo-Source', cached.source);
    res.setHeader('X-Cache-Status', 'HIT');
    if (cached.matchedName) res.setHeader('X-Matched-Name', encodeURIComponent(cached.matchedName));
    return res.send(cached.buffer);
  }

  // Resolve player info from bootstrap cache
  let playerName = req.query.name || '';
  let teamShortName = '';
  let webName = '';

  const elements = await getCachedElements();
  const found = elements.find(e => String(e.code) === cleanId || String(e.id) === cleanId || (e.photo && e.photo.includes(cleanId)));
  if (found) {
    if (!playerName) {
      playerName = `${found.first_name || ''} ${found.second_name || ''}`.trim() || found.web_name;
    }
    webName = found.web_name || '';
  }

  console.log(`[Photo Proxy] Request for "${playerName || cleanId}" (photoId=${cleanId}, v=${version})`);

  // 2. Tier 1 (PRIMARY): TheSportsDB Lookup
  if (playerName) {
    console.log(`[Photo Proxy] 🔍 Tier 1 (TheSportsDB Primary) searching for "${playerName}" (webName="${webName}", photoId=${cleanId})...`);
    const sportsDbResult = await searchTheSportsDbCutout(playerName, teamShortName, webName);
    if (sportsDbResult) {
      console.log(`[Photo Proxy] ✅ Tier 1 (TheSportsDB) MATCHED for "${playerName}" (photoId=${cleanId}) -> ${sportsDbResult.matchedName}`);
      playerPhotoCache.set(cacheKey, {
        buffer: sportsDbResult.buffer,
        contentType: sportsDbResult.contentType,
        source: 'thesportsdb',
        matchedName: sportsDbResult.matchedName,
        timestamp: now,
      });

      res.setHeader('Content-Type', sportsDbResult.contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
      res.setHeader('X-Photo-Source', 'thesportsdb');
      res.setHeader('X-Matched-Name', encodeURIComponent(sportsDbResult.matchedName));
      res.setHeader('X-Cache-Status', 'MISS_FETCHED');
      return res.send(sportsDbResult.buffer);
    }
    console.log(`[Photo Proxy] ℹ️ Tier 1 (TheSportsDB) had no confident match for "${playerName}". Falling through to Tier 2 (PL CDN)...`);
  }

  // 3. Tier 2 (FALLBACK): Premier League Official CDN
  const plUrl = `https://resources.premierleague.com/premierleague/photos/players/110x140/p${cleanId}.png`;
  const plHeaders = {
    'User-Agent': FPL_USER_AGENT,
    'Referer': 'https://fantasy.premierleague.com/',
    'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
  };

  try {
    const plRes = await axios.get(plUrl, {
      responseType: 'arraybuffer',
      headers: plHeaders,
      timeout: 8000,
      validateStatus: (status) => status === 200,
    });

    if (plRes.status === 200 && plRes.data && plRes.data.length > 500) {
      console.log(`[Photo Proxy] ✅ Tier 2 (Premier League CDN) SUCCEEDED for photoId=${cleanId}`);
      const contentType = plRes.headers['content-type'] || 'image/png';
      const buffer = Buffer.from(plRes.data);

      playerPhotoCache.set(cacheKey, {
        buffer,
        contentType,
        source: 'premierleague',
        timestamp: now,
      });

      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
      res.setHeader('X-Photo-Source', 'premierleague');
      res.setHeader('X-Cache-Status', 'MISS_FETCHED');
      return res.send(buffer);
    }
  } catch (plErr) {
    console.log(`[Photo Proxy] ⚠️ Tier 2 (Premier League CDN) failed (403/404) for photoId=${cleanId}.`);
  }

  // 4. Tier 3 (FINAL FALLBACK): Both sources failed -> return 404 to render styled club initials avatar in app
  return res.status(404).json({ error: 'PLAYER_PHOTO_NOT_FOUND', photoId: cleanId });
});

// ── Helper: extract session cookie string from jar ──────────────────────────
async function extractSessionCookie(jar, url) {
  const cookies = await jar.getCookies(url);
  const session = cookies.find(c =>
    c.key === 'pl_profile' || c.key === 'sessionid' || c.key.includes('session')
  );
  if (session) return `${session.key}=${session.value}`;

  // fallback: return all cookies as string
  const allCookies = await jar.getCookies('https://fantasy.premierleague.com');
  const plCookies = await jar.getCookies('https://users.premierleague.com');
  const combined = [...allCookies, ...plCookies];
  if (combined.length > 0) {
    return combined.map(c => `${c.key}=${c.value}`).join('; ');
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/fpl-login
// Body: { email, password }
// Returns: { success, teamId, teamName, playerName, session }
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/auth/fpl-login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required.' });
  }

  // 🔒 SECURITY AUDIT: Password used ONLY here, sent directly to FPL's servers.
  // It is NOT stored, logged, or passed to any other endpoint.
  console.log(`[Auth] Login attempt for: ${email.substring(0, 3)}***`);

  try {
    const { client, jar } = createFplClient();

    // Step 1: GET the login page to get CSRF token
    let csrfToken = '';
    try {
      const loginPageRes = await client.get(FPL_LOGIN_URL, {
        headers: { 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' }
      });
      const csrfMatch = loginPageRes.data.match(/csrfmiddlewaretoken['"]\s+value=['"]([^'"]+)['"]/);
      if (csrfMatch) csrfToken = csrfMatch[1];
      if (!csrfToken) {
        const cookieList = await jar.getCookies(FPL_LOGIN_URL);
        const csrfCookie = cookieList.find(c => c.key === 'csrftoken');
        if (csrfCookie) csrfToken = csrfCookie.value;
      }
    } catch (pageErr) {
      console.warn('[Auth] Could not fetch login page for CSRF, continuing without it...');
    }

    // Step 2: POST login credentials to FPL
    const loginBody = new URLSearchParams({
      login: email,
      password: password,
      redirect_uri: 'https://fantasy.premierleague.com/',
      app: 'plfpl-web',
    });
    if (csrfToken) loginBody.append('csrfmiddlewaretoken', csrfToken);

    const loginRes = await client.post(FPL_LOGIN_URL, loginBody.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': FPL_LOGIN_URL,
        ...(csrfToken ? { 'X-CSRFToken': csrfToken } : {}),
      },
    });

    // Step 3: Extract session cookie
    const sessionCookie = await extractSessionCookie(jar, 'https://fantasy.premierleague.com');
    const sessionCookiePL = await extractSessionCookie(jar, 'https://users.premierleague.com');
    const finalSession = sessionCookie || sessionCookiePL;

    if (!finalSession) {
      console.warn('[Auth] No session cookie found after login');
      return res.status(401).json({
        success: false,
        error: 'Login failed. Please check your email and password and try again.',
      });
    }

    // Step 4: Fetch user data to get team ID
    const meRes = await client.get(`${FPL_BASE}/me/`, {
      headers: { Cookie: finalSession }
    });

    const meData = meRes.data;
    if (!meData || !meData.player) {
      return res.status(401).json({
        success: false,
        error: 'Could not retrieve your FPL account. Please try again.',
      });
    }

    const player = meData.player;
    const teamId = player.entry ? String(player.entry) : null;
    const playerName = `${player.first_name || ''} ${player.last_name || ''}`.trim();

    // Step 5: Get team name if teamId exists
    let teamName = 'My FPL Team';
    if (teamId) {
      try {
        const entryRes = await client.get(`${FPL_BASE}/entry/${teamId}/`);
        teamName = entryRes.data.name || teamName;
      } catch (e) {}
    }

    console.log(`[Auth] Login success: ${playerName}, Team ID: ${teamId}`);

    // 🔒 Password is now done — only session cookie returned from here
    return res.json({
      success: true,
      teamId,
      teamName,
      playerName,
      session: finalSession, // Only the session cookie, never the password
    });

  } catch (err) {
    console.error('[Auth] Login error:', err.message);
    const status = err.response?.status;

    if (status === 401 || status === 403) {
      return res.status(401).json({
        success: false,
        error: 'Incorrect email or password. Please try again.',
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Could not connect to FPL servers. Please check your internet connection.',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/bootstrap
// Returns FPL bootstrap-static (players, teams, events)
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/bootstrap', async (req, res) => {
  try {
    const { client } = createFplClient();
    const response = await client.get(`${FPL_BASE}/bootstrap-static/`);
    res.json(response.data);
  } catch (err) {
    console.error('[Bootstrap] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch FPL data.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/team/:id
// Returns team entry data (name, overall rank, points, etc.)
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/team/:id', async (req, res) => {
  try {
    const { client } = createFplClient();
    const response = await client.get(`${FPL_BASE}/entry/${req.params.id}/`);
    res.json(response.data);
  } catch (err) {
    console.error('[Team] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch team data.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/team/:id/history
// Returns season history
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/team/:id/history', async (req, res) => {
  try {
    const { client } = createFplClient();
    const response = await client.get(`${FPL_BASE}/entry/${req.params.id}/history/`);
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch history.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/team/:id/picks/:gw
// Returns picks for a specific gameweek
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/team/:id/picks/:gw', async (req, res) => {
  try {
    const { client } = createFplClient();
    const response = await client.get(`${FPL_BASE}/entry/${req.params.id}/event/${req.params.gw}/picks/`);
    res.json(response.data);
  } catch (err) {
    console.error('[Picks] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch picks.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/team/:id/squad
// Returns the full squad for lineup editing (requires session)
// Header: x-fpl-session: <session_cookie>
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/team/:id/squad (or /api/team/:id/my-team)
// Returns the REAL 15 players selected by the user on official FPL site
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/team/:id/squad', async (req, res) => {
  // Enforce NO CACHING on squad/picks data
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  try {
    await executeAuthenticatedFplRequest(req, res, async (accessToken) => {
      const { client } = createFplClient(accessToken);

      // 1. Try authenticated my-team endpoints (returns real 15 picks for the NEW SEASON)
      const urlsToTry = [
        `${FPL_BASE}/my-team/${req.params.id}/`,
        `${FPL_BASE}/my-team/`,
      ];

      for (const url of urlsToTry) {
        try {
          const myTeamRes = await client.get(url);
          if (myTeamRes.data && myTeamRes.data.picks && myTeamRes.data.picks.length >= 11) {
            console.log(`[Squad] Successfully fetched ${myTeamRes.data.picks.length} picks from ${url}`);
            return res.json({
              picks: myTeamRes.data.picks,
              chips: myTeamRes.data.chips,
              transfers: myTeamRes.data.transfers,
            });
          }
        } catch (e) {
          if (e.response?.status === 401 || e.response?.status === 403) {
            throw e;
          }
          console.warn(`[Squad] ${url} failed, trying next...`);
        }
      }

      // 2. Fallback to real public GW picks endpoint if my-team is unavailable
      try {
        const bootstrapRes = await client.get(`${FPL_BASE}/bootstrap-static/`);
        const currentGW = bootstrapRes.data.events?.find(e => e.is_current)?.id
          || bootstrapRes.data.events?.find(e => e.is_next)?.id
          || 1;

        const gwPicksRes = await client.get(`${FPL_BASE}/entry/${req.params.id}/event/${currentGW}/picks/`);
        if (gwPicksRes.data && gwPicksRes.data.picks && gwPicksRes.data.picks.length >= 11) {
          console.log(`[Squad] Fetched real GW ${currentGW} picks for Team ID: ${req.params.id}`);
          return res.json({
            picks: gwPicksRes.data.picks,
            chips: gwPicksRes.data.chips || [],
            transfers: gwPicksRes.data.transfers || null,
          });
        }
      } catch (gwErr) {
        console.warn(`[Squad] GW picks fetch failed: ${gwErr.message}`);
      }

      // 3. No fake squad substitution — return a clear error state so frontend displays honest error
      console.warn(`[Squad] Could not retrieve real squad for Team ID: ${req.params.id}`);
      return res.status(502).json({
        error: "Couldn't load your squad — pull to refresh.",
      });
    });
  } catch (err) {
    if (!res.headersSent) {
      console.error('[Squad] Error:', err.message);
      res.status(err.response?.status || 500).json({ error: 'Failed to fetch squad.' });
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/fixtures & /api/fpl/fixtures
// Returns all fixtures
// ─────────────────────────────────────────────────────────────────────────────
app.get(['/api/fixtures', '/api/fpl/fixtures'], async (req, res) => {
  noStore(res);
  try {
    const { client } = createFplClient();
    const response = await client.get(`${FPL_BASE}/fixtures/`);
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch fixtures.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/team/transfers
// Submit transfers (requires authenticated session)
// Header: x-fpl-session: <session_cookie>
// Body: { transfers: [{element_in, element_out, purchase_price, selling_price}], chip, event }
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/team/transfers', async (req, res) => {
  const passedCsrf = req.headers['x-fpl-csrf'] || req.body.csrfToken || null;
  const { teamId, gameweek, transfers } = req.body || {};

  if (!transfers || !Array.isArray(transfers) || transfers.length === 0) {
    return res.status(400).json({ success: false, message: 'Invalid transfer payload.' });
  }

  try {
    await executeAuthenticatedFplRequest(req, res, async (accessToken) => {
      if (!accessToken) {
        return res.status(401).json({
          success: false,
          error: 'NO_SESSION',
          message: 'Log in with your FPL account to make transfers from the app.',
        });
      }

      const { client, jar } = createFplClient(accessToken);

      let csrfToken = passedCsrf;
      if (!csrfToken) {
        try {
          await client.get('https://fantasy.premierleague.com/');
          const freshCookies = await jar.getCookies('https://fantasy.premierleague.com');
          const freshCsrf = freshCookies.find(c => c.key === 'csrftoken');
          if (freshCsrf) csrfToken = freshCsrf.value;
        } catch (e) {}
      }

      const fplPayload = {
        entry: Number(teamId),
        event: Number(gameweek),
        transfers: transfers.map(t => ({
          element_in: Number(t.element_in),
          element_out: Number(t.element_out),
          purchase_price: Number(t.purchase_price || 0),
          selling_price: Number(t.selling_price || 0),
        })),
        chip: req.body.chip || null,
        confirmed: true,
      };

      console.log('[Transfers] Submitting to FPL:', JSON.stringify(fplPayload));

      const transferRes = await client.post(
        `${FPL_BASE}/transfers/`,
        fplPayload,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': csrfToken,
            'Referer': 'https://fantasy.premierleague.com/transfers',
            'X-Requested-With': 'XMLHttpRequest',
          },
        }
      );

      console.log('[Transfers] FPL response:', transferRes.status, transferRes.data);
      return res.json({ success: true, message: 'Transfer completed successfully!', data: transferRes.data });
    });
  } catch (err) {
    if (!res.headersSent) {
      console.error('[Transfers] FPL Error:', err.response?.status, err.response?.data || err.message);
      const status = err.response?.status;
      return res.status(status || 500).json({
        success: false,
        message: err.response?.data?.detail || 'Transfer failed.',
        details: err.response?.data,
      });
    }
  }
});


// ─────────────────────────────────────────────────────────────────────────────
// POST /api/team/lineup
// Save lineup (captain, vice-captain, formation, subs order)
// Header: x-fpl-session: <access_token>, x-fpl-csrf: <csrf_token>
// Body: { teamId, picks: [{ element, position, is_captain, is_vice_captain }], chip }
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/team/lineup', async (req, res) => {
  const passedCsrf = req.headers['x-fpl-csrf'] || req.body.csrfToken || null;
  const { teamId, picks, chip } = req.body || {};

  if (!teamId || !validTeamId(teamId)) {
    return res.status(400).json({ success: false, error: 'INVALID_TEAM_ID', message: 'Valid Team ID is required.' });
  }

  try {
    await executeAuthenticatedFplRequest(req, res, async (accessToken) => {
      if (!accessToken) {
        return res.status(401).json({ success: false, error: 'NO_SESSION', message: 'Log in with FPL to save lineup.' });
      }

      const { client, jar } = createFplClient(accessToken, passedCsrf);

      let csrfToken = passedCsrf;
      if (!csrfToken) {
        try {
          await client.get('https://fantasy.premierleague.com/');
          const freshCookies = await jar.getCookies('https://fantasy.premierleague.com');
          const freshCsrf = freshCookies.find(c => c.key === 'csrftoken');
          if (freshCsrf) csrfToken = freshCsrf.value;
        } catch (e) {}
      }

      const fplPayload = {
        chip: chip || null,
        picks: (picks || []).map((p, idx) => ({
          element: Number(p.element || p.id),
          position: Number(p.position || idx + 1),
          is_captain: Boolean(p.is_captain),
          is_vice_captain: Boolean(p.is_vice_captain),
        })),
      };

      console.log(`[Lineup] Submitting lineup to FPL endpoint: POST https://fantasy.premierleague.com/api/my-team/${teamId}/`);
      const lineupRes = await client.post(
        `${FPL_BASE}/my-team/${teamId}/`,
        fplPayload,
        {
          headers: {
            'Content-Type': 'application/json',
            ...(csrfToken ? { 'x-csrftoken': csrfToken } : {}),
            'Referer': 'https://fantasy.premierleague.com/my-team',
            'X-Requested-With': 'XMLHttpRequest',
          },
        }
      );

      console.log('[Lineup] FPL response status:', lineupRes.status);
      return res.json({ success: true, data: lineupRes.data });
    });
  } catch (err) {
    if (!res.headersSent) {
      console.error('[Lineup] FPL Error:', err.response?.status, err.response?.data || err.message);
      return res.status(err.response?.status || 500).json({
        success: false,
        error: err.response?.data?.detail || err.response?.data?.message || 'Could not save lineup to FPL.',
        details: err.response?.data,
      });
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/me
// Get my team info (requires session)
// Header: x-fpl-session: <session_cookie>
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/me', async (req, res) => {
  try {
    await executeAuthenticatedFplRequest(req, res, async (accessToken) => {
      if (!accessToken) return res.status(401).json({ error: 'Session required.' });
      const { client } = createFplClient(accessToken);
      const meRes = await client.get(`${FPL_BASE}/me/`);
      return res.json(meRes.data);
    });
  } catch (err) {
    if (!res.headersSent) {
      res.status(err.response?.status || 500).json({ error: 'Failed to fetch account data.' });
    }
  }
});

// ── AI Insights & Chat System (Official Google GenAI SDK + Exponential Backoff) ────
const insightCache = new Map();

// Active, confirmed Gemini models in fallback order (handles 404/429 smoothly)
const GEMINI_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.7-flash',
  'gemini-flash-latest',
  'gemini-3.5-flash',
  'gemini-2.5-pro',
];

/**
 * Robust Gemini Content Generator with:
 * 1. Multi-model failover pool (handles 404 deprecation and 429 quota exhaustion)
 * 2. Exponential backoff retry on 503 (1s -> 2s -> 4s)
 * 3. 20-second timeout
 * 4. finishReason validation and high maxOutputTokens (1000)
 */
async function generateGeminiContentWithRetry({ apiKey, systemInstruction, contents, generationConfig = {}, maxRetries = 2 }) {
  if (!apiKey) {
    return { success: false, errorType: 'NO_KEY', message: 'GEMINI_API_KEY is not configured.' };
  }

  const genAI = new GoogleGenerativeAI(apiKey);

  for (const modelName of GEMINI_MODELS) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[Gemini SDK] 🚀 (Model: ${modelName} | Attempt ${attempt}/${maxRetries}) Sending request...`);
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
          generationConfig: {
            temperature: 0.6,
            maxOutputTokens: 1000,
            ...generationConfig,
          },
        });

        // 20-second timeout
        let timeoutHandle;
        const timeoutPromise = new Promise((_, reject) => {
          timeoutHandle = setTimeout(() => reject(new Error('TIMEOUT: Gemini request exceeded 20s limit')), 20000);
        });

        const resultPromise = model.generateContent({ contents });
        const result = await Promise.race([resultPromise, timeoutPromise]);
        clearTimeout(timeoutHandle);

        const response = await result.response;
        const candidate = response.candidates?.[0];
        const finishReason = candidate?.finishReason || 'STOP';
        const text = response.text()?.trim() || '';

        console.log(`[Gemini SDK] ✅ SUCCESS from ${modelName} | finishReason="${finishReason}" | length=${text.length} chars`);

        if (finishReason === 'MAX_TOKENS') {
          console.warn(`[Gemini SDK] ⚠️ Warning: Response reached MAX_TOKENS limit (${text.length} chars).`);
        }

        return {
          success: true,
          text,
          finishReason,
          model: modelName,
        };
      } catch (err) {
        const status = err.status || err.response?.status;
        const errMsg = err.message || '';
        const isRateLimit = status === 429 || errMsg.includes('429') || errMsg.includes('Quota exceeded') || errMsg.includes('quota');
        const is503Overload = status === 503 || errMsg.includes('503') || errMsg.includes('high demand') || errMsg.includes('overloaded');
        const is404NotFound = status === 404 || errMsg.includes('404') || errMsg.includes('not found') || errMsg.includes('no longer available');
        const isTimeout = errMsg.includes('TIMEOUT');

        console.warn(`[Gemini SDK] ⚠️ Attempt ${attempt}/${maxRetries} on ${modelName} failed (status=${status || 'none'}): ${errMsg.slice(0, 100)}`);

        // If 404 or 429 (quota exhausted on this model), immediately switch to next model in pool without wasting retry loops!
        if (is404NotFound || isRateLimit) {
          console.warn(`[Gemini SDK] 🔄 Model "${modelName}" ${isRateLimit ? 'hit rate limit (429)' : 'not found (404)'}. Immediately trying next model.`);
          break;
        }

        if (attempt < maxRetries && (is503Overload || isTimeout)) {
          const delay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s
          console.log(`[Gemini SDK] ⏳ Backing off for ${delay}ms before retry ${attempt + 1}...`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
      }
    }
  }

  return {
    success: false,
    errorType: 'AI_UNAVAILABLE',
    message: 'The AI service is temporarily busy or unreachable. Please try again in a moment.',
  };
}

async function computeRuleBasedInsights(teamId, accessToken = null) {
  const { client } = createFplClient(accessToken);

  const [bootstrapRes, fixturesRes] = await Promise.all([
    client.get(`${FPL_BASE}/bootstrap-static/`),
    client.get(`${FPL_BASE}/fixtures/`).catch(() => ({ data: [] })),
  ]);

  const bootstrap = bootstrapRes.data || {};
  const elements = bootstrap.elements || [];
  const teams = bootstrap.teams || [];
  const events = bootstrap.events || [];
  const fixtures = fixturesRes.data || [];

  const elementsMap = new Map(elements.map(e => [e.id, e]));

  const currentGW = events.find(e => e.is_current)?.id || events.find(e => e.is_next)?.id || 1;
  const nextGW = events.find(e => e.is_next)?.id || currentGW;

  let picks = [];
  let bankTenths = 0;
  let teamName = '';
  let managerName = '';

  try {
    const entryRes = await client.get(`${FPL_BASE}/entry/${teamId}/`).catch(() => null);
    if (entryRes?.data) {
      teamName = entryRes.data.name || '';
      managerName = `${entryRes.data.player_first_name || ''} ${entryRes.data.player_last_name || ''}`.trim();
      if (entryRes.data.last_deadline_bank !== undefined) {
        bankTenths = entryRes.data.last_deadline_bank;
      }
    }

    if (accessToken) {
      const squadRes = await client.get(`${FPL_BASE}/my-team/${teamId}/`).catch(() => null);
      if (squadRes?.data?.picks?.length >= 11) {
        picks = squadRes.data.picks;
        if (squadRes.data.transfers?.bank !== undefined) {
          bankTenths = squadRes.data.transfers.bank;
        }
      }
    }
    if (picks.length === 0) {
      const gwPicksRes = await client.get(`${FPL_BASE}/entry/${teamId}/event/${currentGW}/picks/`).catch(() => null);
      if (gwPicksRes?.data?.picks?.length >= 11) {
        picks = gwPicksRes.data.picks;
      }
    }
  } catch (err) {
    console.warn('[computeRuleBasedInsights] Error fetching team picks:', err.message);
  }

  if (picks.length === 0) {
    const topElements = [...elements].sort((a, b) => (b.total_points || 0) - (a.total_points || 0)).slice(0, 15);
    picks = topElements.map((el, i) => ({ element: el.id, position: i + 1 }));
  }

  const squadElements = picks
    .map(p => elementsMap.get(p.element))
    .filter(Boolean);

  // A) Captain candidate (highest form in starting XI)
  const startingXI = squadElements.slice(0, 11);
  const bestCaptainEl = [...startingXI].sort((a, b) => {
    const formA = parseFloat(a.form || '0');
    const formB = parseFloat(b.form || '0');
    if (formB !== formA) return formB - formA;
    return (b.total_points || 0) - (a.total_points || 0);
  })[0] || squadElements[0];

  let bestCaptain = null;
  if (bestCaptainEl) {
    const nextFix = fixtures.find(f => f.event === nextGW && (f.team_h === bestCaptainEl.team || f.team_a === bestCaptainEl.team));
    const isHome = nextFix ? nextFix.team_h === bestCaptainEl.team : true;
    const fixtureDiff = nextFix ? (isHome ? nextFix.team_h_difficulty : nextFix.team_a_difficulty) : 3;
    bestCaptain = {
      id: bestCaptainEl.id,
      name: bestCaptainEl.web_name,
      form: bestCaptainEl.form || '0.0',
      totalPoints: bestCaptainEl.total_points || 0,
      fixtureDiff,
      status: bestCaptainEl.status,
    };
  }

  // B) Transfer Suggestion
  let topTransferSuggestion = null;
  const underperformers = [...squadElements]
    .filter(el => (el.chance_of_playing_next_round !== null && el.chance_of_playing_next_round < 75) || parseFloat(el.form || '0') < 2.5)
    .sort((a, b) => parseFloat(a.form || '0') - parseFloat(b.form || '0'));

  for (const outPlayer of underperformers) {
    const maxBudget = (outPlayer.now_cost || 0) + bankTenths;
    const candidates = elements
      .filter(el =>
        el.element_type === outPlayer.element_type &&
        el.id !== outPlayer.id &&
        (el.now_cost || 0) <= maxBudget &&
        (el.chance_of_playing_next_round === null || el.chance_of_playing_next_round >= 75) &&
        parseFloat(el.form || '0') > parseFloat(outPlayer.form || '0') + 1.5
      )
      .sort((a, b) => parseFloat(b.form || '0') - parseFloat(a.form || '0'));

    if (candidates.length > 0) {
      const inPlayer = candidates[0];
      topTransferSuggestion = {
        outId: outPlayer.id,
        outName: outPlayer.web_name,
        outCost: ((outPlayer.now_cost || 0) / 10).toFixed(1),
        outForm: outPlayer.form || '0.0',
        inId: inPlayer.id,
        inName: inPlayer.web_name,
        inCost: ((inPlayer.now_cost || 0) / 10).toFixed(1),
        inForm: inPlayer.form || '0.0',
      };
      break;
    }
  }

  // C) Injury / Availability Alerts
  const injuryAlerts = squadElements
    .filter(el => (el.chance_of_playing_next_round !== null && el.chance_of_playing_next_round < 100) || (el.status && el.status !== 'a'))
    .map(el => ({
      name: el.web_name,
      chance: el.chance_of_playing_next_round,
      news: el.news || 'Availability concern reported by FPL',
    }));

  return {
    captainCandidate: bestCaptain,
    transferSuggestion: topTransferSuggestion,
    injuryAlerts,
    currentGW,
    nextGW,
    bankTenths,
    teamName,
    managerName,
    elements,
    teams,
    fixtures,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ai/insight
// Body: { teamId }
// Header: x-fpl-session: <access_token> (optional)
// Returns: { insightEn, insightAr, cached, source: 'gemini' | 'groq' | 'fallback' }
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/ai/insight', async (req, res) => {
  const { teamId, forceRefresh: bodyForce } = req.body || {};
  const queryForce = req.query?.forceRefresh === 'true';
  const forceRefresh = Boolean(bodyForce || queryForce);

  const accessToken = req.headers['x-fpl-session'] || req.body?.accessToken || null;

  const effectiveTeamId = String(teamId || '1763262').trim();
  const cacheKey = `team_${effectiveTeamId}`;

  // 1. Check 24-hour cache unless forceRefresh is true
  const cachedItem = insightCache.get(cacheKey);
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

  if (!forceRefresh && cachedItem && (Date.now() - cachedItem.timestamp < TWENTY_FOUR_HOURS_MS)) {
    console.log(`[AI Insight] Returning CACHED insight for team ${effectiveTeamId} (age: ${Math.round((Date.now() - cachedItem.timestamp) / 1000 / 60)} mins)`);
    return res.json({ ...cachedItem.data, cached: true });
  }

  console.log(`[AI Insight] Computing fresh insight for team ${effectiveTeamId} (forceRefresh: ${forceRefresh})...`);

  let ruleData = null;
  try {
    ruleData = await computeRuleBasedInsights(effectiveTeamId, accessToken);
  } catch (ruleErr) {
    console.warn('[AI Insight] Rule-based computation warning:', ruleErr.message);
  }

  const cap = ruleData?.captainCandidate;
  const trans = ruleData?.transferSuggestion;
  const injuries = ruleData?.injuryAlerts || [];

  const geminiApiKey = process.env.GEMINI_API_KEY;
  const groqApiKey = process.env.GROQ_API_KEY;
  let insightEn = null;
  let insightAr = null;
  let source = 'fallback';

  const compactPrompt = `FPL Structured Data:
- Recommended Captain: ${cap ? `${cap.name} (Form: ${cap.form}, Fixture Difficulty: ${cap.fixtureDiff}/5)` : 'None'}
- Suggested Transfer: ${trans ? `Out: ${trans.outName}, In: ${trans.inName} (Form: ${trans.inForm})` : 'None'}
- Availability Warnings: ${injuries.length > 0 ? injuries.map(i => `${i.name} (${i.news})`).join('; ') : 'None'}

Return ONLY a valid JSON object matching this schema:
{
  "insightEn": "1-2 sentence advice in English mentioning the recommended captain/transfer",
  "insightAr": "Natural Arabic translation of the exact same advice (same player, same reasoning)"
}`;

  // 1. Try Gemini API with SDK
  if (geminiApiKey) {
    const geminiRes = await generateGeminiContentWithRetry({
      apiKey: geminiApiKey,
      systemInstruction: 'You are a top-ranked Fantasy Premier League (FPL) expert. Output ONLY a valid JSON object with keys "insightEn" and "insightAr".',
      contents: [{ role: 'user', parts: [{ text: compactPrompt }] }],
      generationConfig: {
        temperature: 0.3,
        responseMimeType: 'application/json',
      },
    });

    if (geminiRes.success && geminiRes.text) {
      try {
        const parsed = JSON.parse(geminiRes.text);
        if (parsed.insightEn && parsed.insightAr) {
          insightEn = parsed.insightEn;
          insightAr = parsed.insightAr;
          source = 'gemini';
          console.log('[AI Insight] ✅ Gemini dual-language insight parsed successfully!');
        }
      } catch (jsonErr) {
        console.warn('[AI Insight] Failed to parse JSON from Gemini text:', geminiRes.text);
      }
    }
  }

  // 2. Try Groq API as secondary if Gemini didn't return insight
  if (groqApiKey && (!insightEn || !insightAr)) {
    try {
      console.log('[AI Insight] Calling Groq API for dual-language JSON (llama-3.3-70b-versatile)...');
      const groqResponse = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: 'llama-3.3-70b-versatile',
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: 'You are a top-ranked Fantasy Premier League (FPL) expert. Output ONLY valid JSON containing keys "insightEn" and "insightAr".',
            },
            {
              role: 'user',
              content: compactPrompt,
            },
          ],
          temperature: 0.5,
          max_tokens: 250,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${groqApiKey}`,
          },
          timeout: 10000,
        }
      );

      const content = groqResponse.data?.choices?.[0]?.message?.content?.trim();
      if (content) {
        try {
          const parsed = JSON.parse(content);
          if (parsed.insightEn && parsed.insightAr) {
            insightEn = parsed.insightEn;
            insightAr = parsed.insightAr;
            source = 'groq';
            console.log('[AI Insight] ✅ Dual-language Groq JSON received successfully!');
          }
        } catch (jsonErr) {
          console.warn('[AI Insight] Failed to parse JSON from Groq content:', content);
        }
      }
    } catch (groqErr) {
      console.warn(`[AI Insight] Groq API call failed:`, groqErr.response?.data?.error?.message || groqErr.message);
    }
  }

  // Fallback template generator if cloud LLMs failed or returned incomplete JSON
  if (!insightEn || !insightAr) {
    if (cap) {
      insightEn = `${cap.name} is in strong form (${cap.form}) with a favorable fixture — consider giving him the captain armband this week.`;
      insightAr = `${cap.name} في حالة قوية (معدل فورم ${cap.form}) ومباراته القادمة جيدة — فكّر في إعطائه شارة الكابتن هذا الأسبوع.`;

      if (trans) {
        insightEn += ` Consider transferring out ${trans.outName} for ${trans.inName}.`;
        insightAr += ` نوصي ببيع ${trans.outName} وشراء ${trans.inName}.`;
      }
    } else {
      insightEn = 'Roll your free transfer this week to maximize flexibility for upcoming gameweeks.';
      insightAr = 'أجّل التغيير المجاني هذه الجولة لزيادة المرونة في الجولات القادمة.';
    }
  }

  const responseData = {
    insightEn,
    insightAr,
    structuredData: {
      captain: cap ? {
        name: cap.name,
        form: cap.form,
        totalPoints: cap.totalPoints,
        fixtureDiff: cap.fixtureDiff,
        status: cap.status,
      } : null,
      transfer: trans ? {
        outName: trans.outName,
        inName: trans.inName,
        inForm: trans.inForm,
        inCost: trans.inCost,
      } : null,
      injuries: injuries || [],
    },
    source,
    timestamp: new Date().toISOString(),
  };

  insightCache.set(cacheKey, {
    timestamp: Date.now(),
    data: responseData,
  });

  return res.json({ ...responseData, cached: false });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ai/chat
// Body: { teamId, message, conversationHistory }
// Header: x-fpl-session: <access_token> (optional)
// Returns: { reply, referencedPlayer?: FPLPlayer }
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/ai/chat', async (req, res) => {
  const { teamId, message, conversationHistory = [] } = req.body || {};
  const accessToken = req.headers['x-fpl-session'] || req.body?.accessToken || null;
  const effectiveTeamId = String(teamId || '1763262').trim();

  console.log(`[AI Chat] 📩 Incoming message | teamId="${effectiveTeamId}" | message="${message}" | historyLength=${conversationHistory.length}`);

  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message is required.' });
  }

  try {
    // Get live data context
    let ruleData = null;
    let bootstrapData = null;
    try {
      const { client } = createFplClient(accessToken);
      const bRes = await client.get(`${FPL_BASE}/bootstrap-static/`);
      bootstrapData = bRes.data;
      ruleData = await computeRuleBasedInsights(effectiveTeamId, accessToken);
    } catch (err) {
      console.warn('[AI Chat] Warning getting context:', err.message);
    }

    const elements = ruleData?.elements || bootstrapData?.elements || [];
    const teams = ruleData?.teams || bootstrapData?.teams || [];
    const teamMap = new Map(teams.map(t => [t.id, t.short_name || t.name]));

    const cap = ruleData?.captainCandidate;
    const trans = ruleData?.transferSuggestion;
    const injuries = ruleData?.injuryAlerts || [];
    const currentGW = ruleData?.currentGW || 1;
    const nextGW = ruleData?.nextGW || currentGW;
    const bankTenths = ruleData?.bankTenths ?? 0;
    const budgetInM = (bankTenths / 10).toFixed(1);

    const nextGwFixtures = (ruleData?.fixtures || [])
      .filter(f => f.event === nextGW)
      .slice(0, 10)
      .map(f => `${teamMap.get(f.team_h) || f.team_h} vs ${teamMap.get(f.team_a) || f.team_a}`)
      .join(', ');

    console.log(`[AI Chat] 🧠 Grounded Context: GW${currentGW} | NextGW${nextGW} | Bank=£${budgetInM}m | Manager="${ruleData?.managerName || ''}" | Captain="${cap?.name || 'None'}" | Transfer="${trans ? `${trans.outName} -> ${trans.inName}` : 'None'}" | Injuries=${injuries.length}`);

    // Detect Arabic
    const isArabic = /[\u0600-\u06FF]/.test(message);
    const geminiApiKey = process.env.GEMINI_API_KEY;
    const groqApiKey = process.env.GROQ_API_KEY;
    let reply = '';
    let referencedPlayer = null;

    const systemPrompt = `You are an elite Fantasy Premier League (FPL) AI expert and tactician named FPL Assistant.
Manager's Live FPL Context:
- Current Gameweek: GW${currentGW} (Next Gameweek: GW${nextGW})
- Bank Budget: £${budgetInM}m
- Recommended Captain: ${cap ? `${cap.name} (Form: ${cap.form}, Fixture Difficulty: ${cap.fixtureDiff}/5)` : 'None'}
- Suggested Transfer: ${trans ? `Out: ${trans.outName} -> In: ${trans.inName} (Form: ${trans.inForm}, £${trans.inCost}m)` : 'Roll transfer'}
- Active Availability Alerts: ${injuries.length > 0 ? injuries.map(i => `${i.name}: ${i.news} (${i.chance ?? '?'}%)`).join('; ') : 'All 15 players 100% fit'}
- Upcoming Fixtures: ${nextGwFixtures || 'Consult standard PL schedule'}

Guidelines:
1. Provide expert, insightful, and complete answers (2 to 4 sentences maximum). Always finish your thoughts completely.
2. If the user asks in Arabic, reply in fluent, natural Egyptian/Arab FPL community language (friendly and tactically sharp). If in English, reply in English.
3. If the user engages in banter or jokes, reply with good football humor.
4. When mentioning specific players, always use their exact official FPL web names (e.g. Haaland, Salah, Palmer, Saka, Gabriel, Raya, Becker, Isak, Watkins).`;

    // 1. Try Gemini API with SDK & exponential backoff
    if (geminiApiKey && !reply) {
      const geminiContents = [
        ...conversationHistory.slice(-8).map((m) => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.content || '' }],
        })),
        {
          role: 'user',
          parts: [{ text: message }],
        },
      ];

      const geminiResult = await generateGeminiContentWithRetry({
        apiKey: geminiApiKey,
        systemInstruction: systemPrompt,
        contents: geminiContents,
        generationConfig: {
          temperature: 0.65,
          maxOutputTokens: 1000,
        },
      });

      if (geminiResult.success && geminiResult.text) {
        reply = geminiResult.text;
      } else {
        console.warn(`[AI Chat] Gemini generation failed: ${geminiResult.message}`);
      }
    }

    // 2. Try Groq API if Gemini wasn't available or failed
    if (groqApiKey && !reply) {
      try {
        console.log(`[AI Chat] 🚀 Calling Groq API with model "llama-3.3-70b-versatile"...`);
        const formattedMessages = [
          { role: 'system', content: systemPrompt },
          ...conversationHistory.slice(-6).map(m => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.content || '',
          })),
          { role: 'user', content: message },
        ];
        const groqResponse = await axios.post(
          'https://api.groq.com/openai/v1/chat/completions',
          {
            model: 'llama-3.3-70b-versatile',
            messages: formattedMessages,
            temperature: 0.6,
            max_tokens: 500,
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${groqApiKey}`,
            },
            timeout: 15000,
          }
        );

        reply = groqResponse.data?.choices?.[0]?.message?.content?.trim() || '';
        console.log(`[AI Chat] ✅ Groq API replied (${reply.length} chars): "${reply.slice(0, 80)}..."`);
      } catch (groqErr) {
        console.warn(`[AI Chat] ⚠️ Groq call failed:`, groqErr.response?.data?.error?.message || groqErr.message);
      }
    }

    // 3. If AI replied successfully, find referenced player card
    if (reply) {
      if (elements.length > 0) {
        const found = elements
          .filter(el => el.web_name && el.web_name.length >= 4 && reply.toLowerCase().includes(el.web_name.toLowerCase()))
          .sort((a, b) => (b.total_points || 0) - (a.total_points || 0))[0];
        if (found) referencedPlayer = found;
      }

      let playerPayload = null;
      if (referencedPlayer) {
        playerPayload = {
          id: referencedPlayer.id,
          code: referencedPlayer.code,
          web_name: referencedPlayer.web_name,
          first_name: referencedPlayer.first_name,
          second_name: referencedPlayer.second_name,
          element_type: referencedPlayer.element_type,
          team: referencedPlayer.team,
          team_short: teamMap.get(referencedPlayer.team) || 'PL',
          form: referencedPlayer.form || '0.0',
          now_cost: referencedPlayer.now_cost || 0,
          total_points: referencedPlayer.total_points || 0,
        };
      }

      return res.json({
        reply,
        referencedPlayer: playerPayload,
        budget: budgetInM,
        currentGW,
      });
    }

    // 4. If AI call completely failed (e.g. 503 after all retries or offline), return an HONEST error (NEVER mask it with fake squad answers)
    console.warn('[AI Chat] ❌ Cloud AI unavailable. Returning honest error state.');
    return res.status(503).json({
      error: 'AI_TEMPORARILY_BUSY',
      reply: isArabic
        ? '⚠️ المساعد الذكي مشغول حالياً بسبب ضغط الطلبات على خوادم الذكاء الاصطناعي. يرجى إعادة المحاولة بعد لحظات.'
        : '⚠️ The AI Assistant is temporarily busy due to high server demand. Please try again in a moment.',
    });
  } catch (err) {
    console.error('[AI Chat] Unhandled error:', err.message, err);
    return res.status(500).json({ error: 'Failed to process AI chat request.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /health
// Health check
// ─────────────────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'FPL Assistant Backend', timestamp: new Date().toISOString() });
});

// ── Start Server ────────────────────────────────────────────────────────────
const HOST = '0.0.0.0'; // Bind to ALL network interfaces so physical mobile phones on Wi-Fi can connect!

app.listen(PORT, HOST, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║  FPL Assistant Backend Server                             ║
║  Listening on ALL interfaces (0.0.0.0:${PORT})             ║
║                                                           ║
║  🌐 LAN Access: http://192.168.1.10:${PORT}                 ║
║  🏠 Local Access: http://localhost:${PORT}                 ║
║                                                           ║
║  🔒 Security Model:                                       ║
║  - Passwords never stored/logged                          ║
║  - Only session cookies persisted                         ║
║  - All FPL calls proxied server-side                      ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

module.exports = app;
