import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, FontSizes, Radii, Spacing } from '@/constants/theme';
import BottomNav from '@/components/BottomNav';
import { fetchBootstrap, fetchUserEntry, joinPrivateLeague, FPLLeagueClassic, FPLUserEntry } from '@/api/fpl';
import { getStoredTeamId } from '@/utils/storage';

type Tab = 'leagues' | 'cups';

function formatRank(num?: number | null): string {
  if (num == null) return '-';
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatCompact(num?: number | null): string {
  if (num == null) return '0';
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}m`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}k`;
  return String(num);
}

export default function LeaguesScreen() {
  const router = useRouter();
  const [isArabic, setIsArabic] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('leagues');
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [teamId, setTeamId] = useState<string | null>(null);
  const [entry, setEntry] = useState<FPLUserEntry | null>(null);
  const [currentGw, setCurrentGw] = useState<number>(1);

  // Join League Modal state
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState('');

  const headlineFont = isArabic ? 'Cairo_700' : 'ArchivoNarrow_700';
  const bodyFont = isArabic ? 'IBMPlexSansArabic_500' : 'HankenGrotesk_500';
  const labelFont = isArabic ? 'IBMPlexSansArabic_600' : 'JetBrainsMono_700';
  const flexDir = isArabic ? 'row-reverse' : 'row';
  const textAlign = isArabic ? 'right' : 'left';

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const storedId = await getStoredTeamId();
      setTeamId(storedId);

      const bootstrapData = await fetchBootstrap().catch(() => null);
      if (bootstrapData?.events) {
        const currentEvent = bootstrapData.events.find((e) => e.is_current) || bootstrapData.events.find((e) => e.is_next);
        if (currentEvent) {
          setCurrentGw(currentEvent.id);
        }
      }

      if (storedId) {
        const entryData = await fetchUserEntry(storedId);
        setEntry(entryData);
        if (entryData.current_event) {
          setCurrentGw(entryData.current_event);
        }
      }
    } catch (err: any) {
      console.warn('[Leagues] Load error:', err.message);
      setError(isArabic ? 'تعذر تحميل بيانات الدوريات. يرجى السحب للتحديث.' : 'Failed to load leagues data. Pull to refresh.');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [isArabic]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleLeaguePress = (league: FPLLeagueClassic) => {
    router.push({
      pathname: '/league-detail' as any,
      params: {
        id: String(league.id),
        name: league.name,
        rank: String(league.entry_rank || ''),
        total: String(league.rank_count || ''),
        type: league.league_type,
      },
    });
  };

  const handleJoinSubmit = async () => {
    const code = joinCode.trim();
    if (!code) {
      setJoinError(isArabic ? 'يرجى إدخال رمز الدوري' : 'Please enter a league code');
      return;
    }
    setJoinLoading(true);
    setJoinError('');
    try {
      const res = await joinPrivateLeague(code);
      setShowJoinModal(false);
      setJoinCode('');
      Alert.alert(
        isArabic ? 'تم بنجاح!' : 'Success!',
        res.message || (isArabic ? 'تم الانضمام للدوري بنجاح' : 'You have joined the league successfully!'),
      );
      loadData();
    } catch (err: any) {
      setJoinError(err?.message || (isArabic ? 'فشل الانضمام للدوري' : 'Failed to join league.'));
    } finally {
      setJoinLoading(false);
    }
  };

  const classicLeagues = entry?.leagues?.classic || [];
  const teamName = entry?.name || (isArabic ? 'فريق الفانتازي' : "My FPL Team");

  return (
    <View style={styles.root}>
      {/* ── 1. DEDICATED LEAGUES HEADER (NO AVATAR) ── */}
      <SafeAreaView style={styles.headerSafeArea} edges={['top']}>
        <View style={[styles.header, { flexDirection: flexDir }]}>
          <View style={[styles.headerLeft, { flexDirection: flexDir }]}>
            <MaterialIcons name="emoji-events" size={26} color={Colors.brandTeal} />
            <Text style={[styles.headerTitle, { fontFamily: headlineFont }]}>
              {isArabic ? 'الدوريات' : 'Leagues'}
            </Text>
          </View>

          {/* Language Toggle Pill (EN | عربي) */}
          <TouchableOpacity
            style={styles.langToggle}
            onPress={() => setIsArabic(!isArabic)}
            activeOpacity={0.8}
          >
            <Text style={[styles.langActive, { fontFamily: labelFont }]}>
              {isArabic ? 'عربي' : 'EN'}
            </Text>
            <View style={styles.langDivider} />
            <Text style={[styles.langMuted, { fontFamily: labelFont }]}>
              {isArabic ? 'EN' : 'عربي'}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* ── SCROLLABLE BODY ── */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.brandTeal}
            colors={[Colors.brandTeal]}
          />
        }
      >
        {/* ── 2. TEAM SUMMARY ROW ── */}
        <View style={[styles.teamSummaryCard, { flexDirection: flexDir }]}>
          <View style={[styles.teamLeftGroup, { flexDirection: flexDir }]}>
            <View style={styles.crestCircle}>
              <MaterialIcons name="shield" size={24} color={Colors.brandTeal} />
            </View>

            <View style={{ alignItems: isArabic ? 'flex-end' : 'flex-start' }}>
              <Text style={[styles.teamNameText, { fontFamily: headlineFont, textAlign }]}>
                {teamName}
              </Text>
              <View style={[styles.gwPill, { flexDirection: flexDir }]}>
                <View style={styles.liveDot} />
                <Text style={[styles.gwPillText, { fontFamily: labelFont }]}>
                  {isArabic ? `الجولة ${currentGw}` : `Gameweek ${currentGw}`}
                </Text>
              </View>
            </View>
          </View>

          {/* Actions: Refresh & Join */}
          <View style={[styles.teamActions, { flexDirection: flexDir }]}>
            <TouchableOpacity
              style={styles.actionIconBtn}
              onPress={onRefresh}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialIcons name="refresh" size={20} color={Colors.onSurface} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionIconBtn}
              onPress={() => setShowJoinModal(true)}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialIcons name="group-add" size={20} color={Colors.brandTeal} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── 3. LEAGUES | CUPS TAB SWITCHER ── */}
        <View style={[styles.tabSwitcher, { flexDirection: flexDir }]}>
          <TouchableOpacity
            style={[styles.switcherBtn, activeTab === 'leagues' && styles.switcherBtnActive]}
            onPress={() => setActiveTab('leagues')}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.switcherText,
                {
                  fontFamily: headlineFont,
                  color: activeTab === 'leagues' ? Colors.brandPurple : Colors.onSurfaceVariant,
                },
              ]}
            >
              {isArabic ? 'الدوريات' : 'Leagues'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.switcherBtn, activeTab === 'cups' && styles.switcherBtnActive]}
            onPress={() => setActiveTab('cups')}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.switcherText,
                {
                  fontFamily: headlineFont,
                  color: activeTab === 'cups' ? Colors.brandPurple : Colors.onSurfaceVariant,
                },
              ]}
            >
              {isArabic ? 'الكؤوس' : 'Cups'}
            </Text>
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.brandTeal} />
            <Text style={[styles.loadingText, { fontFamily: bodyFont }]}>
              {isArabic ? 'جاري تحميل الدوريات...' : 'Loading leagues...'}
            </Text>
          </View>
        ) : error ? (
          <View style={styles.errorContainer}>
            <MaterialIcons name="error-outline" size={40} color={Colors.error} />
            <Text style={[styles.errorText, { fontFamily: bodyFont }]}>{error}</Text>
          </View>
        ) : activeTab === 'leagues' ? (
          <>
            {/* ── 4. GENERAL LEAGUES SECTION LABEL ── */}
            <View style={[styles.sectionHeader, { flexDirection: flexDir }]}>
              <Text style={[styles.sectionLabel, { fontFamily: labelFont }]}>
                {isArabic
                  ? `الدوريات العامة (${classicLeagues.length})`
                  : `GENERAL LEAGUES (${classicLeagues.length})`}
              </Text>
            </View>

            {/* ── 5. LEAGUE ROWS ── */}
            {classicLeagues.length === 0 ? (
              <View style={styles.emptyCard}>
                <MaterialIcons name="emoji-events" size={44} color={Colors.onSurfaceVariant} />
                <Text style={[styles.emptyTitle, { fontFamily: headlineFont }]}>
                  {isArabic ? 'لا توجد دوريات مسجلة' : 'No Leagues Found'}
                </Text>
                <Text style={[styles.emptySub, { fontFamily: bodyFont }]}>
                  {isArabic
                    ? 'قم بتسجيل الدخول أو ربط فريقك لتصفح جميع دورياتك العامة والخاصة.'
                    : 'Log in or connect your team ID to view your classic leagues.'}
                </Text>
              </View>
            ) : (
              classicLeagues.map((league) => {
                const isOverall = league.name.toLowerCase() === 'overall';
                const currentRank = league.entry_rank;
                const lastRank = league.entry_last_rank;

                let delta = 0;
                let movement: 'up' | 'down' | 'neutral' = 'neutral';
                if (currentRank && lastRank) {
                  if (currentRank < lastRank) {
                    movement = 'up';
                    delta = lastRank - currentRank;
                  } else if (currentRank > lastRank) {
                    movement = 'down';
                    delta = currentRank - lastRank;
                  }
                }

                return (
                  <TouchableOpacity
                    key={league.id}
                    style={[
                      styles.leagueCard,
                      isOverall && styles.featuredLeagueCard,
                      { flexDirection: flexDir },
                    ]}
                    onPress={() => handleLeaguePress(league)}
                    activeOpacity={0.7}
                  >
                    {/* Left Rank Movement Icon Badge */}
                    <View style={styles.movementCol}>
                      {movement === 'up' ? (
                        <View style={[styles.movementBadge, styles.movementUp]}>
                          <MaterialIcons name="arrow-drop-up" size={24} color="#00FF87" />
                        </View>
                      ) : movement === 'down' ? (
                        <View style={[styles.movementBadge, styles.movementDown]}>
                          <MaterialIcons name="arrow-drop-down" size={24} color="#F87171" />
                        </View>
                      ) : (
                        <View style={[styles.movementBadge, styles.movementNeutral]}>
                          <MaterialIcons name="remove" size={18} color={Colors.onSurfaceVariant} />
                        </View>
                      )}
                    </View>

                    {/* Middle: League Name & Subtext */}
                    <View style={[styles.leagueInfoCol, { alignItems: isArabic ? 'flex-end' : 'flex-start' }]}>
                      <View style={[styles.leagueTitleRow, { flexDirection: flexDir }]}>
                        <Text
                          style={[styles.leagueNameText, { fontFamily: headlineFont, textAlign }]}
                          numberOfLines={1}
                        >
                          {league.name}
                        </Text>
                        {isOverall && (
                          <View style={styles.featuredBadge}>
                            <Text style={[styles.featuredBadgeText, { fontFamily: labelFont }]}>
                              {isArabic ? 'مميز' : 'FEATURED'}
                            </Text>
                          </View>
                        )}
                      </View>

                      <Text style={[styles.leagueMetaText, { fontFamily: bodyFont }]}>
                        {isArabic
                          ? `${formatCompact(league.rank_count)} عضو · ${league.league_type === 's' ? 'عام' : 'كلاسيك'}`
                          : `${formatCompact(league.rank_count)} members · ${league.league_type === 's' ? 'General' : 'Classic'}`}
                      </Text>
                    </View>

                    {/* Right: Current Rank & Delta */}
                    <View style={styles.rankCol}>
                      <Text style={[styles.currentRankText, { fontFamily: labelFont }]}>
                        {formatRank(currentRank)}
                      </Text>

                      {movement === 'up' ? (
                        <Text style={[styles.deltaUpText, { fontFamily: labelFont }]}>
                          ▲ +{formatRank(delta)}
                        </Text>
                      ) : movement === 'down' ? (
                        <Text style={[styles.deltaDownText, { fontFamily: labelFont }]}>
                          ▼ -{formatRank(delta)}
                        </Text>
                      ) : (
                        <Text style={[styles.deltaNeutralText, { fontFamily: labelFont }]}>
                          -
                        </Text>
                      )}
                    </View>

                    <MaterialIcons
                      name={isArabic ? 'chevron-left' : 'chevron-right'}
                      size={20}
                      color="rgba(255,255,255,0.3)"
                      style={{ marginLeft: 4 }}
                    />
                  </TouchableOpacity>
                );
              })
            )}

            {/* ── 6. JOIN PRIVATE LEAGUE CARD ── */}
            <View style={styles.joinCard}>
              <View style={[styles.joinCardContent, { flexDirection: flexDir }]}>
                <View style={styles.joinIconCircle}>
                  <MaterialIcons name="lock-open" size={26} color={Colors.brandTeal} />
                </View>
                <View style={[styles.joinTextCol, { alignItems: isArabic ? 'flex-end' : 'flex-start' }]}>
                  <Text style={[styles.joinTitle, { fontFamily: headlineFont, textAlign }]}>
                    {isArabic ? 'انضم لدوري خاص' : 'Join Private League'}
                  </Text>
                  <Text style={[styles.joinDesc, { fontFamily: bodyFont, textAlign }]}>
                    {isArabic
                      ? 'تنافس مع أصدقائك في العمل والعائلة عبر إدخال رمز الدوري.'
                      : 'Enter your league code to compete with friends, colleagues and family.'}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.joinBtn}
                onPress={() => setShowJoinModal(true)}
                activeOpacity={0.8}
              >
                <Text style={[styles.joinBtnText, { fontFamily: headlineFont }]}>
                  {isArabic ? '+ انضمام بكود الدوري' : '+ Join Private League'}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          /* ── CUPS TAB CONTENT ── */
          <View style={styles.cupsContainer}>
            <View style={styles.cupCard}>
              <View style={[styles.cupCardHeader, { flexDirection: flexDir }]}>
                <MaterialIcons name="military-tech" size={28} color={Colors.brandTeal} />
                <View style={{ flex: 1, alignItems: isArabic ? 'flex-end' : 'flex-start', marginHorizontal: 8 }}>
                  <Text style={[styles.cupTitle, { fontFamily: headlineFont, textAlign }]}>
                    {isArabic ? 'كأس الفانتازي العام' : 'FPL Overall Cup'}
                  </Text>
                  <Text style={[styles.cupStatus, { fontFamily: bodyFont }]}>
                    {isArabic ? 'يبدأ في الجولة 17' : 'Starts in Gameweek 17'}
                  </Text>
                </View>
                <View style={styles.cupPill}>
                  <Text style={[styles.cupPillText, { fontFamily: labelFont }]}>
                    {isArabic ? 'قادم' : 'Upcoming'}
                  </Text>
                </View>
              </View>
              <Text style={[styles.cupDesc, { fontFamily: bodyFont, textAlign }]}>
                {isArabic
                  ? 'يتأهل أفضل المدربين تلقائياً إلى الأدوار الإقصائية المباشرة (Head-to-Head) حتى المباراة النهائية للجولة 38.'
                  : 'The top-scoring managers will automatically qualify for the knockout phase starting in Gameweek 17, competing head-to-head until the final in GW38.'}
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* ── JOIN PRIVATE LEAGUE MODAL ── */}
      <Modal visible={showJoinModal} transparent animationType="fade" onRequestClose={() => setShowJoinModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={[styles.modalHeader, { flexDirection: flexDir }]}>
              <Text style={[styles.modalTitle, { fontFamily: headlineFont }]}>
                {isArabic ? 'الانضمام لدوري خاص' : 'Join Private League'}
              </Text>
              <TouchableOpacity onPress={() => setShowJoinModal(false)}>
                <MaterialIcons name="close" size={24} color={Colors.onSurface} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalSubtitle, { fontFamily: bodyFont, textAlign }]}>
              {isArabic
                ? 'أدخل رمز الدوري المكون من 6 أحرف/أرقام الذي شاركه معك مسؤول الدوري:'
                : 'Enter the 6-character code shared by your league admin:'}
            </Text>

            <TextInput
              style={[styles.modalInput, { textAlign: isArabic ? 'right' : 'left' }]}
              value={joinCode}
              onChangeText={(val) => {
                setJoinCode(val);
                setJoinError('');
              }}
              placeholder={isArabic ? 'مثال: abc123' : 'e.g. abc123'}
              placeholderTextColor={Colors.onSurfaceVariant}
              autoCapitalize="none"
              autoCorrect={false}
            />

            {!!joinError && <Text style={[styles.modalError, { fontFamily: bodyFont }]}>{joinError}</Text>}

            <View style={[styles.modalActions, { flexDirection: flexDir }]}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalCancelBtn]}
                onPress={() => setShowJoinModal(false)}
                activeOpacity={0.8}
              >
                <Text style={[styles.modalCancelText, { fontFamily: headlineFont }]}>
                  {isArabic ? 'إلغاء' : 'Cancel'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalBtn, styles.modalSubmitBtn]}
                onPress={handleJoinSubmit}
                disabled={joinLoading}
                activeOpacity={0.8}
              >
                {joinLoading ? (
                  <ActivityIndicator size="small" color={Colors.brandPurple} />
                ) : (
                  <Text style={[styles.modalSubmitText, { fontFamily: headlineFont }]}>
                    {isArabic ? 'انضمام' : 'Join'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── 7. SHARED BOTTOM NAVIGATION BAR (LEAGUES TAB ACTIVE) ── */}
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
  headerLeft: {
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    color: Colors.white,
    fontSize: 22,
    fontWeight: '700',
  },
  langToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(51,53,53,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    borderRadius: Radii.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  langActive: {
    color: Colors.onSurface,
    fontSize: FontSizes.labelMd,
    letterSpacing: 0.5,
  },
  langDivider: {
    width: 1,
    height: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  langMuted: {
    color: Colors.onSurfaceVariant,
    fontSize: FontSizes.labelMd,
    opacity: 0.7,
  },
  scrollContent: {
    padding: Spacing.md,
    paddingBottom: Spacing.xl,
    gap: 14,
  },
  teamSummaryCard: {
    backgroundColor: '#4A0E52',
    borderRadius: Radii.lg,
    padding: Spacing.md,
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  teamLeftGroup: {
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  crestCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 255, 135, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 135, 0.3)',
  },
  teamNameText: {
    color: Colors.white,
    fontSize: 18,
  },
  gwPill: {
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.brandTeal,
  },
  gwPillText: {
    color: Colors.brandTeal,
    fontSize: 12,
    letterSpacing: 0.5,
  },
  teamActions: {
    alignItems: 'center',
    gap: 8,
  },
  actionIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabSwitcher: {
    flexDirection: 'row',
    backgroundColor: '#2A0030',
    borderRadius: Radii.full,
    padding: 4,
  },
  switcherBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: Radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switcherBtnActive: {
    backgroundColor: Colors.brandTeal,
  },
  switcherText: {
    fontSize: 14,
    letterSpacing: 0.5,
  },
  sectionHeader: {
    marginTop: 4,
    marginBottom: -4,
  },
  sectionLabel: {
    color: Colors.brandTeal,
    fontSize: 12,
    letterSpacing: 1.2,
  },
  leagueCard: {
    backgroundColor: '#4A0E52',
    borderRadius: Radii.lg,
    padding: Spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    gap: 12,
  },
  featuredLeagueCard: {
    borderLeftWidth: 4,
    borderLeftColor: Colors.brandTeal,
    backgroundColor: '#52125A',
  },
  movementCol: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  movementBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  movementUp: {
    backgroundColor: 'rgba(0, 255, 135, 0.15)',
  },
  movementDown: {
    backgroundColor: 'rgba(248, 113, 113, 0.15)',
  },
  movementNeutral: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  leagueInfoCol: {
    flex: 1,
    justifyContent: 'center',
  },
  leagueTitleRow: {
    alignItems: 'center',
    gap: 6,
  },
  leagueNameText: {
    color: Colors.white,
    fontSize: 16,
    flexShrink: 1,
  },
  featuredBadge: {
    backgroundColor: 'rgba(0, 255, 135, 0.18)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.brandTeal,
  },
  featuredBadgeText: {
    color: Colors.brandTeal,
    fontSize: 9,
    letterSpacing: 0.8,
  },
  leagueMetaText: {
    color: Colors.onSurfaceVariant,
    fontSize: 12,
    marginTop: 2,
  },
  rankCol: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    minWidth: 65,
  },
  currentRankText: {
    color: Colors.white,
    fontSize: 16,
  },
  deltaUpText: {
    color: '#00FF87',
    fontSize: 11,
    marginTop: 2,
  },
  deltaDownText: {
    color: '#F87171',
    fontSize: 11,
    marginTop: 2,
  },
  deltaNeutralText: {
    color: Colors.onSurfaceVariant,
    fontSize: 11,
    marginTop: 2,
  },
  joinCard: {
    backgroundColor: '#4A0E52',
    borderRadius: Radii.xl,
    padding: Spacing.lg,
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 135, 0.2)',
    gap: 14,
  },
  joinCardContent: {
    alignItems: 'center',
    gap: 14,
  },
  joinIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 255, 135, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinTextCol: {
    flex: 1,
  },
  joinTitle: {
    color: Colors.white,
    fontSize: 18,
    marginBottom: 4,
  },
  joinDesc: {
    color: Colors.onSurfaceVariant,
    fontSize: 13,
    lineHeight: 18,
  },
  joinBtn: {
    backgroundColor: Colors.brandTeal,
    borderRadius: Radii.lg,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinBtnText: {
    color: Colors.brandPurple,
    fontSize: 16,
    fontWeight: '700',
  },
  cupsContainer: {
    gap: 12,
    marginTop: 6,
  },
  cupCard: {
    backgroundColor: '#4A0E52',
    borderRadius: Radii.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 10,
  },
  cupCardHeader: {
    alignItems: 'center',
  },
  cupTitle: {
    color: Colors.white,
    fontSize: 18,
  },
  cupStatus: {
    color: Colors.onSurfaceVariant,
    fontSize: 12,
  },
  cupPill: {
    backgroundColor: 'rgba(0, 255, 135, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radii.full,
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 135, 0.3)',
  },
  cupPillText: {
    color: Colors.brandTeal,
    fontSize: 11,
  },
  cupDesc: {
    color: Colors.onSurfaceVariant,
    fontSize: 13,
    lineHeight: 18,
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: Colors.onSurfaceVariant,
    fontSize: 14,
  },
  errorContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  errorText: {
    color: Colors.error,
    fontSize: 14,
    textAlign: 'center',
  },
  emptyCard: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4A0E52',
    borderRadius: Radii.lg,
    gap: 8,
  },
  emptyTitle: {
    color: Colors.white,
    fontSize: 18,
    marginTop: 4,
  },
  emptySub: {
    color: Colors.onSurfaceVariant,
    fontSize: 13,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#37003C',
    borderRadius: Radii.xl,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    gap: 14,
  },
  modalHeader: {
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    color: Colors.white,
    fontSize: 20,
  },
  modalSubtitle: {
    color: Colors.onSurfaceVariant,
    fontSize: 13,
    lineHeight: 18,
  },
  modalInput: {
    height: 48,
    backgroundColor: '#4A0E52',
    borderRadius: Radii.default,
    paddingHorizontal: 14,
    color: Colors.white,
    fontSize: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  modalError: {
    color: Colors.error,
    fontSize: 12,
  },
  modalActions: {
    gap: 10,
    marginTop: 6,
  },
  modalBtn: {
    flex: 1,
    height: 44,
    borderRadius: Radii.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelBtn: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  modalCancelText: {
    color: Colors.onSurfaceVariant,
    fontSize: 15,
  },
  modalSubmitBtn: {
    backgroundColor: Colors.brandTeal,
  },
  modalSubmitText: {
    color: Colors.brandPurple,
    fontSize: 15,
  },
});
