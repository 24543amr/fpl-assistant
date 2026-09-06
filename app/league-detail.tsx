import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors, FontSizes, Radii, Spacing } from '@/constants/theme';
import BottomNav from '@/components/BottomNav';
import { fetchBootstrap, fetchLeagueStandings, FPLStandingItem } from '@/api/fpl';
import { getStoredTeamId } from '@/utils/storage';

type StandingsMode = 'overall' | 'gw';

function formatRank(num?: number | null): string {
  if (num == null) return '-';
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Generate initials from manager name
function getInitials(name?: string): string {
  if (!name) return 'FC';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function LeagueDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id?: string;
    name?: string;
    rank?: string;
    total?: string;
    type?: string;
  }>();

  const leagueId = params.id ? Number(params.id) : 0;
  const initialName = params.name || 'League Standings';
  const initialRank = params.rank ? Number(params.rank) : null;
  const initialTotal = params.total ? Number(params.total) : null;
  const leagueType = params.type || 's';

  const [isArabic, setIsArabic] = useState(false);
  const [mode, setMode] = useState<StandingsMode>('overall');
  const [standings, setStandings] = useState<FPLStandingItem[]>([]);
  const [leagueName, setLeagueName] = useState(initialName);
  const [userRank, setUserRank] = useState<number | null>(initialRank);
  const [totalMembers, setTotalMembers] = useState<number | null>(initialTotal);
  const [currentGw, setCurrentGw] = useState<number>(1);
  const [currentTeamId, setCurrentTeamId] = useState<number | null>(null);

  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const flatListRef = useRef<FlatList<FPLStandingItem>>(null);

  const headlineFont = isArabic ? 'Cairo_700' : 'ArchivoNarrow_700';
  const bodyFont = isArabic ? 'IBMPlexSansArabic_500' : 'HankenGrotesk_500';
  const labelFont = isArabic ? 'IBMPlexSansArabic_600' : 'JetBrainsMono_700';
  const flexDir = isArabic ? 'row-reverse' : 'row';
  const textAlign = isArabic ? 'right' : 'left';

  const loadInitialData = useCallback(async () => {
    if (!leagueId) {
      setError(isArabic ? 'معرف الدوري غير صحيح' : 'Invalid League ID.');
      setIsLoading(false);
      return;
    }

    try {
      setError(null);
      const storedId = await getStoredTeamId();
      if (storedId) {
        setCurrentTeamId(Number(storedId));
      }

      // Bootstrap for current GW
      const bootstrapData = await fetchBootstrap().catch(() => null);
      if (bootstrapData?.events) {
        const currentEvent = bootstrapData.events.find((e) => e.is_current) || bootstrapData.events.find((e) => e.is_next);
        if (currentEvent) setCurrentGw(currentEvent.id);
      }

      // Fetch page 1 standings
      const data = await fetchLeagueStandings(leagueId, 1);
      if (data.league?.name) setLeagueName(data.league.name);
      if (data.standings?.results) {
        setStandings(data.standings.results);
        setHasNextPage(Boolean(data.standings.has_next));
        setPage(1);

        // Try to locate user's rank in results if not already set
        if (storedId) {
          const myEntry = data.standings.results.find((r) => r.entry === Number(storedId));
          if (myEntry) setUserRank(myEntry.rank);
        }
      }
    } catch (err: any) {
      console.warn('[LeagueDetail] Load error:', err.message);
      setError(isArabic ? 'تعذر تحميل ترتيب الدوري. يرجى المحاولة لاحقاً.' : 'Failed to load league standings. Please try again.');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [leagueId, isArabic]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadInitialData();
  };

  const loadMore = async () => {
    if (loadingMore || !hasNextPage) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const data = await fetchLeagueStandings(leagueId, nextPage);
      if (data.standings?.results) {
        setStandings((prev) => [...prev, ...data.standings.results]);
        setHasNextPage(Boolean(data.standings.has_next));
        setPage(nextPage);
      }
    } catch (err: any) {
      console.warn('[LeagueDetail] Load more error:', err.message);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: isArabic
          ? `تابع ترتيب دوري الفانتازي: ${leagueName} على تطبيق FPL Assistant!`
          : `Check out our FPL league: ${leagueName} on FPL Assistant!`,
      });
    } catch (e) {}
  };

  const scrollToMyRank = () => {
    if (!currentTeamId || standings.length === 0) return;
    const index = standings.findIndex((item) => item.entry === currentTeamId);
    if (index !== -1) {
      flatListRef.current?.scrollToIndex({
        index,
        animated: true,
        viewPosition: 0.5,
      });
    } else {
      // If user is further down the table, load more or scroll near end
      flatListRef.current?.scrollToEnd({ animated: true });
    }
  };

  // Sort or display standings based on selected mode
  const displayedStandings = [...standings].sort((a, b) => {
    if (mode === 'gw') {
      return (b.event_total || 0) - (a.event_total || 0);
    }
    return (a.rank || 0) - (b.rank || 0);
  });

  const isH2H = leagueType === 'h';
  const leagueTypeLabel = isH2H
    ? isArabic ? 'مواجهات مباشرة' : 'Head-to-Head'
    : isArabic ? 'كلاسيك' : 'Classic';

  return (
    <View style={styles.root}>
      {/* ── 1. DEDICATED LEAGUE DETAIL HEADER (NO AVATAR) ── */}
      <SafeAreaView style={styles.headerSafeArea} edges={['top']}>
        <View style={[styles.header, { flexDirection: flexDir }]}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.back()}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialIcons
              name={isArabic ? 'arrow-forward' : 'arrow-back'}
              size={24}
              color={Colors.onSurface}
            />
          </TouchableOpacity>

          <Text style={[styles.headerTitle, { fontFamily: headlineFont, textAlign }]} numberOfLines={1}>
            {leagueName}
          </Text>

          <View style={[styles.headerActions, { flexDirection: flexDir }]}>
            <TouchableOpacity
              style={styles.shareBtn}
              onPress={handleShare}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialIcons name="share" size={20} color={Colors.brandTeal} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.langToggle}
              onPress={() => setIsArabic(!isArabic)}
              activeOpacity={0.8}
            >
              <Text style={[styles.langActive, { fontFamily: labelFont }]}>
                {isArabic ? 'عربي' : 'EN'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>

      {/* ── 2. SUMMARY CARD ── */}
      <View style={styles.summaryCardWrapper}>
        <View style={styles.summaryCard}>
          <View style={[styles.summaryHeader, { flexDirection: flexDir }]}>
            <View style={styles.typePill}>
              <Text style={[styles.typePillText, { fontFamily: labelFont }]}>
                {leagueTypeLabel}
              </Text>
            </View>

            <View style={[styles.gwContextPill, { flexDirection: flexDir }]}>
              <MaterialIcons name="sports-soccer" size={14} color={Colors.brandTeal} />
              <Text style={[styles.gwContextText, { fontFamily: labelFont }]}>
                {isArabic ? `الجولة ${currentGw}` : `Gameweek ${currentGw}`}
              </Text>
            </View>

            {totalMembers != null && (
              <Text style={[styles.memberCountText, { fontFamily: bodyFont }]}>
                {isArabic ? `${formatRank(totalMembers)} عضو` : `${formatRank(totalMembers)} members`}
              </Text>
            )}
          </View>

          {/* Highlighted Rank Banner */}
          <View style={[styles.rankBanner, { flexDirection: flexDir }]}>
            <View style={{ alignItems: isArabic ? 'flex-end' : 'flex-start' }}>
              <Text style={[styles.rankBannerSub, { fontFamily: bodyFont }]}>
                {isArabic ? 'ترتيبك الحالي في الدوري' : 'Your Current League Standing'}
              </Text>
              <Text style={[styles.rankBannerNumber, { fontFamily: headlineFont }]}>
                #{formatRank(userRank)}
              </Text>
            </View>

            <View style={styles.trophyGlow}>
              <MaterialIcons name="emoji-events" size={36} color={Colors.brandTeal} />
            </View>
          </View>
        </View>

        {/* ── 3. SEGMENTED CONTROL: THIS GAMEWEEK | OVERALL ── */}
        <View style={[styles.segmentedControl, { flexDirection: flexDir }]}>
          <TouchableOpacity
            style={[styles.segmentBtn, mode === 'overall' && styles.segmentBtnActive]}
            onPress={() => setMode('overall')}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.segmentText,
                {
                  fontFamily: headlineFont,
                  color: mode === 'overall' ? Colors.brandPurple : Colors.onSurfaceVariant,
                },
              ]}
            >
              {isArabic ? 'الترتيب العام' : 'Overall'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.segmentBtn, mode === 'gw' && styles.segmentBtnActive]}
            onPress={() => setMode('gw')}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.segmentText,
                {
                  fontFamily: headlineFont,
                  color: mode === 'gw' ? Colors.brandPurple : Colors.onSurfaceVariant,
                },
              ]}
            >
              {isArabic ? 'هذه الجولة' : 'This Gameweek'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── 4. STANDINGS LIST (SCROLLABLE FLATLIST) ── */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.brandTeal} />
          <Text style={[styles.loadingText, { fontFamily: bodyFont }]}>
            {isArabic ? 'جاري تحميل جدول الترتيب...' : 'Loading standings...'}
          </Text>
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <MaterialIcons name="error-outline" size={40} color={Colors.error} />
          <Text style={[styles.errorText, { fontFamily: bodyFont }]}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={onRefresh}>
            <Text style={[styles.retryBtnText, { fontFamily: headlineFont }]}>
              {isArabic ? 'إعادة المحاولة' : 'Retry'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={displayedStandings}
          keyExtractor={(item) => String(item.id || item.entry)}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.brandTeal}
              colors={[Colors.brandTeal]}
            />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListHeaderComponent={
            <View style={[styles.listHeaderRow, { flexDirection: flexDir }]}>
              <Text style={[styles.listHeaderCol, { fontFamily: labelFont, width: 45 }]}>#</Text>
              <Text style={[styles.listHeaderCol, { fontFamily: labelFont, flex: 1, textAlign }]}>
                {isArabic ? 'المدرب / الفريق' : 'Manager / Team'}
              </Text>
              <Text style={[styles.listHeaderCol, { fontFamily: labelFont, width: 75, textAlign: 'right' }]}>
                {mode === 'overall' ? (isArabic ? 'النقاط' : 'Pts') : (isArabic ? 'الجولة' : 'GW Pts')}
              </Text>
            </View>
          }
          renderItem={({ item, index }) => {
            const isUser = currentTeamId != null && item.entry === currentTeamId;
            const rankNum = mode === 'overall' ? item.rank : index + 1;
            const lastRank = item.last_rank;

            let movement: 'up' | 'down' | 'neutral' = 'neutral';
            if (rankNum && lastRank) {
              if (rankNum < lastRank) movement = 'up';
              else if (rankNum > lastRank) movement = 'down';
            }

            const pointsDisplay = mode === 'overall' ? item.total : item.event_total;
            const initials = getInitials(item.player_name);

            return (
              <View
                style={[
                  styles.standingRow,
                  isUser && styles.userStandingRow,
                  { flexDirection: flexDir },
                ]}
              >
                {/* Rank & Movement Badge */}
                <View style={styles.rankBadgeCol}>
                  <Text
                    style={[
                      styles.rankNumText,
                      { fontFamily: labelFont, color: isUser ? Colors.brandTeal : Colors.white },
                    ]}
                  >
                    {rankNum}
                  </Text>
                  {movement === 'up' ? (
                    <MaterialIcons name="arrow-drop-up" size={20} color="#00FF87" />
                  ) : movement === 'down' ? (
                    <MaterialIcons name="arrow-drop-down" size={20} color="#F87171" />
                  ) : (
                    <MaterialIcons name="remove" size={14} color="rgba(255,255,255,0.3)" />
                  )}
                </View>

                {/* Manager Avatar (Initials) */}
                <View style={[styles.managerAvatar, isUser && styles.userAvatar]}>
                  <Text style={[styles.avatarText, { fontFamily: labelFont }]}>{initials}</Text>
                </View>

                {/* Names: Manager & Team */}
                <View style={[styles.namesCol, { alignItems: isArabic ? 'flex-end' : 'flex-start' }]}>
                  <View style={[styles.managerNameRow, { flexDirection: flexDir }]}>
                    <Text
                      style={[
                        styles.managerNameText,
                        { fontFamily: headlineFont, color: isUser ? Colors.brandTeal : Colors.white },
                      ]}
                      numberOfLines={1}
                    >
                      {item.player_name}
                    </Text>
                    {isUser && (
                      <View style={styles.youBadge}>
                        <Text style={[styles.youBadgeText, { fontFamily: labelFont }]}>
                          {isArabic ? 'أنت' : 'YOU'}
                        </Text>
                      </View>
                    )}
                  </View>

                  <Text style={[styles.teamNameSubText, { fontFamily: bodyFont }]} numberOfLines={1}>
                    {item.entry_name}
                  </Text>
                </View>

                {/* Points */}
                <View style={styles.pointsCol}>
                  <Text
                    style={[
                      styles.pointsValueText,
                      { fontFamily: labelFont, color: isUser ? Colors.brandTeal : Colors.white },
                    ]}
                  >
                    {pointsDisplay ?? 0}
                  </Text>
                  <Text style={[styles.pointsUnitText, { fontFamily: bodyFont }]}>
                    {isArabic ? 'نقطة' : 'pts'}
                  </Text>
                </View>
              </View>
            );
          }}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color={Colors.brandTeal} />
              </View>
            ) : (
              <View style={{ height: 40 }} />
            )
          }
        />
      )}

      {/* ── 6. STICKY "MY RANK (#X)" FLOATING BUTTON ── */}
      {userRank != null && (
        <TouchableOpacity
          style={[styles.floatingRankBtn, { [isArabic ? 'left' : 'right']: 16 }]}
          onPress={scrollToMyRank}
          activeOpacity={0.85}
        >
          <MaterialIcons name="my-location" size={18} color={Colors.brandPurple} />
          <Text style={[styles.floatingRankText, { fontFamily: labelFont }]}>
            {isArabic ? `ترتيبي (#${formatRank(userRank)})` : `My Rank (#${formatRank(userRank)})`}
          </Text>
        </TouchableOpacity>
      )}

      {/* ── 8. SHARED BOTTOM NAVIGATION BAR (LEAGUES TAB ACTIVE) ── */}
      <BottomNav activeTab="leagues" isArabic={isArabic} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#37003C',
  },
  headerSafeArea: {
    backgroundColor: 'rgba(18,20,20,0.85)',
    zIndex: 100,
  },
  header: {
    height: 54,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    color: Colors.white,
    fontSize: 18,
    flex: 1,
    marginHorizontal: 10,
  },
  headerActions: {
    alignItems: 'center',
    gap: 8,
  },
  shareBtn: {
    padding: 6,
    borderRadius: Radii.full,
    backgroundColor: 'rgba(0, 255, 135, 0.1)',
  },
  langToggle: {
    backgroundColor: 'rgba(51,53,53,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    borderRadius: Radii.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  langActive: {
    color: Colors.onSurface,
    fontSize: FontSizes.labelMd,
    letterSpacing: 0.5,
  },
  summaryCardWrapper: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    gap: 12,
  },
  summaryCard: {
    backgroundColor: '#4A0E52',
    borderRadius: Radii.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 12,
  },
  summaryHeader: {
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  typePill: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  typePillText: {
    color: Colors.white,
    fontSize: 11,
  },
  gwContextPill: {
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0, 255, 135, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radii.full,
  },
  gwContextText: {
    color: Colors.brandTeal,
    fontSize: 11,
  },
  memberCountText: {
    color: Colors.onSurfaceVariant,
    fontSize: 12,
  },
  rankBanner: {
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#37003C',
    borderRadius: Radii.default,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 135, 0.25)',
  },
  rankBannerSub: {
    color: Colors.onSurfaceVariant,
    fontSize: 11,
  },
  rankBannerNumber: {
    color: Colors.brandTeal,
    fontSize: 26,
    marginTop: -2,
  },
  trophyGlow: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 255, 135, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: '#2A0030',
    borderRadius: Radii.full,
    padding: 3,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: Radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnActive: {
    backgroundColor: Colors.brandTeal,
  },
  segmentText: {
    fontSize: 13,
    letterSpacing: 0.5,
  },
  listContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: 8,
    paddingBottom: 80,
  },
  listHeaderRow: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
  },
  listHeaderCol: {
    color: Colors.onSurfaceVariant,
    fontSize: 11,
    letterSpacing: 0.8,
  },
  standingRow: {
    backgroundColor: '#4A0E52',
    borderRadius: Radii.default,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginVertical: 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    gap: 10,
  },
  userStandingRow: {
    backgroundColor: 'rgba(0, 255, 135, 0.12)',
    borderLeftWidth: 4,
    borderLeftColor: Colors.brandTeal,
    borderColor: 'rgba(0, 255, 135, 0.3)',
  },
  rankBadgeCol: {
    width: 45,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  rankNumText: {
    fontSize: 13,
    minWidth: 22,
  },
  managerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#37003C',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatar: {
    borderColor: Colors.brandTeal,
    backgroundColor: 'rgba(0, 255, 135, 0.2)',
  },
  avatarText: {
    color: Colors.white,
    fontSize: 11,
  },
  namesCol: {
    flex: 1,
    justifyContent: 'center',
  },
  managerNameRow: {
    alignItems: 'center',
    gap: 6,
  },
  managerNameText: {
    fontSize: 14,
    flexShrink: 1,
  },
  youBadge: {
    backgroundColor: Colors.brandTeal,
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  youBadgeText: {
    color: Colors.brandPurple,
    fontSize: 9,
    fontWeight: '800',
  },
  teamNameSubText: {
    color: Colors.onSurfaceVariant,
    fontSize: 11,
    marginTop: 1,
  },
  pointsCol: {
    width: 65,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  pointsValueText: {
    fontSize: 15,
  },
  pointsUnitText: {
    color: Colors.onSurfaceVariant,
    fontSize: 10,
    marginTop: -2,
  },
  footerLoader: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  floatingRankBtn: {
    position: 'absolute',
    bottom: 72,
    backgroundColor: Colors.brandTeal,
    borderRadius: Radii.full,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
    zIndex: 100,
  },
  floatingRankText: {
    color: Colors.brandPurple,
    fontSize: 13,
    fontWeight: '700',
  },
  loadingContainer: {
    flex: 1,
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: Colors.onSurfaceVariant,
    fontSize: 14,
  },
  errorContainer: {
    flex: 1,
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingHorizontal: 24,
  },
  errorText: {
    color: Colors.error,
    fontSize: 14,
    textAlign: 'center',
  },
  retryBtn: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: Radii.default,
  },
  retryBtnText: {
    color: Colors.brandTeal,
    fontSize: 14,
  },
});
