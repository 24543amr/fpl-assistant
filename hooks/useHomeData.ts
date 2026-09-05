import { useState, useCallback, useRef } from 'react';
import {
  fetchBootstrap,
  fetchUserEntry,
  fetchUserPicks,
  fetchCaptainSuggestion,
  fetchAiInsight,
  FPLUserEntry,
  FPLPick,
  CaptainSuggestion,
  AiInsight,
  FPLPlayer,
} from '@/api/fpl';
import { getStoredTeamId, getStoredFplToken } from '@/utils/storage';

export interface HomeDataState {
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  entry: FPLUserEntry | null;
  currentGw: number;
  nextGw: number;
  nextDeadlineIso: string | null;
  picks: FPLPick[];
  captainSuggestion: CaptainSuggestion | null;
  aiInsight: AiInsight | null;
  activeTeamId: string;
  authMode: 'FPL Login' | 'Team ID';
  lastFetched: string | null;
  refetch: (isSilent?: boolean) => Promise<void>;
}

export function useHomeData(): HomeDataState {
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entry, setEntry] = useState<FPLUserEntry | null>(null);
  const [currentGw, setCurrentGw] = useState(0);
  const [nextGw, setNextGw] = useState(0);
  const [nextDeadlineIso, setNextDeadlineIso] = useState<string | null>(null);
  const [picks, setPicks] = useState<FPLPick[]>([]);
  const [captainSuggestion, setCaptainSuggestion] = useState<CaptainSuggestion | null>(null);
  const [aiInsight, setAiInsight] = useState<AiInsight | null>(null);
  const [activeTeamId, setActiveTeamId] = useState('');
  const [authMode, setAuthMode] = useState<'FPL Login' | 'Team ID'>('Team ID');
  const [lastFetched, setLastFetched] = useState<string | null>(null);

  // Track if at least one successful load has completed
  const hasLoadedOnce = useRef(false);

  // Reads AsyncStorage fresh on every call (including screen focus)
  const refetch = useCallback(async (isSilent = false) => {
    // If we already have loaded data once, do NOT set isLoading(true)
    // Only set isRefreshing(true) so UI keeps existing data visible seamlessly
    if (hasLoadedOnce.current || isSilent) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const teamId = await getStoredTeamId();
      const tokens = await getStoredFplToken();
      const mode = tokens ? 'FPL Login' : 'Team ID';
      setAuthMode(mode);

      if (!teamId) throw new Error('No verified FPL Team ID is connected.');
      console.log(`[useHomeData] ── Fetching for Team ID: ${teamId} | Mode: ${mode} | Silent: ${isSilent || hasLoadedOnce.current}`);

      const bootstrap = await fetchBootstrap();

      // Resolve current GW — prefer is_current, fall back to is_next
      const currentEvent = bootstrap.events.find((e) => e.is_current)
        || bootstrap.events.find((e) => e.is_next);

      if (!currentEvent) throw new Error('FPL has not published a current or next gameweek.');

      const nextEvent = bootstrap.events.find((e) => e.is_next) || currentEvent;
      console.log(`[useHomeData] GW resolved: current=${currentEvent.id} (is_current=${currentEvent.is_current}), next=${nextEvent.id}`);

      const elementsMap = new Map<number, FPLPlayer>(bootstrap.elements.map((el) => [el.id, el]));

      const freshEntry = await fetchUserEntry(teamId);

      // Picks come from the public GW endpoint — works after the deadline has passed.
      const gwToFetch = currentEvent.id;
      console.log(`[useHomeData] Fetching GW ${gwToFetch} picks for team ${teamId}...`);

      const [picksResult, captain, insight] = await Promise.all([
        fetchUserPicks(teamId, gwToFetch, elementsMap).catch((e) => {
          console.warn(`[useHomeData] picks fetch failed: ${e.message}`);
          return null;
        }),
        fetchCaptainSuggestion(teamId, gwToFetch, bootstrap.elements),
        fetchAiInsight(teamId),
      ]);

      console.log(`[useHomeData] picks result: ${picksResult ? picksResult.length + ' picks' : 'null (fetch failed or GW not started)'}`);

      // Seamlessly swap in new data
      setActiveTeamId(teamId);
      setEntry(freshEntry);
      setCurrentGw(currentEvent.id);
      setNextGw(nextEvent.id);
      setNextDeadlineIso(nextEvent.deadline_time || null);
      if (picksResult && picksResult.length > 0) {
        setPicks(picksResult);
      }
      setCaptainSuggestion(captain);
      setAiInsight(insight);
      setError(null);
      hasLoadedOnce.current = true;

      if (!picksResult || picksResult.length === 0) {
        if (!hasLoadedOnce.current) {
          setError('No picks found for this gameweek yet. Picks become available after the deadline passes.');
        }
      }

      setLastFetched(new Date().toLocaleTimeString());
    } catch (cause: any) {
      console.error('[useHomeData] Error during fetch:', cause?.message);
      // NEVER clear existing picks/data if we already have them!
      if (!hasLoadedOnce.current) {
        setPicks([]);
      }
      setError(cause?.message || 'Unable to update FPL data.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  return { isLoading, isRefreshing, error, entry, currentGw, nextGw, nextDeadlineIso, picks, captainSuggestion, aiInsight, activeTeamId, authMode, lastFetched, refetch };
}
