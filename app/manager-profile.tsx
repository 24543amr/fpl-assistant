import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors, Radii } from '@/constants/theme';
import {
  fetchBootstrap,
  fetchUserEntry,
  fetchManagerSquadPicks,
  fetchEntryLeagues,
  fetchEntryHistory,
  fetchGameweekLive,
  FPLPick,
  FPLPlayer,
  FPLFixture,
  FPLUserEntry,
  FPLEntryLeaguesData,
  FPLEventHistory,
  FPLChipHistory,
  DEFAULT_TEAMS_MAP,
  managerProfileCache,
} from '@/api/fpl';
import SquadPitchCard from '@/components/SquadPitchCard';
import SquadBenchCard from '@/components/SquadBenchCard';
import SpinningRefreshButton from '@/components/SpinningRefreshButton';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type ProfileTab = 'points' | 'leagues' | 'cups';

function formatRank(num?: number | null): string {
  if (num == null) return '-';
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function getChipLabel(chip: string | null | undefined, isArabic: boolean): string | null {
  if (!chip) return null;
  const c = chip.toLowerCase();
  if (c.includes('wildcard')) {
    return isArabic ? 'تم تفعيل الوايلد كارد' : 'Wildcard Played';
  }
  if (c.includes('3xc') || c.includes('triple')) {
    return isArabic ? 'تم تفعيل الكابتن الثلاثي' : 'Triple Captain Played';
  }
  if (c.includes('bboost') || c.includes('bench')) {
    return isArabic ? 'تم تفعيل بنش بوست' : 'Bench Boost Played';
  }
  if (c.includes('freehit') || c.includes('free')) {
    return isArabic ? 'تم تفعيل الفري هيت' : 'Free Hit Played';
  }
  return isArabic ? `تم تفعيل ${chip}` : `${chip} Played`;
}

export default function ManagerProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    entryId?: string;
    managerName?: string;
    teamName?: string;
  }>();

  const entryId = params.entryId ? String(params.entryId).trim() : '';
  const initialManagerName = params.managerName || '';
  const initialTeamName = params.teamName || '';

  const [isArabic, setIsArabic] = useState(false);
  const [activeTab, setActiveTab] = useState<ProfileTab>('points');

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data states
  const [entry, setEntry] = useState<FPLUserEntry | null>(null);
  const [picks, setPicks] = useState<FPLPick[]>([]);
  const [activeChip, setActiveChip] = useState<string | null>(null);
  const [entryHistory, setEntryHistory] = useState<FPLEventHistory | null>(null);
  const [leagues, setLeagues] = useState<FPLEntryLeaguesData | null>(null);
  const [seasonChips, setSeasonChips] = useState<FPLChipHistory[]>([]);
  const [currentGw, setCurrentGw] = useState<number>(1);
  const [teamsMap, setTeamsMap] = useState<Map<number, string>>(DEFAULT_TEAMS_MAP);
  const [fixtures, setFixtures] = useState<FPLFixture[]>([]);
  const [livePointsMap, setLivePointsMap] = useState<Map<number, number>>(new Map());

  // Fonts & RTL
  const isRTL = isArabic;
  const flexDir = isRTL ? 'row-reverse' : 'row';
  const textAlign = isRTL ? 'right' : 'left';
  const headlineFont = isArabic ? 'Cairo_700' : 'ArchivoNarrow_700';
  const bodyFont = isArabic ? 'IBMPlexSansArabic_400' : 'HankenGrotesk_400';
  const labelFont = isArabic ? 'IBMPlexSansArabic_600' : 'HankenGrotesk_600';
  const monoFont = 'JetBrainsMono_500';

  // Load Manager Data
  const loadManagerData = useCallback(async (force = false) => {
    if (!entryId) {
      setError(isArabic ? 'رقم المدرب غير صالح.' : 'Invalid Manager Entry ID.');
      setIsLoading(false);
      return;
    }

    // 1. Check in-memory session cache if not forcing refresh
    if (!force) {
      const cached = managerProfileCache.get(entryId);
      if (cached && Date.now() - cached.timestamp < 10 * 60 * 1000) {
        setEntry(cached.entry);
        setPicks(cached.picks);
        setActiveChip(cached.activeChip);
        setEntryHistory(cached.entryHistory);
        setLeagues(cached.leagues);
        setSeasonChips(cached.chips);
        if (cached.entry.current_event) {
          setCurrentGw(cached.entry.current_event);
        }
        setIsLoading(false);
        return;
      }
    }

    if (!force) setIsLoading(true);
    setError(null);

    try {
      // 2. Fetch Bootstrap static & User Entry in parallel
      const [bootstrap, entryData] = await Promise.all([
        fetchBootstrap().catch(() => null),
        fetchUserEntry(entryId),
      ]);

      if (entryData) {
        setEntry(entryData);
      }

      // Map elements & teams
      let elementsMap = new Map<number, FPLPlayer>();
      let resolvedTeamsMap = new Map<number, string>(DEFAULT_TEAMS_MAP);
      let activeGw = entryData?.current_event || 1;

      if (bootstrap) {
        if (bootstrap.elements) {
          elementsMap = new Map(bootstrap.elements.map((el: any) => [el.id, el]));
        }
        if (bootstrap.teams) {
          resolvedTeamsMap = new Map(bootstrap.teams.map((t: any) => [t.id, t.short_name || t.name]));
          setTeamsMap(resolvedTeamsMap);
        }
        if (bootstrap.events) {
          const currentEv = bootstrap.events.find((e: any) => e.is_current) ||
                            bootstrap.events.find((e: any) => e.is_next);
          if (currentEv?.id) {
            activeGw = currentEv.id;
          }
        }
      }
      setCurrentGw(activeGw);

      // 3. Fetch picks, leagues, history, and live points concurrently
      const [squadPicksResult, leaguesData, historyData, liveMap] = await Promise.all([
        fetchManagerSquadPicks(entryId, activeGw, elementsMap).catch(() => ({
          picks: [],
          active_chip: null,
          entry_history: null,
        })),
        fetchEntryLeagues(entryId).catch(() => ({
          classic: [],
          h2h: [],
          cup: null,
        })),
        fetchEntryHistory(entryId).catch(() => ({
          current: [],
          past: [],
          chips: [],
        })),
        fetchGameweekLive(activeGw).catch(() => new Map<number, number>()),
      ]);

      setPicks(squadPicksResult.picks);
      setActiveChip(squadPicksResult.active_chip || null);
      setEntryHistory(squadPicksResult.entry_history || null);
      setLeagues(leaguesData);
      setSeasonChips(historyData.chips || []);
      setLivePointsMap(liveMap);

      // 4. Update session memory cache
      if (entryData) {
        managerProfileCache.set(entryId, {
          entry: entryData,
          picks: squadPicksResult.picks,
          activeChip: squadPicksResult.active_chip || null,
          entryHistory: squadPicksResult.entry_history || null,
          leagues: leaguesData,
          chips: historyData.chips || [],
          timestamp: Date.now(),
        });
      }
    } catch (err: any) {
      console.warn('[ManagerProfile] Load error:', err.message);
      setError(
        isArabic
          ? 'تعذر تحميل بيانات المدرب. يرجى المحاولة مرة أخرى.'
          : 'Failed to load manager profile. Please try again.'
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [entryId, isArabic]);

  useEffect(() => {
    void loadManagerData(false);
  }, [loadManagerData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadManagerData(true);
  };

  // Starters & Bench split
  const starters = useMemo(() => picks.slice(0, 11), [picks]);
  const bench = useMemo(() => picks.slice(11, 15), [picks]);

  const gks = useMemo(() => starters.filter(p => (p.player?.element_type ?? (p as any).element_type) === 1), [starters]);
  const defs = useMemo(() => starters.filter(p => (p.player?.element_type ?? (p as any).element_type) === 2), [starters]);
  const mids = useMemo(() => starters.filter(p => (p.player?.element_type ?? (p as any).element_type) === 3), [starters]);
  const fwds = useMemo(() => starters.filter(p => (p.player?.element_type ?? (p as any).element_type) === 4), [starters]);

  // Points and transfer stats
  const currentGwPoints = entryHistory?.points ?? entry?.summary_event_points ?? 0;
  const transfersMade = entryHistory?.event_transfers ?? 0;
  const chipPlayedThisGw = activeChip || null;
  const chipBadgeText = getChipLabel(chipPlayedThisGw, isArabic);

  const displayTeamName = entry?.name || initialTeamName || (isArabic ? 'فريق المدرب' : 'Team');
  const displayManagerName = entry
    ? `${entry.player_first_name || ''} ${entry.player_last_name || ''}`.trim()
    : initialManagerName;

  const tabs: { key: ProfileTab; label: string }[] = [
    { key: 'points', label: isArabic ? 'النقاط' : 'Points' },
    { key: 'leagues', label: isArabic ? 'الدوريات' : 'Leagues' },
    { key: 'cups', label: isArabic ? 'الكأسات' : 'Cups' },
  ];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* ── TOP APP BAR ──────────────────────────────────────────────────────── */}
      <View style={[styles.topBar, { flexDirection: flexDir }]}>
        {/* Back Button */}
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialIcons
            name={isRTL ? 'arrow-forward' : 'arrow-back'}
            size={24}
            color={Colors.white}
          />
        </TouchableOpacity>

        {/* Center Team Info */}
        <View style={styles.headerCenter}>
          <Text style={[styles.teamNameHeader, { fontFamily: headlineFont }]} numberOfLines={1}>
            {displayTeamName}
          </Text>
          <Text style={[styles.gwSubtitle, { fontFamily: bodyFont }]}>
            {isArabic ? `الجولة ${currentGw}` : `Gameweek ${currentGw}`}
            {displayManagerName ? ` • ${displayManagerName}` : ''}
          </Text>
        </View>

        {/* Right Actions: Lang toggle & Refresh */}
        <View style={[styles.headerActions, { flexDirection: flexDir }]}>
          <TouchableOpacity
            style={styles.langToggle}
            onPress={() => setIsArabic(!isArabic)}
            activeOpacity={0.8}
          >
            <Text style={[styles.langText, { fontFamily: labelFont }]}>
              {isArabic ? 'EN' : 'عربي'}
            </Text>
          </TouchableOpacity>

          <SpinningRefreshButton
            onRefresh={handleRefresh}
            isRefreshing={isRefreshing}
            isArabic={isArabic}
            color={Colors.brandTeal}
            size={18}
          />
        </View>
      </View>

      {/* ── THREE TABS (Points | Leagues | Cups) ──────────────────────────────── */}
      <View style={[styles.tabBar, { flexDirection: flexDir }]}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabItem, isActive && styles.tabItemActive]}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.tabText,
                  isActive && styles.tabTextActive,
                  { fontFamily: headlineFont },
                ]}
              >
                {tab.label}
              </Text>
              {isActive && <View style={styles.tabIndicator} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── CONTENT BODY ────────────────────────────────────────────────────── */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.brandTeal} />
          <Text style={[styles.loadingText, { fontFamily: bodyFont }]}>
            {isArabic ? 'جاري تحميل بيانات المدرب...' : 'Loading manager profile...'}
          </Text>
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <MaterialIcons name="error-outline" size={42} color={Colors.error} />
          <Text style={[styles.errorText, { fontFamily: bodyFont }]}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => loadManagerData(true)}>
            <Text style={[styles.retryBtnText, { fontFamily: headlineFont }]}>
              {isArabic ? 'إعادة المحاولة' : 'Retry'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={Colors.brandTeal}
              colors={[Colors.brandTeal]}
            />
          }
        >
          {/* ══════════════════════════════════════════════════════════════════════
              TAB 1: POINTS (STAT BUBBLES + TACTICAL PITCH VIEW)
          ══════════════════════════════════════════════════════════════════════ */}
          {activeTab === 'points' && (
            <View style={styles.tabContainer}>
              {/* Stat Bubbles Row */}
              <View style={[styles.statBubblesRow, { flexDirection: flexDir }]}>
                {/* Points Bubble */}
                <View style={styles.pointsBubble}>
                  <Text style={[styles.pointsBubbleNumber, { fontFamily: monoFont }]}>
                    {currentGwPoints}
                  </Text>
                  <Text style={[styles.pointsBubbleLabel, { fontFamily: labelFont }]}>
                    {isArabic ? 'نقطة' : 'pts'}
                  </Text>
                </View>

                {/* Transfers Bubble */}
                <View style={styles.transfersBubble}>
                  <Text style={[styles.transfersBubbleNumber, { fontFamily: monoFont }]}>
                    {transfersMade}
                  </Text>
                  <Text style={[styles.transfersBubbleLabel, { fontFamily: labelFont }]}>
                    {isArabic ? 'انتقالات' : 'Transfers'}
                  </Text>
                </View>
              </View>

              {/* Active Chip Badge if played this GW */}
              {!!chipBadgeText && (
                <View style={[styles.chipPill, { flexDirection: flexDir }]}>
                  <MaterialCommunityIcons name="lightning-bolt" size={15} color={Colors.brandPurple} />
                  <Text style={[styles.chipPillText, { fontFamily: labelFont }]}>
                    {chipBadgeText}
                  </Text>
                </View>
              )}

              {/* Tactical Pitch Wrapper */}
              <View style={styles.pitchWrapper}>
                {/* Pitch Markings */}
                <View style={styles.pitchMarkingHalfway} pointerEvents="none" />
                <View style={styles.pitchMarkingCenterCircle} pointerEvents="none" />
                <View style={styles.pitchMarkingPenaltyTop} pointerEvents="none" />
                <View style={styles.pitchMarkingPenaltyBottom} pointerEvents="none" />

                {/* Pitch Rows */}
                <View style={styles.pitchRowsContainer}>
                  {/* GK Row */}
                  <View style={styles.pitchRow}>
                    {gks.map((pick) => {
                      const raw = livePointsMap.get(pick.element) ?? pick.player?.total_points ?? 0;
                      const mult = pick.multiplier || (pick.is_captain ? 2 : 1);
                      return (
                        <SquadPitchCard
                          key={`gk-${pick.element}`}
                          pick={pick}
                          teamsMap={teamsMap}
                          fixtures={fixtures}
                          targetGw={currentGw}
                          isArabic={isArabic}
                          badgeMode="points"
                          points={raw * mult}
                          onPress={() => {}}
                        />
                      );
                    })}
                  </View>

                  {/* DEF Row */}
                  <View style={styles.pitchRow}>
                    {defs.map((pick) => {
                      const raw = livePointsMap.get(pick.element) ?? pick.player?.total_points ?? 0;
                      const mult = pick.multiplier || (pick.is_captain ? 2 : 1);
                      return (
                        <SquadPitchCard
                          key={`def-${pick.element}`}
                          pick={pick}
                          teamsMap={teamsMap}
                          fixtures={fixtures}
                          targetGw={currentGw}
                          isArabic={isArabic}
                          badgeMode="points"
                          points={raw * mult}
                          onPress={() => {}}
                        />
                      );
                    })}
                  </View>

                  {/* MID Row */}
                  <View style={styles.pitchRow}>
                    {mids.map((pick) => {
                      const raw = livePointsMap.get(pick.element) ?? pick.player?.total_points ?? 0;
                      const mult = pick.multiplier || (pick.is_captain ? 2 : 1);
                      return (
                        <SquadPitchCard
                          key={`mid-${pick.element}`}
                          pick={pick}
                          teamsMap={teamsMap}
                          fixtures={fixtures}
                          targetGw={currentGw}
                          isArabic={isArabic}
                          badgeMode="points"
                          points={raw * mult}
                          onPress={() => {}}
                        />
                      );
                    })}
                  </View>

                  {/* FWD Row */}
                  <View style={styles.pitchRow}>
                    {fwds.map((pick) => {
                      const raw = livePointsMap.get(pick.element) ?? pick.player?.total_points ?? 0;
                      const mult = pick.multiplier || (pick.is_captain ? 2 : 1);
                      return (
                        <SquadPitchCard
                          key={`fwd-${pick.element}`}
                          pick={pick}
                          teamsMap={teamsMap}
                          fixtures={fixtures}
                          targetGw={currentGw}
                          isArabic={isArabic}
                          badgeMode="points"
                          points={raw * mult}
                          onPress={() => {}}
                        />
                      );
                    })}
                  </View>
                </View>
              </View>

              {/* Substitutes / Bench Section */}
              <View style={styles.benchWrapper}>
                <View style={[styles.benchHeaderRow, { flexDirection: flexDir }]}>
                  <Text style={[styles.benchHeaderTitle, { fontFamily: headlineFont }]}>
                    {isArabic ? 'الاحتياط' : 'Substitutes'}
                  </Text>
                  <Text style={[styles.benchSubRulesText, { fontFamily: bodyFont }]}>
                    {isArabic ? 'النقاط المسجلة على الدكة' : 'Bench scoring'}
                  </Text>
                </View>

                <View style={[styles.benchCardsRow, { flexDirection: flexDir }]}>
                  {bench.map((pick, bIdx) => {
                    const pts = livePointsMap.get(pick.element) ?? pick.player?.total_points ?? 0;
                    return (
                      <SquadBenchCard
                        key={`bench-${pick.element}`}
                        pick={pick}
                        benchIndex={bIdx + 1}
                        teamsMap={teamsMap}
                        fixtures={fixtures}
                        targetGw={currentGw}
                        isArabic={isArabic}
                        badgeMode="points"
                        points={pts}
                        onPress={() => {}}
                      />
                    );
                  })}
                </View>
              </View>
            </View>
          )}

          {/* ══════════════════════════════════════════════════════════════════════
              TAB 2: LEAGUES (GENERAL LEAGUES LIST WITH RANKS)
          ══════════════════════════════════════════════════════════════════════ */}
          {activeTab === 'leagues' && (
            <View style={styles.tabContainer}>
              <View style={[styles.sectionHeaderRow, { flexDirection: flexDir }]}>
                <MaterialCommunityIcons name="trophy-award" size={20} color={Colors.brandTeal} />
                <Text style={[styles.sectionHeaderTitle, { fontFamily: headlineFont, textAlign }]}>
                  {isArabic ? 'الدوريات العامة' : 'General Leagues'}
                </Text>
              </View>

              {(!leagues?.classic || leagues.classic.length === 0) ? (
                <View style={styles.emptyCard}>
                  <MaterialIcons name="format-list-bulleted" size={32} color={Colors.onSurfaceVariant} />
                  <Text style={[styles.emptyText, { fontFamily: bodyFont }]}>
                    {isArabic ? 'لا توجد دوريات كلاسيكية مسجلة.' : 'No classic leagues found.'}
                  </Text>
                </View>
              ) : (
                <View style={styles.leaguesList}>
                  {leagues.classic.map((item) => {
                    const rankStr = formatRank(item.entry_rank);
                    const lastRank = item.entry_last_rank;
                    const isUp = lastRank && item.entry_rank < lastRank;

                    return (
                      <TouchableOpacity
                        key={`league-${item.id}`}
                        style={[styles.leagueRow, { flexDirection: flexDir }]}
                        activeOpacity={0.75}
                        onPress={() => {
                          router.push({
                            pathname: '/league-detail',
                            params: {
                              id: String(item.id),
                              name: item.name,
                              rank: String(item.entry_rank),
                              total: String(item.rank_count || ''),
                            },
                          });
                        }}
                      >
                        {/* Rank Movement Indicator */}
                        <View style={styles.leagueRankBadge}>
                          <MaterialIcons
                            name={isUp ? 'arrow-drop-up' : 'arrow-drop-down'}
                            size={22}
                            color={isUp ? '#00FF87' : '#F87171'}
                          />
                          <Text style={[styles.leagueRankText, { fontFamily: monoFont }]}>
                            {rankStr}
                          </Text>
                        </View>

                        {/* League Name */}
                        <View style={[styles.leagueInfoCol, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
                          <Text style={[styles.leagueNameText, { fontFamily: headlineFont }]} numberOfLines={1}>
                            {item.name}
                          </Text>
                          {!!item.rank_count && (
                            <Text style={[styles.leagueCountText, { fontFamily: bodyFont }]}>
                              {isArabic
                                ? `من أصل ${formatRank(item.rank_count)} مدرب`
                                : `of ${formatRank(item.rank_count)} managers`}
                            </Text>
                          )}
                        </View>

                        {/* Arrow Chevron */}
                        <MaterialIcons
                          name={isRTL ? 'chevron-left' : 'chevron-right'}
                          size={22}
                          color={Colors.onSurfaceVariant}
                        />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          {/* ══════════════════════════════════════════════════════════════════════
              TAB 3: CUPS (CUP COMPETITIONS)
          ══════════════════════════════════════════════════════════════════════ */}
          {activeTab === 'cups' && (
            <View style={styles.tabContainer}>
              <View style={[styles.sectionHeaderRow, { flexDirection: flexDir }]}>
                <MaterialCommunityIcons name="trophy" size={20} color={Colors.brandTeal} />
                <Text style={[styles.sectionHeaderTitle, { fontFamily: headlineFont, textAlign }]}>
                  {isArabic ? 'الكؤوس العامة' : 'General Cups'}
                </Text>
              </View>

              {/* Cup list rendering */}
              <View style={styles.cupsList}>
                {/* Standard FPL Overall Cup */}
                <View style={[styles.cupRow, { flexDirection: flexDir }]}>
                  <View style={styles.cupIconCircle}>
                    <MaterialCommunityIcons name="trophy-variant" size={20} color={Colors.brandTeal} />
                  </View>
                  <View style={[styles.cupInfoCol, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
                    <Text style={[styles.cupNameText, { fontFamily: headlineFont }]}>
                      {isArabic ? 'كأس الفانتازي العام' : 'FPL Overall Cup'}
                    </Text>
                    <Text style={[styles.cupStatusText, { fontFamily: bodyFont }]}>
                      {isArabic ? 'التصفيات نشطة' : 'Qualification Stage'}
                    </Text>
                  </View>
                </View>

                {/* Classic Leagues with Cups */}
                {leagues?.classic
                  ?.filter((l) => l.has_cup)
                  .map((l) => (
                    <View key={`cup-${l.id}`} style={[styles.cupRow, { flexDirection: flexDir }]}>
                      <View style={styles.cupIconCircle}>
                        <MaterialCommunityIcons name="shield-star-outline" size={20} color={Colors.brandTeal} />
                      </View>
                      <View style={[styles.cupInfoCol, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
                        <Text style={[styles.cupNameText, { fontFamily: headlineFont }]}>
                          {isArabic ? `كأس دوري ${l.name}` : `${l.name} Cup`}
                        </Text>
                        <Text style={[styles.cupStatusText, { fontFamily: bodyFont }]}>
                          {isArabic ? 'متاح للمنافسة' : 'Eligible League Cup'}
                        </Text>
                      </View>
                    </View>
                  ))}

                {/* Additional cup matches if present */}
                {(leagues?.cup?.matches || []).map((m) => (
                  <View key={`cup-match-${m.id}`} style={[styles.cupRow, { flexDirection: flexDir }]}>
                    <View style={styles.cupIconCircle}>
                      <MaterialCommunityIcons name="sword-cross" size={20} color={Colors.brandTeal} />
                    </View>
                    <View style={[styles.cupInfoCol, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
                      <Text style={[styles.cupNameText, { fontFamily: headlineFont }]}>
                        {m.knockout_name || (isArabic ? 'مباراة الكأس' : 'Cup Match')}
                      </Text>
                      <Text style={[styles.cupStatusText, { fontFamily: bodyFont }]}>
                        {m.entry_1_name} vs {m.entry_2_name}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#37003c',
  },
  topBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  backBtn: {
    padding: 6,
    borderRadius: Radii.full,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  teamNameHeader: {
    fontSize: 18,
    color: Colors.white,
    fontWeight: '700',
  },
  gwSubtitle: {
    fontSize: 12,
    color: '#d2c2cd',
    marginTop: 2,
  },
  headerActions: {
    alignItems: 'center',
    gap: 10,
  },
  langToggle: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radii.default,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  langText: {
    fontSize: 11,
    color: Colors.brandTeal,
    fontWeight: '700',
  },

  /* Tabs */
  tabBar: {
    backgroundColor: '#37003c',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  tabItem: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    position: 'relative',
  },
  tabItemActive: {
    backgroundColor: 'rgba(0, 255, 135, 0.04)',
  },
  tabText: {
    fontSize: 14,
    color: '#d2c2cd',
  },
  tabTextActive: {
    color: Colors.brandTeal,
    fontWeight: '700',
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 16,
    right: 16,
    height: 3,
    backgroundColor: Colors.brandTeal,
    borderRadius: Radii.full,
  },

  /* Scroll Area */
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  tabContainer: {
    gap: 14,
  },

  /* Stat Bubbles */
  statBubblesRow: {
    gap: 12,
  },
  pointsBubble: {
    flex: 1,
    backgroundColor: Colors.brandTeal,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.brandTeal,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  pointsBubbleNumber: {
    fontSize: 28,
    fontWeight: '800',
    color: '#00210c',
  },
  pointsBubbleLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#003919',
    marginTop: 2,
    textTransform: 'uppercase',
  },
  transfersBubble: {
    flex: 1,
    backgroundColor: '#4f1953',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  transfersBubbleNumber: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.white,
  },
  transfersBubbleLabel: {
    fontSize: 12,
    color: '#d2c2cd',
    marginTop: 2,
    textTransform: 'uppercase',
  },

  /* Chip Played Pill */
  chipPill: {
    alignSelf: 'center',
    backgroundColor: Colors.brandTeal,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: Radii.full,
    alignItems: 'center',
    gap: 6,
    shadowColor: Colors.brandTeal,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  chipPillText: {
    color: Colors.brandPurple,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  /* Tactical Pitch */
  pitchWrapper: {
    backgroundColor: '#12331f',
    borderRadius: 18,
    paddingVertical: 14,
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(96, 255, 152, 0.2)',
    marginVertical: 4,
  },
  pitchMarkingHalfway: {
    position: 'absolute',
    top: '50%',
    left: 8,
    right: 8,
    height: 1,
    backgroundColor: 'rgba(96, 255, 152, 0.25)',
  },
  pitchMarkingCenterCircle: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 90,
    height: 90,
    marginTop: -45,
    marginLeft: -45,
    borderRadius: 45,
    borderWidth: 1,
    borderColor: 'rgba(96, 255, 152, 0.25)',
  },
  pitchMarkingPenaltyTop: {
    position: 'absolute',
    top: 0,
    left: '25%',
    right: '25%',
    height: 40,
    borderBottomWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(96, 255, 152, 0.2)',
  },
  pitchMarkingPenaltyBottom: {
    position: 'absolute',
    bottom: 0,
    left: '25%',
    right: '25%',
    height: 40,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(96, 255, 152, 0.2)',
  },
  pitchRowsContainer: {
    zIndex: 2,
    gap: 12,
  },
  pitchRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 6,
  },

  /* Bench */
  benchWrapper: {
    backgroundColor: '#27082b',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  benchHeaderRow: {
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  benchHeaderTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  benchSubRulesText: {
    color: '#9b8d97',
    fontSize: 11,
  },
  benchCardsRow: {
    gap: 8,
    justifyContent: 'space-between',
  },

  /* Leagues Tab */
  sectionHeaderRow: {
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    marginBottom: 4,
  },
  sectionHeaderTitle: {
    fontSize: 16,
    color: Colors.brandTeal,
    fontWeight: '700',
  },
  leaguesList: {
    gap: 8,
  },
  leagueRow: {
    backgroundColor: '#4f1953',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  leagueRankBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 70,
    gap: 2,
  },
  leagueRankText: {
    fontSize: 14,
    color: Colors.white,
    fontWeight: '700',
  },
  leagueInfoCol: {
    flex: 1,
    paddingHorizontal: 10,
  },
  leagueNameText: {
    fontSize: 15,
    color: Colors.white,
    fontWeight: '700',
  },
  leagueCountText: {
    fontSize: 11,
    color: '#d2c2cd',
    marginTop: 2,
  },

  /* Cups Tab */
  cupsList: {
    gap: 10,
  },
  cupRow: {
    backgroundColor: '#4f1953',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    gap: 12,
  },
  cupIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0, 255, 135, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 135, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cupInfoCol: {
    flex: 1,
  },
  cupNameText: {
    fontSize: 15,
    color: Colors.white,
    fontWeight: '700',
  },
  cupStatusText: {
    fontSize: 12,
    color: '#d2c2cd',
    marginTop: 2,
  },

  /* Loading & Error */
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 60,
  },
  loadingText: {
    fontSize: 14,
    color: '#d2c2cd',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 60,
  },
  errorText: {
    fontSize: 14,
    color: Colors.error,
    textAlign: 'center',
  },
  retryBtn: {
    backgroundColor: Colors.brandTeal,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: Radii.full,
    marginTop: 8,
  },
  retryBtnText: {
    color: Colors.brandPurple,
    fontSize: 14,
    fontWeight: '700',
  },
  emptyCard: {
    backgroundColor: '#4f1953',
    borderRadius: 14,
    padding: 28,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
    color: '#d2c2cd',
    textAlign: 'center',
  },
});
