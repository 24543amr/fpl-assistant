import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Colors, Spacing, Radii } from "@/constants/theme";
import { loadMatchesCache } from "./matches";
import { FPLFixture, FPLTeam, FixtureStat, DEFAULT_TEAMS_MAP } from "@/api/fpl";

// ─── Stat Display Config ───────────────────────────────────────────────────────
interface StatConfig {
  labelEn: string;
  labelAr: string;
  icon: string;
  color?: string;
  showBoth?: boolean; // show all entries (BPS), not just top
}

const STAT_CONFIG: Record<string, StatConfig> = {
  goals_scored:      { labelEn: "Goals",              labelAr: "الأهداف",               icon: "⚽", color: Colors.brandTeal },
  assists:           { labelEn: "Assists",             labelAr: "التمريرات الحاسمة",      icon: "🎯", color: "#60A5FA" },
  own_goals:         { labelEn: "Own Goals",           labelAr: "أهداف في المرمى",        icon: "😬", color: Colors.error },
  penalties_saved:   { labelEn: "Penalties Saved",     labelAr: "ركلات مصدودة",           icon: "🛡️", color: Colors.brandTeal },
  penalties_missed:  { labelEn: "Penalties Missed",    labelAr: "ركلات ضائعة",            icon: "❌", color: Colors.error },
  yellow_cards:      { labelEn: "Yellow Cards",        labelAr: "البطاقات الصفراء",       icon: "🟨" },
  red_cards:         { labelEn: "Red Cards",           labelAr: "البطاقات الحمراء",       icon: "🟥", color: "#FF6B6B" },
  saves:             { labelEn: "Saves",               labelAr: "التصديات",               icon: "🧤" },
  bonus:             { labelEn: "Bonus Points",        labelAr: "النقاط الإضافية",        icon: "⭐", color: "#FBBF24" },
  bps:               { labelEn: "BPS",                 labelAr: "نقاط BPS",               icon: "📊", showBoth: true },
};

// Identifiers to render (ordered)
const STAT_ORDER = [
  "goals_scored",
  "assists",
  "own_goals",
  "penalties_saved",
  "penalties_missed",
  "yellow_cards",
  "red_cards",
  "saves",
  "bonus",
  "bps",
];

// ─── Helpers ───────────────────────────────────────────────────────────────────
function formatDate(iso: string, isArabic: boolean): string {
  try {
    return new Date(iso).toLocaleDateString(isArabic ? "ar-EG" : "en-GB", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatTime(iso: string, isArabic: boolean): string {
  try {
    return new Date(iso).toLocaleTimeString(isArabic ? "ar-EG" : "en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

// ─── StatSection Component ─────────────────────────────────────────────────────
function StatSection({
  stat,
  config,
  elementsMap,
  homeTeamId,
  isArabic,
}: {
  stat: FixtureStat;
  config: StatConfig;
  elementsMap: Map<number, string>;
  homeTeamId: number;
  isArabic: boolean;
}) {
  const allEntries = [
    ...stat.h.map((e) => ({ ...e, isHome: true })),
    ...stat.a.map((e) => ({ ...e, isHome: false })),
  ].sort((a, b) => b.value - a.value);

  if (allEntries.length === 0) return null;

  // For BPS show all, for others filter out zero/negative
  const entries = config.showBoth
    ? allEntries
    : allEntries.filter((e) => e.value > 0);

  if (entries.length === 0) return null;

  return (
    <View style={styles.statSection}>
      <View style={styles.statHeader}>
        <Text style={styles.statIcon}>{config.icon}</Text>
        <Text style={[styles.statLabel, config.color ? { color: config.color } : {}]}>
          {isArabic ? config.labelAr : config.labelEn}
        </Text>
      </View>
      <View style={styles.statEntries}>
        {entries.map((entry, idx) => {
          const name = elementsMap.get(entry.element) ?? `#${entry.element}`;
          return (
            <View key={`${entry.element}-${idx}`} style={styles.statEntry}>
              <View style={styles.statEntryLeft}>
                <View style={[styles.teamDot, entry.isHome ? styles.homeDot : styles.awayDot]} />
                <Text style={styles.playerName}>{name}</Text>
              </View>
              <Text style={[styles.statValue, config.color ? { color: config.color } : {}]}>
                {stat.identifier === "bps"
                  ? entry.value
                  : entry.value > 1
                  ? `×${entry.value}`
                  : ""}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ─── Main Screen ───────────────────────────────────────────────────────────────
export default function MatchDetailScreen() {
  const router = useRouter();
  const { fixtureId } = useLocalSearchParams<{ fixtureId: string }>();

  const [fixture, setFixture] = useState<FPLFixture | null>(null);
  const [teamsMap, setTeamsMap] = useState<Map<number, FPLTeam>>(new Map());
  const [elementsMap, setElementsMap] = useState<Map<number, string>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isArabic, setIsArabic] = useState(false);

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      const cached = await loadMatchesCache();
      if (!cached) {
        setError("No data available. Go back and refresh the Matches screen.");
        return;
      }
      const found = cached.data.fixtures.find((f) => String(f.id) === fixtureId);
      if (!found) {
        setError("Match not found.");
        return;
      }
      setFixture(found);
      setTeamsMap(cached.teamsMap);
      setElementsMap(cached.elementsMap);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load match details.");
    } finally {
      setIsLoading(false);
    }
  }, [fixtureId]);

  useEffect(() => { load(); }, [load]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        <View style={styles.navBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialIcons name="arrow-back" size={22} color={Colors.onSurface} />
          </TouchableOpacity>
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.brandTeal} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !fixture) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        <View style={styles.navBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialIcons name="arrow-back" size={22} color={Colors.onSurface} />
          </TouchableOpacity>
        </View>
        <View style={styles.center}>
          <MaterialIcons name="error-outline" size={48} color={Colors.onSurfaceVariant} />
          <Text style={styles.errorText}>{error ?? "Match not found."}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => router.back()}>
            <Text style={styles.retryText}>{isArabic ? "رجوع" : "Go Back"}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const homeTeam = teamsMap.get(fixture.team_h);
  const awayTeam = teamsMap.get(fixture.team_a);
  const homeShort = homeTeam?.short_name ?? DEFAULT_TEAMS_MAP.get(fixture.team_h) ?? "???";
  const awayShort = awayTeam?.short_name ?? DEFAULT_TEAMS_MAP.get(fixture.team_a) ?? "???";
  const homeName = homeTeam?.name ?? homeShort;
  const awayName = awayTeam?.name ?? awayShort;
  const live = !!(fixture.started && !fixture.finished && !fixture.finished_provisional);
  const done = fixture.finished || fixture.finished_provisional;

  const statsToRender = STAT_ORDER
    .map((id) => ({
      id,
      stat: fixture.stats?.find((s) => s.identifier === id),
      config: STAT_CONFIG[id],
    }))
    .filter((s) => s.stat && s.config);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      {/* Nav */}
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>
          {isArabic ? "تفاصيل المباراة" : "Match Details"}
        </Text>
        <TouchableOpacity
          onPress={() => setIsArabic((a) => !a)}
          style={styles.langBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.langBtnText}>{isArabic ? "EN" : "ع"}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Score Hero */}
        <View style={styles.heroCard}>
          {/* Date */}
          <Text style={styles.heroDate}>
            {formatDate(fixture.kickoff_time, isArabic)}
          </Text>
          <Text style={styles.heroTime}>
            {formatTime(fixture.kickoff_time, isArabic)}
          </Text>

          {/* Gameweek badge */}
          {fixture.event && (
            <View style={styles.gwBadge}>
              <Text style={styles.gwBadgeText}>
                {isArabic ? `الجولة ${fixture.event}` : `GW ${fixture.event}`}
              </Text>
            </View>
          )}

          {/* Teams & Score */}
          <View style={styles.scoreHero}>
            {/* Home */}
            <View style={[styles.heroTeam, { alignItems: "flex-end" }]}>
              <Text style={styles.heroShort}>{homeShort}</Text>
              <Text style={styles.heroTeamName} numberOfLines={2}>{homeName}</Text>
            </View>

            {/* Score / Status */}
            <View style={styles.heroScoreCenter}>
              {done || live ? (
                <>
                  <Text style={styles.heroScore}>
                    {fixture.team_h_score ?? 0} - {fixture.team_a_score ?? 0}
                  </Text>
                  {live && (
                    <View style={styles.liveChip}>
                      <View style={styles.liveDot} />
                      <Text style={styles.liveText}>LIVE</Text>
                      {fixture.minutes ? (
                        <Text style={styles.liveMinutes}>{fixture.minutes}&apos;</Text>
                      ) : null}
                    </View>
                  )}
                  {done && !live && (
                    <View style={styles.ftChip}>
                      <Text style={styles.ftText}>FT</Text>
                    </View>
                  )}
                </>
              ) : (
                <Text style={styles.vsText}>VS</Text>
              )}
            </View>

            {/* Away */}
            <View style={[styles.heroTeam, { alignItems: "flex-start" }]}>
              <Text style={styles.heroShort}>{awayShort}</Text>
              <Text style={styles.heroTeamName} numberOfLines={2}>{awayName}</Text>
            </View>
          </View>

          {/* Legend */}
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.teamDot, styles.homeDot]} />
              <Text style={styles.legendText}>{isArabic ? "صاحب الأرض" : "Home"}</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.teamDot, styles.awayDot]} />
              <Text style={styles.legendText}>{isArabic ? "الضيف" : "Away"}</Text>
            </View>
          </View>
        </View>

        {/* Stats */}
        {statsToRender.length > 0 ? (
          <View style={styles.statsCard}>
            <Text style={styles.statsCardTitle}>
              {isArabic ? "إحصائيات المباراة" : "Match Statistics"}
            </Text>
            {statsToRender.map(({ id, stat, config }) => (
              <StatSection
                key={id}
                stat={stat!}
                config={config}
                elementsMap={elementsMap}
                homeTeamId={fixture.team_h}
                isArabic={isArabic}
              />
            ))}
          </View>
        ) : (
          <View style={styles.noStats}>
            <MaterialIcons name="hourglass-empty" size={36} color={Colors.onSurfaceVariant} />
            <Text style={styles.noStatsText}>
              {isArabic ? "الإحصائيات غير متاحة بعد" : "Stats not available yet"}
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.brandPurple },
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
    gap: 10,
  },
  backBtn: { padding: 2 },
  navTitle: {
    fontFamily: "JetBrainsMono_700",
    fontSize: 16,
    color: Colors.onSurface,
    flex: 1,
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
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingHorizontal: Spacing.lg,
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
    padding: Spacing.sm,
    gap: Spacing.sm,
  },

  // Hero card
  heroCard: {
    backgroundColor: Colors.brandPurpleMid,
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    padding: Spacing.md,
    alignItems: "center",
    gap: 8,
  },
  heroDate: {
    fontFamily: "JetBrainsMono_400",
    fontSize: 12,
    color: Colors.onSurfaceVariant,
    textAlign: "center",
  },
  heroTime: {
    fontFamily: "JetBrainsMono_700",
    fontSize: 12,
    color: Colors.onSurfaceVariant,
    textAlign: "center",
  },
  gwBadge: {
    backgroundColor: "rgba(0,255,135,0.12)",
    borderRadius: Radii.full,
    paddingHorizontal: 12,
    paddingVertical: 2,
  },
  gwBadgeText: {
    fontFamily: "JetBrainsMono_700",
    fontSize: 11,
    color: Colors.brandTeal,
  },
  scoreHero: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    marginTop: 8,
  },
  heroTeam: {
    flex: 1,
    gap: 4,
  },
  heroShort: {
    fontFamily: "JetBrainsMono_700",
    fontSize: 22,
    color: Colors.onSurface,
    letterSpacing: 1,
  },
  heroTeamName: {
    fontFamily: "JetBrainsMono_400",
    fontSize: 11,
    color: Colors.onSurfaceVariant,
    maxWidth: 100,
  },
  heroScoreCenter: {
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
  },
  heroScore: {
    fontFamily: "JetBrainsMono_700",
    fontSize: 36,
    color: Colors.brandTeal,
    letterSpacing: 2,
  },
  vsText: {
    fontFamily: "JetBrainsMono_700",
    fontSize: 22,
    color: Colors.onSurfaceVariant,
  },
  liveChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,45,45,0.18)",
    borderRadius: Radii.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#FF6B6B",
  },
  liveText: {
    fontFamily: "JetBrainsMono_700",
    fontSize: 11,
    color: "#FF6B6B",
  },
  liveMinutes: {
    fontFamily: "JetBrainsMono_400",
    fontSize: 11,
    color: "#FF6B6B",
  },
  ftChip: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: Radii.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  ftText: {
    fontFamily: "JetBrainsMono_700",
    fontSize: 11,
    color: Colors.onSurfaceVariant,
  },
  legend: {
    flexDirection: "row",
    gap: 20,
    marginTop: 4,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendText: {
    fontFamily: "JetBrainsMono_400",
    fontSize: 11,
    color: Colors.onSurfaceVariant,
  },

  // Stats card
  statsCard: {
    backgroundColor: Colors.brandPurpleMid,
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    overflow: "hidden",
  },
  statsCardTitle: {
    fontFamily: "JetBrainsMono_700",
    fontSize: 13,
    color: Colors.brandTeal,
    letterSpacing: 0.5,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  statSection: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
    paddingBottom: 4,
  },
  statHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: Spacing.md,
    paddingTop: 12,
    paddingBottom: 6,
  },
  statIcon: { fontSize: 16 },
  statLabel: {
    fontFamily: "JetBrainsMono_700",
    fontSize: 13,
    color: Colors.onSurface,
  },
  statEntries: {
    paddingHorizontal: Spacing.md,
    paddingBottom: 8,
    gap: 5,
  },
  statEntry: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 3,
  },
  statEntryLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  teamDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  homeDot: { backgroundColor: Colors.brandTeal },
  awayDot: { backgroundColor: "#60A5FA" },
  playerName: {
    fontFamily: "JetBrainsMono_500",
    fontSize: 13,
    color: Colors.onSurface,
    flex: 1,
  },
  statValue: {
    fontFamily: "JetBrainsMono_700",
    fontSize: 13,
    color: Colors.onSurfaceVariant,
    minWidth: 30,
    textAlign: "right",
  },

  // No stats
  noStats: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 40,
    backgroundColor: Colors.brandPurpleMid,
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  noStatsText: {
    fontFamily: "JetBrainsMono_400",
    fontSize: 13,
    color: Colors.onSurfaceVariant,
  },
});
