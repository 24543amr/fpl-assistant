import React, { useState, useCallback, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Colors, Spacing, Radii } from "@/constants/theme";
import BottomNav from "@/components/BottomNav";
import {
  fetchFixtures,
  fetchBootstrap,
  FPLFixture,
  FPLTeam,
  FPLEvent,
  DEFAULT_TEAMS_MAP,
} from "@/api/fpl";

// ─── Types ─────────────────────────────────────────────────────────────────────
interface MatchesData {
  fixtures: FPLFixture[];
  teamsMapArr: [number, FPLTeam][];
  events: FPLEvent[];
  currentEvent: number;
  fetchedAt: number;
}

interface GameweekGroup {
  gw: number;
  fixtures: FPLFixture[];
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function formatKickoff(iso: string, isArabic: boolean): string {
  try {
    const date = new Date(iso);
    const day = date.toLocaleDateString(isArabic ? "ar-EG" : "en-GB", {
      weekday: "short",
      day: "2-digit",
      month: "short",
    });
    const time = date.toLocaleTimeString(isArabic ? "ar-EG" : "en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${day}  ${time}`;
  } catch {
    return iso;
  }
}

function isLive(f: FPLFixture): boolean {
  return !!(f.started && !f.finished && !f.finished_provisional);
}

// ─── Cache ─────────────────────────────────────────────────────────────────────
const CACHE_KEY = "matches_data_cache_v1";
const CACHE_TTL = 5 * 60 * 1000;

async function loadCache(): Promise<{ data: MatchesData; teamsMap: Map<number, FPLTeam> } | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed: MatchesData = JSON.parse(raw);
    if (Date.now() - parsed.fetchedAt > CACHE_TTL) return null;
    const teamsMap = new Map<number, FPLTeam>(parsed.teamsMapArr ?? []);
    return { data: parsed, teamsMap };
  } catch {
    return null;
  }
}

async function saveCache(d: MatchesData): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(d));
  } catch {}
}

// ─── FixtureRow ────────────────────────────────────────────────────────────────
const FixtureRow = React.memo(function FixtureRow({
  fixture,
  teamsMap,
  isArabic,
}: {
  fixture: FPLFixture;
  teamsMap: Map<number, FPLTeam>;
  isArabic: boolean;
}) {
  const homeTeam = teamsMap.get(fixture.team_h);
  const awayTeam = teamsMap.get(fixture.team_a);
  const homeSN = homeTeam?.short_name ?? DEFAULT_TEAMS_MAP.get(fixture.team_h) ?? "???";
  const awaySN = awayTeam?.short_name ?? DEFAULT_TEAMS_MAP.get(fixture.team_a) ?? "???";
  const homeFullName = homeTeam?.name ?? homeSN;
  const awayFullName = awayTeam?.name ?? awaySN;
  const live = isLive(fixture);
  const done = fixture.finished || fixture.finished_provisional;

  const middle = done ? (
    <View style={styles.scoreBox}>
      <Text style={styles.scoreNum}>{fixture.team_h_score ?? "-"}</Text>
      <Text style={styles.scoreDash}>-</Text>
      <Text style={styles.scoreNum}>{fixture.team_a_score ?? "-"}</Text>
    </View>
  ) : live ? (
    <View style={[styles.scoreBox, styles.liveBox]}>
      <Text style={styles.scoreNum}>{fixture.team_h_score ?? 0}</Text>
      <Text style={styles.scoreDash}>-</Text>
      <Text style={styles.scoreNum}>{fixture.team_a_score ?? 0}</Text>
    </View>
  ) : (
    <View style={styles.timeBox}>
      <Text style={styles.timeText}>{formatKickoff(fixture.kickoff_time, isArabic)}</Text>
    </View>
  );

  return (
    <View style={styles.fixtureRow}>
      <View style={[styles.teamSide, { alignItems: "flex-start" }]}>
        <Text style={styles.teamSN}>{homeSN}</Text>
        <Text style={styles.teamFull} numberOfLines={1}>{homeFullName}</Text>
      </View>

      {middle}

      <View style={[styles.teamSide, { alignItems: "flex-end" }]}>
        <Text style={styles.teamSN}>{awaySN}</Text>
        <Text style={styles.teamFull} numberOfLines={1}>{awayFullName}</Text>
      </View>

      {live && (
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveLabel}>LIVE</Text>
        </View>
      )}
    </View>
  );
});

// ─── GameweekSection ───────────────────────────────────────────────────────────
function GameweekSection({
  group,
  teamsMap,
  isArabic,
  isCurrent,
  defaultOpen,
}: {
  group: GameweekGroup;
  teamsMap: Map<number, FPLTeam>;
  isArabic: boolean;
  isCurrent: boolean;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const hasLive = group.fixtures.some(isLive);
  const done = group.fixtures.filter((f) => f.finished || f.finished_provisional).length;
  const total = group.fixtures.length;

  return (
    <View style={styles.gwSection}>
      <TouchableOpacity
        style={[styles.gwHeader, isCurrent && styles.gwHeaderCurrent]}
        onPress={() => setOpen((o) => !o)}
        activeOpacity={0.75}
      >
        <View>
          <Text style={[styles.gwTitle, isCurrent && styles.gwTitleCurrent]}>
            {isArabic ? `الجولة ${group.gw}` : `Gameweek ${group.gw}`}
          </Text>
          <Text style={styles.gwSub}>
            {isArabic ? `${done} من ${total} مباريات` : `${done} / ${total} played`}
          </Text>
        </View>
        <View style={styles.gwRight}>
          {hasLive && (
            <View style={styles.liveChip}>
              <View style={styles.liveDot} />
              <Text style={styles.liveChipText}>LIVE</Text>
            </View>
          )}
          <MaterialIcons
            name={open ? "keyboard-arrow-up" : "keyboard-arrow-down"}
            size={22}
            color={Colors.onSurfaceVariant}
          />
        </View>
      </TouchableOpacity>

      {open && (
        <View>
          {group.fixtures.map((f) => (
            <FixtureRow key={f.id} fixture={f} teamsMap={teamsMap} isArabic={isArabic} />
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Main Screen ───────────────────────────────────────────────────────────────
export default function MatchesScreen() {
  const [matchesData, setMatchesData] = useState<MatchesData | null>(null);
  const [teamsMap, setTeamsMap] = useState<Map<number, FPLTeam>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isArabic, setIsArabic] = useState(false);
  const hasLoadedOnce = useRef(false);
  const isFetching = useRef(false);

  // ── Language pref ─────────────────────────────────────────────────────────────
  React.useEffect(() => {
    AsyncStorage.getItem("app_language")
      .then((lang) => { if (lang) setIsArabic(lang === "ar"); })
      .catch(() => {});
  }, []);

  // ── Gameweek groups ───────────────────────────────────────────────────────────
  const gwGroups: GameweekGroup[] = useMemo(() => {
    if (!matchesData) return [];
    const map = new Map<number, FPLFixture[]>();
    for (const f of matchesData.fixtures) {
      const gw = f.event ?? 0;
      if (gw <= 0) continue;
      if (!map.has(gw)) map.set(gw, []);
      map.get(gw)!.push(f);
    }
    const groups: GameweekGroup[] = [];
    map.forEach((fixtures, gw) => {
      fixtures.sort(
        (a, b) => new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime()
      );
      groups.push({ gw, fixtures });
    });
    groups.sort((a, b) => a.gw - b.gw);
    return groups;
  }, [matchesData]);

  // ── Fetch ─────────────────────────────────────────────────────────────────────
  const fetchData = useCallback(
    async (mode: "initial" | "focus" | "pull") => {
      if (isFetching.current) return;
      isFetching.current = true;

      if (mode === "initial") setIsLoading(true);
      if (mode === "pull") setIsRefreshing(true);

      try {
        // Show cached data instantly on first load
        if (mode === "initial" && !matchesData) {
          const cached = await loadCache();
          if (cached) {
            setMatchesData(cached.data);
            setTeamsMap(cached.teamsMap);
            hasLoadedOnce.current = true;
          }
        }

        const [fixtures, bootstrap] = await Promise.all([
          fetchFixtures(),
          fetchBootstrap(),
        ]);

        const newTeamsMap = new Map<number, FPLTeam>();
        for (const t of bootstrap.teams) newTeamsMap.set(t.id, t);

        const currentEvent =
          bootstrap.events.find((e) => e.is_current)?.id ??
          bootstrap.events.find((e) => e.is_next)?.id ??
          1;

        const newData: MatchesData = {
          fixtures,
          teamsMapArr: [...newTeamsMap.entries()],
          events: bootstrap.events,
          currentEvent,
          fetchedAt: Date.now(),
        };

        setMatchesData(newData);
        setTeamsMap(newTeamsMap);
        setError(null);
        hasLoadedOnce.current = true;
        await saveCache(newData);
      } catch (err: any) {
        console.error("[Matches] fetch error:", err?.message);
        if (!hasLoadedOnce.current) {
          setError(
            isArabic
              ? "فشل تحميل المباريات. تحقق من اتصال الشبكة."
              : "Failed to load matches. Check your connection."
          );
        }
      } finally {
        isFetching.current = false;
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [isArabic, matchesData]
  );

  useFocusEffect(
    useCallback(() => {
      fetchData(hasLoadedOnce.current ? "focus" : "initial");
    }, [fetchData])
  );

  // ── Render ────────────────────────────────────────────────────────────────────
  const currentGw = matchesData?.currentEvent ?? 0;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {isArabic ? "المباريات" : "Matches"}
        </Text>
        <TouchableOpacity
          onPress={() => setIsArabic((a) => !a)}
          style={styles.langBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.langBtnText}>{isArabic ? "EN" : "ع"}</Text>
        </TouchableOpacity>
      </View>

      {/* Subtle error toast (data already shown) */}
      {error && matchesData && (
        <View style={styles.subtleError}>
          <MaterialIcons name="warning-amber" size={13} color="#FBBF24" />
          <Text style={styles.subtleErrorText}>{error}</Text>
        </View>
      )}

      {/* First load spinner */}
      {isLoading && !matchesData ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.brandTeal} />
          <Text style={styles.loadingText}>
            {isArabic ? "جاري تحميل المباريات..." : "Loading matches..."}
          </Text>
        </View>
      ) : error && !matchesData ? (
        /* Full error state */
        <View style={styles.center}>
          <MaterialIcons name="wifi-off" size={48} color={Colors.onSurfaceVariant} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => fetchData("initial")}>
            <Text style={styles.retryText}>{isArabic ? "إعادة المحاولة" : "Retry"}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => fetchData("pull")}
              tintColor={Colors.brandTeal}
              colors={[Colors.brandTeal]}
            />
          }
        >
          {gwGroups.map((group) => (
            <GameweekSection
              key={group.gw}
              group={group}
              teamsMap={teamsMap}
              isArabic={isArabic}
              isCurrent={group.gw === currentGw}
              defaultOpen={group.gw === currentGw}
            />
          ))}
        </ScrollView>
      )}

      <BottomNav activeTab="matches" isArabic={isArabic} />
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.brandPurple },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  headerTitle: {
    fontFamily: "JetBrainsMono_700",
    fontSize: 20,
    color: Colors.brandTeal,
    letterSpacing: 0.5,
  },
  langBtn: {
    backgroundColor: "rgba(0,255,135,0.12)",
    borderRadius: Radii.full,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  langBtnText: {
    fontFamily: "JetBrainsMono_700",
    fontSize: 13,
    color: Colors.brandTeal,
  },
  subtleError: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    backgroundColor: "rgba(251,191,36,0.08)",
  },
  subtleErrorText: {
    fontFamily: "JetBrainsMono_400",
    fontSize: 11,
    color: "#FBBF24",
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingHorizontal: Spacing.lg,
  },
  loadingText: {
    fontFamily: "JetBrainsMono_400",
    fontSize: 14,
    color: Colors.onSurfaceVariant,
  },
  errorText: {
    fontFamily: "JetBrainsMono_400",
    fontSize: 14,
    color: Colors.error,
    textAlign: "center",
  },
  retryBtn: {
    backgroundColor: Colors.brandTeal,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: Radii.lg,
  },
  retryText: {
    fontFamily: "JetBrainsMono_700",
    fontSize: 14,
    color: Colors.brandPurple,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    gap: Spacing.sm,
  },

  // Gameweek section
  gwSection: {
    borderRadius: Radii.xl,
    overflow: "hidden",
    backgroundColor: Colors.brandPurpleMid,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  gwHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 4,
    backgroundColor: "rgba(0,0,0,0.15)",
  },
  gwHeaderCurrent: {
    backgroundColor: "rgba(0,255,135,0.08)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,255,135,0.18)",
  },
  gwTitle: {
    fontFamily: "JetBrainsMono_700",
    fontSize: 14,
    color: Colors.onSurface,
  },
  gwTitleCurrent: { color: Colors.brandTeal },
  gwSub: {
    fontFamily: "JetBrainsMono_400",
    fontSize: 11,
    color: Colors.onSurfaceVariant,
    marginTop: 1,
  },
  gwRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  liveChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,45,45,0.18)",
    borderRadius: Radii.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  liveChipText: {
    fontFamily: "JetBrainsMono_700",
    fontSize: 10,
    color: "#FF6B6B",
  },

  // Fixture row
  fixtureRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.04)",
    position: "relative",
  },
  teamSide: { flex: 1, gap: 2 },
  teamSN: {
    fontFamily: "JetBrainsMono_700",
    fontSize: 14,
    color: Colors.onSurface,
    letterSpacing: 0.5,
  },
  teamFull: {
    fontFamily: "JetBrainsMono_400",
    fontSize: 10,
    color: Colors.onSurfaceVariant,
    maxWidth: 90,
  },
  scoreBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radii.lg,
    backgroundColor: "rgba(0,0,0,0.3)",
    minWidth: 64,
    justifyContent: "center",
  },
  liveBox: {
    backgroundColor: "rgba(255,45,45,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,107,107,0.4)",
  },
  scoreNum: {
    fontFamily: "JetBrainsMono_700",
    fontSize: 16,
    color: Colors.onSurface,
    minWidth: 12,
    textAlign: "center",
  },
  scoreDash: {
    fontFamily: "JetBrainsMono_400",
    fontSize: 14,
    color: Colors.onSurfaceVariant,
  },
  timeBox: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 88,
    paddingHorizontal: 4,
  },
  timeText: {
    fontFamily: "JetBrainsMono_400",
    fontSize: 10,
    color: Colors.onSurfaceVariant,
    textAlign: "center",
  },
  liveBadge: {
    position: "absolute",
    top: 4,
    right: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#FF6B6B",
  },
  liveLabel: {
    fontFamily: "JetBrainsMono_700",
    fontSize: 9,
    color: "#FF6B6B",
  },
});
