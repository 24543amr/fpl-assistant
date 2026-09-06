/**
 * FPL Assistant – Pitch Formation Squad Management & Transfers Screen
 *
 * Fully bilingual (EN/AR), real player photos with graceful fallbacks,
 * dark green stylized pitch with tactical formation layout, Captain/Vice-Captain badges,
 * bench order cards with doubt/injury indicators, gameweek status card, and live FPL save.
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
  Modal,
  Dimensions,
  TextInput,
  FlatList,
  Image,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';

import { Colors, Radii, Spacing, FontSizes } from '@/constants/theme';
import { getSavedTeamId, getStoredTeamId, setSavedPicks, getStoredFplToken } from '@/utils/storage';
import AppHeader from '@/components/AppHeader';
import BottomNav from '@/components/BottomNav';
import {
  fetchBootstrap,
  fetchUserEntry,
  fetchUserPicks,
  fetchMyTeamSquad,
  saveLineupToServer,
  submitFplTransfer,
  getPlayerPhotoUrl,
  fetchFixtures,
  getTeamNextGwFixtures,
  getTeamUpcomingFiveFixtures,
  getTargetGameweek,
  fetchElementSummary,
  FPLElementSummary,
  DEFAULT_TEAMS_MAP,
  FPLFixture,
  TeamNextFixtureInfo,
  FPLPick,
  FPLPlayer,
  FPLUserEntry,
  FPLTransfersInfo,
  fetchGameweekLive,
  FPLEvent,
} from '@/api/fpl';

const { width: SCREEN_W } = Dimensions.get('window');

type ScreenTab = 'squad' | 'points' | 'transfers';

const POSITION_COLORS: Record<number, string> = {
  1: '#FBBF24', // GK: amber
  2: '#60A5FA', // DEF: blue
  3: '#00FF87', // MID: teal
  4: '#F87171', // FWD: coral/red
};

const POSITION_SHORT: Record<number, string> = {
  1: 'GK',
  2: 'DEF',
  3: 'MID',
  4: 'FWD',
};

const POSITION_NAMES_EN: Record<number, string> = {
  1: 'Goalkeeper',
  2: 'Defender',
  3: 'Midfielder',
  4: 'Forward',
};

const POSITION_NAMES_AR: Record<number, string> = {
  1: 'حارس مرمى',
  2: 'مدافع',
  3: 'خط وسط',
  4: 'مهاجم',
};

interface StagedTransfer {
  element_out: FPLPlayer;
  element_in: FPLPlayer;
  purchase_price: number;
  selling_price: number;
  pickIndex: number;
}

function formatDeadlineDisplay(deadlineIso: string | null | undefined, isArabic: boolean): string {
  if (!deadlineIso) return isArabic ? 'الجمعة، 19:00' : 'Friday, 19:00';
  try {
    const d = new Date(deadlineIso);
    const dayNameEn = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()];
    const dayNameAr = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'][d.getDay()];
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return isArabic ? `${dayNameAr}، ${hours}:${mins}` : `${dayNameEn}, ${hours}:${mins}`;
  } catch (_) {
    return isArabic ? 'الجمعة، 19:00' : 'Friday, 19:00';
  }
}

export default function SquadScreen() {
  const router = useRouter();

  // Active Screen Tab: 'squad' (Pitch Formation) or 'transfers' (Transfers Planner)
  const [activeTab, setActiveTab] = useState<ScreenTab>('squad');

  // Language state
  const [isArabic, setIsArabic] = useState(false);
  const isRTL = isArabic;

  // Data & loading state
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isBackgroundRefreshing, setIsBackgroundRefreshing] = useState(false);
  const [squadError, setSquadError] = useState<string | null>(null);
  const [isSavingLineup, setIsSavingLineup] = useState(false);
  const [isSubmittingTransfers, setIsSubmittingTransfers] = useState(false);
  const [hasFplSession, setHasFplSession] = useState(false);
  const hasLoadedSquadOnce = useRef(false);

  const [entry, setEntry] = useState<FPLUserEntry | null>(null);
  const [picks, setPicks] = useState<FPLPick[]>([]);
  const [transfersInfo, setTransfersInfo] = useState<FPLTransfersInfo | null>(null);
  const [allElementsList, setAllElementsList] = useState<FPLPlayer[]>([]);
  const [elementsMap, setElementsMap] = useState<Map<number, FPLPlayer>>(new Map());
  const [teamsMap, setTeamsMap] = useState<Map<number, string>>(new Map(DEFAULT_TEAMS_MAP));
  const [currentGw, setCurrentGw] = useState<number>(1);
  const [currentEventObj, setCurrentEventObj] = useState<FPLEvent | null>(null);

  // Fixtures state for fixture tags and upcoming difficulty
  const [fixtures, setFixtures] = useState<FPLFixture[]>([]);
  const [targetGw, setTargetGw] = useState<number>(1);

  // Screen A (Squad Pitch) state
  const [selectedPickIndex, setSelectedPickIndex] = useState<number | null>(null);
  const [actionMenuPick, setActionMenuPick] = useState<{ pick: FPLPick; index: number } | null>(null);
  const [playerSummary, setPlayerSummary] = useState<FPLElementSummary | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [hasLineupChanges, setHasLineupChanges] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  // Screen B (Transfers) state
  const [stagedTransfers, setStagedTransfers] = useState<StagedTransfer[]>([]);
  const [transferPickerPick, setTransferPickerPick] = useState<{ pick: FPLPick; index: number } | null>(null);
  const [pickerSearchQuery, setPickerSearchQuery] = useState('');
  const [pickerSortBy, setPickerSortBy] = useState<'points' | 'form' | 'cost'>('points');

  // Screen C (Points) state
  const [pointsGw, setPointsGw] = useState<number>(1);
  const [livePointsMap, setLivePointsMap] = useState<Map<number, number>>(new Map());
  const [isLoadingPoints, setIsLoadingPoints] = useState(false);

  useEffect(() => {
    if (currentGw > 0 && pointsGw === 1) {
      setPointsGw(currentGw);
    }
  }, [currentGw]);

  useEffect(() => {
    if (activeTab === 'points' && pointsGw > 0) {
      setIsLoadingPoints(true);
      fetchGameweekLive(pointsGw)
        .then((map) => {
          setLivePointsMap(map);
        })
        .catch((err) => {
          console.warn('[Squad] Failed to fetch live points:', err?.message);
          setLivePointsMap(new Map());
        })
        .finally(() => setIsLoadingPoints(false));
    }
  }, [activeTab, pointsGw]);

  // Load element summary whenever actionMenuPick opens
  useEffect(() => {
    if (actionMenuPick?.pick?.element) {
      setIsLoadingSummary(true);
      fetchElementSummary(actionMenuPick.pick.element)
        .then((data) => setPlayerSummary(data))
        .catch((err) => {
          console.warn('[Squad] Could not load player summary:', err.message);
          setPlayerSummary(null);
        })
        .finally(() => setIsLoadingSummary(false));
    } else {
      setPlayerSummary(null);
    }
  }, [actionMenuPick?.pick?.element]);

  // Fonts
  const headlineFont = isArabic ? 'Cairo_700' : 'ArchivoNarrow_700';
  const bodyFont = isArabic ? 'IBMPlexSansArabic_400' : 'HankenGrotesk_400';
  const labelFont = isArabic ? 'IBMPlexSansArabic_600' : 'HankenGrotesk_600';
  const monoFont = 'JetBrainsMono_500';

  const flexDir = isRTL ? 'row-reverse' : 'row';
  const textAlign = isRTL ? 'right' : 'left';

  // Load team picks on focus
  const loadSquadData = useCallback(async (mode: 'initial' | 'refresh' | 'focus' | boolean = 'initial') => {
    const resolvedMode = typeof mode === 'boolean' ? (mode ? 'refresh' : 'initial') : mode;
    if (resolvedMode === 'refresh') {
      setRefreshing(true);
    } else if (resolvedMode === 'focus' || hasLoadedSquadOnce.current) {
      setIsBackgroundRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setSquadError(null);

    try {
      const teamId = await getStoredTeamId();
      const tokens = await getStoredFplToken();
      const accessToken = tokens?.accessToken || null;
      setHasFplSession(!!accessToken);

      if (!teamId) throw new Error('No connected Team ID.');

      const [bootstrap, userEntry, fixturesData] = await Promise.all([
        fetchBootstrap(),
        fetchUserEntry(teamId),
        fetchFixtures().catch(() => [] as FPLFixture[]),
      ]);

      const pMap = new Map<number, FPLPlayer>();
      bootstrap.elements.forEach((p) => pMap.set(p.id, p));

      // Build teamsMap with DEFAULT_TEAMS_MAP fallback + live bootstrap teams
      const tMap = new Map<number, string>(DEFAULT_TEAMS_MAP);
      bootstrap.teams?.forEach((t) => tMap.set(t.id, t.short_name || t.name));

      const activeEvent = bootstrap.events?.find((e: any) => e.is_current)
        || bootstrap.events?.find((e: any) => e.is_next)
        || bootstrap.events?.[0]
        || null;

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
          console.warn('[Squad Screen] my-team endpoint failed, fallback to GW picks:', err.message);
          userPicks = await fetchUserPicks(teamId, resolvedGw, pMap).catch(() => []);
        }
      } else {
        userPicks = await fetchUserPicks(teamId, resolvedGw, pMap).catch(() => []);
      }

      // Only update picks if userPicks has elements; never clear existing squad on focus!
      if (userPicks && userPicks.length > 0) {
        setPicks(userPicks);
        if (tInfo) setTransfersInfo(tInfo);
        hasLoadedSquadOnce.current = true;
      }
      if (mode !== 'focus') {
        setStagedTransfers([]);
        setHasLineupChanges(false);
      }
    } catch (e: any) {
      console.error('[Squad Screen] Load error:', e.message);
      setSquadError(e?.message || 'Unable to update squad.');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
      setIsBackgroundRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadSquadData(hasLoadedSquadOnce.current ? 'focus' : 'initial');
    }, [loadSquadData])
  );

  // ── FORMATION VALIDATION & LINEUP LOGIC ──────────────────────────────────────

  // Validate starting XI formation (1 GK, at least 3 DEF, at least 2 MID, at least 1 FWD)
  const validateFormation = (candidatePicks: FPLPick[]): boolean => {
    const starters = candidatePicks.slice(0, 11);
    const gks = starters.filter(p => p.player?.element_type === 1).length;
    const defs = starters.filter(p => p.player?.element_type === 2).length;
    const mids = starters.filter(p => p.player?.element_type === 3).length;
    const fwds = starters.filter(p => p.player?.element_type === 4).length;

    return gks === 1 && defs >= 3 && defs <= 5 && mids >= 2 && mids <= 5 && fwds >= 1 && fwds <= 3;
  };

  // Handle Player Press on Pitch or Bench
  const handlePlayerPress = (index: number) => {
    if (selectedPickIndex === null) {
      if (isEditMode) {
        setSelectedPickIndex(index);
      } else {
        // Open Action Sheet
        setActionMenuPick({ pick: picks[index], index });
      }
    } else if (selectedPickIndex === index) {
      setSelectedPickIndex(null);
    } else {
      // Execute Player Substitution Swap
      const candidatePicks = [...picks];
      const temp = candidatePicks[selectedPickIndex];
      candidatePicks[selectedPickIndex] = candidatePicks[index];
      candidatePicks[index] = temp;

      // Re-assign positions 1..15
      candidatePicks.forEach((p, idx) => { p.position = idx + 1; });

      // Validate formation rules
      if (!validateFormation(candidatePicks)) {
        Alert.alert(
          isArabic ? 'تشكيلة غير صالحة' : 'Invalid Formation',
          isArabic
            ? 'يجب أن تحتوي التشكيلة الأساسية على: حارس مرمى 1، 3 مدافعين على الأقل، 2 خط وسط على الأقل، ومهاجم 1 على الأقل.'
            : 'Starting XI must contain: 1 GK, at least 3 DEF, at least 2 MID, and at least 1 FWD.'
        );
        setSelectedPickIndex(null);
        return;
      }

      setPicks(candidatePicks);
      setSelectedPickIndex(null);
      setHasLineupChanges(true);
    }
  };

  // Make Captain (C)
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

  // Make Vice Captain (V)
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

  // Save Lineup Changes to FPL Website
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

    if (captain.element === viceCaptain.element) {
      Alert.alert(
        isArabic ? 'خطأ' : 'Error',
        isArabic
          ? 'الكابتن ونائب الكابتن يجب أن يكونا لاعبين مختلفين.'
          : 'Captain and Vice-Captain must be two different players.'
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
        setHasLineupChanges(false);
        setIsEditMode(false);
        Alert.alert(
          isArabic ? 'تم الحفظ بنجاح! 🏆' : 'Lineup Saved! 🏆',
          isArabic ? 'تم تحديث تشكيلتك الأساسية على موقع FPL بنجاح.' : 'Your starting XI and captains were updated on FPL.'
        );
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
      b += (t.selling_price - t.purchase_price);
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

    if (picks.some((p, idx) => idx !== index && p.element === newPlayer.id)) {
      Alert.alert(isArabic ? 'تنبيه' : 'Already in Squad', `${newPlayer.web_name} is already in your squad.`);
      return;
    }

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
    setPickerSearchQuery('');
  };

  const handleCancelStagedTransfer = (staged: StagedTransfer) => {
    const updatedPicks = [...picks];
    updatedPicks[staged.pickIndex] = {
      ...updatedPicks[staged.pickIndex],
      element: staged.element_out.id,
      player: staged.element_out,
    };
    setPicks(updatedPicks);
    setStagedTransfers(stagedTransfers.filter(t => t.pickIndex !== staged.pickIndex));
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
          isArabic ? 'سجل الدخول بحسابك في FPL لتنفيذ الانتقالات.' : 'Log in with your FPL account to make official transfers.'
        );
        setIsSubmittingTransfers(false);
        return;
      }

      const res = await submitFplTransfer({
        teamId,
        gameweek: currentGw,
        transfers: stagedTransfers.map(t => ({
          element_in: t.element_in.id,
          element_out: t.element_out.id,
          purchase_price: t.purchase_price,
          selling_price: t.selling_price,
        })),
        accessToken: tokens.accessToken,
      });

      if (res.success) {
        setStagedTransfers([]);
        Alert.alert(
          isArabic ? 'تمت الانتقالات بنجاح! ⚽' : 'Transfers Confirmed! ⚽',
          isArabic ? 'تم تنفيذ انتقالاتك الرسمية على سيرفرات FPL بنجاح.' : 'Your official transfers have been submitted.'
        );
        void loadSquadData('refresh');
      }
    } catch (e: any) {
      Alert.alert(isArabic ? 'خطأ في الانتقالات' : 'Transfer Error', e.message || 'Failed to submit transfer.');
    } finally {
      setIsSubmittingTransfers(false);
    }
  };

  const availableReplacements = useMemo(() => {
    if (!transferPickerPick || !transferPickerPick.pick.player) return [];

    const targetType = transferPickerPick.pick.player.element_type;
    const currentSquadElementIds = new Set(picks.map(p => p.element));

    let list = allElementsList.filter(
      p => p.element_type === targetType && !currentSquadElementIds.has(p.id)
    );

    if (pickerSearchQuery.trim()) {
      const q = pickerSearchQuery.toLowerCase().trim();
      list = list.filter(p =>
        p.web_name.toLowerCase().includes(q) ||
        p.first_name.toLowerCase().includes(q) ||
        p.second_name.toLowerCase().includes(q)
      );
    }

    if (pickerSortBy === 'points') {
      list.sort((a, b) => (b.total_points || 0) - (a.total_points || 0));
    } else if (pickerSortBy === 'form') {
      list.sort((a, b) => parseFloat(b.form || '0') - parseFloat(a.form || '0'));
    } else if (pickerSortBy === 'cost') {
      list.sort((a, b) => (b.now_cost || 0) - (a.now_cost || 0));
    }

    return list;
  }, [transferPickerPick, allElementsList, picks, pickerSearchQuery, pickerSortBy]);

  // Starters (1-11) and Bench (12-15)
  const starters = picks.slice(0, 11);
  const bench = picks.slice(11, 15);

  const gks = starters.filter(p => p.player?.element_type === 1);
  const defs = starters.filter(p => p.player?.element_type === 2);
  const mids = starters.filter(p => p.player?.element_type === 3);
  const fwds = starters.filter(p => p.player?.element_type === 4);

  const totalStartersPoints = useMemo(() => {
    return starters.reduce((acc, pick) => {
      const rawPts = livePointsMap.get(pick.element) ?? pick.player?.total_points ?? 0;
      const mult = pick.multiplier || (pick.is_captain ? 2 : 1);
      return acc + (rawPts * mult);
    }, 0);
  }, [starters, livePointsMap]);

  const totalBenchPoints = useMemo(() => {
    return bench.reduce((acc, pick) => {
      const rawPts = livePointsMap.get(pick.element) ?? pick.player?.total_points ?? 0;
      return acc + rawPts;
    }, 0);
  }, [bench, livePointsMap]);

  const teamNameDisplay = entry?.name || `Team ${getSavedTeamId()}`;
  const managerName = entry?.player_first_name && entry?.player_last_name
    ? `${entry.player_first_name} ${entry.player_last_name}`
    : `Manager #${getSavedTeamId()}`;
  const avatarUrl = `https://api.dicebear.com/7.x/initials/png?seed=${encodeURIComponent(managerName)}`;

  const deadlineFormatted = formatDeadlineDisplay(currentEventObj?.deadline_time, isArabic);

  return (
    <View style={styles.root}>
      {/* ── SHARED APP HEADER ── */}
      <AppHeader
        title={teamNameDisplay}
        isArabic={isArabic}
        onToggleLanguage={setIsArabic}
        showNotificationBell
        icon={
          <TouchableOpacity onPress={() => router.push('/profile')} activeOpacity={0.8}>
            <Image source={{ uri: avatarUrl }} style={styles.headerAvatar} />
          </TouchableOpacity>
        }
        rightAction={
          <View style={styles.proBadge}>
            <Text style={styles.proBadgeText}>PRO</Text>
          </View>
        }
      />

      {/* ── Segmented Control Bar (My Squad | Points | Transfers) ── */}
      <View style={[styles.segmentedControl, { flexDirection: flexDir }]}>
        <TouchableOpacity
          style={[styles.segmentBtn, activeTab === 'squad' && styles.segmentBtnActive]}
          onPress={() => setActiveTab('squad')}
        >
          <MaterialIcons
            name="sports-soccer"
            size={18}
            color={activeTab === 'squad' ? Colors.brandPurple : Colors.onSurfaceVariant}
          />
          <Text style={[styles.segmentText, { fontFamily: labelFont }, activeTab === 'squad' && styles.segmentTextActive]}>
            {isArabic ? 'التشكيلة' : 'My Squad'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.segmentBtn, activeTab === 'points' && styles.segmentBtnActive]}
          onPress={() => setActiveTab('points')}
        >
          <MaterialIcons
            name="leaderboard"
            size={18}
            color={activeTab === 'points' ? Colors.brandPurple : Colors.onSurfaceVariant}
          />
          <Text style={[styles.segmentText, { fontFamily: labelFont }, activeTab === 'points' && styles.segmentTextActive]}>
            {isArabic ? 'النقاط' : 'Points'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.segmentBtn, activeTab === 'transfers' && styles.segmentBtnActive]}
          onPress={() => setActiveTab('transfers')}
        >
          <MaterialCommunityIcons
            name="swap-horizontal"
            size={18}
            color={activeTab === 'transfers' ? Colors.brandPurple : Colors.onSurfaceVariant}
          />
          <Text style={[styles.segmentText, { fontFamily: labelFont }, activeTab === 'transfers' && styles.segmentTextActive]}>
            {isArabic ? 'الانتقالات' : 'Transfers'}
            {stagedTransfers.length > 0 ? ` (${stagedTransfers.length})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Main Screen Body ── */}
      {isLoading && picks.length === 0 ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={Colors.brandTeal} />
          <Text style={[styles.loadingText, { fontFamily: bodyFont }]}>
            {isArabic ? 'جاري تحميل تشكيلة الفانتاسي...' : 'Loading squad from FPL...'}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadSquadData('refresh')}
              tintColor={Colors.brandTeal}
              colors={[Colors.brandTeal]}
            />
          }
        >
          {/* ── Background Sync Indicator ── */}
          {isBackgroundRefreshing && !refreshing && (
            <View style={[styles.backgroundSyncRow, { flexDirection: flexDir }]}>
              <ActivityIndicator size="small" color={Colors.brandTeal} />
              <Text style={[styles.backgroundSyncText, { fontFamily: labelFont }]}>
                {isArabic ? 'تحديث التشكيلة في الخلفية...' : 'Updating squad in background...'}
              </Text>
            </View>
          )}

          {!!squadError && picks.length > 0 && (
            <View style={[styles.subtleErrorToast, { flexDirection: flexDir }]}>
              <MaterialIcons name="info-outline" size={16} color={Colors.secondaryContainer} />
              <Text style={[styles.subtleErrorText, { fontFamily: bodyFont, textAlign }]}>
                {squadError}
              </Text>
            </View>
          )}
          {/* ========================================================================= */}
          {/* SCREEN A: PITCH FORMATION VIEW                                            */}
          {/* ========================================================================= */}
          {activeTab === 'squad' && (
            <>
              {/* ── 1. GAMEWEEK STATUS CARD ── */}
              <View style={styles.statusCard}>
                <View style={[styles.statusCardRow, { flexDirection: flexDir }]}>
                  {/* Left: Gameweek & Deadline */}
                  <View style={[styles.statusLeftCol, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
                    <Text style={[styles.gwTitle, { fontFamily: headlineFont }]}>
                      {isArabic ? `الجولة ${currentGw}` : `Gameweek ${currentGw}`}
                    </Text>
                    <View style={[styles.deadlineContainer, { flexDirection: flexDir }]}>
                      <MaterialIcons name="schedule" size={15} color={Colors.brandTeal} />
                      <Text style={[styles.deadlineText, { fontFamily: monoFont }]}>
                        {isArabic ? `الموعد النهائي: ${deadlineFormatted}` : `Deadline: ${deadlineFormatted}`}
                      </Text>
                    </View>
                  </View>

                  {/* Right: Action Buttons (Edit & Save Formation) */}
                  <View style={[styles.statusActionsCol, { flexDirection: flexDir }]}>
                    <TouchableOpacity
                      style={[styles.btnOutline, isEditMode && styles.btnOutlineActive]}
                      onPress={() => {
                        setIsEditMode(!isEditMode);
                        setSelectedPickIndex(null);
                      }}
                      activeOpacity={0.7}
                    >
                      <MaterialIcons
                        name={isEditMode ? 'close' : 'edit'}
                        size={15}
                        color={isEditMode ? Colors.brandTeal : Colors.white}
                      />
                      <Text style={[styles.btnOutlineText, { fontFamily: labelFont }]}>
                        {isEditMode ? (isArabic ? 'إلغاء' : 'Cancel') : (isArabic ? 'تعديل' : 'Edit')}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.btnSave,
                        (!hasLineupChanges && !isEditMode) && styles.btnSaveMuted,
                      ]}
                      onPress={handleSaveLineup}
                      disabled={isSavingLineup}
                      activeOpacity={0.8}
                    >
                      {isSavingLineup ? (
                        <ActivityIndicator size="small" color={Colors.brandPurple} />
                      ) : (
                        <>
                          <MaterialIcons name="check-circle" size={16} color={Colors.brandPurple} />
                          <Text style={[styles.btnSaveText, { fontFamily: labelFont }]}>
                            {isArabic ? 'حفظ التشكيلة' : 'Save Formation'}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {/* Edit Mode Instructions Banner */}
              {isEditMode && (
                <View style={[styles.editBanner, { flexDirection: flexDir }]}>
                  <MaterialIcons name="swap-vertical-circle" size={18} color={Colors.brandTeal} />
                  <Text style={[styles.editBannerText, { fontFamily: bodyFont, textAlign }]}>
                    {selectedPickIndex !== null
                      ? isArabic
                        ? 'اضغط على لاعب آخر لتبديل المراكز أو التبديل مع الدكة'
                        : 'Tap another player on the pitch or bench to swap'
                      : isArabic
                      ? 'اضغط على أي لاعب لبدء عملية التبديل'
                      : 'Tap any player to start substitution swap'}
                  </Text>
                </View>
              )}

              {/* ── 2. THE PITCH (VISUAL CENTERPIECE) ── */}
              <View style={styles.pitchContainer}>
                {/* Tactical Pitch Markings */}
                <View style={styles.pitchCircle} pointerEvents="none" />
                <View style={styles.pitchHalfwayLine} pointerEvents="none" />
                <View style={styles.pitchPenaltyBoxTop} pointerEvents="none" />
                <View style={styles.pitchPenaltyBoxBottom} pointerEvents="none" />

                {/* Pitch Formation Rows */}
                <View style={styles.pitchContent}>
                  {/* GK Row */}
                  <View style={styles.pitchRow}>
                    {gks.map((pick) => {
                      const realIndex = picks.findIndex(p => p.element === pick.element);
                      return (
                        <PitchPlayerCard
                          key={pick.element}
                          pick={pick}
                          teamsMap={teamsMap}
                          fixtures={fixtures}
                          targetGw={targetGw}
                          isArabic={isArabic}
                          isSelected={selectedPickIndex === realIndex}
                          onPress={() => handlePlayerPress(realIndex)}
                        />
                      );
                    })}
                  </View>

                  {/* DEF Row */}
                  <View style={styles.pitchRow}>
                    {defs.map((pick) => {
                      const realIndex = picks.findIndex(p => p.element === pick.element);
                      return (
                        <PitchPlayerCard
                          key={pick.element}
                          pick={pick}
                          teamsMap={teamsMap}
                          fixtures={fixtures}
                          targetGw={targetGw}
                          isArabic={isArabic}
                          isSelected={selectedPickIndex === realIndex}
                          onPress={() => handlePlayerPress(realIndex)}
                        />
                      );
                    })}
                  </View>

                  {/* MID Row */}
                  <View style={styles.pitchRow}>
                    {mids.map((pick) => {
                      const realIndex = picks.findIndex(p => p.element === pick.element);
                      return (
                        <PitchPlayerCard
                          key={pick.element}
                          pick={pick}
                          teamsMap={teamsMap}
                          fixtures={fixtures}
                          targetGw={targetGw}
                          isArabic={isArabic}
                          isSelected={selectedPickIndex === realIndex}
                          onPress={() => handlePlayerPress(realIndex)}
                        />
                      );
                    })}
                  </View>

                  {/* FWD Row */}
                  <View style={styles.pitchRow}>
                    {fwds.map((pick) => {
                      const realIndex = picks.findIndex(p => p.element === pick.element);
                      return (
                        <PitchPlayerCard
                          key={pick.element}
                          pick={pick}
                          teamsMap={teamsMap}
                          fixtures={fixtures}
                          targetGw={targetGw}
                          isArabic={isArabic}
                          isSelected={selectedPickIndex === realIndex}
                          onPress={() => handlePlayerPress(realIndex)}
                        />
                      );
                    })}
                  </View>
                </View>
              </View>

              {/* ── 3. BENCH SECTION ── */}
              <View style={styles.benchCard}>
                <View style={[styles.benchHeaderRow, { flexDirection: flexDir }]}>
                  <Text style={[styles.benchSectionTitle, { fontFamily: headlineFont }]}>
                    {isArabic ? 'الدكة' : 'Bench'}
                  </Text>
                  <Text style={[styles.benchSubText, { fontFamily: monoFont }]}>
                    {isArabic ? '4 لاعبين احتياط' : '4 Substitutes'}
                  </Text>
                </View>

                <View style={[styles.benchRow, { flexDirection: flexDir }]}>
                  {bench.map((pick, bIndex) => {
                    const realIndex = 11 + bIndex;
                    return (
                      <BenchPlayerCard
                        key={pick.element}
                        pick={pick}
                        benchIndex={bIndex + 1}
                        teamsMap={teamsMap}
                        fixtures={fixtures}
                        targetGw={targetGw}
                        isArabic={isArabic}
                        isSelected={selectedPickIndex === realIndex}
                        onPress={() => handlePlayerPress(realIndex)}
                      />
                    );
                  })}
                </View>
              </View>
            </>
          )}

          {/* ========================================================================= */}
          {/* SCREEN B: POINTS VIEW (Real GW live points for all 15 players)             */}
          {/* ========================================================================= */}
          {activeTab === 'points' && (
            <>
              {/* 1. Gameweek Navigator & Total Points Hero */}
              <View style={styles.statusCard}>
                {/* Gameweek Selector */}
                <View style={[styles.pointsGwSelectorRow, { flexDirection: flexDir }]}>
                  <TouchableOpacity
                    style={styles.gwArrowBtn}
                    onPress={() => setPointsGw(Math.max(1, pointsGw - 1))}
                    disabled={pointsGw <= 1}
                  >
                    <MaterialIcons
                      name={isRTL ? 'chevron-right' : 'chevron-left'}
                      size={24}
                      color={pointsGw <= 1 ? 'rgba(255,255,255,0.2)' : Colors.white}
                    />
                  </TouchableOpacity>

                  <View style={styles.gwTitleBadge}>
                    <Text style={[styles.pointsGwTitleText, { fontFamily: headlineFont }]}>
                      {isArabic ? `الجولة ${pointsGw}` : `Gameweek ${pointsGw}`}
                    </Text>
                    <Text style={[styles.pointsGwSubText, { fontFamily: monoFont }]}>
                      {pointsGw === currentGw
                        ? (isArabic ? 'الجولة الحالية' : 'Current Gameweek')
                        : (isArabic ? 'جولة سابقة' : 'Past Gameweek')}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={styles.gwArrowBtn}
                    onPress={() => setPointsGw(Math.min(currentGw || 38, pointsGw + 1))}
                    disabled={pointsGw >= (currentGw || 38)}
                  >
                    <MaterialIcons
                      name={isRTL ? 'chevron-left' : 'chevron-right'}
                      size={24}
                      color={pointsGw >= (currentGw || 38) ? 'rgba(255,255,255,0.2)' : Colors.white}
                    />
                  </TouchableOpacity>
                </View>

                {/* Big Score Cards Row */}
                <View style={[styles.pointsHeroStatsRow, { flexDirection: flexDir }]}>
                  {/* Starters Points */}
                  <View style={[styles.pointsHeroCard, styles.pointsHeroCardMain]}>
                    <Text style={[styles.pointsHeroLabel, { fontFamily: labelFont }]}>
                      {isArabic ? 'نقاط التشكيلة' : 'Starting XI Pts'}
                    </Text>
                    {isLoadingPoints ? (
                      <ActivityIndicator size="small" color={Colors.brandTeal} style={{ marginVertical: 8 }} />
                    ) : (
                      <Text style={[styles.pointsHeroMainVal, { fontFamily: headlineFont }]}>
                        {totalStartersPoints}
                      </Text>
                    )}
                    <Text style={[styles.pointsHeroSubText, { fontFamily: monoFont }]}>
                      {isArabic ? '11 لاعب أساسي' : '11 Starting Players'}
                    </Text>
                  </View>

                  {/* Bench Points */}
                  <View style={styles.pointsHeroCard}>
                    <Text style={[styles.pointsHeroLabel, { fontFamily: labelFont }]}>
                      {isArabic ? 'نقاط الدكة' : 'Bench Pts'}
                    </Text>
                    {isLoadingPoints ? (
                      <ActivityIndicator size="small" color={Colors.onSurfaceVariant} style={{ marginVertical: 8 }} />
                    ) : (
                      <Text style={[styles.pointsHeroBenchVal, { fontFamily: headlineFont }]}>
                        {totalBenchPoints}
                      </Text>
                    )}
                    <Text style={[styles.pointsHeroSubText, { fontFamily: monoFont }]}>
                      {isArabic ? '4 لاعبين احتياط' : '4 Substitutes'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* 2. Tactical Pitch with Starting 11 (Showing Points Badges) */}
              <View style={styles.pitchContainer}>
                <View style={styles.pitchCircle} pointerEvents="none" />
                <View style={styles.pitchHalfwayLine} pointerEvents="none" />
                <View style={styles.pitchPenaltyBoxTop} pointerEvents="none" />
                <View style={styles.pitchPenaltyBoxBottom} pointerEvents="none" />

                <View style={styles.pitchContent}>
                  {/* GK Row */}
                  <View style={styles.pitchRow}>
                    {gks.map((pick) => {
                      const realIndex = picks.findIndex(p => p.element === pick.element);
                      const rawPts = livePointsMap.get(pick.element) ?? pick.player?.total_points ?? 0;
                      const mult = pick.multiplier || (pick.is_captain ? 2 : 1);
                      const finalPts = rawPts * mult;
                      return (
                        <PitchPlayerCard
                          key={pick.element}
                          pick={pick}
                          teamsMap={teamsMap}
                          fixtures={fixtures}
                          targetGw={pointsGw}
                          isArabic={isArabic}
                          badgeMode="points"
                          points={finalPts}
                          isSelected={false}
                          onPress={() => handlePlayerPress(realIndex)}
                        />
                      );
                    })}
                  </View>

                  {/* DEF Row */}
                  <View style={styles.pitchRow}>
                    {defs.map((pick) => {
                      const realIndex = picks.findIndex(p => p.element === pick.element);
                      const rawPts = livePointsMap.get(pick.element) ?? pick.player?.total_points ?? 0;
                      const mult = pick.multiplier || (pick.is_captain ? 2 : 1);
                      const finalPts = rawPts * mult;
                      return (
                        <PitchPlayerCard
                          key={pick.element}
                          pick={pick}
                          teamsMap={teamsMap}
                          fixtures={fixtures}
                          targetGw={pointsGw}
                          isArabic={isArabic}
                          badgeMode="points"
                          points={finalPts}
                          isSelected={false}
                          onPress={() => handlePlayerPress(realIndex)}
                        />
                      );
                    })}
                  </View>

                  {/* MID Row */}
                  <View style={styles.pitchRow}>
                    {mids.map((pick) => {
                      const realIndex = picks.findIndex(p => p.element === pick.element);
                      const rawPts = livePointsMap.get(pick.element) ?? pick.player?.total_points ?? 0;
                      const mult = pick.multiplier || (pick.is_captain ? 2 : 1);
                      const finalPts = rawPts * mult;
                      return (
                        <PitchPlayerCard
                          key={pick.element}
                          pick={pick}
                          teamsMap={teamsMap}
                          fixtures={fixtures}
                          targetGw={pointsGw}
                          isArabic={isArabic}
                          badgeMode="points"
                          points={finalPts}
                          isSelected={false}
                          onPress={() => handlePlayerPress(realIndex)}
                        />
                      );
                    })}
                  </View>

                  {/* FWD Row */}
                  <View style={styles.pitchRow}>
                    {fwds.map((pick) => {
                      const realIndex = picks.findIndex(p => p.element === pick.element);
                      const rawPts = livePointsMap.get(pick.element) ?? pick.player?.total_points ?? 0;
                      const mult = pick.multiplier || (pick.is_captain ? 2 : 1);
                      const finalPts = rawPts * mult;
                      return (
                        <PitchPlayerCard
                          key={pick.element}
                          pick={pick}
                          teamsMap={teamsMap}
                          fixtures={fixtures}
                          targetGw={pointsGw}
                          isArabic={isArabic}
                          badgeMode="points"
                          points={finalPts}
                          isSelected={false}
                          onPress={() => handlePlayerPress(realIndex)}
                        />
                      );
                    })}
                  </View>
                </View>
              </View>

              {/* 3. Bench Section with 4 Substitutes (Showing Points Badges) */}
              <View style={styles.benchCard}>
                <View style={[styles.benchHeaderRow, { flexDirection: flexDir }]}>
                  <Text style={[styles.benchSectionTitle, { fontFamily: headlineFont }]}>
                    {isArabic ? 'نقاط الدكة' : 'Bench Points'}
                  </Text>
                  <Text style={[styles.benchSubText, { fontFamily: monoFont }]}>
                    {isArabic ? `${totalBenchPoints} نقطة` : `${totalBenchPoints} pts`}
                  </Text>
                </View>

                <View style={[styles.benchRow, { flexDirection: flexDir }]}>
                  {bench.map((pick, bIndex) => {
                    const realIndex = 11 + bIndex;
                    const pts = livePointsMap.get(pick.element) ?? pick.player?.total_points ?? 0;
                    return (
                      <BenchPlayerCard
                        key={pick.element}
                        pick={pick}
                        benchIndex={bIndex + 1}
                        teamsMap={teamsMap}
                        fixtures={fixtures}
                        targetGw={pointsGw}
                        isArabic={isArabic}
                        badgeMode="points"
                        points={pts}
                        isSelected={false}
                        onPress={() => handlePlayerPress(realIndex)}
                      />
                    );
                  })}
                </View>
              </View>
            </>
          )}

          {/* ========================================================================= */}
          {/* SCREEN C: TRANSFERS PLANNER VIEW (With 15-player Pitch & Bench)          */}
          {/* ========================================================================= */}
          {activeTab === 'transfers' && (
            <>
              {/* Transfer Metrics Card */}
              <View style={styles.statusCard}>
                <View style={[styles.transferMetricsRow, { flexDirection: flexDir }]}>
                  <View style={styles.metricCol}>
                    <Text style={[styles.metricSub, { fontFamily: labelFont }]}>
                      {isArabic ? 'التبديلات المجانية' : 'Free Transfers'}
                    </Text>
                    <Text style={[styles.metricVal, { fontFamily: headlineFont }]}>
                      {Math.max(0, freeTransfersLimit - stagedTransfers.length)}
                    </Text>
                  </View>

                  <View style={styles.metricDivider} />

                  <View style={styles.metricCol}>
                    <Text style={[styles.metricSub, { fontFamily: labelFont }]}>
                      {isArabic ? 'ميزانية البنك' : 'Bank Budget'}
                    </Text>
                    <Text style={[styles.metricVal, { fontFamily: headlineFont, color: calculatedBank < 0 ? Colors.error : Colors.brandTeal }]}>
                      £{(calculatedBank / 10).toFixed(1)}m
                    </Text>
                  </View>

                  <View style={styles.metricDivider} />

                  <View style={styles.metricCol}>
                    <Text style={[styles.metricSub, { fontFamily: labelFont }]}>
                      {isArabic ? 'الخصم بالنقاط' : 'Transfer Cost'}
                    </Text>
                    <Text style={[styles.metricVal, { fontFamily: headlineFont, color: transferCostPoints > 0 ? Colors.error : Colors.white }]}>
                      {transferCostPoints > 0 ? `-${transferCostPoints} pts` : '0 pts'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Staged Transfers Banner */}
              {stagedTransfers.length > 0 && (
                <View style={styles.stagedCard}>
                  <Text style={[styles.stagedTitle, { fontFamily: headlineFont, textAlign }]}>
                    {isArabic ? 'الانتقالات المقترحة للتأكيد:' : 'Staged Transfers:'}
                  </Text>
                  {stagedTransfers.map((st, i) => (
                    <View key={i} style={[styles.stagedRow, { flexDirection: flexDir }]}>
                      <View style={styles.stagedOut}>
                        <Text style={styles.stagedOutText}>OUT: {st.element_out.web_name}</Text>
                      </View>
                      <MaterialIcons name="arrow-forward" size={16} color={Colors.brandTeal} />
                      <View style={styles.stagedIn}>
                        <Text style={styles.stagedInText}>IN: {st.element_in.web_name}</Text>
                      </View>
                      <TouchableOpacity onPress={() => handleCancelStagedTransfer(st)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <MaterialIcons name="cancel" size={22} color={Colors.error} />
                      </TouchableOpacity>
                    </View>
                  ))}

                  <TouchableOpacity
                    style={styles.confirmTransfersBtn}
                    onPress={handleConfirmTransfers}
                    disabled={isSubmittingTransfers || calculatedBank < 0}
                  >
                    {isSubmittingTransfers ? (
                      <ActivityIndicator color={Colors.brandPurple} />
                    ) : (
                      <Text style={[styles.confirmTransfersBtnText, { fontFamily: headlineFont }]}>
                        {isArabic ? 'تأكيد الانتقالات في FPL' : 'Confirm Transfers in FPL'}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}

              {/* Instructions banner */}
              <View style={[styles.transfersInstructionBanner, { flexDirection: flexDir }]}>
                <MaterialIcons name="touch-app" size={18} color={Colors.brandTeal} />
                <Text style={[styles.transfersInstructionText, { fontFamily: bodyFont, textAlign }]}>
                  {isArabic
                    ? 'اضغط على أي لاعب في التشكيلة أو الدكة لاستبداله بلاعب جديد مباشرة'
                    : 'Tap any player on the pitch or bench to replace them'}
                </Text>
              </View>

              {/* The Pitch with all 11 Starting Players (Transfer Mode: Price Badge & Tap to replace) */}
              <View style={styles.pitchContainer}>
                <View style={styles.pitchCircle} pointerEvents="none" />
                <View style={styles.pitchHalfwayLine} pointerEvents="none" />
                <View style={styles.pitchPenaltyBoxTop} pointerEvents="none" />
                <View style={styles.pitchPenaltyBoxBottom} pointerEvents="none" />

                <View style={styles.pitchContent}>
                  {/* GK Row */}
                  <View style={styles.pitchRow}>
                    {gks.map((pick) => {
                      const realIndex = picks.findIndex(p => p.element === pick.element);
                      const isStaged = stagedTransfers.some(st => st.element_in.id === pick.element);
                      return (
                        <PitchPlayerCard
                          key={pick.element}
                          pick={pick}
                          teamsMap={teamsMap}
                          fixtures={fixtures}
                          targetGw={targetGw}
                          isArabic={isArabic}
                          badgeMode="price"
                          isNewlyStaged={isStaged}
                          isSelected={false}
                          onPress={() => setTransferPickerPick({ pick, index: realIndex })}
                        />
                      );
                    })}
                  </View>

                  {/* DEF Row */}
                  <View style={styles.pitchRow}>
                    {defs.map((pick) => {
                      const realIndex = picks.findIndex(p => p.element === pick.element);
                      const isStaged = stagedTransfers.some(st => st.element_in.id === pick.element);
                      return (
                        <PitchPlayerCard
                          key={pick.element}
                          pick={pick}
                          teamsMap={teamsMap}
                          fixtures={fixtures}
                          targetGw={targetGw}
                          isArabic={isArabic}
                          badgeMode="price"
                          isNewlyStaged={isStaged}
                          isSelected={false}
                          onPress={() => setTransferPickerPick({ pick, index: realIndex })}
                        />
                      );
                    })}
                  </View>

                  {/* MID Row */}
                  <View style={styles.pitchRow}>
                    {mids.map((pick) => {
                      const realIndex = picks.findIndex(p => p.element === pick.element);
                      const isStaged = stagedTransfers.some(st => st.element_in.id === pick.element);
                      return (
                        <PitchPlayerCard
                          key={pick.element}
                          pick={pick}
                          teamsMap={teamsMap}
                          fixtures={fixtures}
                          targetGw={targetGw}
                          isArabic={isArabic}
                          badgeMode="price"
                          isNewlyStaged={isStaged}
                          isSelected={false}
                          onPress={() => setTransferPickerPick({ pick, index: realIndex })}
                        />
                      );
                    })}
                  </View>

                  {/* FWD Row */}
                  <View style={styles.pitchRow}>
                    {fwds.map((pick) => {
                      const realIndex = picks.findIndex(p => p.element === pick.element);
                      const isStaged = stagedTransfers.some(st => st.element_in.id === pick.element);
                      return (
                        <PitchPlayerCard
                          key={pick.element}
                          pick={pick}
                          teamsMap={teamsMap}
                          fixtures={fixtures}
                          targetGw={targetGw}
                          isArabic={isArabic}
                          badgeMode="price"
                          isNewlyStaged={isStaged}
                          isSelected={false}
                          onPress={() => setTransferPickerPick({ pick, index: realIndex })}
                        />
                      );
                    })}
                  </View>
                </View>
              </View>

              {/* Bench Section with all 4 substitutes (Transfer Mode: Price Badge & Tap to replace) */}
              <View style={styles.benchCard}>
                <View style={[styles.benchHeaderRow, { flexDirection: flexDir }]}>
                  <Text style={[styles.benchSectionTitle, { fontFamily: headlineFont }]}>
                    {isArabic ? 'بدلاء الدكة' : 'Bench Substitutes'}
                  </Text>
                  <Text style={[styles.benchSubText, { fontFamily: monoFont }]}>
                    {isArabic ? 'اضغط للاستبدال' : 'Tap to replace'}
                  </Text>
                </View>

                <View style={[styles.benchRow, { flexDirection: flexDir }]}>
                  {bench.map((pick, bIndex) => {
                    const realIndex = 11 + bIndex;
                    const isStaged = stagedTransfers.some(st => st.element_in.id === pick.element);
                    return (
                      <BenchPlayerCard
                        key={pick.element}
                        pick={pick}
                        benchIndex={bIndex + 1}
                        teamsMap={teamsMap}
                        fixtures={fixtures}
                        targetGw={targetGw}
                        isArabic={isArabic}
                        badgeMode="price"
                        isNewlyStaged={isStaged}
                        isSelected={false}
                        onPress={() => setTransferPickerPick({ pick, index: realIndex })}
                      />
                    );
                  })}
                </View>
              </View>
            </>
          )}
        </ScrollView>
      )}

      {/* ── SHARED BOTTOM NAVIGATION BAR ── */}
      <BottomNav activeTab="squad" isArabic={isArabic} />

      {/* ── PLAYER QUICK ACTIONS BOTTOM SHEET MODAL ── */}
      <Modal visible={!!actionMenuPick} transparent animationType="fade" onRequestClose={() => setActionMenuPick(null)}>
        <View style={styles.modalOverlay}>
          {/* Backdrop Touch Area to dismiss */}
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setActionMenuPick(null)}
          />

          {/* Action Sheet Container */}
          <View style={styles.actionSheet}>
            {/* Drag Handle Bar */}
            <View style={styles.sheetDragHandle} />

            {/* Player Info Card / Header */}
            {actionMenuPick?.pick.player && (
              <View style={styles.sheetPlayerCard}>
                <View style={[styles.sheetPlayerHeaderRow, { flexDirection: flexDir }]}>
                  <View style={styles.sheetAvatarWrapper}>
                    <Image
                      source={{ uri: getPlayerPhotoUrl(actionMenuPick.pick.player, actionMenuPick.pick.element) }}
                      style={styles.sheetAvatar}
                    />
                  </View>
                  <View style={[styles.sheetPlayerMeta, { alignItems: isArabic ? 'flex-end' : 'flex-start' }]}>
                    <View style={[styles.sheetPillRow, { flexDirection: flexDir }]}>
                      <View
                        style={[
                          styles.sheetPositionPill,
                          { backgroundColor: POSITION_COLORS[actionMenuPick.pick.player.element_type || 1] || Colors.brandTeal },
                        ]}
                      >
                        <Text style={styles.sheetPositionPillText}>
                          {POSITION_SHORT[actionMenuPick.pick.player.element_type || 1]}
                        </Text>
                      </View>
                      <Text style={[styles.sheetTeamText, { fontFamily: monoFont }]}>
                        {teamsMap.get(actionMenuPick.pick.player.team || 0) || DEFAULT_TEAMS_MAP.get(actionMenuPick.pick.player.team || 0) || 'PL'}
                      </Text>
                    </View>
                    <Text style={[styles.actionSheetTitle, { fontFamily: headlineFont }]}>
                      {actionMenuPick.pick.player.web_name}
                    </Text>
                  </View>
                </View>

                {/* Divider */}
                <View style={styles.sheetCardDivider} />

                {/* 5-Stat Row: Price, Total Pts, Bonus Pts, Form, Selected % */}
                <View style={[styles.sheetStatsRow, { flexDirection: flexDir }]}>
                  <View style={styles.statCol}>
                    <Text style={[styles.statColLabel, { fontFamily: monoFont }]}>{isArabic ? 'السعر' : 'Price'}</Text>
                    <Text style={[styles.statColValTeal, { fontFamily: monoFont }]}>
                      £{(actionMenuPick.pick.player.now_cost / 10).toFixed(1)}m
                    </Text>
                  </View>
                  <View style={styles.statColDivider} />
                  <View style={styles.statCol}>
                    <Text style={[styles.statColLabel, { fontFamily: monoFont }]}>{isArabic ? 'النقاط' : 'Pts'}</Text>
                    <Text style={[styles.statColVal, { fontFamily: monoFont }]}>
                      {actionMenuPick.pick.player.total_points}
                    </Text>
                  </View>
                  <View style={styles.statColDivider} />
                  <View style={styles.statCol}>
                    <Text style={[styles.statColLabel, { fontFamily: monoFont }]}>{isArabic ? 'بونص' : 'Bonus'}</Text>
                    <Text style={[styles.statColVal, { fontFamily: monoFont }]}>
                      {actionMenuPick.pick.player.bonus ?? 0}
                    </Text>
                  </View>
                  <View style={styles.statColDivider} />
                  <View style={styles.statCol}>
                    <Text style={[styles.statColLabel, { fontFamily: monoFont }]}>{isArabic ? 'فورم' : 'Form'}</Text>
                    <Text style={[styles.statColVal, { fontFamily: monoFont }]}>
                      {actionMenuPick.pick.player.form}
                    </Text>
                  </View>
                  <View style={styles.statColDivider} />
                  <View style={styles.statCol}>
                    <Text style={[styles.statColLabel, { fontFamily: monoFont }]}>{isArabic ? 'اختيار' : 'Sel%'}</Text>
                    <Text style={[styles.statColVal, { fontFamily: monoFont }]}>
                      {actionMenuPick.pick.player.selected_by_percent}%
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* Gameweek History & Fixtures Strip */}
            <PlayerGameweekHistoryStrip
              playerSummary={playerSummary}
              isLoading={isLoadingSummary}
              playerTeam={actionMenuPick?.pick.player?.team || 0}
              targetGw={targetGw}
              teamsMap={teamsMap}
              fixtures={fixtures}
              isArabic={isArabic}
              headlineFont={headlineFont}
              monoFont={monoFont}
              labelFont={labelFont}
            />

            {/* Switch / Transfer Player Option (Navigates to /player-switch) */}
            <TouchableOpacity
              style={[styles.actionSheetOption, { flexDirection: flexDir }]}
              onPress={() => {
                const pId = actionMenuPick?.pick.element;
                setActionMenuPick(null);
                if (pId) {
                  router.push({
                    pathname: '/player-switch' as any,
                    params: { playerId: String(pId) },
                  });
                }
              }}
            >
              <View style={styles.switchOptionBadge}>
                <MaterialIcons name="swap-horiz" size={18} color={Colors.brandPurple} />
              </View>
              <Text style={[styles.actionSheetText, { fontFamily: labelFont }]}>
                {isArabic ? 'استبدال لاعب (Switch)' : 'Switch / Transfer Player'}
              </Text>
            </TouchableOpacity>

            {/* Captain Option */}
            <TouchableOpacity
              style={[styles.actionSheetOption, { flexDirection: flexDir }]}
              onPress={() => handleMakeCaptain(actionMenuPick!.index)}
            >
              <View style={styles.captainOptionBadge}>
                <Text style={styles.captainOptionLetter}>C</Text>
              </View>
              <Text style={[styles.actionSheetText, { fontFamily: labelFont }]}>
                {isArabic ? 'تعيين كابتن (C)' : 'Make Captain (C)'}
              </Text>
            </TouchableOpacity>

            {/* Vice Captain Option */}
            <TouchableOpacity
              style={[styles.actionSheetOption, { flexDirection: flexDir }]}
              onPress={() => handleMakeViceCaptain(actionMenuPick!.index)}
            >
              <View style={styles.vcOptionBadge}>
                <Text style={styles.vcOptionLetter}>VC</Text>
              </View>
              <Text style={[styles.actionSheetText, { fontFamily: labelFont }]}>
                {isArabic ? 'تعيين نائب كابتن (VC)' : 'Make Vice-Captain (VC)'}
              </Text>
            </TouchableOpacity>

            {/* Substitute Option */}
            <TouchableOpacity
              style={[styles.actionSheetOption, { flexDirection: flexDir }]}
              onPress={() => {
                const idx = actionMenuPick!.index;
                setActionMenuPick(null);
                setIsEditMode(true);
                setSelectedPickIndex(idx);
              }}
            >
              <MaterialIcons name="swap-vert" size={22} color={Colors.brandTeal} />
              <Text style={[styles.actionSheetText, { fontFamily: labelFont }]}>
                {isArabic ? 'تبديل مع لاعب آخر' : 'Substitute / Swap Player'}
              </Text>
            </TouchableOpacity>

            {/* Cancel Option */}
            <TouchableOpacity style={styles.actionSheetCancel} onPress={() => setActionMenuPick(null)}>
              <Text style={[styles.actionSheetCancelText, { fontFamily: labelFont }]}>
                {isArabic ? 'إلغاء' : 'Cancel'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── REPLACEMENT PICKER MODAL: Search & Select Target Player ── */}
      <Modal visible={!!transferPickerPick} animationType="slide" onRequestClose={() => setTransferPickerPick(null)}>
        <SafeAreaView style={styles.pickerRoot} edges={['top', 'bottom']}>
          <View style={[styles.pickerHeader, { flexDirection: flexDir }]}>
            <View style={{ alignItems: isRTL ? 'flex-end' : 'flex-start' }}>
              <Text style={[styles.pickerTitle, { fontFamily: headlineFont }]}>
                {isArabic ? 'اختر بديلاً لـ:' : 'Replace:'} {transferPickerPick?.pick.player?.web_name}
              </Text>
              <Text style={[styles.pickerSub, { fontFamily: monoFont }]}>
                {POSITION_SHORT[transferPickerPick?.pick.player?.element_type || 1]} • Bank: £{(calculatedBank / 10).toFixed(1)}m
              </Text>
            </View>
            <TouchableOpacity onPress={() => setTransferPickerPick(null)}>
              <MaterialIcons name="close" size={26} color={Colors.onSurface} />
            </TouchableOpacity>
          </View>

          {/* Search Bar */}
          <View style={styles.pickerSearchRow}>
            <TextInput
              value={pickerSearchQuery}
              onChangeText={setPickerSearchQuery}
              placeholder={isArabic ? 'بحث باسم اللاعب...' : 'Search player name...'}
              placeholderTextColor={Colors.onSurfaceVariant}
              style={[styles.searchInput, { fontFamily: bodyFont, textAlign }]}
            />
          </View>

          {/* Sort Controls */}
          <View style={[styles.sortBar, { flexDirection: flexDir }]}>
            <TouchableOpacity
              style={[styles.sortBtn, pickerSortBy === 'points' && styles.sortBtnActive]}
              onPress={() => setPickerSortBy('points')}
            >
              <Text style={[styles.sortBtnText, { fontFamily: labelFont }]}>{isArabic ? 'النقاط' : 'Points'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.sortBtn, pickerSortBy === 'form' && styles.sortBtnActive]}
              onPress={() => setPickerSortBy('form')}
            >
              <Text style={[styles.sortBtnText, { fontFamily: labelFont }]}>{isArabic ? 'الفورم' : 'Form'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.sortBtn, pickerSortBy === 'cost' && styles.sortBtnActive]}
              onPress={() => setPickerSortBy('cost')}
            >
              <Text style={[styles.sortBtnText, { fontFamily: labelFont }]}>{isArabic ? 'السعر' : 'Price'}</Text>
            </TouchableOpacity>
          </View>

          {/* Replacement Players FlatList */}
          <FlatList
            data={availableReplacements}
            keyExtractor={item => String(item.id)}
            contentContainerStyle={styles.pickerListContent}
            renderItem={({ item }) => {
              const sellingPrice = transferPickerPick?.pick.selling_price || transferPickerPick?.pick.player?.now_cost || 0;
              const costDiff = item.now_cost - sellingPrice;
              return (
                <TouchableOpacity
                  style={[styles.pickerItem, { flexDirection: flexDir }]}
                  onPress={() => handleStageReplacement(item)}
                >
                  <Image
                    source={{ uri: getPlayerPhotoUrl(item, item.code || item.id) }}
                    style={styles.pickerAvatar}
                  />

                  <View style={[styles.pickerInfo, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
                    <Text style={[styles.pickerItemName, { fontFamily: headlineFont }]}>{item.web_name}</Text>
                    <Text style={[styles.pickerItemMeta, { fontFamily: monoFont }]}>
                      {teamsMap.get(item.team) || DEFAULT_TEAMS_MAP.get(item.team) || 'PL'} • Form: {item.form} • {item.total_points} pts
                    </Text>
                  </View>

                  <View style={styles.replacementPriceCol}>
                    <Text style={[styles.replacementPrice, { fontFamily: monoFont }]}>£{(item.now_cost / 10).toFixed(1)}m</Text>
                    <Text style={[styles.costDiffText, { fontFamily: monoFont }, costDiff > 0 ? styles.costUp : styles.costDown]}>
                      {costDiff >= 0 ? `+£${(costDiff / 10).toFixed(1)}m` : `-£${(Math.abs(costDiff) / 10).toFixed(1)}m`}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const CLUB_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  ARS: { bg: '#850000', border: '#EF0107', text: '#FFFFFF' },
  AVL: { bg: '#4A0825', border: '#95BFE5', text: '#FFFFFF' },
  BOU: { bg: '#700000', border: '#DA291C', text: '#FFFFFF' },
  BRE: { bg: '#800000', border: '#FDE100', text: '#FFFFFF' },
  BHA: { bg: '#003B7A', border: '#0057B8', text: '#FFFFFF' },
  CHE: { bg: '#022B5C', border: '#034694', text: '#FFFFFF' },
  CRY: { bg: '#102A56', border: '#1B458F', text: '#FFFFFF' },
  EVE: { bg: '#002266', border: '#003399', text: '#FFFFFF' },
  FUL: { bg: '#1C1C1C', border: '#FFFFFF', text: '#FFFFFF' },
  IPS: { bg: '#002266', border: '#003399', text: '#FFFFFF' },
  LEI: { bg: '#002060', border: '#003090', text: '#FFFFFF' },
  LIV: { bg: '#7D0A1C', border: '#C8102E', text: '#FFFFFF' },
  MCI: { bg: '#2C6A94', border: '#6CABDD', text: '#FFFFFF' },
  MUN: { bg: '#7D120B', border: '#DA291C', text: '#FFFFFF' },
  NEW: { bg: '#181818', border: '#FFFFFF', text: '#FFFFFF' },
  NFO: { bg: '#7A0000', border: '#DD0000', text: '#FFFFFF' },
  SOU: { bg: '#7D0E13', border: '#D71920', text: '#FFFFFF' },
  TOT: { bg: '#0B1433', border: '#132257', text: '#FFFFFF' },
  WHU: { bg: '#4D1423', border: '#7A263A', text: '#FFFFFF' },
  WOL: { bg: '#855E00', border: '#FDB913', text: '#FFFFFF' },
  COV: { bg: '#005DAA', border: '#70B5F9', text: '#FFFFFF' },
  HUL: { bg: '#F5A623', border: '#000000', text: '#000000' },
  LEE: { bg: '#1D428A', border: '#FFCD00', text: '#FFFFFF' },
  SUN: { bg: '#EB172B', border: '#FFFFFF', text: '#FFFFFF' },
  PL:  { bg: '#37003C', border: '#00FF87', text: '#00FF87' },
};

function ClubAvatarFallback({
  teamCode = 'PL',
  initials = 'PL',
  size = 42,
}: {
  teamCode?: string;
  initials?: string;
  size?: number;
}) {
  const club = CLUB_COLORS[teamCode.toUpperCase()] || CLUB_COLORS.PL;
  return (
    <View
      style={[
        styles.clubFallbackRoot,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: club.bg,
          borderColor: club.border,
        },
      ]}
    >
      <Text style={styles.clubWatermarkText}>{teamCode}</Text>
      <Text style={[styles.clubInitialsText, { color: club.text }]}>{initials}</Text>
    </View>
  );
}

// ── SUB-COMPONENT: Fixture Tag Pill ──────────────────────────────────────────
function FixtureTagPill({
  fixtures,
  isArabic,
}: {
  fixtures: TeamNextFixtureInfo[];
  isArabic: boolean;
}) {
  if (!fixtures || fixtures.length === 0) {
    return (
      <View style={styles.fixtureTagRoot}>
        <Text style={styles.fixtureTagNoFix}>
          {isArabic ? 'بدون مباراة' : 'No fixture'}
        </Text>
      </View>
    );
  }

  // Double Gameweek: stacked in the same tag area
  if (fixtures.length >= 2) {
    return (
      <View style={styles.fixtureTagRootDgw}>
        {fixtures.map((f, i) => (
          <Text key={i} style={styles.fixtureTagText} numberOfLines={1}>
            {f.opponentCode}{' '}
            <Text style={f.isHome ? styles.fixtureTagHome : styles.fixtureTagAway}>
              {f.isHome ? '(H)' : '(A)'}
            </Text>
          </Text>
        ))}
      </View>
    );
  }

  // Single fixture
  const f = fixtures[0];
  return (
    <View style={styles.fixtureTagRoot}>
      <Text style={styles.fixtureTagText} numberOfLines={1}>
        {f.opponentCode}{' '}
        <Text style={f.isHome ? styles.fixtureTagHome : styles.fixtureTagAway}>
          {f.isHome ? '(H)' : '(A)'}
        </Text>
      </Text>
    </View>
  );
}

// ── SUB-COMPONENT: Player Gameweek History & Upcoming Fixtures Strip ─────────
interface PlayerGameweekHistoryStripProps {
  playerSummary: FPLElementSummary | null;
  isLoading: boolean;
  playerTeam: number;
  targetGw: number;
  teamsMap: Map<number, string>;
  fixtures: FPLFixture[];
  isArabic: boolean;
  headlineFont: string;
  monoFont: string;
  labelFont: string;
}

function PlayerGameweekHistoryStrip({
  playerSummary,
  isLoading,
  playerTeam,
  targetGw,
  teamsMap,
  fixtures,
  isArabic,
  monoFont,
  labelFont,
}: PlayerGameweekHistoryStripProps) {
  // Played / Past history from playerSummary
  const playedHistory = useMemo(() => {
    if (!playerSummary?.history) return [];
    return [...playerSummary.history].sort((a, b) => a.round - b.round);
  }, [playerSummary?.history]);

  // Upcoming fixtures from playerSummary or global fixtures fallback
  const upcomingFixtures: Array<{ event: number; oppCode: string; isHome: boolean; difficulty: number }> = useMemo(() => {
    if (playerSummary?.fixtures && playerSummary.fixtures.length > 0) {
      return [...playerSummary.fixtures]
        .filter((f) => f.event !== null && f.event >= targetGw)
        .sort((a, b) => a.event - b.event)
        .slice(0, 10)
        .map((f) => {
          const isHome = f.is_home;
          const oppTeamId = isHome ? f.team_a : f.team_h;
          const oppCode = teamsMap.get(oppTeamId) || DEFAULT_TEAMS_MAP.get(oppTeamId) || 'PL';
          return {
            event: f.event,
            oppCode,
            isHome,
            difficulty: f.difficulty,
          };
        });
    }

    const fallback: TeamNextFixtureInfo[] = getTeamUpcomingFiveFixtures(playerTeam, fixtures, targetGw, teamsMap, 10);
    return fallback.map((f: TeamNextFixtureInfo) => ({
      event: f.event || targetGw,
      oppCode: f.opponentCode,
      isHome: f.isHome,
      difficulty: f.difficulty,
    }));
  }, [playerSummary?.fixtures, playerTeam, fixtures, targetGw, teamsMap]);

  const hasAnyData = playedHistory.length > 0 || upcomingFixtures.length > 0;

  return (
    <View style={styles.gwStripWrapper}>
      <View style={[styles.gwStripHeader, { flexDirection: isArabic ? 'row-reverse' : 'row' }]}>
        <Text style={[styles.gwStripTitle, { fontFamily: labelFont }]}>
          {isArabic ? 'سجل الجولات والمباريات القادمة' : 'Gameweek History & Fixtures'}
        </Text>
        {isLoading && (
          <ActivityIndicator size="small" color={Colors.brandTeal} style={{ marginHorizontal: 6 }} />
        )}
      </View>

      <ScrollView
        horizontal={true}
        showsHorizontalScrollIndicator={false}
        nestedScrollEnabled={true}
        directionalLockEnabled={true}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.gwStripScroll}
      >
        {/* Past Played Gameweeks with real points */}
        {playedHistory.map((item) => {
          const oppCode = teamsMap.get(item.opponent_team) || DEFAULT_TEAMS_MAP.get(item.opponent_team) || 'PL';
          const venue = item.was_home ? '(H)' : '(A)';
          const pts = item.total_points;

          let badgeBg = '#059669';
          let badgeTextColor = '#FFFFFF';
          if (pts >= 10) {
            badgeBg = '#00FF87';
            badgeTextColor = '#121414';
          } else if (pts >= 6) {
            badgeBg = '#10B981';
            badgeTextColor = '#FFFFFF';
          } else if (pts >= 1) {
            badgeBg = '#059669';
            badgeTextColor = '#FFFFFF';
          } else if (pts === 0) {
            badgeBg = '#4B5563';
            badgeTextColor = '#D1D5DB';
          } else {
            badgeBg = '#EF4444';
            badgeTextColor = '#FFFFFF';
          }

          return (
            <View key={`hist-${item.round}-${item.fixture}`} style={styles.gwChip}>
              <View style={[styles.gwBadgePoints, { backgroundColor: badgeBg }]}>
                <Text style={[styles.gwBadgePointsText, { color: badgeTextColor, fontFamily: monoFont }]}>
                  {pts} pts
                </Text>
              </View>
              <Text style={[styles.gwChipOpponent, { fontFamily: monoFont }]}>
                {oppCode}{' '}
                <Text style={item.was_home ? styles.venueHome : styles.venueAway}>
                  {venue}
                </Text>
              </Text>
              <Text style={[styles.gwChipRound, { fontFamily: monoFont }]}>GW{item.round}</Text>
            </View>
          );
        })}

        {/* Upcoming Gameweeks with FDR */}
        {upcomingFixtures.map((f, idx) => {
          const isUpNext = idx === 0 || f.event === targetGw;
          const venue = f.isHome ? '(H)' : '(A)';

          let fdrBg = '#00FF87';
          let fdrTextColor = '#121414';
          if (f.difficulty <= 2) {
            fdrBg = '#00FF87';
            fdrTextColor = '#121414';
          } else if (f.difficulty === 3) {
            fdrBg = '#FBBF24';
            fdrTextColor = '#121414';
          } else {
            fdrBg = '#F87171';
            fdrTextColor = '#FFFFFF';
          }

          return (
            <View
              key={`up-${f.event}-${f.oppCode}-${idx}`}
              style={[styles.gwChip, styles.gwChipUpcoming, isUpNext && styles.gwChipUpNext]}
            >
              {isUpNext && (
                <View style={styles.upNextTag}>
                  <Text style={[styles.upNextTagText, { fontFamily: monoFont }]}>
                    {isArabic ? 'القادم' : 'NEXT'}
                  </Text>
                </View>
              )}
              <View style={[styles.gwBadgeFdr, { backgroundColor: fdrBg }]}>
                <Text style={[styles.gwBadgeFdrText, { color: fdrTextColor, fontFamily: monoFont }]}>
                  FDR {f.difficulty}
                </Text>
              </View>
              <Text style={[styles.gwChipOpponent, { fontFamily: monoFont }]}>
                {f.oppCode}{' '}
                <Text style={f.isHome ? styles.venueHome : styles.venueAway}>
                  {venue}
                </Text>
              </Text>
              <Text style={[styles.gwChipRound, { fontFamily: monoFont }]}>GW{f.event}</Text>
            </View>
          );
        })}

        {!hasAnyData && !isLoading && (
          <View style={styles.gwEmptyChip}>
            <Text style={[styles.gwEmptyText, { fontFamily: monoFont }]}>
              {isArabic ? 'لا توجد مباريات سابقة أو قادمة' : 'No history or fixtures available'}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function getPointsBadgeBg(pts: number): string {
  if (pts >= 7) return '#00FF87';
  if (pts >= 3) return '#FBBF24';
  if (pts < 0) return '#FF6B6B';
  return 'rgba(255, 255, 255, 0.18)';
}

function getPointsTextColor(pts: number): string {
  if (pts >= 7) return '#1E0021';
  if (pts >= 3) return '#1E0021';
  return '#FFFFFF';
}

// ── SUB-COMPONENT: Pitch Player Card ──────────────────────────────────────────
function PitchPlayerCard({
  pick,
  teamsMap,
  fixtures,
  targetGw,
  isArabic,
  isSelected = false,
  isNewlyStaged = false,
  badgeMode = 'fixture',
  points,
  onPress,
}: {
  pick: FPLPick;
  teamsMap: Map<number, string>;
  fixtures: FPLFixture[];
  targetGw: number;
  isArabic: boolean;
  isSelected?: boolean;
  isNewlyStaged?: boolean;
  badgeMode?: 'fixture' | 'points' | 'price';
  points?: number;
  onPress: () => void;
}) {
  const [imgError, setImgError] = useState(false);
  const player = pick.player;
  const name = player?.web_name || 'Player';
  const teamCode = player?.team ? (teamsMap.get(player.team) || DEFAULT_TEAMS_MAP.get(player.team) || 'PL') : 'PL';
  const photoUrl = getPlayerPhotoUrl(player, pick.element);

  const teamFixtures = useMemo(
    () => getTeamNextGwFixtures(player?.team || 0, fixtures, targetGw, teamsMap),
    [player?.team, fixtures, targetGw, teamsMap]
  );

  const isDoubtful = player?.chance_of_playing_next_round !== null &&
    player?.chance_of_playing_next_round !== undefined &&
    player?.chance_of_playing_next_round < 100;

  const initials = name.slice(0, 3).toUpperCase();

  return (
    <TouchableOpacity
      style={[
        styles.pitchCardRoot,
        isSelected && styles.pitchCardSelected,
        isNewlyStaged && styles.pitchCardStagedGlow,
        pick.is_captain && styles.pitchCardCaptainGlow,
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {/* Newly Staged Tag (IN ✨) */}
      {isNewlyStaged && (
        <View style={styles.newStagedBadge}>
          <Text style={styles.newStagedText}>{isArabic ? 'جديد ✨' : 'IN ✨'}</Text>
        </View>
      )}

      {/* Player Photo with Overlay Badges */}
      <View style={styles.photoWrapper}>
        {imgError ? (
          <ClubAvatarFallback teamCode={teamCode} initials={initials} size={42} />
        ) : (
          <Image
            source={{ uri: photoUrl }}
            style={styles.playerPhoto}
            onError={() => setImgError(true)}
          />
        )}

        {/* Captain Badge ("C" / "ك") */}
        {pick.is_captain && (
          <View style={styles.captainBadge}>
            <Text style={styles.captainBadgeText}>{isArabic ? 'ك' : 'C'}</Text>
          </View>
        )}

        {/* Vice-Captain Badge ("VC" / "ن") */}
        {pick.is_vice_captain && (
          <View style={styles.vcBadge}>
            <Text style={styles.vcBadgeText}>{isArabic ? 'ن' : 'VC'}</Text>
          </View>
        )}

        {/* Injury / Doubt Percentage Badge */}
        {isDoubtful && (
          <View style={styles.doubtBadge}>
            <Text style={styles.doubtBadgeText}>{player?.chance_of_playing_next_round}%</Text>
          </View>
        )}
      </View>

      {/* Name and Team Tag */}
      <View style={styles.chipTag}>
        <Text style={styles.chipName} numberOfLines={1}>{name}</Text>
        <Text style={styles.chipTeam} numberOfLines={1}>{teamCode}</Text>
      </View>

      {/* Bottom Tag: Points, Price, or Fixture */}
      {badgeMode === 'points' ? (
        <View style={[styles.pointsBadge, { backgroundColor: getPointsBadgeBg(points ?? 0) }]}>
          <Text style={[styles.pointsBadgeText, { color: getPointsTextColor(points ?? 0) }]}>
            {points ?? 0} pts
          </Text>
        </View>
      ) : badgeMode === 'price' ? (
        <View style={styles.priceTagBadge}>
          <Text style={styles.priceTagText}>
            £{((player?.now_cost || 0) / 10).toFixed(1)}m
          </Text>
        </View>
      ) : (
        <FixtureTagPill fixtures={teamFixtures} isArabic={isArabic} />
      )}
    </TouchableOpacity>
  );
}

// ── SUB-COMPONENT: Bench Player Card ──────────────────────────────────────────
function BenchPlayerCard({
  pick,
  benchIndex,
  teamsMap,
  fixtures,
  targetGw,
  isArabic,
  isSelected = false,
  isNewlyStaged = false,
  badgeMode = 'fixture',
  points,
  onPress,
}: {
  pick: FPLPick;
  benchIndex: number;
  teamsMap: Map<number, string>;
  fixtures: FPLFixture[];
  targetGw: number;
  isArabic: boolean;
  isSelected?: boolean;
  isNewlyStaged?: boolean;
  badgeMode?: 'fixture' | 'points' | 'price';
  points?: number;
  onPress: () => void;
}) {
  const [imgError, setImgError] = useState(false);
  const player = pick.player;
  const name = player?.web_name || 'Sub';
  const teamCode = player?.team ? (teamsMap.get(player.team) || DEFAULT_TEAMS_MAP.get(player.team) || 'PL') : 'PL';
  const photoUrl = getPlayerPhotoUrl(player, pick.element);

  const teamFixtures = useMemo(
    () => getTeamNextGwFixtures(player?.team || 0, fixtures, targetGw, teamsMap),
    [player?.team, fixtures, targetGw, teamsMap]
  );

  const isDoubtful = player?.chance_of_playing_next_round !== null &&
    player?.chance_of_playing_next_round !== undefined &&
    player?.chance_of_playing_next_round < 100;

  const initials = name.slice(0, 3).toUpperCase();

  return (
    <TouchableOpacity
      style={[
        styles.benchCardRoot,
        isSelected && styles.pitchCardSelected,
        isNewlyStaged && styles.pitchCardStagedGlow,
        isDoubtful && styles.benchCardDoubtful,
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {/* Bench Order Number Badge (1-4) */}
      <View style={styles.benchOrderBadge}>
        <Text style={styles.benchOrderText}>{benchIndex}</Text>
      </View>

      {/* Newly Staged Tag (IN ✨) */}
      {isNewlyStaged && (
        <View style={styles.newStagedBadge}>
          <Text style={styles.newStagedText}>{isArabic ? 'جديد ✨' : 'IN ✨'}</Text>
        </View>
      )}

      <View style={styles.benchPhotoWrapper}>
        {imgError ? (
          <ClubAvatarFallback teamCode={teamCode} initials={initials} size={42} />
        ) : (
          <Image
            source={{ uri: photoUrl }}
            style={[styles.benchPlayerPhoto, !isSelected && styles.benchPhotoMuted]}
            onError={() => setImgError(true)}
          />
        )}

        {/* Doubt Badge */}
        {isDoubtful && (
          <View style={styles.doubtBadge}>
            <Text style={styles.doubtBadgeText}>{player?.chance_of_playing_next_round}%</Text>
          </View>
        )}
      </View>

      <View style={styles.benchTag}>
        <Text style={styles.benchName} numberOfLines={1}>{name}</Text>
        <Text style={styles.benchMeta} numberOfLines={1}>{POSITION_SHORT[player?.element_type || 1]} • {teamCode}</Text>
      </View>

      {/* Bottom Tag: Points, Price, or Fixture */}
      {badgeMode === 'points' ? (
        <View style={[styles.pointsBadge, { backgroundColor: getPointsBadgeBg(points ?? 0) }]}>
          <Text style={[styles.pointsBadgeText, { color: getPointsTextColor(points ?? 0) }]}>
            {points ?? 0} pts
          </Text>
        </View>
      ) : badgeMode === 'price' ? (
        <View style={styles.priceTagBadge}>
          <Text style={styles.priceTagText}>
            £{((player?.now_cost || 0) / 10).toFixed(1)}m
          </Text>
        </View>
      ) : (
        <FixtureTagPill fixtures={teamFixtures} isArabic={isArabic} />
      )}
    </TouchableOpacity>
  );
}

// ── STYLES ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.brandPurple,
  },
  headerAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.brandTeal,
  },
  proBadge: {
    backgroundColor: 'rgba(0, 255, 135, 0.15)',
    borderWidth: 1,
    borderColor: Colors.brandTeal,
    borderRadius: Radii.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  proBadgeText: {
    color: Colors.brandTeal,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  // Segmented Control
  segmentedControl: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    gap: 8,
    backgroundColor: 'rgba(18,20,20,0.4)',
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: Radii.lg,
    backgroundColor: 'rgba(255,255,255,0.06)',
    gap: 6,
  },
  segmentBtnActive: {
    backgroundColor: Colors.brandTeal,
  },
  segmentText: {
    fontSize: 13,
    color: Colors.onSurfaceVariant,
  },
  segmentTextActive: {
    color: Colors.brandPurple,
  },

  loadingCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: Colors.onSurfaceVariant,
    fontSize: 14,
  },
  backgroundSyncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    gap: 8,
    marginBottom: 4,
  },
  backgroundSyncText: {
    color: Colors.brandTeal,
    fontSize: 12,
    letterSpacing: 0.5,
  },
  subtleErrorToast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 180, 0, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radii.default,
    borderWidth: 1,
    borderColor: 'rgba(255, 180, 0, 0.25)',
    marginBottom: 4,
  },
  subtleErrorText: {
    color: Colors.onSurface,
    fontSize: 12,
    flex: 1,
  },

  scrollContent: {
    paddingHorizontal: Spacing.md,
    paddingBottom: 24,
    gap: Spacing.md,
  },

  // 1. Status Card (#4A0E52 brand-purple-light)
  statusCard: {
    backgroundColor: Colors.brandPurpleMid,
    borderRadius: Radii.xxl,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  statusCardRow: {
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  statusLeftCol: {
    flex: 1,
    gap: 2,
  },
  gwTitle: {
    color: Colors.white,
    fontSize: 20,
  },
  deadlineContainer: {
    alignItems: 'center',
    gap: 4,
  },
  deadlineText: {
    color: Colors.onSurfaceVariant,
    fontSize: 11,
  },
  statusActionsCol: {
    alignItems: 'center',
    gap: 8,
  },
  btnOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1.2,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radii.lg,
  },
  btnOutlineActive: {
    borderColor: Colors.brandTeal,
    backgroundColor: 'rgba(0, 255, 135, 0.1)',
  },
  btnOutlineText: {
    color: Colors.white,
    fontSize: 12,
  },
  btnSave: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.brandTeal,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radii.lg,
  },
  btnSaveMuted: {
    opacity: 0.85,
  },
  btnSaveText: {
    color: Colors.brandPurple,
    fontSize: 12,
    fontWeight: '700',
  },

  editBanner: {
    backgroundColor: 'rgba(0, 255, 135, 0.12)',
    borderWidth: 1,
    borderColor: Colors.brandTeal,
    borderRadius: Radii.lg,
    padding: 10,
    alignItems: 'center',
    gap: 8,
  },
  editBannerText: {
    color: Colors.brandTeal,
    fontSize: 12,
    flex: 1,
  },

  // 2. The Pitch
  pitchContainer: {
    backgroundColor: '#143C22',
    borderRadius: Radii.xxl,
    borderWidth: 1.5,
    borderColor: 'rgba(52, 255, 140, 0.25)',
    paddingVertical: 14,
    paddingHorizontal: 8,
    minHeight: 400,
    position: 'relative',
    overflow: 'hidden',
  },
  pitchCircle: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 100,
    height: 100,
    borderRadius: 50,
    marginTop: -50,
    marginLeft: -50,
    borderWidth: 1.2,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  pitchHalfwayLine: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    height: 1.2,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  pitchPenaltyBoxTop: {
    position: 'absolute',
    top: 0,
    left: '25%',
    right: '25%',
    height: 48,
    borderBottomWidth: 1.2,
    borderLeftWidth: 1.2,
    borderRightWidth: 1.2,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  pitchPenaltyBoxBottom: {
    position: 'absolute',
    bottom: 0,
    left: '25%',
    right: '25%',
    height: 48,
    borderTopWidth: 1.2,
    borderLeftWidth: 1.2,
    borderRightWidth: 1.2,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  pitchContent: {
    flex: 1,
    justifyContent: 'space-between',
    gap: 10,
    zIndex: 2,
  },
  pitchRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginVertical: 2,
  },

  // Pitch Player Card
  pitchCardRoot: {
    alignItems: 'center',
    width: (SCREEN_W - 50) / 5,
    maxWidth: 72,
    padding: 2,
  },
  pitchCardSelected: {
    transform: [{ scale: 1.08 }],
  },
  pitchCardCaptainGlow: {
    // glowing border/shadow
    shadowColor: Colors.brandTeal,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 6,
  },
  photoWrapper: {
    position: 'relative',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#0D2615',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerPhoto: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  photoFallback: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.brandPurpleMid,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoFallbackText: {
    color: Colors.brandTeal,
    fontSize: 10,
    fontWeight: '800',
  },
  clubFallbackRoot: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.2,
    position: 'relative',
    overflow: 'hidden',
  },
  clubWatermarkText: {
    position: 'absolute',
    color: 'rgba(255, 255, 255, 0.16)',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  clubInitialsText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    zIndex: 2,
  },

  // Captain / Vice-Captain Badges
  captainBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: Colors.brandTeal,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.brandPurple,
  },
  captainBadgeText: {
    color: Colors.brandPurple,
    fontSize: 10,
    fontWeight: '900',
  },
  vcBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: Colors.tertiary,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.brandPurple,
  },
  vcBadgeText: {
    color: Colors.brandPurple,
    fontSize: 9,
    fontWeight: '900',
  },
  doubtBadge: {
    position: 'absolute',
    top: -4,
    left: -4,
    backgroundColor: Colors.errorContainer,
    borderWidth: 1,
    borderColor: Colors.error,
    paddingHorizontal: 3,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doubtBadgeText: {
    color: Colors.white,
    fontSize: 8,
    fontWeight: '800',
  },

  chipTag: {
    marginTop: 3,
    backgroundColor: 'rgba(20, 3, 23, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: Radii.default,
    paddingHorizontal: 4,
    paddingVertical: 1,
    alignItems: 'center',
    width: '100%',
  },
  chipName: {
    color: Colors.white,
    fontSize: 10,
    fontWeight: '700',
  },
  chipTeam: {
    color: Colors.onSurfaceVariant,
    fontSize: 8,
  },

  // 3. Bench Section
  benchCard: {
    backgroundColor: Colors.brandPurpleMid,
    borderRadius: Radii.xxl,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  benchHeaderRow: {
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  benchSectionTitle: {
    color: Colors.white,
    fontSize: 18,
  },
  benchSubText: {
    color: Colors.onSurfaceVariant,
    fontSize: 11,
  },
  benchRow: {
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  benchCardRoot: {
    alignItems: 'center',
    width: (SCREEN_W - 60) / 4,
    maxWidth: 76,
    padding: 2,
    position: 'relative',
  },
  benchCardDoubtful: {
    borderWidth: 1,
    borderColor: 'rgba(255, 180, 171, 0.3)',
    borderRadius: Radii.lg,
  },
  benchOrderBadge: {
    position: 'absolute',
    top: 0,
    left: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  benchOrderText: {
    color: Colors.white,
    fontSize: 9,
    fontWeight: '700',
  },
  benchPhotoWrapper: {
    position: 'relative',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#2A0730',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  benchPlayerPhoto: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  benchPhotoMuted: {
    opacity: 0.85,
  },
  benchTag: {
    marginTop: 3,
    backgroundColor: 'rgba(18, 0, 20, 0.75)',
    borderRadius: Radii.default,
    paddingHorizontal: 4,
    paddingVertical: 1,
    alignItems: 'center',
    width: '100%',
  },
  benchName: {
    color: Colors.white,
    fontSize: 10,
    fontWeight: '700',
  },
  benchMeta: {
    color: Colors.onSurfaceVariant,
    fontSize: 8,
  },

  // Transfers View Styles
  transferMetricsRow: {
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  metricCol: {
    alignItems: 'center',
    flex: 1,
  },
  metricSub: {
    color: Colors.onSurfaceVariant,
    fontSize: 10,
    marginBottom: 2,
  },
  metricVal: {
    color: Colors.white,
    fontSize: 18,
  },
  metricDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  stagedCard: {
    backgroundColor: 'rgba(74, 14, 82, 0.9)',
    borderRadius: Radii.xxl,
    padding: Spacing.md,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.brandTeal,
  },
  stagedTitle: {
    color: Colors.white,
    fontSize: 16,
  },
  stagedRow: {
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.3)',
    padding: 8,
    borderRadius: Radii.lg,
  },
  stagedOut: {
    backgroundColor: 'rgba(255, 180, 171, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radii.default,
  },
  stagedOutText: {
    color: Colors.error,
    fontSize: 12,
    fontWeight: '700',
  },
  stagedIn: {
    backgroundColor: 'rgba(0, 255, 135, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radii.default,
  },
  stagedInText: {
    color: Colors.brandTeal,
    fontSize: 12,
    fontWeight: '700',
  },
  confirmTransfersBtn: {
    backgroundColor: Colors.brandTeal,
    borderRadius: Radii.xl,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 6,
  },
  confirmTransfersBtnText: {
    color: Colors.brandPurple,
    fontSize: 15,
  },

  transfersListCard: {
    backgroundColor: Colors.brandPurpleMid,
    borderRadius: Radii.xxl,
    padding: Spacing.md,
    gap: 10,
  },
  transfersListTitle: {
    color: Colors.white,
    fontSize: 16,
    marginBottom: 4,
  },
  transferListItem: {
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(18, 0, 20, 0.4)',
    padding: 10,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  transferListAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#2A0730',
  },
  transferListInfo: {
    flex: 1,
    marginHorizontal: 10,
  },
  transferListName: {
    color: Colors.white,
    fontSize: 14,
  },
  transferListMeta: {
    color: Colors.onSurfaceVariant,
    fontSize: 11,
  },
  replaceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.brandTeal,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radii.full,
  },
  replaceBtnText: {
    color: Colors.brandPurple,
    fontSize: 12,
    fontWeight: '700',
  },

  // Fixture Tag Pills (below player names)
  fixtureTagRoot: {
    marginTop: 3,
    backgroundColor: '#1E0021',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1.5,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 46,
  },
  fixtureTagRootDgw: {
    marginTop: 3,
    backgroundColor: '#1E0021',
    borderRadius: 4,
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    minWidth: 46,
  },
  fixtureTagText: {
    color: '#E2E2E2',
    fontSize: 9,
    fontFamily: 'JetBrainsMono_700',
    fontWeight: '700',
  },
  fixtureTagHome: {
    color: Colors.brandTeal,
    fontWeight: '700',
  },
  fixtureTagAway: {
    color: '#A3909F',
    fontWeight: '600',
  },
  fixtureTagNoFix: {
    color: '#8A7584',
    fontSize: 8,
    fontStyle: 'italic',
  },

  // Action Sheet Modal (Player Quick Actions)
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  actionSheet: {
    backgroundColor: '#1E0021',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: Spacing.lg,
    paddingTop: 12,
    paddingBottom: Spacing.xl,
    gap: 10,
    borderTopWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  sheetDragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#6B5B67',
    alignSelf: 'center',
    marginBottom: 8,
  },
  sheetPlayerCard: {
    backgroundColor: '#4A0E52',
    padding: 12,
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 4,
  },
  sheetPlayerHeaderRow: {
    alignItems: 'center',
    gap: 12,
    width: '100%',
  },
  sheetCardDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginVertical: 10,
    width: '100%',
  },
  sheetAvatarWrapper: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: Colors.brandTeal,
    backgroundColor: '#0D2615',
  },
  sheetAvatar: {
    width: 48,
    height: 48,
  },
  sheetPlayerMeta: {
    flex: 1,
    gap: 2,
  },
  sheetPillRow: {
    alignItems: 'center',
    gap: 6,
  },
  sheetPositionPill: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  sheetPositionPillText: {
    color: '#121414',
    fontSize: 10,
    fontWeight: '800',
  },
  sheetTeamText: {
    color: Colors.onSurfaceVariant,
    fontSize: 11,
  },
  sheetStatsRow: {
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  statCol: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statColDivider: {
    width: 1,
    height: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  statColLabel: {
    fontSize: 9,
    color: '#D2C2CD',
    textTransform: 'uppercase',
  },
  statColVal: {
    fontSize: 13,
    fontWeight: '700',
    color: '#E2E2E2',
  },
  statColValTeal: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.brandTeal,
  },
  actionSheetTitle: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: '700',
  },

  // ── Gameweek History & Upcoming Fixtures Strip ──
  gwStripWrapper: {
    marginTop: 2,
    marginBottom: 4,
    width: '100%',
  },
  gwStripHeader: {
    alignItems: 'center',
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  gwStripTitle: {
    color: '#D2C2CD',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  gwStripScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  gwChip: {
    backgroundColor: '#4A0E52',
    borderRadius: Radii.lg,
    paddingVertical: 7,
    paddingHorizontal: 10,
    minWidth: 68,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  gwChipUpcoming: {
    backgroundColor: '#350B3B',
  },
  gwChipUpNext: {
    borderColor: Colors.brandTeal,
    borderWidth: 1.5,
  },
  upNextTag: {
    position: 'absolute',
    top: -8,
    alignSelf: 'center',
    backgroundColor: Colors.brandTeal,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  upNextTagText: {
    color: '#121414',
    fontSize: 8,
    fontWeight: '900',
  },
  gwBadgePoints: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 4,
  },
  gwBadgePointsText: {
    fontSize: 10,
    fontWeight: '800',
  },
  gwBadgeFdr: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 4,
  },
  gwBadgeFdrText: {
    fontSize: 9,
    fontWeight: '800',
  },
  gwChipOpponent: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 2,
  },
  venueHome: {
    color: Colors.brandTeal,
    fontWeight: '700',
  },
  venueAway: {
    color: '#9CA3AF',
    fontWeight: '500',
  },
  gwChipRound: {
    color: '#D2C2CD',
    fontSize: 9,
  },
  gwEmptyChip: {
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gwEmptyText: {
    color: '#D2C2CD',
    fontSize: 11,
    fontStyle: 'italic',
  },
  actionSheetOption: {
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#4A0E52',
    padding: 13,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  switchOptionBadge: {
    backgroundColor: Colors.brandTeal,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captainOptionBadge: {
    backgroundColor: Colors.brandTeal,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captainOptionLetter: {
    color: Colors.brandPurple,
    fontSize: 14,
    fontWeight: '900',
  },
  vcOptionBadge: {
    backgroundColor: Colors.tertiary,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vcOptionLetter: {
    color: Colors.brandPurple,
    fontSize: 12,
    fontWeight: '900',
  },
  actionSheetText: {
    color: Colors.white,
    fontSize: 14,
  },
  actionSheetCancel: {
    padding: 10,
    alignItems: 'center',
    marginTop: 2,
  },
  actionSheetCancelText: {
    color: Colors.onSurfaceVariant,
    fontSize: 15,
  },

  // Replacement Picker Modal
  pickerRoot: {
    flex: 1,
    backgroundColor: Colors.brandPurple,
  },
  pickerHeader: {
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  pickerTitle: {
    color: Colors.white,
    fontSize: 18,
  },
  pickerSub: {
    color: Colors.onSurfaceVariant,
    fontSize: 12,
  },
  pickerSearchRow: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
  },
  searchInput: {
    backgroundColor: '#1E0021',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: Radii.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Colors.white,
    fontSize: 14,
  },
  sortBar: {
    paddingHorizontal: Spacing.md,
    paddingBottom: 8,
    gap: 8,
  },
  sortBtn: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: Radii.default,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  sortBtnActive: {
    backgroundColor: Colors.brandTeal,
  },
  sortBtnText: {
    color: Colors.white,
    fontSize: 12,
  },
  pickerListContent: {
    paddingHorizontal: Spacing.md,
    paddingBottom: 24,
    gap: 8,
  },
  pickerItem: {
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.brandPurpleMid,
    padding: 10,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  pickerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2A0730',
  },
  pickerInfo: {
    flex: 1,
    marginHorizontal: 10,
  },
  pickerItemName: {
    color: Colors.white,
    fontSize: 15,
  },
  pickerItemMeta: {
    color: Colors.onSurfaceVariant,
    fontSize: 11,
  },
  replacementPriceCol: {
    alignItems: 'flex-end',
  },
  replacementPrice: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  costDiffText: {
    fontSize: 11,
    fontWeight: '700',
  },
  costUp: {
    color: Colors.error,
  },
  costDown: {
    color: Colors.brandTeal,
  },

  // ── Points View Styles ──
  pointsGwSelectorRow: {
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    marginBottom: 12,
  },
  gwArrowBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gwTitleBadge: {
    alignItems: 'center',
    gap: 2,
  },
  pointsGwTitleText: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: '700',
  },
  pointsGwSubText: {
    color: Colors.brandTeal,
    fontSize: 11,
    letterSpacing: 0.5,
  },
  pointsHeroStatsRow: {
    gap: 10,
  },
  pointsHeroCard: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: Radii.xl,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
  },
  pointsHeroCardMain: {
    backgroundColor: 'rgba(0, 255, 135, 0.08)',
    borderColor: 'rgba(0, 255, 135, 0.25)',
  },
  pointsHeroLabel: {
    color: Colors.onSurfaceVariant,
    fontSize: 11,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  pointsHeroMainVal: {
    color: Colors.brandTeal,
    fontSize: 36,
    fontWeight: '800',
    lineHeight: 40,
  },
  pointsHeroBenchVal: {
    color: Colors.white,
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 34,
  },
  pointsHeroSubText: {
    color: Colors.onSurfaceVariant,
    fontSize: 10,
    marginTop: 4,
  },

  // ── Card Badges ──
  pointsBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radii.default,
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 46,
  },
  pointsBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  priceTagBadge: {
    backgroundColor: 'rgba(0, 255, 135, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 135, 0.35)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radii.default,
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  priceTagText: {
    color: Colors.brandTeal,
    fontSize: 10,
    fontWeight: '700',
  },
  newStagedBadge: {
    position: 'absolute',
    top: -6,
    left: -6,
    backgroundColor: Colors.brandTeal,
    borderRadius: Radii.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
    zIndex: 10,
    elevation: 4,
  },
  newStagedText: {
    color: Colors.brandPurple,
    fontSize: 9,
    fontWeight: '800',
  },
  pitchCardStagedGlow: {
    borderColor: Colors.brandTeal,
    borderWidth: 2,
    shadowColor: Colors.brandTeal,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
  },
  transfersInstructionBanner: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(0, 255, 135, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 135, 0.2)',
    borderRadius: Radii.lg,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  transfersInstructionText: {
    color: Colors.brandTeal,
    fontSize: 12,
    flex: 1,
  },
});
