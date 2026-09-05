/**
 * FPL Assistant – Home Dashboard Screen
 *
 * Full implementation with real FPL API data, fallback tolerance,
 * countdown timer, AI Captain suggestion, mini-pitch squad view,
 * skeleton loaders, bilingual LTR/RTL support, and 5-tab navigation bar.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Animated,
  Dimensions,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';

import { Colors, FontSizes, Radii, Spacing } from '@/constants/theme';
import { useHomeData } from '@/hooks/useHomeData';
import { FPLPick, getPlayerPhotoUrl } from '@/api/fpl';
import AppHeader from '@/components/AppHeader';
import BottomNav from '@/components/BottomNav';

const { width: SCREEN_W } = Dimensions.get('window');

// ─── i18n Dictionary ────────────────────────────────────────────────────────
const STRINGS = {
  en: {
    activeLang: 'EN',
    toggleLang: 'عربي',
    appName: 'FPL ASSISTANT',
    managerLabel: 'MANAGER',
    gwLive: 'LIVE',
    gameweek: 'GAMEWEEK',
    pts: 'PTS',
    overallRank: 'Overall Rank',
    nextDeadline: 'Next Deadline',
    aiSuggested: 'AI SUGGESTED',
    captainPick: 'CAPTAIN PICK',
    yourSquad: 'YOUR SQUAD',
    viewAll: 'View all →',
    aiInsightTitle: 'AI Insight of the Day',
    askAiMore: 'Ask AI more →',
    daysUnit: 'd',
    hoursUnit: 'h',
    minsUnit: 'm',
    navHome: 'Home',
    navSquad: 'Squad',
    navNews: 'News',
    navAi: 'AI Assistant',
    navLeagues: 'Leagues',
    insightFallback: 'Roll your transfer to maximize flexibility for the double gameweek.',
  },
  ar: {
    activeLang: 'عربي',
    toggleLang: 'EN',
    appName: 'مساعد FPL',
    managerLabel: 'مدير الفانتازي',
    gwLive: 'مباشر',
    gameweek: 'الجولة',
    pts: 'نقطة',
    overallRank: 'الترتيب العام',
    nextDeadline: 'الموعد النهائي القادم',
    aiSuggested: 'ترشيح الذكاء الاصطناعي',
    captainPick: 'الكابتن المقترح',
    yourSquad: 'فريقك',
    viewAll: '← عرض الكل',
    aiInsightTitle: 'نصيحة اليوم من الذكاء الاصطناعي',
    askAiMore: 'اسأل الذكاء الاصطناعي ←',
    daysUnit: 'ي',
    hoursUnit: 'س',
    minsUnit: 'د',
    navHome: 'الرئيسية',
    navSquad: 'فريقك',
    navNews: 'الأخبار',
    navAi: 'المساعد',
    navLeagues: 'الدوريات',
    insightFallback: 'تأجيل التغيير الجولة دي هيديك مرونة أكبر للجولة المزدوجة.',
  },
} as const;

// Helper to format numbers with commas e.g. 142,509
function formatRank(num: number): string {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Countdown Calculator
function getCountdownText(deadlineIso: string | null, isArabic: boolean): string {
  if (!deadlineIso) return isArabic ? '2ي 14س 32د' : '2d 14h 32m';

  const diffMs = new Date(deadlineIso).getTime() - Date.now();
  if (diffMs <= 0) return isArabic ? '0ي 0س 0د' : '0d 0h 0m';

  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  const dU = isArabic ? 'ي' : 'd';
  const hU = isArabic ? 'س' : 'h';
  const mU = isArabic ? 'د' : 'm';

  // Format LTR order internally for numbers
  return `${days}${dU} ${hours}${hU} ${mins}${mU}`;
}

export default function HomeScreen() {
  const router = useRouter();

  // Language state
  const [isArabic, setIsArabic] = useState<boolean>(false);
  const t = STRINGS[isArabic ? 'ar' : 'en'];
  const isRTL = isArabic;

  const headlineFont = isArabic ? 'Cairo_700' : 'ArchivoNarrow_700';
  const bodyFont = isArabic ? 'IBMPlexSansArabic' : 'HankenGrotesk';
  const labelFont = isArabic ? 'IBMPlexSansArabic_500' : 'JetBrainsMono_500';

  // FPL Data Hook
  const {
    isLoading,
    error,
    entry,
    currentGw,
    nextGw,
    nextDeadlineIso,
    picks,
    captainSuggestion,
    aiInsight,
    activeTeamId,
    authMode,
    lastFetched,
    refetch,
  } = useHomeData();


  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  // Force a fresh live fetch on every Home screen focus (not just mount)
  useFocusEffect(useCallback(() => { void refetch(); }, [refetch]));

  // Live timer for deadline
  const [countdownStr, setCountdownStr] = useState<string>('');
  useEffect(() => {
    setCountdownStr(getCountdownText(nextDeadlineIso, isArabic));
    const interval = setInterval(() => {
      setCountdownStr(getCountdownText(nextDeadlineIso, isArabic));
    }, 60000);
    return () => clearInterval(interval);
  }, [nextDeadlineIso, isArabic]);

  // Live Pulse Animations
  const pulseAnim = useRef(new Animated.Value(0.4)).current;
  const shimmerAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ])
    );
    pulse.start();

    const shimmer = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, { toValue: 0.8, duration: 900, useNativeDriver: true }),
        Animated.timing(shimmerAnim, { toValue: 0.3, duration: 900, useNativeDriver: true }),
      ])
    );
    shimmer.start();

    return () => {
      pulse.stop();
      shimmer.stop();
    };
  }, []);

  const teamName = entry?.name || `Team ${activeTeamId}`;
  const managerName = entry?.player_first_name && entry?.player_last_name
    ? `${entry.player_first_name} ${entry.player_last_name}`
    : `Manager #${activeTeamId}`;
  const avatarUrl = `https://api.dicebear.com/7.x/initials/png?seed=${encodeURIComponent(managerName)}`;

  const captainPhotoCode = captainSuggestion?.player?.code || 118748;
  const captainPhotoUrl = getPlayerPhotoUrl(captainSuggestion?.player, captainPhotoCode);

  return (
    <View style={styles.root}>
      {/* ── Fixed Blur Top Header ── */}
      <AppHeader
        isArabic={isArabic}
        onToggleLanguage={setIsArabic}
        showNotificationBell
        avatarUrl={avatarUrl}
        onAvatarPress={() => router.push('/profile')}
      />

      {/* ── Scrollable Body ── */}
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
        {/* ── 2. User Row ── */}
        <View style={[styles.userRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <TouchableOpacity
            style={[styles.userInfo, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
            onPress={() => router.push('/profile')}
            activeOpacity={0.8}
          >
            <Image source={{ uri: avatarUrl }} style={styles.avatar} />
            <View style={{ alignItems: isRTL ? 'flex-end' : 'flex-start' }}>
              <Text style={[styles.teamName, { fontFamily: headlineFont }]}>{teamName}</Text>
              <Text style={[styles.managerTag, { fontFamily: labelFont }]}>
                👤 {managerName}  •  #{activeTeamId}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
        {!!error && <Text style={[styles.dataNotice, { fontFamily: bodyFont }]}>{error}</Text>}

        {/* ── 3. Hero Stats Card ── */}
        {isLoading ? (
          <SkeletonCard shimmerAnim={shimmerAnim} height={150} />
        ) : (
          <View style={styles.heroCard}>
            <View style={styles.heroGlow} pointerEvents="none" />
            <View style={[styles.heroHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Text style={[styles.gwBadgeText, { fontFamily: labelFont }]}>
                {t.gameweek} {currentGw}
              </Text>
              <View style={styles.liveIndicator}>
                <Animated.View style={[styles.liveDot, { opacity: pulseAnim }]} />
                <Text style={[styles.liveText, { fontFamily: labelFont }]}>{t.gwLive}</Text>
              </View>
            </View>

            <View style={[styles.ptsRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Text style={[styles.ptsNumber, { fontFamily: 'ArchivoNarrow_700' }]}>
                {entry?.summary_event_points || entry?.summary_overall_points || entry?.last_season_points || 0}
              </Text>
              <Text style={[styles.ptsUnit, { fontFamily: headlineFont }]}>{t.pts}</Text>
            </View>

            <View style={[styles.rankRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <MaterialIcons name="trending-up" size={18} color={Colors.secondaryContainer} />
              <Text style={[styles.rankText, { fontFamily: bodyFont }]}>
                {t.overallRank}:{' '}
                <Text style={{ fontFamily: labelFont, color: Colors.white }}>
                  {formatRank(entry?.summary_overall_rank || entry?.last_season_rank || 0)}
                </Text>
              </Text>
            </View>
          </View>
        )}

        {/* ── 4. Horizontal Scroll Cards ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.horizontalScroll}
        >
          {/* Card A: Next Deadline */}
          {isLoading ? (
            <SkeletonCard shimmerAnim={shimmerAnim} width={240} height={140} />
          ) : (
            <View style={styles.miniCard}>
              <View style={styles.miniCardHeader}>
                <MaterialIcons name="timer" size={18} color={Colors.tertiary} />
                <Text style={[styles.miniCardTag, { fontFamily: labelFont }]}>
                  {t.nextDeadline}
                </Text>
              </View>
              <Text style={[styles.countdownText, { fontFamily: 'JetBrainsMono_700' }]}>
                {countdownStr}
              </Text>
              <Text style={[styles.miniCardSub, { fontFamily: bodyFont }]}>
                {t.gameweek} {nextGw}
              </Text>
            </View>
          )}

          {/* Card B: Captain Pick */}
          {isLoading ? (
            <SkeletonCard shimmerAnim={shimmerAnim} width={280} height={140} />
          ) : (
            <View style={[styles.miniCard, styles.captainCard]}>
              <View style={styles.captainBadge}>
                <Text style={[styles.captainBadgeText, { fontFamily: labelFont }]}>
                  {t.aiSuggested}
                </Text>
              </View>
              <View style={[styles.captainContent, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <Image source={{ uri: captainPhotoUrl }} style={styles.captainPhoto} />
                <View style={{ flex: 1, alignItems: isRTL ? 'flex-end' : 'flex-start' }}>
                  <Text style={[styles.captainName, { fontFamily: headlineFont }]}>
                    {captainSuggestion?.player?.web_name || 'Salah'}
                  </Text>
                  <Text style={[styles.captainReason, { fontFamily: bodyFont, textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={2}>
                    {isArabic
                      ? captainSuggestion?.reasoningAr || STRINGS.ar.insightFallback
                      : captainSuggestion?.reasoningEn || STRINGS.en.insightFallback}
                  </Text>
                </View>
              </View>
            </View>
          )}
        </ScrollView>

        {/* ── 5. "YOUR SQUAD" Mini Pitch ── */}
        <View style={styles.squadSection}>
          <View style={[styles.sectionHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <Text style={[styles.sectionTitle, { fontFamily: headlineFont }]}>
              {t.yourSquad}
            </Text>
            <TouchableOpacity onPress={() => router.push('/squad')} activeOpacity={0.7}>
              <Text style={[styles.viewAllLink, { fontFamily: labelFont }]}>
                {t.viewAll}
              </Text>
            </TouchableOpacity>
          </View>

          {isLoading ? (
            <SkeletonCard shimmerAnim={shimmerAnim} height={260} />
          ) : (
            picks.length ? <MiniPitch picks={picks} isArabic={isArabic} /> : <View style={styles.emptySquad}><Text style={[styles.emptySquadText, { fontFamily: bodyFont }]}>FPL has not published this gameweek’s public squad picks yet.</Text></View>
          )}
        </View>

        {/* ── 6. AI Insight of the Day Card ── */}
        <View style={styles.insightCard}>
          <View style={styles.insightHeader}>
            <MaterialIcons name="psychology" size={22} color={Colors.tertiary} />
            <Text style={[styles.insightTitle, { fontFamily: headlineFont }]}>
              {t.aiInsightTitle}
            </Text>
          </View>

          {isLoading ? (
            <Animated.View style={[styles.insightShimmer, { opacity: shimmerAnim }]} />
          ) : (
            <Text style={[styles.insightBody, { fontFamily: bodyFont, textAlign: isRTL ? 'right' : 'left' }]}>
              {isArabic
                ? aiInsight?.insightAr || STRINGS.ar.insightFallback
                : aiInsight?.insightEn || STRINGS.en.insightFallback}
            </Text>
          )}

          <TouchableOpacity
            style={[styles.askAiRow, { alignSelf: isRTL ? 'flex-start' : 'flex-end' }]}
            onPress={() => router.push('/ai')}
            activeOpacity={0.7}
          >
            <Text style={[styles.askAiText, { fontFamily: labelFont }]}>{t.askAiMore}</Text>
          </TouchableOpacity>
        </View>
        <Text style={[styles.debugText, { fontFamily: labelFont }]}>
          Team ID: {activeTeamId || '—'} | GW: {currentGw || '—'} | Mode: {authMode} | Fetched: {lastFetched || '—'}
        </Text>

      </ScrollView>

      {/* ── 7. Fixed Bottom Nav ── */}
      <BottomNav activeTab="home" isArabic={isArabic} />
    </View>
  );
}

// ─── Mini Pitch Component ─────────────────────────────────────────────────────
function MiniPitch({ picks, isArabic }: { picks: FPLPick[]; isArabic: boolean }) {
  const startingXI = picks.filter((p) => p.position <= 11);

  // Group by formation role
  const gks = startingXI.filter((p) => p.player?.element_type === 1);
  const defs = startingXI.filter((p) => p.player?.element_type === 2);
  const mids = startingXI.filter((p) => p.player?.element_type === 3);
  const fwds = startingXI.filter((p) => p.player?.element_type === 4);

  const formationStr = `${defs.length || 4}-${mids.length || 4}-${fwds.length || 2}`;
  const formationLabel = isArabic
    ? `التشكيلة الأساسية: ${formationStr}`
    : `Starting XI: ${formationStr}`;

  const rows = [
    gks.length ? gks : startingXI.slice(0, 1),
    defs.length ? defs : startingXI.slice(1, 5),
    mids.length ? mids : startingXI.slice(5, 9),
    fwds.length ? fwds : startingXI.slice(9, 11),
  ];

  return (
    <View style={pitchStyles.pitchContainer}>
      {/* Decorative Grid Lines */}
      <View style={pitchStyles.gridOverlay} pointerEvents="none">
        {Array.from({ length: 8 }).map((_, i) => (
          <View key={i} style={pitchStyles.gridLine} />
        ))}
      </View>
      <View style={pitchStyles.pitchCircle} pointerEvents="none" />
      <View style={pitchStyles.pitchHalfwayLine} pointerEvents="none" />

      {/* Players layout */}
      <View style={pitchStyles.formationContent}>
        {rows.map((rowPicks, rIndex) => (
          <View key={rIndex} style={pitchStyles.row}>
            {rowPicks.map((pick) => {
              const isGk = pick.player?.element_type === 1 || rIndex === 0;
              const dotColor = isGk ? Colors.tertiary : Colors.secondaryContainer;
              return (
                <View key={pick.element} style={pitchStyles.playerWrapper}>
                  <View style={[pitchStyles.dot, { backgroundColor: dotColor }]}>
                    {pick.is_captain && (
                      <View style={pitchStyles.badgeC}>
                        <Text style={pitchStyles.badgeText}>C</Text>
                      </View>
                    )}
                    {pick.is_vice_captain && (
                      <View style={pitchStyles.badgeV}>
                        <Text style={pitchStyles.badgeText}>V</Text>
                      </View>
                    )}
                  </View>
                  <Text style={pitchStyles.playerName} numberOfLines={1}>
                    {pick.player?.web_name || 'Player'}
                  </Text>
                </View>
              );
            })}
          </View>
        ))}
      </View>

      {/* Formation summary bar */}
      <View style={pitchStyles.formationFooter}>
        <Text style={pitchStyles.formationFooterText}>{formationLabel}</Text>
      </View>
    </View>
  );
}

// ─── Nav Item Component ──────────────────────────────────────────────────────
function NavItem({
  icon,
  label,
  active = false,
  labelFont,
  onPress,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  label: string;
  active?: boolean;
  labelFont: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.navItem} onPress={onPress} activeOpacity={0.7}>
      {active && <View style={styles.activeGlow} />}
      <MaterialIcons
        name={icon}
        size={22}
        color={active ? Colors.secondaryContainer : Colors.onSurfaceVariant}
      />
      <Text
        style={[
          styles.navLabel,
          { fontFamily: labelFont, color: active ? Colors.secondaryContainer : Colors.onSurfaceVariant },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Skeleton Card Component ────────────────────────────────────────────────
function SkeletonCard({
  shimmerAnim,
  width = '100%',
  height = 100,
}: {
  shimmerAnim: Animated.Value;
  width?: number | string;
  height?: number;
}) {
  return (
    <Animated.View
      style={[
        styles.skeleton,
        { width: width as any, height, opacity: shimmerAnim },
      ]}
    />
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.brandPurple,
  },

  // Fixed top header
  fixedHeaderSafeArea: {
    backgroundColor: 'rgba(18,20,20,0.85)',
    zIndex: 100,
  },
  fixedHeader: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  brandGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandTitle: {
    color: Colors.tertiary,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBtn: {
    position: 'relative',
    padding: 6,
  },
  unreadDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: Colors.secondaryContainer,
  },

  // Language toggle
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
    fontSize: 12,
  },
  langDivider: {
    width: 1,
    height: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  langMuted: {
    color: Colors.onSurfaceVariant,
    fontSize: 12,
    opacity: 0.7,
  },

  // Scroll Content
  scrollContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: 100,
    gap: Spacing.lg,
  },

  // User Row
  userRow: {
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  userInfo: {
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.brandPurpleMid,
    borderWidth: 1.5,
    borderColor: Colors.secondaryContainer,
  },
  teamName: {
    color: Colors.white,
    fontSize: FontSizes.headlineSm,
    fontWeight: '700',
  },
  managerTag: {
    color: Colors.onSurfaceVariant,
    fontSize: 11,
    letterSpacing: 1,
  },

  // Hero Card
  heroCard: {
    backgroundColor: '#4F1953',
    borderRadius: Radii.xxl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: Colors.secondaryContainer,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
    overflow: 'hidden',
  },
  heroGlow: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.secondaryContainer,
    opacity: 0.1,
  },
  heroHeader: {
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  gwBadgeText: {
    color: Colors.onSurfaceVariant,
    fontSize: 12,
    letterSpacing: 1,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(52,255,140,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radii.full,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.secondaryContainer,
  },
  liveText: {
    color: Colors.secondaryContainer,
    fontSize: 11,
    fontWeight: '700',
  },
  ptsRow: {
    alignItems: 'baseline',
    gap: 6,
    marginVertical: 4,
  },
  ptsNumber: {
    color: Colors.white,
    fontSize: 48,
    lineHeight: 52,
    fontWeight: '700',
  },
  ptsUnit: {
    color: Colors.secondaryContainer,
    fontSize: 22,
    fontWeight: '700',
  },
  rankRow: {
    alignItems: 'center',
    gap: 6,
  },
  rankText: {
    color: Colors.onSurfaceVariant,
    fontSize: FontSizes.bodyMd,
  },

  // Horizontal Scroll
  horizontalScroll: {
    gap: Spacing.md,
  },
  miniCard: {
    width: 230,
    backgroundColor: 'rgba(79,25,83,0.4)',
    borderRadius: Radii.xl,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    gap: 8,
  },
  miniCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  miniCardTag: {
    color: Colors.tertiary,
    fontSize: 11,
    letterSpacing: 0.5,
  },
  countdownText: {
    color: Colors.white,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  miniCardSub: {
    color: Colors.onSurfaceVariant,
    fontSize: 12,
  },

  // Captain Card
  captainCard: {
    width: 270,
    backgroundColor: 'rgba(79,25,83,0.5)',
  },
  captainBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(52,255,140,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radii.full,
  },
  captainBadgeText: {
    color: Colors.secondaryContainer,
    fontSize: 10,
    fontWeight: '700',
  },
  captainContent: {
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  captainPhoto: {
    width: 48,
    height: 60,
    borderRadius: 6,
    backgroundColor: Colors.brandPurpleMid,
  },
  captainName: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: '700',
  },
  captainReason: {
    color: Colors.onSurfaceVariant,
    fontSize: 11,
    lineHeight: 15,
  },

  // Squad Section
  squadSection: {
    gap: Spacing.sm,
  },
  sectionHeader: {
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    color: Colors.white,
    fontSize: FontSizes.headlineSm,
    fontWeight: '700',
  },
  viewAllLink: {
    color: Colors.secondaryContainer,
    fontSize: 12,
  },

  // AI Insight Card
  insightCard: {
    backgroundColor: 'rgba(79,25,83,0.35)',
    borderRadius: Radii.xl,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    gap: Spacing.sm,
  },
  debugText: {
    color: Colors.onSurfaceVariant,
    fontSize: 10,
    opacity: 0.65,
    textAlign: 'center',
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
  },
  dataNotice: { color: Colors.onSurfaceVariant, fontSize: 12, textAlign: 'center', marginTop: Spacing.sm },
  emptySquad: { minHeight: 170, borderRadius: Radii.xl, backgroundColor: 'rgba(0,0,0,0.14)', alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  emptySquadText: { color: Colors.onSurfaceVariant, fontSize: FontSizes.bodyMd, textAlign: 'center', lineHeight: 22 },
  insightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  insightTitle: {
    color: Colors.tertiary,
    fontSize: 16,
    fontWeight: '700',
  },
  insightBody: {
    color: Colors.onSurface,
    fontSize: 14,
    lineHeight: 20,
  },
  insightShimmer: {
    height: 36,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 6,
  },
  askAiRow: {
    paddingVertical: 2,
  },
  askAiText: {
    color: Colors.secondaryContainer,
    fontSize: 12,
  },

  // Bottom Nav
  bottomNavSafeArea: {
    backgroundColor: '#121414',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  bottomNav: {
    height: 60,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    position: 'relative',
  },
  activeGlow: {
    position: 'absolute',
    top: -6,
    width: 20,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: Colors.secondaryContainer,
  },
  navLabel: {
    fontSize: 10,
  },

  // Skeleton Placeholder
  skeleton: {
    backgroundColor: 'rgba(79,25,83,0.4)',
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
});

// ─── Pitch Styles ─────────────────────────────────────────────────────────────
const pitchStyles = StyleSheet.create({
  pitchContainer: {
    height: 240,
    backgroundColor: 'rgba(30,0,33,0.85)',
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    justifyContent: 'center',
    position: 'relative',
  },
  gridOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-evenly',
  },
  gridLine: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  pitchCircle: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.07)',
    transform: [{ translateX: -40 }, { translateY: -40 }],
  },
  pitchHalfwayLine: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  formationContent: {
    flex: 1,
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  playerWrapper: {
    alignItems: 'center',
    gap: 3,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    position: 'relative',
  },
  badgeC: {
    position: 'absolute',
    top: -4,
    right: -6,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.brandPurple,
    borderWidth: 1,
    borderColor: Colors.secondaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeV: {
    position: 'absolute',
    top: -4,
    right: -6,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.brandPurple,
    borderWidth: 1,
    borderColor: Colors.tertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: Colors.white,
    fontSize: 7,
    fontWeight: '700',
  },
  playerName: {
    color: Colors.onSurfaceVariant,
    fontSize: 9,
    maxWidth: 55,
    textAlign: 'center',
  },
  formationFooter: {
    paddingVertical: 4,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  formationFooterText: {
    color: Colors.tertiary,
    fontSize: 10,
    letterSpacing: 0.5,
  },
});
