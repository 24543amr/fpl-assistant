/**
 * FPL Assistant – Squad Management Screen
 *
 * Implements the 5 Stitch Design Frames:
 * 1. squad_my_team_en (Starting XI + FDR badges, Substitutes bench, Header meta, Chips)
 * 2. squad_my_team_ar_rtl (Complete Arabic RTL layout, Cairo typography, translated labels)
 * 3. squad_points_tab_en (Live GW Points, Stat bubbles, GW switcher, Points pitch)
 * 4. squad_player_action_sheet_en (Captain, Vice-Captain, Triple Captain, Bench Boost, Sub)
 * 5. squad_transfers_comparison_en (Player Swap Hub, Candidate audit, Staged transfer pitch, Sticky summary bar)
 *
 * Caching: squadCache singleton (<50ms instant load, 30m stale checking, clear on mutation)
 * Top Bar: Animated spinning refresh button (↻) with 360-spin loop and Updated toast
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Dimensions,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';

import { Colors } from '@/constants/theme';
import { getStoredTeamId, getStoredFplToken } from '@/utils/storage';
import { squadCache } from '@/utils/squadCache';
import AppHeader from '@/components/AppHeader';
import BottomNav from '@/components/BottomNav';
import SpinningRefreshButton from '@/components/SpinningRefreshButton';
import SquadPitchCard from '@/components/SquadPitchCard';
import SquadBenchCard from '@/components/SquadBenchCard';
import PlayerActionSheet from '@/components/PlayerActionSheet';
import TransferComparisonModal from '@/components/TransferComparisonModal';
import {
  fetchBootstrap,
  fetchUserEntry,
  fetchUserPicks,
  fetchMyTeamSquad,
  saveLineupToServer,
  submitFplTransfer,
  fetchFixtures,
  getTargetGameweek,
  DEFAULT_TEAMS_MAP,
  FPLFixture,
  FPLPick,
  FPLPlayer,
  FPLUserEntry,
  FPLTransfersInfo,
  fetchGameweekLive,
  FPLEvent,
} from '@/api/fpl';

type ScreenTab = 'squad' | 'points' | 'transfers';

interface StagedTransfer {
  element_out: FPLPlayer;
  element_in: FPLPlayer;
  purchase_price: number;
  selling_price: number;
  pickIndex: number;
}

function formatDeadlineDisplay(deadlineIso: string | null | undefined, isArabic: boolean): string {
  if (!deadlineIso) return isArabic ? 'السبت، 1:30 م' : 'Sat 13:30';
  try {
    const d = new Date(deadlineIso);
    const dayNameEn = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
    const dayNameAr = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'][d.getDay()];
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return isArabic ? `${dayNameAr}، ${hours}:${mins}` : `${dayNameEn} ${hours}:${mins}`;
  } catch (_) {
    return isArabic ? 'السبت، 1:30 م' : 'Sat 13:30';
  }
}

export default function SquadScreen() {
  const router = useRouter();

  // Active Tab: 'squad' (My Team) | 'points' (Points) | 'transfers' (Transfers)
  const [activeTab, setActiveTab] = useState<ScreenTab>('squad');

  // Language state
  const [isArabic, setIsArabic] = useState(false);
  const isRTL = isArabic;

  // Initialize state from squadCache singleton for instant (<50ms) render
  const cachedInitial = squadCache.get();

  const [isLoading, setIsLoading] = useState(!cachedInitial);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [squadError, setSquadError] = useState<string | null>(null);
  const [isSavingLineup, setIsSavingLineup] = useState(false);
  const [isSubmittingTransfers, setIsSubmittingTransfers] = useState(false);

  const [entry, setEntry] = useState<FPLUserEntry | null>(null);
  const [picks, setPicks] = useState<FPLPick[]>(cachedInitial?.picks || []);
  const [transfersInfo, setTransfersInfo] = useState<FPLTransfersInfo | null>(
    cachedInitial ? { bank: cachedInitial.bank ?? 0, limit: cachedInitial.freeTransfers ?? 1, made: 0, cost: 0, value: 1000 } : null
  );
  const [allElementsList, setAllElementsList] = useState<FPLPlayer[]>([]);
  const [elementsMap, setElementsMap] = useState<Map<number, FPLPlayer>>(
    cachedInitial?.playerMap || new Map()
  );
  const [teamsMap, setTeamsMap] = useState<Map<number, string>>(
    cachedInitial?.teamMap ? new Map(Array.from(cachedInitial.teamMap.entries()).map(([k, v]) => [k, v.short_name || v.name])) : new Map(DEFAULT_TEAMS_MAP)
  );
  const [currentGw, setCurrentGw] = useState<number>(cachedInitial?.gameweek || 1);
  const [currentEventObj, setCurrentEventObj] = useState<FPLEvent | null>(null);

  // Fixtures & Target GW
  const [fixtures, setFixtures] = useState<FPLFixture[]>([]);
  const [targetGw, setTargetGw] = useState<number>(cachedInitial?.gameweek || 1);

  // Selection & Substitution State
  const [selectedPickIndex, setSelectedPickIndex] = useState<number | null>(null);
  const [actionMenuPick, setActionMenuPick] = useState<{ pick: FPLPick; index: number } | null>(null);
  const [hasLineupChanges, setHasLineupChanges] = useState(false);

  // Transfers Staging State
  const [stagedTransfers, setStagedTransfers] = useState<StagedTransfer[]>([]);
  const [transferPickerPick, setTransferPickerPick] = useState<{ pick: FPLPick; index: number } | null>(null);

  // Points Tab State
  const [pointsGw, setPointsGw] = useState<number>(cachedInitial?.gameweek || 1);
  const [livePointsMap, setLivePointsMap] = useState<Map<number, number>>(new Map());
  const [isLoadingPoints, setIsLoadingPoints] = useState(false);

  // Fetch Squad Data silently or on demand
  const loadSquadData = useCallback(async (mode: 'initial' | 'refresh' | 'focus' = 'initial') => {
    if (mode === 'refresh') {
      setIsRefreshing(true);
    } else if (mode === 'initial' && !squadCache.get()) {
      setIsLoading(true);
    }
    setSquadError(null);

    try {
      const teamId = await getStoredTeamId();
      const tokens = await getStoredFplToken();
      const accessToken = tokens?.accessToken || null;

      if (!teamId) throw new Error('No connected Team ID.');

      const [bootstrap, userEntry, fixturesData] = await Promise.all([
        fetchBootstrap(),
        fetchUserEntry(teamId),
        fetchFixtures().catch(() => [] as FPLFixture[]),
      ]);

      const pMap = new Map<number, FPLPlayer>();
      bootstrap.elements.forEach(p => pMap.set(p.id, p));

      const tMap = new Map<number, string>(DEFAULT_TEAMS_MAP);
      const fullTeamMap = new Map<number, any>();
      bootstrap.teams?.forEach(t => {
        tMap.set(t.id, t.short_name || t.name);
        fullTeamMap.set(t.id, t);
      });

      const activeEvent =
        bootstrap.events?.find((e: any) => e.is_current) ||
        bootstrap.events?.find((e: any) => e.is_next) ||
        bootstrap.events?.[0] ||
        null;

      const resolvedGw = activeEvent?.id || userEntry.current_event || 1;
      const nextUnplayedGw = getTargetGameweek(bootstrap.events || []);

      setCurrentGw(resolvedGw);
      setTargetGw(nextUnplayedGw);
      setFixtures(fixturesData || []);
      setCurrentEventObj(activeEvent);
      setElementsMap(pMap);
      setTeamsMap(tMap);
      setAllElementsList(bootstrap.elements);
      setEntry(userEntry);

      let userPicks: FPLPick[] = [];
      let tInfo: FPLTransfersInfo | null = null;

      if (accessToken) {
        try {
          const squadData = await fetchMyTeamSquad(teamId, accessToken, pMap);
          userPicks = squadData.picks;
          tInfo = squadData.transfers || null;
        } catch (err: any) {
          console.warn('[Squad] my-team fetch failed, fallback to picks endpoint:', err.message);
          userPicks = await fetchUserPicks(teamId, resolvedGw, pMap).catch(() => []);
        }
      } else {
        userPicks = await fetchUserPicks(teamId, resolvedGw, pMap).catch(() => []);
      }

      if (userPicks && userPicks.length > 0) {
        setPicks(userPicks);
        if (tInfo) setTransfersInfo(tInfo);

        // Update squadCache singleton
        squadCache.set({
          picks: userPicks,
          playerMap: pMap,
          teamMap: fullTeamMap,
          gameweek: resolvedGw,
          teamId,
          teamName: userEntry.name,
          bank: tInfo?.bank,
          freeTransfers: tInfo?.limit,
        });
      }

      if (mode !== 'focus') {
        setStagedTransfers([]);
        setHasLineupChanges(false);
      }
    } catch (e: any) {
      console.error('[Squad] Load error:', e.message);
      setSquadError(e?.message || 'Unable to update squad.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Screen focus handling: loads from cache instantly, only silently refetches if stale (>30m)
  useFocusEffect(
    useCallback(() => {
      if (!squadCache.get() || squadCache.isStale()) {
        void loadSquadData(squadCache.get() ? 'focus' : 'initial');
      }
    }, [loadSquadData])
  );

  // Load live points when switching to points tab
  useEffect(() => {
    if (activeTab === 'points' && pointsGw > 0) {
      setIsLoadingPoints(true);
      fetchGameweekLive(pointsGw)
        .then(map => setLivePointsMap(map))
        .catch(err => {
          console.warn('[Squad] Failed to fetch live points:', err?.message);
          setLivePointsMap(new Map());
        })
        .finally(() => setIsLoadingPoints(false));
    }
  }, [activeTab, pointsGw]);

  // Synchronize pointsGw when currentGw resolves
  useEffect(() => {
    if (currentGw > 0) {
      setPointsGw(currentGw);
    }
  }, [currentGw]);

  // ── FORMATION VALIDATION & SUBSTITUTION ──────────────────────────────────────
  const validateFormation = (candidatePicks: FPLPick[]): boolean => {
    const starters = candidatePicks.slice(0, 11);
    const gks = starters.filter(p => p.player?.element_type === 1).length;
    const defs = starters.filter(p => p.player?.element_type === 2).length;
    const mids = starters.filter(p => p.player?.element_type === 3).length;
    const fwds = starters.filter(p => p.player?.element_type === 4).length;
    return gks === 1 && defs >= 3 && defs <= 5 && mids >= 2 && mids <= 5 && fwds >= 1 && fwds <= 3;
  };

  const handlePlayerCardPress = (index: number) => {
    if (activeTab === 'transfers') {
      setTransferPickerPick({ pick: picks[index], index });
      return;
    }

    if (selectedPickIndex === null) {
      // Open Stitch Player Action Sheet
      setActionMenuPick({ pick: picks[index], index });
    } else if (selectedPickIndex === index) {
      setSelectedPickIndex(null);
    } else {
      // Execute swap between selectedPickIndex and index
      const candidatePicks = [...picks];
      const temp = candidatePicks[selectedPickIndex];
      candidatePicks[selectedPickIndex] = candidatePicks[index];
      candidatePicks[index] = temp;

      candidatePicks.forEach((p, idx) => {
        p.position = idx + 1;
      });

      if (!validateFormation(candidatePicks)) {
        Alert.alert(
          isArabic ? 'تشكيلة غير صالحة' : 'Invalid Formation',
          isArabic
            ? 'يجب أن تحتوي التشكيلة الأساسية على: حارس مرمى 1، 3 مدافعين على الأقل، 2 خط وسط على الأقل، ومهاجم 1 على الأقل.'
            : 'Starting XI must contain: 1 GK, 3-5 DEF, 2-5 MID, 1-3 FWD.'
        );
        setSelectedPickIndex(null);
        return;
      }

      setPicks(candidatePicks);
      setSelectedPickIndex(null);
      setHasLineupChanges(true);
    }
  };

  const handleMakeCaptain = (targetIndex: number) => {
    const newPicks = picks.map((p, idx) => ({
      ...p,
      is_captain: idx === targetIndex,
      is_vice_captain: idx === targetIndex ? false : p.is_vice_captain,
    }));
    setPicks(newPicks);
    setActionMenuPick(null);
    setHasLineupChanges(true);
  };

  const handleMakeViceCaptain = (targetIndex: number) => {
    const newPicks = picks.map((p, idx) => ({
      ...p,
      is_vice_captain: idx === targetIndex,
      is_captain: idx === targetIndex ? false : p.is_captain,
    }));
    setPicks(newPicks);
    setActionMenuPick(null);
    setHasLineupChanges(true);
  };

  const handleStartSwapFromSheet = (index: number) => {
    setActionMenuPick(null);
    setSelectedPickIndex(index);
  };

  const handleSaveLineup = async () => {
    const starters = picks.slice(0, 11);
    const captain = starters.find(p => p.is_captain);
    const viceCaptain = starters.find(p => p.is_vice_captain);

    if (!captain || !viceCaptain) {
      Alert.alert(
        isArabic ? 'تنبيه الكابتن' : 'Captain Required',
        isArabic
          ? 'يجب تحديد كابتن ونائب كابتن في التشكيلة الأساسية قبل الحفظ.'
          : 'You must select a Captain and Vice-Captain in your Starting XI before saving.'
      );
      return;
    }

    setIsSavingLineup(true);
    try {
      const teamId = await getStoredTeamId();
      const tokens = await getStoredFplToken();

      if (!teamId || !tokens?.accessToken) {
        Alert.alert(
          isArabic ? 'تسجيل الدخول مطلوب' : 'FPL Login Required',
          isArabic
            ? 'سجل الدخول بحسابك في FPL لتحديث تشكيلتك وحفظها على الموقع الرسمي.'
            : 'Log in with your official FPL account to save lineup changes.'
        );
        setIsSavingLineup(false);
        return;
      }

      const res = await saveLineupToServer(teamId, picks, tokens.accessToken);
      if (res.success) {
        squadCache.clear();
        setHasLineupChanges(false);
        Alert.alert(
          isArabic ? 'تم الحفظ بنجاح! 🏆' : 'Lineup Saved! 🏆',
          isArabic
            ? 'تم حفظ تشكيلتك وتحديثها على موقع FPL بنجاح.'
            : 'Your starting XI and captains were updated on FPL.'
        );
        void loadSquadData('refresh');
      } else {
        Alert.alert(isArabic ? 'فشل الحفظ' : 'Save Failed', res.message || 'Error saving lineup.');
      }
    } catch (e: any) {
      Alert.alert(isArabic ? 'خطأ' : 'Error', e.message || 'Connection error.');
    } finally {
      setIsSavingLineup(false);
    }
  };

  // ── TRANSFERS PLANNER LOGIC ──────────────────────────────────────────────────
  const initialBank = transfersInfo?.bank ?? 0;
  const calculatedBank = useMemo(() => {
    let b = initialBank;
    stagedTransfers.forEach(t => {
      b += t.selling_price - t.purchase_price;
    });
    return b;
  }, [initialBank, stagedTransfers]);

  const freeTransfersLimit = transfersInfo?.limit ?? 1;
  const transferCostPoints = useMemo(() => {
    const extra = Math.max(0, stagedTransfers.length - freeTransfersLimit);
    return extra * 4;
  }, [stagedTransfers.length, freeTransfersLimit]);

  const handleStageReplacement = (newPlayer: FPLPlayer) => {
    if (!transferPickerPick || !transferPickerPick.pick.player) return;

    const outgoing = transferPickerPick.pick.player;
    const index = transferPickerPick.index;

    const sellingPrice = transferPickerPick.pick.selling_price || outgoing.now_cost;
    const purchasePrice = newPlayer.now_cost;
    const costDiff = purchasePrice - sellingPrice;

    if (costDiff > calculatedBank) {
      Alert.alert(
        isArabic ? 'ميزانية غير كافية' : 'Insufficient Funds',
        `You need £${(costDiff / 10).toFixed(1)}m but only have £${(calculatedBank / 10).toFixed(1)}m in bank.`
      );
      return;
    }

    const updatedPicks = [...picks];
    updatedPicks[index] = {
      ...updatedPicks[index],
      element: newPlayer.id,
      player: newPlayer,
    };

    const newStaged = [...stagedTransfers.filter(t => t.pickIndex !== index)];
    newStaged.push({
      element_out: outgoing,
      element_in: newPlayer,
      purchase_price: purchasePrice,
      selling_price: sellingPrice,
      pickIndex: index,
    });

    setPicks(updatedPicks);
    setStagedTransfers(newStaged);
    setTransferPickerPick(null);
  };

  const handleConfirmTransfers = async () => {
    if (stagedTransfers.length === 0) return;

    setIsSubmittingTransfers(true);
    try {
      const teamId = await getStoredTeamId();
      const tokens = await getStoredFplToken();

      if (!teamId || !tokens?.accessToken) {
        Alert.alert(
          isArabic ? 'تسجيل الدخول مطلوب' : 'FPL Login Required',
          isArabic
            ? 'سجل الدخول بحسابك في FPL لتنفيذ الانتقالات على الموقع الرسمي.'
            : 'Log in with your official FPL account to confirm transfers.'
        );
        setIsSubmittingTransfers(false);
        return;
      }

      const transfersPayload = stagedTransfers.map(t => ({
        element_in: t.element_in.id,
        element_out: t.element_out.id,
        purchase_price: t.purchase_price,
        selling_price: t.selling_price,
      }));

      const res = await submitFplTransfer({
        teamId,
        gameweek: targetGw || currentGw,
        transfers: transfersPayload,
        accessToken: tokens.accessToken,
      });
      if (res.success) {
        squadCache.clear();
        setStagedTransfers([]);
        Alert.alert(
          isArabic ? 'تم تأكيد التبديلات بنجاح! 🚀' : 'Transfers Confirmed! 🚀',
          isArabic
            ? 'تم حفظ انتقالاتك على موقع الفانتاسي بنجاح.'
            : 'Your transfers have been processed and saved on FPL.'
        );
        void loadSquadData('refresh');
      } else {
        Alert.alert(isArabic ? 'فشل الانتقالات' : 'Transfer Failed', res.message || 'Error confirming transfers.');
      }
    } catch (e: any) {
      Alert.alert(isArabic ? 'خطأ' : 'Error', e.message || 'Connection error.');
    } finally {
      setIsSubmittingTransfers(false);
    }
  };

  // Starters (1-11) and Bench (12-15)
  const starters = picks.slice(0, 11);
  const bench = picks.slice(11, 15);

  const gks = starters.filter(p => p.player?.element_type === 1);
  const defs = starters.filter(p => p.player?.element_type === 2);
  const mids = starters.filter(p => p.player?.element_type === 3);
  const fwds = starters.filter(p => p.player?.element_type === 4);

  const totalPointsLive = useMemo(() => {
    return starters.reduce((acc, pick) => {
      const raw = livePointsMap.get(pick.element) ?? pick.player?.total_points ?? 0;
      const mult = pick.multiplier || (pick.is_captain ? 2 : 1);
      return acc + raw * mult;
    }, 0);
  }, [starters, livePointsMap]);

  const totalBenchPoints = useMemo(() => {
    return bench.reduce((acc, pick) => {
      const raw = livePointsMap.get(pick.element) ?? pick.player?.total_points ?? 0;
      return acc + raw;
    }, 0);
  }, [bench, livePointsMap]);

  const teamNameDisplay = entry?.name || (isArabic ? 'فريق عمرو' : "Amr's Team");
  const deadlineStr = formatDeadlineDisplay(currentEventObj?.deadline_time, isArabic);

  const handleShareTeam = async () => {
    try {
      await Share.share({
        message: `${teamNameDisplay} - FPL Gameweek ${currentGw} Squad!\nPoints: ${totalPointsLive} pts`,
      });
    } catch (_) {}
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* ── STITCH TEAM CONTEXT HEADER ── */}
      <View style={[styles.teamHeaderCard, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <View style={[styles.teamHeaderLeft, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
          <TouchableOpacity style={[styles.teamNameRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]} activeOpacity={0.8}>
            <Text style={styles.teamNameText} numberOfLines={1}>
              {teamNameDisplay}
            </Text>
            <MaterialIcons name="expand-more" size={18} color="#f6aff2" />
          </TouchableOpacity>
          <View style={[styles.teamSubRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <Text style={styles.gwPillText}>
              {isArabic ? `الجولة ${currentGw}` : `Gameweek ${currentGw}`}
            </Text>
            <View style={styles.subDot} />
            <Text style={styles.avgPtsText}>
              {activeTab === 'points'
                ? isArabic
                  ? `إجمالي: ${totalPointsLive} نقطة`
                  : `Total: ${totalPointsLive} pts`
                : isArabic
                ? `الترتيب: ${entry?.summary_overall_rank ? entry.summary_overall_rank.toLocaleString() : '-'}`
                : `Rank: ${entry?.summary_overall_rank ? entry.summary_overall_rank.toLocaleString() : '-'}`}
            </Text>
          </View>
        </View>

        {/* Right Header Controls: Refresh (↻), Share, Language Toggle */}
        <View style={[styles.headerControlsRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <SpinningRefreshButton
            onRefresh={() => loadSquadData('refresh')}
            isArabic={isArabic}
            isRefreshing={isRefreshing}
          />

          <TouchableOpacity style={styles.iconCircleBtn} onPress={handleShareTeam} activeOpacity={0.8}>
            <MaterialIcons name="share" size={16} color="#d2c2cd" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.langPillBtn}
            onPress={() => setIsArabic(!isArabic)}
            activeOpacity={0.8}
          >
            <Text style={styles.langPillText}>{isArabic ? 'عربي' : 'EN'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── STITCH MAIN VIEW NAVIGATION TABS ── */}
      <View style={[styles.tabsNavContainer, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <TouchableOpacity
          style={[styles.tabNavItem, activeTab === 'squad' && styles.tabNavItemActive]}
          onPress={() => setActiveTab('squad')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabNavText, activeTab === 'squad' && styles.tabNavTextActive]}>
            {isArabic ? 'فريقي' : 'My Team'}
          </Text>
          {activeTab === 'squad' && <View style={styles.tabActiveIndicator} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabNavItem, activeTab === 'points' && styles.tabPointsActive]}
          onPress={() => setActiveTab('points')}
          activeOpacity={0.8}
        >
          <View style={styles.pointsTabContent}>
            <Text style={[styles.tabNavText, activeTab === 'points' && styles.tabPointsTextActive]}>
              {isArabic ? 'النقاط' : 'Points'}
            </Text>
            {activeTab === 'points' && <View style={styles.pulseDot} />}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabNavItem, activeTab === 'transfers' && styles.tabNavItemActive]}
          onPress={() => setActiveTab('transfers')}
          activeOpacity={0.8}
        >
          <View style={styles.transfersTabContent}>
            <Text style={[styles.tabNavText, activeTab === 'transfers' && styles.tabTransfersTextActive]}>
              {isArabic ? 'التبديلات' : 'Transfers'}
            </Text>
            {stagedTransfers.length > 0 && (
              <View style={styles.stagedBadge}>
                <Text style={styles.stagedBadgeText}>{stagedTransfers.length}</Text>
              </View>
            )}
          </View>
          {activeTab === 'transfers' && <View style={styles.tabActiveIndicatorCyan} />}
        </TouchableOpacity>
      </View>

      {/* ── SCROLLABLE BODY ── */}
      {isLoading && picks.length === 0 ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color="#00FF87" />
          <Text style={styles.loadingText}>
            {isArabic ? 'جاري تحميل التشكيلة من FPL...' : 'Loading squad from FPL...'}
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Swap Mode Prompt Banner */}
          {selectedPickIndex !== null && (
            <View style={[styles.swapModeBanner, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <MaterialIcons name="swap-vertical-circle" size={18} color="#34ff8c" />
              <Text style={styles.swapModeText}>
                {isArabic
                  ? 'اضغط على لاعب آخر لتبديله أو اضغط على نفس اللاعب للإلغاء'
                  : 'Tap another player to complete swap, or tap again to cancel'}
              </Text>
            </View>
          )}

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* TAB 1: MY TEAM (Tactical Pitch & Substitutes)                      */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'squad' && (
            <>
              {/* Gameweek Live Summary Banner */}
              <View style={[styles.summaryBanner, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <View style={[styles.summaryCol, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
                  <Text style={styles.summaryLabel}>
                    {isArabic ? 'الموعد النهائي القادم' : 'Next Deadline'}
                  </Text>
                  <Text style={styles.summaryValue}>{deadlineStr}</Text>
                </View>
                <View style={[styles.summaryCol, { alignItems: isRTL ? 'flex-start' : 'flex-end' }]}>
                  <Text style={styles.summaryLabel}>
                    {isArabic ? 'التبديلات المجانية' : 'Free Transfers'}
                  </Text>
                  <Text style={styles.summaryValueTeal}>
                    {freeTransfersLimit} {isArabic ? 'متاح' : 'Available'} (+£{(calculatedBank / 10).toFixed(1)}m)
                  </Text>
                </View>
              </View>

              {/* Booster Chips Row */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={[styles.chipsContainer, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
              >
                <View style={styles.chipPillBtn}>
                  <MaterialIcons name="bolt" size={15} color="#34ff8c" />
                  <Text style={styles.chipPillTitle}>
                    {isArabic ? 'كابتن مضاعف 3x' : 'Triple Captain'}
                  </Text>
                  <View style={styles.chipTagAvailable}>
                    <Text style={styles.chipTagAvailableText}>
                      {isArabic ? 'متاح' : 'AVAILABLE'}
                    </Text>
                  </View>
                </View>

                <View style={styles.chipPillBtn}>
                  <MaterialIcons name="fitness-center" size={15} color="#00dbe9" />
                  <Text style={styles.chipPillTitle}>
                    {isArabic ? 'تعزيز الدكة' : 'Bench Boost'}
                  </Text>
                  <View style={[styles.chipTagAvailable, { backgroundColor: 'rgba(0, 219, 233, 0.15)' }]}>
                    <Text style={[styles.chipTagAvailableText, { color: '#00dbe9' }]}>
                      {isArabic ? 'جاهز' : 'READY'}
                    </Text>
                  </View>
                </View>

                <View style={[styles.chipPillBtn, { opacity: 0.7 }]}>
                  <MaterialIcons name="auto-fix-high" size={15} color="#d2c2cd" />
                  <Text style={styles.chipPillTitle}>
                    {isArabic ? 'الوايلد كارد' : 'Wildcard'}
                  </Text>
                </View>
              </ScrollView>

              {/* Pitch Area */}
              <View style={styles.pitchWrapper}>
                {/* SVG Tactical Markings overlay lines */}
                <View style={styles.pitchMarkingHalfway} pointerEvents="none" />
                <View style={styles.pitchMarkingCenterCircle} pointerEvents="none" />
                <View style={styles.pitchMarkingPenaltyTop} pointerEvents="none" />
                <View style={styles.pitchMarkingPenaltyBottom} pointerEvents="none" />

                {/* Pitch Rows */}
                <View style={styles.pitchRowsContainer}>
                  {/* GK Row */}
                  <View style={styles.pitchRow}>
                    {gks.map(pick => {
                      const realIndex = picks.findIndex(p => p.element === pick.element);
                      return (
                        <SquadPitchCard
                          key={pick.element}
                          pick={pick}
                          teamsMap={teamsMap}
                          fixtures={fixtures}
                          targetGw={targetGw}
                          isArabic={isArabic}
                          badgeMode="fixture"
                          isSelected={selectedPickIndex === realIndex}
                          onPress={() => handlePlayerCardPress(realIndex)}
                        />
                      );
                    })}
                  </View>

                  {/* DEF Row */}
                  <View style={styles.pitchRow}>
                    {defs.map(pick => {
                      const realIndex = picks.findIndex(p => p.element === pick.element);
                      return (
                        <SquadPitchCard
                          key={pick.element}
                          pick={pick}
                          teamsMap={teamsMap}
                          fixtures={fixtures}
                          targetGw={targetGw}
                          isArabic={isArabic}
                          badgeMode="fixture"
                          isSelected={selectedPickIndex === realIndex}
                          onPress={() => handlePlayerCardPress(realIndex)}
                        />
                      );
                    })}
                  </View>

                  {/* MID Row */}
                  <View style={styles.pitchRow}>
                    {mids.map(pick => {
                      const realIndex = picks.findIndex(p => p.element === pick.element);
                      return (
                        <SquadPitchCard
                          key={pick.element}
                          pick={pick}
                          teamsMap={teamsMap}
                          fixtures={fixtures}
                          targetGw={targetGw}
                          isArabic={isArabic}
                          badgeMode="fixture"
                          isSelected={selectedPickIndex === realIndex}
                          onPress={() => handlePlayerCardPress(realIndex)}
                        />
                      );
                    })}
                  </View>

                  {/* FWD Row */}
                  <View style={styles.pitchRow}>
                    {fwds.map(pick => {
                      const realIndex = picks.findIndex(p => p.element === pick.element);
                      return (
                        <SquadPitchCard
                          key={pick.element}
                          pick={pick}
                          teamsMap={teamsMap}
                          fixtures={fixtures}
                          targetGw={targetGw}
                          isArabic={isArabic}
                          badgeMode="fixture"
                          isSelected={selectedPickIndex === realIndex}
                          onPress={() => handlePlayerCardPress(realIndex)}
                        />
                      );
                    })}
                  </View>
                </View>
              </View>

              {/* Substitutes Bench */}
              <View style={styles.benchWrapper}>
                <View style={[styles.benchHeaderRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <Text style={styles.benchHeaderTitle}>
                    {isArabic ? 'البدلاء • أولوية التبديل التلقائي' : 'SUBSTITUTES • AUTO-SUB PRIORITY'}
                  </Text>
                  <Text style={styles.benchCountText}>4 {isArabic ? 'لاعبين' : 'Subs'}</Text>
                </View>

                <View style={[styles.benchCardsRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  {bench.map((pick, bIdx) => {
                    const realIndex = 11 + bIdx;
                    return (
                      <SquadBenchCard
                        key={pick.element}
                        pick={pick}
                        benchIndex={bIdx + 1}
                        teamsMap={teamsMap}
                        fixtures={fixtures}
                        targetGw={targetGw}
                        isArabic={isArabic}
                        badgeMode="fixture"
                        isSelected={selectedPickIndex === realIndex}
                        onPress={() => handlePlayerCardPress(realIndex)}
                      />
                    );
                  })}
                </View>
              </View>

              {/* Sticky Lineup Changes Bar */}
              {hasLineupChanges && (
                <View style={styles.lineupSaveStickyBar}>
                  <View style={[styles.lineupSaveRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                    <View style={styles.lineupTextGroup}>
                      <Text style={styles.lineupModTitle}>
                        {isArabic ? 'تم تعديل التشكيلة' : 'Lineup Modified'}
                      </Text>
                      <Text style={styles.lineupModSub}>
                        {isArabic ? 'احفظ التشكيلة لتطبيقها على FPL' : 'Save to apply on official FPL site'}
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={styles.saveLineupBtn}
                      onPress={handleSaveLineup}
                      disabled={isSavingLineup}
                      activeOpacity={0.8}
                    >
                      {isSavingLineup ? (
                        <ActivityIndicator size="small" color="#00210c" />
                      ) : (
                        <>
                          <MaterialIcons name="check-circle" size={16} color="#00210c" />
                          <Text style={styles.saveLineupBtnText}>
                            {isArabic ? 'حفظ التشكيلة' : 'Save Lineup'}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* TAB 2: POINTS (Live Points, Score Bubbles, GW Switcher)           */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'points' && (
            <>
              {/* Gameweek Selector Carousel */}
              <View style={[styles.gwCarouselRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <TouchableOpacity
                  style={styles.gwNavArrow}
                  onPress={() => setPointsGw(Math.max(1, pointsGw - 1))}
                  activeOpacity={0.7}
                >
                  <MaterialIcons name={isRTL ? 'chevron-right' : 'chevron-left'} size={20} color="#d2c2cd" />
                </TouchableOpacity>

                <View style={[styles.gwPillList, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  {pointsGw > 1 && (
                    <TouchableOpacity style={styles.gwPillNormal} onPress={() => setPointsGw(pointsGw - 1)}>
                      <Text style={styles.gwPillNormalText}>GW {pointsGw - 1}</Text>
                    </TouchableOpacity>
                  )}
                  <View style={styles.gwPillActive}>
                    <Text style={styles.gwPillActiveText}>GW {pointsGw} (Live)</Text>
                  </View>
                  <TouchableOpacity style={styles.gwPillNormal} onPress={() => setPointsGw(pointsGw + 1)}>
                    <Text style={styles.gwPillNormalText}>GW {pointsGw + 1}</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.gwNavArrow}
                  onPress={() => setPointsGw(pointsGw + 1)}
                  activeOpacity={0.7}
                >
                  <MaterialIcons name={isRTL ? 'chevron-left' : 'chevron-right'} size={20} color="#d2c2cd" />
                </TouchableOpacity>
              </View>

              {/* Two Prominent Stat Bubbles */}
              <View style={[styles.statBubblesRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                {/* Left: Total GW Points Bubble */}
                <View style={styles.pointsBubbleLeft}>
                  <View style={styles.bubbleTopRow}>
                    <Text style={styles.bubbleTitleLeft}>
                      {isArabic ? 'نقاط الجولة' : 'GW POINTS'}
                    </Text>
                    <MaterialIcons name="bolt" size={18} color="#003919" />
                  </View>
                  <View style={styles.bubbleValueRow}>
                    <Text style={styles.bubblePtsNumber}>{totalPointsLive}</Text>
                    <Text style={styles.bubblePtsUnit}>{isArabic ? 'نقطة' : 'pts'}</Text>
                  </View>
                  <View style={styles.bubbleRankRow}>
                    <View style={styles.rankPill}>
                      <Text style={styles.rankPillText}>
                        Rank: {entry?.summary_event_rank ? entry.summary_event_rank.toLocaleString() : 'Live'}
                      </Text>
                    </View>
                    <Text style={styles.rankArrowText}>▲</Text>
                  </View>
                </View>

                {/* Right: Gameweek Transfers Bubble */}
                <View style={styles.pointsBubbleRight}>
                  <View style={styles.bubbleTopRow}>
                    <Text style={styles.bubbleTitleRight}>
                      {isArabic ? 'التبديلات' : 'TRANSFERS'}
                    </Text>
                    <MaterialIcons name="swap-horiz" size={18} color="#9b8d97" />
                  </View>
                  <View style={styles.bubbleValueRow}>
                    <Text style={styles.bubbleTransNumber}>
                      {transfersInfo?.made ?? 0}
                    </Text>
                    <Text style={styles.bubbleTransUnit}>{isArabic ? 'منفذة' : 'Made'}</Text>
                  </View>
                  <View style={styles.bubbleCostRow}>
                    <View style={styles.costPill}>
                      <Text style={styles.costPillText}>
                        {isArabic ? 'التكلفة: 0 ن' : 'Cost: 0 pts'}
                      </Text>
                    </View>
                    <Text style={styles.bankedText}>
                      {freeTransfersLimit} {isArabic ? 'مجاني' : 'Free Banked'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Points Pitch Area */}
              <View style={styles.pitchWrapper}>
                <View style={styles.pitchMarkingHalfway} pointerEvents="none" />
                <View style={styles.pitchMarkingCenterCircle} pointerEvents="none" />

                <View style={styles.pitchRowsContainer}>
                  {/* GK */}
                  <View style={styles.pitchRow}>
                    {gks.map(pick => {
                      const realIndex = picks.findIndex(p => p.element === pick.element);
                      const pts = livePointsMap.get(pick.element) ?? pick.player?.total_points ?? 0;
                      return (
                        <SquadPitchCard
                          key={pick.element}
                          pick={pick}
                          teamsMap={teamsMap}
                          fixtures={fixtures}
                          targetGw={pointsGw}
                          isArabic={isArabic}
                          badgeMode="points"
                          points={pts}
                          onPress={() => handlePlayerCardPress(realIndex)}
                        />
                      );
                    })}
                  </View>

                  {/* DEF */}
                  <View style={styles.pitchRow}>
                    {defs.map(pick => {
                      const realIndex = picks.findIndex(p => p.element === pick.element);
                      const pts = livePointsMap.get(pick.element) ?? pick.player?.total_points ?? 0;
                      return (
                        <SquadPitchCard
                          key={pick.element}
                          pick={pick}
                          teamsMap={teamsMap}
                          fixtures={fixtures}
                          targetGw={pointsGw}
                          isArabic={isArabic}
                          badgeMode="points"
                          points={pts}
                          onPress={() => handlePlayerCardPress(realIndex)}
                        />
                      );
                    })}
                  </View>

                  {/* MID */}
                  <View style={styles.pitchRow}>
                    {mids.map(pick => {
                      const realIndex = picks.findIndex(p => p.element === pick.element);
                      const pts = livePointsMap.get(pick.element) ?? pick.player?.total_points ?? 0;
                      return (
                        <SquadPitchCard
                          key={pick.element}
                          pick={pick}
                          teamsMap={teamsMap}
                          fixtures={fixtures}
                          targetGw={pointsGw}
                          isArabic={isArabic}
                          badgeMode="points"
                          points={pts}
                          onPress={() => handlePlayerCardPress(realIndex)}
                        />
                      );
                    })}
                  </View>

                  {/* FWD */}
                  <View style={styles.pitchRow}>
                    {fwds.map(pick => {
                      const realIndex = picks.findIndex(p => p.element === pick.element);
                      const raw = livePointsMap.get(pick.element) ?? pick.player?.total_points ?? 0;
                      const mult = pick.multiplier || (pick.is_captain ? 2 : 1);
                      return (
                        <SquadPitchCard
                          key={pick.element}
                          pick={pick}
                          teamsMap={teamsMap}
                          fixtures={fixtures}
                          targetGw={pointsGw}
                          isArabic={isArabic}
                          badgeMode="points"
                          points={raw * mult}
                          onPress={() => handlePlayerCardPress(realIndex)}
                        />
                      );
                    })}
                  </View>
                </View>
              </View>

              {/* Points Bench Section */}
              <View style={styles.benchWrapper}>
                <View style={[styles.benchHeaderRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <View style={[styles.benchPointsTitleGroup, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                    <Text style={styles.benchHeaderTitle}>
                      {isArabic ? 'الدكة' : 'BENCH'}
                    </Text>
                    <View style={styles.benchTotalPill}>
                      <Text style={styles.benchTotalText}>
                        Total: {totalBenchPoints} pts
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.benchSubRulesText}>
                    {isArabic ? 'قوانين التبديل التلقائي مفعلة' : 'Auto-sub rules active'}
                  </Text>
                </View>

                <View style={[styles.benchCardsRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  {bench.map((pick, bIdx) => {
                    const realIndex = 11 + bIdx;
                    const pts = livePointsMap.get(pick.element) ?? pick.player?.total_points ?? 0;
                    return (
                      <SquadBenchCard
                        key={pick.element}
                        pick={pick}
                        benchIndex={bIdx + 1}
                        teamsMap={teamsMap}
                        fixtures={fixtures}
                        targetGw={pointsGw}
                        isArabic={isArabic}
                        badgeMode="points"
                        points={pts}
                        onPress={() => handlePlayerCardPress(realIndex)}
                      />
                    );
                  })}
                </View>
              </View>
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* TAB 3: TRANSFERS (Prices Pitch & Staged Replacement Workflow)       */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'transfers' && (
            <>
              {/* Tap Player instruction bar */}
              <View style={[styles.transferIntroBar, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <Text style={styles.transferIntroTitle}>
                  {isArabic ? 'تشكيلة الانتقالات' : 'TRANSFERS PLANNER'}
                </Text>
                <Text style={styles.transferIntroSub}>
                  {isArabic ? 'اضغط على أي لاعب لاستبداله' : 'Tap player to replace'}
                </Text>
              </View>

              {/* Pitch Area with Price Badges */}
              <View style={styles.pitchWrapper}>
                <View style={styles.pitchMarkingHalfway} pointerEvents="none" />
                <View style={styles.pitchMarkingCenterCircle} pointerEvents="none" />

                <View style={styles.pitchRowsContainer}>
                  {/* GK */}
                  <View style={styles.pitchRow}>
                    {gks.map(pick => {
                      const realIndex = picks.findIndex(p => p.element === pick.element);
                      const isNewlyStaged = stagedTransfers.some(st => st.element_in.id === pick.element);
                      return (
                        <SquadPitchCard
                          key={pick.element}
                          pick={pick}
                          teamsMap={teamsMap}
                          fixtures={fixtures}
                          targetGw={targetGw}
                          isArabic={isArabic}
                          badgeMode="price"
                          isNewlyStaged={isNewlyStaged}
                          onPress={() => handlePlayerCardPress(realIndex)}
                        />
                      );
                    })}
                  </View>

                  {/* DEF */}
                  <View style={styles.pitchRow}>
                    {defs.map(pick => {
                      const realIndex = picks.findIndex(p => p.element === pick.element);
                      const isNewlyStaged = stagedTransfers.some(st => st.element_in.id === pick.element);
                      return (
                        <SquadPitchCard
                          key={pick.element}
                          pick={pick}
                          teamsMap={teamsMap}
                          fixtures={fixtures}
                          targetGw={targetGw}
                          isArabic={isArabic}
                          badgeMode="price"
                          isNewlyStaged={isNewlyStaged}
                          onPress={() => handlePlayerCardPress(realIndex)}
                        />
                      );
                    })}
                  </View>

                  {/* MID */}
                  <View style={styles.pitchRow}>
                    {mids.map(pick => {
                      const realIndex = picks.findIndex(p => p.element === pick.element);
                      const isNewlyStaged = stagedTransfers.some(st => st.element_in.id === pick.element);
                      return (
                        <SquadPitchCard
                          key={pick.element}
                          pick={pick}
                          teamsMap={teamsMap}
                          fixtures={fixtures}
                          targetGw={targetGw}
                          isArabic={isArabic}
                          badgeMode="price"
                          isNewlyStaged={isNewlyStaged}
                          onPress={() => handlePlayerCardPress(realIndex)}
                        />
                      );
                    })}
                  </View>

                  {/* FWD */}
                  <View style={styles.pitchRow}>
                    {fwds.map(pick => {
                      const realIndex = picks.findIndex(p => p.element === pick.element);
                      const isNewlyStaged = stagedTransfers.some(st => st.element_in.id === pick.element);
                      return (
                        <SquadPitchCard
                          key={pick.element}
                          pick={pick}
                          teamsMap={teamsMap}
                          fixtures={fixtures}
                          targetGw={targetGw}
                          isArabic={isArabic}
                          badgeMode="price"
                          isNewlyStaged={isNewlyStaged}
                          onPress={() => handlePlayerCardPress(realIndex)}
                        />
                      );
                    })}
                  </View>
                </View>
              </View>

              {/* Bench Substitutes */}
              <View style={styles.benchWrapper}>
                <View style={[styles.benchHeaderRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <Text style={styles.benchHeaderTitle}>
                    {isArabic ? 'بدلاء الدكة' : 'BENCH SUBSTITUTES'}
                  </Text>
                  <Text style={styles.benchSubRulesText}>
                    {isArabic ? 'اضغط للاستبدال' : 'Tap to replace'}
                  </Text>
                </View>

                <View style={[styles.benchCardsRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  {bench.map((pick, bIdx) => {
                    const realIndex = 11 + bIdx;
                    const isNewlyStaged = stagedTransfers.some(st => st.element_in.id === pick.element);
                    return (
                      <SquadBenchCard
                        key={pick.element}
                        pick={pick}
                        benchIndex={bIdx + 1}
                        teamsMap={teamsMap}
                        fixtures={fixtures}
                        targetGw={targetGw}
                        isArabic={isArabic}
                        badgeMode="price"
                        isNewlyStaged={isNewlyStaged}
                        onPress={() => handlePlayerCardPress(realIndex)}
                      />
                    );
                  })}
                </View>
              </View>

              {/* Sticky Transfer Summary Bar */}
              <View style={styles.transferSummaryStickyBar}>
                <View style={[styles.transferMetricsGrid, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <View style={styles.metricCol}>
                    <Text style={styles.metricLabel}>{isArabic ? 'المجاني' : 'FREE TRANS'}</Text>
                    <Text style={[styles.metricVal, { color: '#00dbe9' }]}>{freeTransfersLimit}</Text>
                  </View>
                  <View style={styles.metricCol}>
                    <Text style={styles.metricLabel}>{isArabic ? 'التكلفة' : 'COST'}</Text>
                    <Text style={styles.metricVal}>-{transferCostPoints} pts</Text>
                  </View>
                  <View style={styles.metricCol}>
                    <Text style={styles.metricLabel}>{isArabic ? 'في البنك' : 'IN BANK'}</Text>
                    <Text style={[styles.metricVal, { color: '#34ff8c' }]}>
                      £{(calculatedBank / 10).toFixed(1)}m
                    </Text>
                  </View>
                  <View style={styles.metricCol}>
                    <Text style={styles.metricLabel}>{isArabic ? 'الموعد' : 'DEADLINE'}</Text>
                    <Text style={styles.metricValSmall} numberOfLines={1}>{deadlineStr}</Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={[
                    styles.confirmTransfersBtn,
                    stagedTransfers.length === 0 && styles.confirmTransfersBtnDisabled,
                  ]}
                  disabled={stagedTransfers.length === 0 || isSubmittingTransfers}
                  onPress={handleConfirmTransfers}
                  activeOpacity={0.8}
                >
                  {isSubmittingTransfers ? (
                    <ActivityIndicator size="small" color="#00210c" />
                  ) : (
                    <>
                      <MaterialIcons name="check-circle" size={18} color="#00210c" />
                      <Text style={styles.confirmTransfersBtnText}>
                        {stagedTransfers.length > 0
                          ? isArabic
                            ? `تأكيد التبديل (${stagedTransfers.length} جاهز)`
                            : `Confirm Transfer (${stagedTransfers.length} Staged)`
                          : isArabic
                          ? 'تأكيد التبديلات (لا يوجد جديد)'
                          : 'Confirm Transfers'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </ScrollView>
      )}

      {/* ── STITCH PLAYER ACTION SHEET MODAL ── */}
      <PlayerActionSheet
        visible={!!actionMenuPick}
        pick={actionMenuPick?.pick || null}
        index={actionMenuPick?.index ?? -1}
        teamsMap={teamsMap}
        fixtures={fixtures}
        targetGw={targetGw}
        isArabic={isArabic}
        onMakeCaptain={handleMakeCaptain}
        onMakeViceCaptain={handleMakeViceCaptain}
        onStartSwap={handleStartSwapFromSheet}
        onClose={() => setActionMenuPick(null)}
      />

      {/* ── STITCH TRANSFER COMPARISON MODAL (SWAP HUB) ── */}
      <TransferComparisonModal
        visible={!!transferPickerPick}
        outgoingPick={transferPickerPick}
        allElements={allElementsList}
        currentSquadPicks={picks}
        teamsMap={teamsMap}
        fixtures={fixtures}
        targetGw={targetGw}
        currentBank={calculatedBank}
        isArabic={isArabic}
        onStageTransfer={handleStageReplacement}
        onClose={() => setTransferPickerPick(null)}
      />

      {/* ── BOTTOM NAVIGATION ── */}
      <BottomNav activeTab="squad" isArabic={isArabic} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#121414',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 90,
  },
  loadingCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#d2c2cd',
    fontSize: 14,
    fontWeight: '600',
  },

  /* Team Header Card */
  teamHeaderCard: {
    backgroundColor: '#1e2020',
    marginHorizontal: 12,
    marginTop: 4,
    marginBottom: 8,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  teamHeaderLeft: {
    flex: 1,
    minWidth: 0,
  },
  teamNameRow: {
    alignItems: 'center',
    gap: 4,
  },
  teamNameText: {
    color: '#e2e2e2',
    fontSize: 17,
    fontWeight: '800',
  },
  teamSubRow: {
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  gwPillText: {
    color: '#00dbe9',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  subDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#9b8d97',
  },
  avgPtsText: {
    color: '#d2c2cd',
    fontSize: 11,
    fontWeight: '500',
  },
  headerControlsRow: {
    alignItems: 'center',
    gap: 6,
  },
  iconCircleBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#282a2b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  langPillBtn: {
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#333535',
    alignItems: 'center',
    justifyContent: 'center',
  },
  langPillText: {
    color: '#34ff8c',
    fontSize: 11,
    fontWeight: '800',
  },

  /* Navigation Tabs */
  tabsNavContainer: {
    backgroundColor: '#1a1c1c',
    marginHorizontal: 12,
    marginBottom: 10,
    borderRadius: 12,
    padding: 3,
  },
  tabNavItem: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    position: 'relative',
  },
  tabNavItemActive: {
    backgroundColor: 'transparent',
  },
  tabPointsActive: {
    backgroundColor: '#34ff8c',
  },
  tabNavText: {
    color: '#d2c2cd',
    fontSize: 13,
    fontWeight: '700',
  },
  tabNavTextActive: {
    color: '#00dbe9',
  },
  tabPointsTextActive: {
    color: '#003919',
    fontWeight: '800',
  },
  tabTransfersTextActive: {
    color: '#00dbe9',
  },
  tabActiveIndicator: {
    position: 'absolute',
    bottom: 2,
    width: 24,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#00dbe9',
  },
  tabActiveIndicatorCyan: {
    position: 'absolute',
    bottom: 2,
    width: 24,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#00dbe9',
  },
  pointsTabContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  pulseDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#003919',
  },
  transfersTabContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stagedBadge: {
    backgroundColor: '#00dbe9',
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stagedBadgeText: {
    color: '#002022',
    fontSize: 9,
    fontWeight: '900',
  },

  /* Summary Banner */
  summaryBanner: {
    backgroundColor: '#1e2020',
    borderRadius: 14,
    padding: 12,
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  summaryCol: {
    flex: 1,
  },
  summaryLabel: {
    color: '#9b8d97',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  summaryValue: {
    color: '#e2e2e2',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  summaryValueTeal: {
    color: '#34ff8c',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 2,
  },

  /* Chips */
  chipsContainer: {
    gap: 8,
    marginBottom: 10,
  },
  chipPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1e2020',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  chipPillTitle: {
    color: '#e2e2e2',
    fontSize: 11,
    fontWeight: '700',
  },
  chipTagAvailable: {
    backgroundColor: 'rgba(52, 255, 140, 0.15)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  chipTagAvailableText: {
    color: '#34ff8c',
    fontSize: 9,
    fontWeight: '800',
  },

  /* Tactical Pitch */
  pitchWrapper: {
    backgroundColor: '#12331f',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 6,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(96, 255, 152, 0.2)',
    marginBottom: 10,
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
    height: 48,
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
    height: 48,
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
  },

  /* Bench */
  benchWrapper: {
    backgroundColor: '#1a1c1c',
    borderRadius: 16,
    padding: 10,
    marginBottom: 10,
  },
  benchHeaderRow: {
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  benchHeaderTitle: {
    color: '#d2c2cd',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  benchCountText: {
    color: '#9b8d97',
    fontSize: 10,
    fontWeight: '600',
  },
  benchCardsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  /* Sticky Lineup Save Bar */
  lineupSaveStickyBar: {
    backgroundColor: '#1e2020',
    borderRadius: 14,
    padding: 12,
    marginTop: 4,
    borderWidth: 1,
    borderColor: 'rgba(52, 255, 140, 0.3)',
    shadowColor: '#34ff8c',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  lineupSaveRow: {
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lineupTextGroup: {
    flex: 1,
  },
  lineupModTitle: {
    color: '#34ff8c',
    fontSize: 14,
    fontWeight: '800',
  },
  lineupModSub: {
    color: '#9b8d97',
    fontSize: 11,
  },
  saveLineupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#34ff8c',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  saveLineupBtnText: {
    color: '#00210c',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },

  /* Swap Mode Banner */
  swapModeBanner: {
    backgroundColor: 'rgba(52, 255, 140, 0.15)',
    borderWidth: 1,
    borderColor: '#34ff8c',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  swapModeText: {
    color: '#34ff8c',
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },

  /* Points Tab Carousel & Bubbles */
  gwCarouselRow: {
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  gwNavArrow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#282a2b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gwPillList: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  gwPillNormal: {
    backgroundColor: '#1e2020',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  gwPillNormalText: {
    color: '#9b8d97',
    fontSize: 11,
    fontWeight: '600',
  },
  gwPillActive: {
    backgroundColor: '#37003c',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
  },
  gwPillActiveText: {
    color: '#f6aff2',
    fontSize: 12,
    fontWeight: '800',
  },

  statBubblesRow: {
    gap: 10,
    marginBottom: 10,
  },
  pointsBubbleLeft: {
    flex: 1,
    backgroundColor: '#34ff8c',
    borderRadius: 16,
    padding: 12,
    shadowColor: '#34ff8c',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  bubbleTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bubbleTitleLeft: {
    color: '#003919',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  bubbleValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    marginVertical: 4,
  },
  bubblePtsNumber: {
    color: '#003919',
    fontSize: 34,
    fontWeight: '900',
    lineHeight: 36,
  },
  bubblePtsUnit: {
    color: '#003919',
    fontSize: 11,
    fontWeight: '800',
  },
  bubbleRankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rankPill: {
    backgroundColor: 'rgba(0, 0, 0, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  rankPillText: {
    color: '#003919',
    fontSize: 9.5,
    fontWeight: '700',
  },
  rankArrowText: {
    color: '#003919',
    fontSize: 10,
    fontWeight: '900',
  },

  pointsBubbleRight: {
    flex: 1,
    backgroundColor: '#282a2b',
    borderRadius: 16,
    padding: 12,
  },
  bubbleTitleRight: {
    color: '#d2c2cd',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  bubbleTransNumber: {
    color: '#e2e2e2',
    fontSize: 34,
    fontWeight: '900',
    lineHeight: 36,
  },
  bubbleTransUnit: {
    color: '#9b8d97',
    fontSize: 11,
    fontWeight: '600',
  },
  bubbleCostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  costPill: {
    backgroundColor: '#1e2020',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  costPillText: {
    color: '#d2c2cd',
    fontSize: 9.5,
    fontWeight: '600',
  },
  bankedText: {
    color: '#00dbe9',
    fontSize: 9.5,
    fontWeight: '700',
  },

  benchPointsTitleGroup: {
    alignItems: 'center',
    gap: 6,
  },
  benchTotalPill: {
    backgroundColor: '#282a2b',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
  },
  benchTotalText: {
    color: '#d2c2cd',
    fontSize: 9.5,
    fontWeight: '700',
  },
  benchSubRulesText: {
    color: '#9b8d97',
    fontSize: 10,
  },

  /* Transfers Tab */
  transferIntroBar: {
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  transferIntroTitle: {
    color: '#d2c2cd',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  transferIntroSub: {
    color: '#00dbe9',
    fontSize: 11,
    fontWeight: '700',
  },

  transferSummaryStickyBar: {
    backgroundColor: '#1a1c1c',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 219, 233, 0.2)',
    marginTop: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  transferMetricsGrid: {
    justifyContent: 'space-between',
    backgroundColor: '#121414',
    padding: 8,
    borderRadius: 10,
    marginBottom: 10,
  },
  metricCol: {
    alignItems: 'center',
    flex: 1,
  },
  metricLabel: {
    color: '#9b8d97',
    fontSize: 9,
    fontWeight: '700',
  },
  metricVal: {
    color: '#e2e2e2',
    fontSize: 15,
    fontWeight: '900',
    marginTop: 2,
  },
  metricValSmall: {
    color: '#e2e2e2',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 3,
  },
  confirmTransfersBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#34ff8c',
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: '#34ff8c',
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  confirmTransfersBtnDisabled: {
    backgroundColor: '#282a2b',
    shadowOpacity: 0,
  },
  confirmTransfersBtnText: {
    color: '#00210c',
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
