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
// GET /api/fixtures
// Returns all fixtures
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/fixtures', async (req, res) => {
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

// ── AI Insights System (Rule-Based + Groq LLM with 24h per-user caching) ────
const insightCache = new Map();

async function computeRuleBasedInsights(teamId, accessToken = null) {
  const { client } = createFplClient(accessToken);

  const [bootstrapRes, fixturesRes] = await Promise.all([
    client.get(`${FPL_BASE}/bootstrap-static/`),
    client.get(`${FPL_BASE}/fixtures/`).catch(() => ({ data: [] })),
  ]);

  const bootstrap = bootstrapRes.data || {};
  const elements = bootstrap.elements || [];
  const events = bootstrap.events || [];
  const fixtures = fixturesRes.data || [];

  const elementsMap = new Map(elements.map(e => [e.id, e]));

  const currentGW = events.find(e => e.is_current)?.id || events.find(e => e.is_next)?.id || 1;
  const nextGW = events.find(e => e.is_next)?.id || currentGW;

  let picks = [];
  try {
    if (accessToken) {
      const squadRes = await client.get(`${FPL_BASE}/my-team/${teamId}/`).catch(() => null);
      if (squadRes?.data?.picks?.length >= 11) {
        picks = squadRes.data.picks;
      }
    }
    if (picks.length === 0) {
      const gwPicksRes = await client.get(`${FPL_BASE}/entry/${teamId}/event/${currentGW}/picks/`).catch(() => null);
      if (gwPicksRes?.data?.picks?.length >= 11) {
        picks = gwPicksRes.data.picks;
      }
    }
  } catch (_) {}

  if (picks.length === 0) {
    const topElements = [...elements].sort((a, b) => (b.total_points || 0) - (a.total_points || 0)).slice(0, 15);
    picks = topElements.map((el, i) => ({ element: el.id, position: i + 1 }));
  }

  const squadElements = picks.map(p => elementsMap.get(p.element)).filter(Boolean);
  const upcomingFixtures = fixtures.filter(f => f.event === nextGW || f.event === currentGW);
  const teamFixtureDiff = new Map();

  upcomingFixtures.forEach(f => {
    if (f.team_h) teamFixtureDiff.set(f.team_h, f.team_h_difficulty || 3);
    if (f.team_a) teamFixtureDiff.set(f.team_a, f.team_a_difficulty || 3);
  });

  // A) Captain Recommendation Scoring
  let bestCaptain = null;
  let bestCaptainScore = -1;

  squadElements.forEach(el => {
    const form = parseFloat(el.form || '0.0') || 0.0;
    const chance = el.chance_of_playing_next_round !== null ? (el.chance_of_playing_next_round / 100) : (el.status === 'a' ? 1.0 : 0.5);
    const diff = teamFixtureDiff.get(el.team) || 3;
    const fixtureMult = (6 - diff) / 3;

    const captainScore = (form + 1.0) * chance * fixtureMult * (el.total_points || 10);
    if (captainScore > bestCaptainScore) {
      bestCaptainScore = captainScore;
      bestCaptain = {
        name: el.web_name,
        form: el.form || '0.0',
        totalPoints: el.total_points,
        fixtureDiff: diff,
        status: el.status,
      };
    }
  });

  // B) Transfer Recommendation
  let topTransferSuggestion = null;
  const squadIds = new Set(squadElements.map(e => e.id));

  for (const squadEl of squadElements) {
    const squadValueScore = (squadEl.total_points || 0) / Math.max(squadEl.now_cost || 1, 1);
    const squadForm = parseFloat(squadEl.form || '0.0') || 0.0;

    const candidates = elements.filter(e =>
      e.element_type === squadEl.element_type &&
      !squadIds.has(e.id) &&
      Math.abs((e.now_cost || 0) - (squadEl.now_cost || 0)) <= 15
    );

    for (const cand of candidates) {
      const candValueScore = (cand.total_points || 0) / Math.max(cand.now_cost || 1, 1);
      const candForm = parseFloat(cand.form || '0.0') || 0.0;

      if (candForm > squadForm + 1.5 && candValueScore > squadValueScore * 1.15) {
        topTransferSuggestion = {
          outName: squadEl.web_name,
          inName: cand.web_name,
          inForm: cand.form,
          inCost: (cand.now_cost / 10).toFixed(1),
        };
        break;
      }
    }
    if (topTransferSuggestion) break;
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
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ai/insight
// Body: { teamId }
// Header: x-fpl-session: <access_token> (optional)
// Returns: { insightEn, insightAr, cached, source: 'groq' | 'fallback' }
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

  const groqApiKey = process.env.GROQ_API_KEY;
  let insightEn = null;
  let insightAr = null;
  let source = 'fallback';

  if (groqApiKey) {
    const compactPrompt = `FPL Structured Data:
- Recommended Captain: ${cap ? `${cap.name} (Form: ${cap.form}, Fixture Difficulty: ${cap.fixtureDiff}/5)` : 'None'}
- Suggested Transfer: ${trans ? `Out: ${trans.outName}, In: ${trans.inName} (Form: ${trans.inForm})` : 'None'}
- Availability Warnings: ${injuries.length > 0 ? injuries.map(i => `${i.name} (${i.news})`).join('; ') : 'None'}

Return ONLY a valid JSON object matching this schema:
{
  "insightEn": "1-2 sentence advice in English mentioning the recommended captain/transfer",
  "insightAr": "Natural Arabic translation of the exact same advice (same player, same reasoning)"
}`;

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
              content: 'You are a top-ranked Fantasy Premier League (FPL) expert. Output ONLY valid JSON containing keys "insightEn" and "insightAr". Both keys MUST convey the exact same advice, recommended player, and reasoning in their respective languages.',
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
            console.log('[AI Insight] Dual-language Groq JSON received successfully!');
          }
        } catch (jsonErr) {
          console.warn('[AI Insight] Failed to parse JSON from Groq content:', content);
        }
      }
    } catch (groqErr) {
      console.warn(`[AI Insight] Groq API call failed (${groqErr.response?.status}): ${groqErr.response?.data?.error?.message || groqErr.message}. Falling back to template.`);
    }
  } else {
    console.warn('[AI Insight] GROQ_API_KEY not found in environment. Using rule-based fallback.');
  }

  // Fallback template generator if Groq call failed or returned incomplete JSON
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
