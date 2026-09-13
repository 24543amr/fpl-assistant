import { FPLPick, FPLPlayer, FPLTeam } from '@/api/fpl';

export interface SquadCacheData {
  picks: FPLPick[];
  playerMap: Map<number, FPLPlayer>;
  teamMap: Map<number, FPLTeam>;
  fixtureMap?: Map<number, any>;
  chips?: any[];
  bank?: number;
  freeTransfers?: number;
  teamId?: string;
  teamName?: string;
  gameweek?: number;
  lastFetched: number;
}

const DEFAULT_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

class SquadCache {
  private data: SquadCacheData | null = null;

  get(): SquadCacheData | null {
    return this.data;
  }

  set(data: Omit<SquadCacheData, 'lastFetched'> & { lastFetched?: number }): void {
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

export const squadCache = new SquadCache();
