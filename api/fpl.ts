import Constants from 'expo-constants';
import { getStoredFplToken, setStoredFplToken, clearStoredFplToken } from '@/utils/storage';

export interface FPLPlayer {
  id: number;
  code: number;
  web_name: string;
  first_name: string;
  second_name: string;
  element_type: number;
  team: number;
  now_cost: number;
  form: string;
  selected_by_percent: string;
  total_points: number;
  chance_of_playing_next_round?: number | null;
  chance_of_playing_this_round?: number | null;
  status?: string;
  news?: string;
  photo?: string;
  bonus?: number;
  bps?: number;
}
export interface FPLEvent { id: number; name: string; deadline_time: string; is_current: boolean; is_next: boolean; finished: boolean; }
export interface FPLPick { element: number; position: number; is_captain: boolean; is_vice_captain: boolean; multiplier: number; player?: FPLPlayer; selling_price?: number; purchase_price?: number; }
export interface FPLLeagueClassic {
  id: number;
  name: string;
  short_name?: string | null;
  created: string;
  closed: boolean;
  rank?: number | null;
  max_entries?: number | null;
  league_type: string;
  scoring: string;
  admin_entry?: number | null;
  start_event: number;
  entry_can_leave?: boolean;
  entry_can_admin?: boolean;
  entry_can_invite?: boolean;
  has_cup?: boolean;
  rank_count?: number;
  entry_rank?: number;
  entry_last_rank?: number;
  entry_percentile_rank?: number;
}
export interface FPLLeaguesData {
  classic: FPLLeagueClassic[];
  h2h?: any[];
  cup?: any;
  cup_matches?: any[];
}
export interface FPLStandingItem {
  id: number;
  entry: number;
  entry_name: string;
  player_name: string;
  rank: number;
  last_rank: number;
  rank_sort: number;
  total: number;
  event_total: number;
}
export interface FPLLeagueStandingsResponse {
  league: {
    id: number;
    name: string;
    created: string;
    closed: boolean;
    max_entries?: number | null;
    league_type: string;
    scoring: string;
    admin_entry?: number | null;
    start_event: number;
    has_cup?: boolean;
  };
  standings: {
    has_next: boolean;
    page: number;
    results: FPLStandingItem[];
  };
  new_entries?: {
    has_next: boolean;
    page: number;
    results: any[];
  };
}
export interface FPLUserEntry { id: number; name: string; player_first_name: string; player_last_name: string; summary_overall_points: number; summary_overall_rank: number; summary_event_points: number; summary_event_rank: number; current_event: number; last_season_points?: number; last_season_rank?: number; leagues?: FPLLeaguesData; bank?: number; value?: number; }
export interface CaptainSuggestion { player: FPLPlayer; reasoningEn: string; reasoningAr: string; }
export interface AiInsight { insightEn: string; insightAr: string; }
export interface FPLTransfersInfo { bank: number; limit: number; made: number; cost: number; value: number; }

export function getBackendCandidateUrls(): string[] {
  const urls: string[] = [];
  const hostUri = Constants.expoConfig?.hostUri || (Constants as any).manifest2?.extra?.expoGo?.debuggerHost;
  if (hostUri) {
    const host = hostUri.split(':')[0];
    if (host && host !== 'localhost' && host !== '127.0.0.1') urls.push(`http://${host}:3001`);
  }
  // Current LAN fallback. Keep this aligned with the IP shown by Expo's QR URL.
  urls.push('http://192.168.1.48:3001', 'http://192.168.1.5:3001', 'http://10.0.2.2:3001', 'http://localhost:3001');
  return [...new Set(urls)];
}

async function backendFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const tokens = await getStoredFplToken();
  const headers: Record<string, string> = { ...(init.headers as Record<string, string> || {}) };

  if (tokens?.refreshToken && !headers['x-fpl-refresh']) {
    headers['x-fpl-refresh'] = tokens.refreshToken;
  }
  if (tokens?.accessToken && !headers['x-fpl-session'] && (path.includes('/my-team') || path.includes('/squad') || path.includes('/transfers') || path.includes('/me'))) {
    headers['x-fpl-session'] = tokens.accessToken;
  }

  const reqInit = { ...init, headers };

  let lastError: unknown;
  for (const baseUrl of getBackendCandidateUrls()) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(`${baseUrl}${path}`, { ...reqInit, cache: 'no-store', signal: controller.signal });

      // Automatically sync updated access/refresh tokens sent by backend headers
      const newAccess = response.headers.get('x-fpl-new-access-token');
      const newRefresh = response.headers.get('x-fpl-new-refresh-token');
      if (newAccess) {
        console.log('[FPL API] New access_token returned by backend headers. Updating local storage...');
        void setStoredFplToken({ accessToken: newAccess, refreshToken: newRefresh || tokens?.refreshToken });
      }

      if (response.ok || response.status < 500) return response;
      lastError = new Error(`Backend HTTP ${response.status}`);
    } catch (error) { lastError = error; }
    finally { clearTimeout(timeout); }
  }
  throw lastError || new Error('Unable to reach the FPL backend. Ensure your phone and computer are on the same Wi-Fi.');
}

/**
 * Calls backend POST /api/auth/refresh to refresh an expired access_token using refresh_token.
 * Automatically updates stored tokens on success, or clears tokens on REFRESH_EXPIRED failure.
 */
export async function refreshFplToken(
  refreshTokenInput?: string,
  accessTokenInput?: string,
): Promise<{ success: boolean; accessToken?: string; refreshToken?: string; error?: string }> {
  let refreshToken = refreshTokenInput;
  let accessToken = accessTokenInput;

  if (!refreshToken) {
    const stored = await getStoredFplToken();
    refreshToken = stored?.refreshToken;
    accessToken = stored?.accessToken;
  }

  if (!refreshToken) {
    console.warn('[refreshFplToken] No refresh token available in storage.');
    await clearStoredFplToken();
    return { success: false, error: 'REFRESH_EXPIRED' };
  }

  console.log('[refreshFplToken] Calling /api/auth/refresh...');
  try {
    const response = await backendFetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken, accessToken }),
    });

    const data = await response.json().catch(() => ({}));

    if (response.ok && data.accessToken) {
      console.log('[refreshFplToken] Refresh SUCCESS! Saving updated tokens...');
      await setStoredFplToken({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken || refreshToken,
      });
      return {
        success: true,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken || refreshToken,
      };
    } else {
      console.warn('[refreshFplToken] Refresh failed from backend:', data);
      await clearStoredFplToken();
      return { success: false, error: data.error || 'REFRESH_EXPIRED' };
    }
  } catch (err: any) {
    console.error('[refreshFplToken] Refresh error:', err?.message);
    await clearStoredFplToken();
    return { success: false, error: 'REFRESH_EXPIRED' };
  }
}

function player(element: any): FPLPlayer {
  return {
    id: element.id,
    code: element.code,
    web_name: element.web_name,
    first_name: element.first_name,
    second_name: element.second_name,
    element_type: element.element_type,
    team: element.team,
    now_cost: element.now_cost,
    form: element.form || '0.0',
    selected_by_percent: element.selected_by_percent || '0.0',
    total_points: element.total_points || 0,
    chance_of_playing_next_round: element.chance_of_playing_next_round,
    chance_of_playing_this_round: element.chance_of_playing_this_round,
    status: element.status,
    news: element.news,
    photo: element.photo,
    bonus: element.bonus || 0,
    bps: element.bps || 0,
  };
}

export function getPlayerPhotoUrl(player?: FPLPlayer | null, elementId?: number): string {
  const photoCode = player?.photo
    ? player.photo.replace('.jpg', '')
    : String(player?.code || elementId || '');
  if (!photoCode) return '';
  const fullName = player ? `${player.first_name || ''} ${player.second_name || ''}`.trim() || player.web_name : '';
  const candidateUrls = getBackendCandidateUrls();
  const backendBase = candidateUrls[0] || 'http://localhost:3001';
  return `${backendBase}/api/fpl/player-photo/${photoCode}?name=${encodeURIComponent(fullName)}&v=sportsdb_v2`;
}

export interface FPLTeam {
  id: number;
  name: string;
  short_name: string;
  code: number;
}

export const DEFAULT_TEAMS_MAP = new Map<number, string>([
  [1, 'ARS'],
  [2, 'AVL'],
  [3, 'BOU'],
  [4, 'BRE'],
  [5, 'BHA'],
  [6, 'CHE'],
  [7, 'COV'],
  [8, 'CRY'],
  [9, 'EVE'],
  [10, 'FUL'],
  [11, 'HUL'],
  [12, 'IPS'],
  [13, 'LEE'],
  [14, 'LIV'],
  [15, 'MCI'],
  [16, 'MUN'],
  [17, 'NEW'],
  [18, 'NFO'],
  [19, 'TOT'],
  [20, 'SUN'],
]);

export async function fetchBootstrap(): Promise<{
  events: FPLEvent[];
  elements: FPLPlayer[];
  teams: FPLTeam[];
}> {
  const response = await backendFetch(`/api/fpl/bootstrap?_t=${Date.now()}`);
  if (!response.ok) throw new Error('Could not fetch current FPL gameweek.');
  const data = await response.json();
  console.log(`[FPL API] bootstrap-static: ${data.events?.length} events, ${data.elements?.length} elements, ${data.teams?.length} teams`);
  return {
    events: data.events || [],
    elements: (data.elements || []).map(player),
    teams: data.teams || [],
  };
}

export async function fetchUserEntry(teamId: string | number): Promise<FPLUserEntry> {
  const response = await backendFetch(`/api/fpl/entry/${encodeURIComponent(String(teamId))}?_t=${Date.now()}`);
  if (!response.ok) {
    if (response.status === 404) throw new Error('TEAM_NOT_FOUND');
    throw new Error('Could not reach the FPL backend. Ensure your phone and computer are on the same Wi-Fi.');
  }
  const data = await response.json();
  console.log(`[FPL API] entry/${teamId}: name="${data.name}", overall_points=${data.summary_overall_points}, current_event=${data.current_event}`);
  return data;
}

/**
 * Fetch GW picks from the PUBLIC read-only endpoint.
 */
export async function fetchUserPicks(teamId: string | number, gw: number, elementsMap?: Map<number, FPLPlayer>, _allElements?: FPLPlayer[]): Promise<FPLPick[]> {
  const response = await backendFetch(`/api/fpl/picks/${encodeURIComponent(String(teamId))}/${gw}?_t=${Date.now()}`);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    console.warn(`[FPL API] picks/${teamId}/${gw} FAILED: HTTP ${response.status}`, body);
    throw new Error("Could not fetch this team's current squad.");
  }
  const data = await response.json();
  console.log(`[FPL API] picks/${teamId}/${gw}: received ${data.picks?.length ?? 0} picks, active_chip=${data.active_chip}`);
  return (data.picks || []).map((pick: any) => ({ ...pick, player: elementsMap?.get(pick.element) }));
}

/**
 * Fetch the LIVE current squad selections from the authenticated my-team/ endpoint.
 * 🔑 Requires the OIDC access_token.
 */
export async function fetchMyTeamSquad(
  teamId: string | number,
  accessToken: string,
  elementsMap?: Map<number, FPLPlayer>,
): Promise<{ picks: FPLPick[]; chips?: any; transfers?: FPLTransfersInfo }> {
  const response = await backendFetch(
    `/api/team/${encodeURIComponent(String(teamId))}/squad?_t=${Date.now()}`,
    { headers: { 'x-fpl-session': accessToken } },
  );

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    console.warn(`[FPL API] my-team/${teamId} FAILED: HTTP ${response.status}`, body);
    throw new Error('Could not fetch your live squad. Please try again.');
  }

  const data = await response.json();
  console.log(`[FPL API] my-team/${teamId}: received ${data.picks?.length ?? 0} picks`);

  const picks: FPLPick[] = (data.picks || []).map((pick: any) => ({
    ...pick,
    player: elementsMap?.get(pick.element),
  }));

  const transfersInfo: FPLTransfersInfo = {
    bank: data.transfers?.bank ?? 0,
    limit: data.transfers?.limit ?? 1,
    made: data.transfers?.made ?? 0,
    cost: data.transfers?.cost ?? 0,
    value: data.transfers?.value ?? 1000,
  };

  return { picks, chips: data.chips, transfers: transfersInfo };
}

export async function verifyTeamId(teamId: string): Promise<FPLUserEntry> { return fetchUserEntry(teamId); }

/**
 * Send the OIDC access_token to our backend to resolve the FPL team ID.
 */
export async function resolveFplSession(accessToken: string): Promise<{ teamId: string; name: string }> {
  const response = await backendFetch('/api/auth/fpl-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken }),
  });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const message = errorBody?.error || `The FPL session could not be verified (HTTP ${response.status}).`;
    console.error('[resolveFplSession] Verification failed:', { status: response.status, error: errorBody });
    throw new Error(message);
  }
  return response.json();
}

export async function fetchCaptainSuggestion(_teamId: string | number, _gw: number, allElements?: FPLPlayer[]): Promise<CaptainSuggestion> {
  const player = allElements?.[0];
  if (!player) throw new Error('No FPL players available.');
  return { player, reasoningEn: 'Based on current FPL data.', reasoningAr: 'بناءً على بيانات FPL الحالية.' };
}
export interface FullAiInsightResponse {
  insightEn: string;
  insightAr: string;
  structuredData?: {
    captain?: {
      name: string;
      form: string;
      totalPoints?: number;
      fixtureDiff?: number;
      status?: string;
    } | null;
    transfer?: {
      outName: string;
      inName: string;
      inForm?: string;
      inCost?: string;
    } | null;
    injuries?: Array<{
      name: string;
      chance?: number | null;
      news: string;
    }>;
  };
  source?: string;
  cached?: boolean;
  timestamp?: string;
}

export async function fetchFullAiInsightDetails(teamId?: string, forceRefresh = false): Promise<FullAiInsightResponse> {
  const url = forceRefresh ? '/api/ai/insight?forceRefresh=true' : '/api/ai/insight';
  const response = await backendFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ teamId: teamId || '', forceRefresh }),
  });
  if (!response.ok) {
    throw new Error(`AI Insight server error HTTP ${response.status}`);
  }
  return response.json();
}

export async function fetchAiInsight(teamId?: string): Promise<AiInsight> {
  try {
    const data = await fetchFullAiInsightDetails(teamId);
    return {
      insightEn: data.insightEn || 'Refresh before making a decision.',
      insightAr: data.insightAr || 'حدّث البيانات قبل اتخاذ القرار.',
    };
  } catch (err) {
    console.warn('[fetchAiInsight] Error calling fetchFullAiInsightDetails:', err);
  }
  return {
    insightEn: 'Roll your transfer to maximize flexibility for upcoming double gameweeks.',
    insightAr: 'تأجيل التغيير الجولة دي هيديك مرونة أكبر للجولة المزدوجة.',
  };
}

export interface AiChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ReferencedPlayer {
  id: number;
  code: number;
  web_name: string;
  first_name: string;
  second_name: string;
  element_type: number;
  team: number;
  team_short?: string;
  form: string;
  now_cost: number;
  total_points: number;
}

export interface AiChatResponse {
  reply: string;
  referencedPlayer?: ReferencedPlayer | null;
  budget?: string;
  currentGW?: number;
  error?: string;
}

export async function sendAiChatMessage(
  message: string,
  teamId?: string | number,
  conversationHistory: AiChatMessage[] = [],
): Promise<AiChatResponse> {
  const response = await backendFetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      teamId: String(teamId || ''),
      message,
      conversationHistory,
    }),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || errorData.reply || `Chat server error HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * Save lineup changes (captain, vice-captain, formation, subs order) via backend.
 * 🔑 Posts to https://fantasy.premierleague.com/api/my-team/{teamId}/
 */
export async function saveLineupToServer(
  teamId: string | number,
  picks: FPLPick[],
  accessToken?: string,
  csrfToken?: string,
  chip?: string | null,
): Promise<{ success: boolean; message?: string }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken) headers['x-fpl-session'] = accessToken;
  if (csrfToken) headers['x-fpl-csrf'] = csrfToken;

  const response = await backendFetch('/api/team/lineup', {
    method: 'POST',
    headers,
    body: JSON.stringify({ teamId: String(teamId), picks, chip: chip || null }),
  });

  const data = await response.json().catch(() => ({}));
  console.log(`[FPL API] POST /lineup: status=${response.status}`, data);
  return response.ok
    ? { success: true, message: data.message || 'Lineup saved successfully!' }
    : { success: false, message: data.error || data.message || 'Could not save lineup to FPL.' };
}

/** Submit real transfer to official FPL website via backend proxy */
export async function submitFplTransfer(params: {
  teamId: string;
  gameweek: number;
  transfers: Array<{
    element_in: number;
    element_out: number;
    purchase_price: number;
    selling_price: number;
  }>;
  accessToken: string;
  csrfToken?: string;
  chip?: string | null;
}): Promise<{ success: boolean; message: string; requiresReauth?: boolean }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-fpl-session': params.accessToken,
  };
  if (params.csrfToken) headers['x-fpl-csrf'] = params.csrfToken;

  const response = await backendFetch('/api/team/transfers', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      teamId: params.teamId,
      gameweek: params.gameweek,
      transfers: params.transfers,
      chip: params.chip || null,
    }),
  });

  const data = await response.json().catch(() => ({}));
  console.log(`[FPL API] POST /transfers: status=${response.status}`, data);

  if (response.status === 401 || data.error === 'SESSION_EXPIRED') {
    return {
      success: false,
      message: data.message || 'Your FPL session has expired. Please log in again.',
      requiresReauth: true,
    };
  }

  if (!response.ok || !data.success) {
    throw new Error(data.message || data.error || 'Transfer failed on FPL server.');
  }

  return { success: true, message: data.message || 'Transfer submitted to FPL successfully!' };
}

/**
 * Fetch standings for a specific classic mini-league.
 */
export async function fetchLeagueStandings(
  leagueId: number | string,
  page: number = 1
): Promise<FPLLeagueStandingsResponse> {
  const response = await backendFetch(
    `/api/fpl/leagues-classic/${encodeURIComponent(String(leagueId))}/standings?page_standings=${page}&_t=${Date.now()}`
  );
  if (!response.ok) {
    throw new Error('Failed to load league standings.');
  }
  return response.json();
}

/**
 * Submit request to join a private league by league code.
 */
export async function joinPrivateLeague(code: string): Promise<{ success: boolean; message?: string }> {
  const response = await backendFetch('/api/fpl/leagues/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || data.error || 'Failed to join league.');
  }
  return data;
}

export interface FPLFixture {
  id: number;
  code: number;
  event: number | null;
  finished: boolean;
  started?: boolean;
  team_h: number;
  team_a: number;
  team_h_difficulty: number;
  team_a_difficulty: number;
  kickoff_time: string;
}

export interface TeamNextFixtureInfo {
  opponentTeamId: number;
  opponentCode: string;
  isHome: boolean;
  difficulty: number;
  event: number | null;
}

/**
 * Fetch all season fixtures from backend proxy.
 */
export async function fetchFixtures(): Promise<FPLFixture[]> {
  try {
    const response = await backendFetch('/api/fpl/fixtures');
    if (response.ok) {
      return await response.json();
    }
  } catch (_) {}

  const fallback = await backendFetch('/api/fixtures');
  if (!fallback.ok) {
    throw new Error('Failed to load fixtures.');
  }
  return fallback.json();
}

/**
 * Get the target gameweek for upcoming unplayed fixtures.
 */
export function getTargetGameweek(events: FPLEvent[] = []): number {
  const current = events.find(e => e.is_current);
  if (current && !current.finished) {
    return current.id;
  }
  const next = events.find(e => e.is_next);
  if (next) {
    return next.id;
  }
  return current ? current.id : 1;
}

/**
 * Get fixtures for a team in a specific gameweek (handles blank, single, and double GW).
 */
export function getTeamNextGwFixtures(
  teamId: number,
  fixtures: FPLFixture[],
  targetGw: number,
  teamsMap: Map<number, string>
): TeamNextFixtureInfo[] {
  if (!teamId || !fixtures || fixtures.length === 0) return [];
  const gwFixtures = fixtures.filter(f => f.event === targetGw);
  const teamFix = gwFixtures.filter(f => f.team_h === teamId || f.team_a === teamId);
  return teamFix.map(f => {
    const isHome = f.team_h === teamId;
    const opponentTeamId = isHome ? f.team_a : f.team_h;
    const opponentCode = teamsMap.get(opponentTeamId) || DEFAULT_TEAMS_MAP.get(opponentTeamId) || 'PL';
    const difficulty = isHome ? f.team_h_difficulty : f.team_a_difficulty;
    return {
      opponentTeamId,
      opponentCode,
      isHome,
      difficulty,
      event: f.event,
    };
  });
}

/**
 * Get the next N upcoming fixtures for a team starting from targetGw.
 */
export function getTeamUpcomingFiveFixtures(
  teamId: number,
  fixtures: FPLFixture[],
  targetGw: number,
  teamsMap: Map<number, string>,
  count: number = 5
): TeamNextFixtureInfo[] {
  if (!teamId || !fixtures || fixtures.length === 0) return [];
  const unplayed = fixtures
    .filter(
      f =>
        f.event !== null &&
        f.event >= targetGw &&
        !f.finished &&
        (f.team_h === teamId || f.team_a === teamId)
    )
    .sort((a, b) => (a.event || 0) - (b.event || 0));

  return unplayed.slice(0, count).map(f => {
    const isHome = f.team_h === teamId;
    const opponentTeamId = isHome ? f.team_a : f.team_h;
    const opponentCode = teamsMap.get(opponentTeamId) || DEFAULT_TEAMS_MAP.get(opponentTeamId) || 'PL';
    const difficulty = isHome ? f.team_h_difficulty : f.team_a_difficulty;
    return {
      opponentTeamId,
      opponentCode,
      isHome,
      difficulty,
      event: f.event,
    };
  });
}

export interface FPLHistoryItem {
  element: number;
  fixture: number;
  opponent_team: number;
  total_points: number;
  was_home: boolean;
  round: number;
}

export interface FPLUpcomingFixtureItem {
  id: number;
  event: number;
  is_home: boolean;
  difficulty: number;
  team_h: number;
  team_a: number;
}

export interface FPLElementSummary {
  history: FPLHistoryItem[];
  fixtures: FPLUpcomingFixtureItem[];
}

/**
 * Fetch past gameweek history and upcoming fixtures for a single player.
 */
export async function fetchElementSummary(playerId: number | string): Promise<FPLElementSummary> {
  const response = await backendFetch(`/api/fpl/element-summary/${encodeURIComponent(String(playerId))}?_t=${Date.now()}`);
  if (!response.ok) {
    throw new Error('Failed to fetch element summary.');
  }
  return response.json();
}

