import { FPLUserEntry, FPLPick, CaptainSuggestion, AiInsight } from '@/api/fpl';

export interface HomeCacheData {
  entry: FPLUserEntry | null;
  currentGw: number;
  nextGw: number;
  nextDeadlineIso: string | null;
  picks: FPLPick[];
  captainSuggestion: CaptainSuggestion | null;
  aiInsight: AiInsight | null;
  activeTeamId: string;
  authMode: 'FPL Login' | 'Team ID';
  lastFetchedTimeStr: string | null;
  lastFetched: number;
}

const DEFAULT_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

class HomeCache {
  private data: HomeCacheData | null = null;

  get(): HomeCacheData | null {
    return this.data;
  }

  set(data: Omit<HomeCacheData, 'lastFetched'> & { lastFetched?: number }): void {
    this.data = {
      ...data,
      lastFetched: data.lastFetched || Date.now(),
    };
  }

  clear(): void {
    this.data = null;
  }

  isStale(maxAgeMs: number = DEFAULT_MAX_AGE_MS): boolean {
    if (!this.data) return true;
    return Date.now() - this.data.lastFetched > maxAgeMs;
  }
}

export const homeCache = new HomeCache();
