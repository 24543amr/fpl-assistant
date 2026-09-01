/**
 * FPL Assistant – Complete Squad Management & Transfers Screen
 *
 * Screen A: My Squad (Starting XI pitch, bench, captain/vice-captain, formation validation, lineup save)
 * Screen B: Transfers (Free transfers, bank budget, replacement picker, staging transfers, real submission)
 */

import React, { useState, useCallback, useMemo } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';

import { Colors, Radii, Spacing } from '@/constants/theme';
import { getSavedTeamId, getStoredTeamId, setSavedPicks, getStoredFplToken, clearStoredFplToken } from '@/utils/storage';
import {
  fetchBootstrap,
  fetchUserEntry,
  fetchUserPicks,
  fetchMyTeamSquad,
  saveLineupToServer,
  submitFplTransfer,
  FPLPick,
  FPLPlayer,
  FPLUserEntry,
  FPLTransfersInfo,
} from '@/api/fpl';

const { width: SCREEN_W } = Dimensions.get('window');

type ScreenTab = 'squad' | 'transfers';

const POSITION_NAMES: Record<number, string> = {
  1: 'GKP',
  2: 'DEF',
  3: 'MID',
  4: 'FWD',
};

const POSITION_SHORT: Record<number, string> = {
  1: 'GK',
  2: 'DEF',
  3: 'MID',
  4: 'FWD',
};

interface StagedTransfer {
  element_out: FPLPlayer;
  element_in: FPLPlayer;
  purchase_price: number;
  selling_price: number;
  pickIndex: number;
}

export default function SquadScreen() {
  const router = useRouter();

  // Active Screen Tab: 'squad' (Screen A) or 'transfers' (Screen B)
  const [activeTab, setActiveTab] = useState<ScreenTab>('squad');

  // Language state
  const [isArabic, setIsArabic] = useState(false);

  // Data & loading state
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingLineup, setIsSavingLineup] = useState(false);
  const [isSubmittingTransfers, setIsSubmittingTransfers] = useState(false);
  const [hasFplSession, setHasFplSession] = useState(false);

  const [entry, setEntry] = useState<FPLUserEntry | null>(null);
  const [picks, setPicks] = useState<FPLPick[]>([]);
  const [transfersInfo, setTransfersInfo] = useState<FPLTransfersInfo | null>(null);
  const [allElementsList, setAllElementsList] = useState<FPLPlayer[]>([]);
  const [elementsMap, setElementsMap] = useState<Map<number, FPLPlayer>>(new Map());
  const [teamsMap, setTeamsMap] = useState<Map<number, string>>(new Map());
  const [currentGw, setCurrentGw] = useState(1);

  // Screen A (Squad) state
  const [selectedPickIndex, setSelectedPickIndex] = useState<number | null>(null);
  const [actionMenuPick, setActionMenuPick] = useState<{ pick: FPLPick; index: number } | null>(null);
  const [hasLineupChanges, setHasLineupChanges] = useState(false);

  // Screen B (Transfers) state
  const [stagedTransfers, setStagedTransfers] = useState<StagedTransfer[]>([]);
  const [transferPickerPick, setTransferPickerPick] = useState<{ pick: FPLPick; index: number } | null>(null);
  const [pickerSearchQuery, setPickerSearchQuery] = useState('');
  const [pickerSortBy, setPickerSortBy] = useState<'points' | 'form' | 'cost'>('points');

  // Load team picks on focus
  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      async function loadSquadData() {
        setIsLoading(true);
        try {
          const teamId = await getStoredTeamId();
          const tokens = await getStoredFplToken();
          const accessToken = tokens?.accessToken || null;
          setHasFplSession(!!accessToken);

          if (!teamId) throw new Error('No connected Team ID.');
          console.log(`[Squad Screen] Loading squad | Team ID: ${teamId} | Session Active: ${!!accessToken}`);

          const [bootstrap, userEntry] = await Promise.all([
            fetchBootstrap(),
            fetchUserEntry(teamId),
          ]);

          const pMap = new Map<number, FPLPlayer>();
          bootstrap.elements.forEach((p) => pMap.set(p.id, p));

          const tMap = new Map<number, string>();
          (bootstrap as any).teams?.forEach((t: any) => tMap.set(t.id, t.short_name || t.name));

          const resolvedGw = bootstrap.events?.find((e: any) => e.is_current)?.id
            || bootstrap.events?.find((e: any) => e.is_next)?.id
            || userEntry.current_event
            || 1;

          setCurrentGw(resolvedGw);
          setElementsMap(pMap);
          setTeamsMap(tMap);
          setAllElementsList(bootstrap.elements);

          let userPicks: FPLPick[] = [];
          let tInfo: FPLTransfersInfo | null = null;

          if (accessToken) {
            try {
              console.log('[Squad Screen] Fetching live squad from authenticated my-team endpoint...');
              const squadData = await fetchMyTeamSquad(teamId, accessToken, pMap);
              userPicks = squadData.picks;
              tInfo = squadData.transfers || null;
            } catch (err: any) {
              console.warn('[Squad Screen] my-team endpoint failed, fallback to GW picks:', err.message);
              userPicks = await fetchUserPicks(teamId, resolvedGw, pMap).catch(() => []);
            }
          } else {
            console.log('[Squad Screen] Read-only session — fetching public GW picks...');
            userPicks = await fetchUserPicks(teamId, resolvedGw, pMap).catch(() => []);
          }

          if (isMounted) {
            setEntry(userEntry);
            setPicks(userPicks);
            setTransfersInfo(tInfo);
            setStagedTransfers([]);
            setHasLineupChanges(false);
            setIsLoading(false);
          }
        } catch (e: any) {
          console.error('[Squad Screen] Load error:', e.message);
          if (isMounted) setIsLoading(false);
        }
      }

      loadSquadData();
      return () => { isMounted = false; };
    }, [])
  );

  // Helper: Refresh live squad state from server
  const refreshSquadFromServer = async () => {
    try {
      const teamId = await getStoredTeamId();
      const tokens = await getStoredFplToken();
      if (!teamId) return;

      if (tokens?.accessToken) {
        const squadData = await fetchMyTeamSquad(teamId, tokens.accessToken, elementsMap);
        setPicks(squadData.picks);
        setTransfersInfo(squadData.transfers || null);
        setSavedPicks(teamId, squadData.picks);
      } else {
        const userPicks = await fetchUserPicks(teamId, currentGw, elementsMap).catch(() => []);
        if (userPicks.length > 0) setPicks(userPicks);
      }
    } catch (e) {
      console.warn('[Squad Screen] Refresh error:', e);
    }
  };

  // ── SCREEN A: FORMATION VALIDATION & LINEUP LOGIC ─────────────────────────────

  // Validate starting XI formation (1 GK, at least 3 DEF, at least 2 MID, at least 1 FWD)
  const validateFormation = (candidatePicks: FPLPick[]): boolean => {
    const starters = candidatePicks.slice(0, 11);
    const gks = starters.filter(p => p.player?.element_type === 1).length;
    const defs = starters.filter(p => p.player?.element_type === 2).length;
    const mids = starters.filter(p => p.player?.element_type === 3).length;
    const fwds = starters.filter(p => p.player?.element_type === 4).length;

    return gks === 1 && defs >= 3 && defs <= 5 && mids >= 2 && mids <= 5 && fwds >= 1 && fwds <= 3;
  };

  // Handle Player Selection / Substitution Swap
  const handlePlayerPress = (index: number) => {
    if (selectedPickIndex === null) {
      setSelectedPickIndex(index);
    } else if (selectedPickIndex === index) {
      setSelectedPickIndex(null);
    } else {
      // Create candidate swap
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
          isArabic ? 'سجل الدخول بحسابك في FPL لحفظ التعديلات.' : 'Log in with your FPL account to save lineup changes.'
        );
        setIsSavingLineup(false);
        return;
      }

      console.log(`[Squad Screen] Saving lineup for Team ${teamId}...`);
      const result = await saveLineupToServer(teamId, picks, tokens.accessToken, tokens.csrfToken);

      if (result.success) {
        Alert.alert(
          isArabic ? 'تم الحفظ بنجاح! 🎉' : 'Lineup Saved! 🎉',
          isArabic ? 'تم حفظ التشكيلة والكابتن بنجاح في حسابك بـ FPL.' : 'Your lineup and captain choices have been saved to your official FPL account!'
        );
        setHasLineupChanges(false);
        await refreshSquadFromServer();
      } else {
        Alert.alert(
          isArabic ? 'فشل الحفظ' : 'Save Failed',
          result.message || 'Could not update lineup on FPL servers.'
        );
      }
    } catch (e: any) {
      Alert.alert(isArabic ? 'خطأ' : 'Error', e?.message || 'Could not save lineup.');
    } finally {
      setIsSavingLineup(false);
    }
  };

  // ── SCREEN B: TRANSFERS LOGIC ──────────────────────────────────────────────────

  // Remaining Bank calculation incorporating staged transfers
  const calculatedBank = useMemo(() => {
    const baseBank = transfersInfo?.bank ?? 0;
    const diff = stagedTransfers.reduce((acc, t) => {
      return acc + (t.selling_price - t.purchase_price);
    }, 0);
    return Math.max(0, baseBank + diff);
  }, [transfersInfo, stagedTransfers]);

  // Number of free transfers available
  const freeTransfersLimit = transfersInfo?.limit ?? 1;

  // Additional transfer points cost (-4 per extra transfer beyond free limit)
  const transferCostPoints = useMemo(() => {
    const extra = Math.max(0, stagedTransfers.length - freeTransfersLimit);
    return extra * 4;
  }, [stagedTransfers.length, freeTransfersLimit]);

  // Stage a replacement transfer
  const handleStageReplacement = (newPlayer: FPLPlayer) => {
    if (!transferPickerPick || !transferPickerPick.pick.player) return;

    const outgoing = transferPickerPick.pick.player;
    const index = transferPickerPick.index;

    // Check if new player is already in squad
    if (picks.some((p, idx) => idx !== index && p.element === newPlayer.id)) {
      Alert.alert(isArabic ? 'تنبيه' : 'Already in Squad', `${newPlayer.web_name} is already in your squad.`);
      return;
    }

    // Check bank budget
    const sellingPrice = transferPickerPick.pick.selling_price || outgoing.now_cost;
    const purchasePrice = newPlayer.now_cost;
    const costDiff = purchasePrice - sellingPrice;

    if (costDiff > calculatedBank) {
      Alert.alert(
        isArabic ? 'ميزانية غير كافية' : 'Insufficient Funds',
        `You need £${(costDiff / 10).toFixed(1)}m but only have £${(calculatedBank / 10).toFixed(1)}m in your bank.`
      );
      return;
    }

    // Stage the transfer
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

  // Cancel a staged transfer
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

  // Submit Staged Transfers to FPL
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
        csrfToken: tokens.csrfToken,
      });

      if (res.requiresReauth) {
        await clearStoredFplToken();
        setHasFplSession(false);
        Alert.alert(isArabic ? 'انتهت الجلسة' : 'Session Expired', res.message);
        router.push('/connect-team');
        return;
      }

      Alert.alert(
        isArabic ? 'تم الانتقال بنجاح! 🎉' : 'Transfers Submitted! 🎉',
        res.message || 'Your transfers have been confirmed on your official FPL account!'
      );

      setStagedTransfers([]);
      await refreshSquadFromServer();
    } catch (err: any) {
      Alert.alert(isArabic ? 'فشل الانتقال' : 'Transfer Error', err?.message || 'Could not submit transfer.');
    } finally {
      setIsSubmittingTransfers(false);
    }
  };

  // Filtered replacement list for the Replacement Picker Modal
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

  // Render Starters (1-11) and Bench (12-15)
  const starters = picks.slice(0, 11);
  const bench = picks.slice(11, 15);

  const gks = starters.filter(p => p.player?.element_type === 1);
  const defs = starters.filter(p => p.player?.element_type === 2);
  const mids = starters.filter(p => p.player?.element_type === 3);
  const fwds = starters.filter(p => p.player?.element_type === 4);

  return (
    <View style={styles.root}>
      {/* ── Fixed Header ── */}
      <SafeAreaView edges={['top']} style={styles.headerSafeArea}>
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>{isArabic ? 'تشكيلتي وانتقالاتي' : 'My Squad & Transfers'}</Text>
            <Text style={styles.headerSub}>
              {entry?.name ? `${entry.name} (#${getSavedTeamId()})` : `Team #${getSavedTeamId()}`}
            </Text>
          </View>

          <TouchableOpacity style={styles.langToggle} onPress={() => setIsArabic(!isArabic)}>
            <Text style={styles.langText}>{isArabic ? 'EN' : 'عربي'}</Text>
          </TouchableOpacity>
        </View>

        {/* ── Segmented Control Bar (My Squad | Transfers) ── */}
        <View style={styles.segmentedControl}>
          <TouchableOpacity
            style={[styles.segmentBtn, activeTab === 'squad' && styles.segmentBtnActive]}
            onPress={() => setActiveTab('squad')}
          >
            <MaterialIcons
              name="sports-soccer"
              size={18}
              color={activeTab === 'squad' ? Colors.brandPurple : Colors.onSurfaceVariant}
            />
            <Text style={[styles.segmentText, activeTab === 'squad' && styles.segmentTextActive]}>
              {isArabic ? 'التشكيلة' : 'My Squad'}
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
            <Text style={[styles.segmentText, activeTab === 'transfers' && styles.segmentTextActive]}>
              {isArabic ? 'الانتقالات' : 'Transfers'}
              {stagedTransfers.length > 0 ? ` (${stagedTransfers.length})` : ''}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* ── Main Screen Body ── */}
      {isLoading ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={Colors.brandTeal} />
          <Text style={styles.loadingText}>
            {isArabic ? 'جاري تحميل التشكيلة المباشرة...' : 'Loading live squad from FPL...'}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {!hasFplSession && (
            <View style={styles.readOnlyBanner}>
              <MaterialIcons name="info" size={18} color={Colors.brandTeal} />
              <Text style={styles.readOnlyText}>
                {isArabic
                  ? 'أنت تتصفح التشكيلة بوضع القراءة فقط. سجل الدخول بـ FPL لحفظ الكابتن وإجراء الانتقالات.'
                  : 'Read-only mode. Log in with FPL OAuth to save captain & make live transfers.'}
              </Text>
            </View>
          )}

          {/* ═════════════════════════════════════════════════════════════════════ */}
          {/* SCREEN A: MY SQUAD                                                    */}
          {/* ═════════════════════════════════════════════════════════════════════ */}
          {activeTab === 'squad' && (
            <>
              {/* Pitch Header */}
              <View style={styles.pitchHeader}>
                <MaterialCommunityIcons name="soccer-field" size={20} color={Colors.brandTeal} />
                <Text style={styles.pitchTitle}>
                  {isArabic ? `تشكيلة الجولة ${currentGw}` : `Gameweek ${currentGw} Formation`} ({defs.length}-{mids.length}-{fwds.length})
                </Text>
              </View>

              {/* Pitch Grid */}
              <View style={styles.pitchGrass}>
                {/* GKs */}
                <View style={styles.pitchRow}>
                  {gks.map(p => {
                    const idx = picks.indexOf(p);
                    return (
                      <PlayerCard
                        key={p.element}
                        pick={p}
                        isSelected={selectedPickIndex === idx}
                        onPress={() => handlePlayerPress(idx)}
                        onLongPress={() => setActionMenuPick({ pick: p, index: idx })}
                      />
                    );
                  })}
                </View>

                {/* DEFs */}
                <View style={styles.pitchRow}>
                  {defs.map(p => {
                    const idx = picks.indexOf(p);
                    return (
                      <PlayerCard
                        key={p.element}
                        pick={p}
                        isSelected={selectedPickIndex === idx}
                        onPress={() => handlePlayerPress(idx)}
                        onLongPress={() => setActionMenuPick({ pick: p, index: idx })}
                      />
                    );
                  })}
                </View>

                {/* MIDs */}
                <View style={styles.pitchRow}>
                  {mids.map(p => {
                    const idx = picks.indexOf(p);
                    return (
                      <PlayerCard
                        key={p.element}
                        pick={p}
                        isSelected={selectedPickIndex === idx}
                        onPress={() => handlePlayerPress(idx)}
                        onLongPress={() => setActionMenuPick({ pick: p, index: idx })}
                      />
                    );
                  })}
                </View>

                {/* FWDs */}
                <View style={styles.pitchRow}>
                  {fwds.map(p => {
                    const idx = picks.indexOf(p);
                    return (
                      <PlayerCard
                        key={p.element}
                        pick={p}
                        isSelected={selectedPickIndex === idx}
                        onPress={() => handlePlayerPress(idx)}
                        onLongPress={() => setActionMenuPick({ pick: p, index: idx })}
                      />
                    );
                  })}
                </View>
              </View>

              {/* Bench Row */}
              <View style={styles.benchContainer}>
                <Text style={styles.benchHeader}>{isArabic ? 'دكة البدلاء' : 'BENCH'}</Text>
                <View style={styles.benchRow}>
                  {bench.map(p => {
                    const idx = picks.indexOf(p);
                    return (
                      <PlayerCard
                        key={p.element}
                        pick={p}
                        isBench
                        isSelected={selectedPickIndex === idx}
                        onPress={() => handlePlayerPress(idx)}
                        onLongPress={() => setActionMenuPick({ pick: p, index: idx })}
                      />
                    );
                  })}
                </View>
              </View>

              {/* Save Lineup Button */}
              {hasLineupChanges && (
                <TouchableOpacity
                  style={styles.saveLineupBtn}
                  disabled={isSavingLineup}
                  onPress={handleSaveLineup}
                >
                  {isSavingLineup ? (
                    <ActivityIndicator color={Colors.brandPurple} />
                  ) : (
                    <Text style={styles.saveLineupText}>
                      {isArabic ? 'حفظ التعديلات في FPL' : 'Save Lineup Changes to FPL'}
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            </>
          )}

          {/* ═════════════════════════════════════════════════════════════════════ */}
          {/* SCREEN B: TRANSFERS                                                   */}
          {/* ═════════════════════════════════════════════════════════════════════ */}
          {activeTab === 'transfers' && (
            <>
              {/* Transfers Summary Bar */}
              <View style={styles.transferSummaryCard}>
                <View style={styles.transferSummaryItem}>
                  <Text style={styles.summaryLabel}>{isArabic ? 'الانتقالات المجانية' : 'Free Transfers'}</Text>
                  <Text style={styles.summaryValue}>{freeTransfersLimit}</Text>
                </View>

                <View style={styles.summaryDivider} />

                <View style={styles.transferSummaryItem}>
                  <Text style={styles.summaryLabel}>{isArabic ? 'الميزانية' : 'Bank'}</Text>
                  <Text style={styles.summaryValue}>£{(calculatedBank / 10).toFixed(1)}m</Text>
                </View>

                <View style={styles.summaryDivider} />

                <View style={styles.transferSummaryItem}>
                  <Text style={styles.summaryLabel}>{isArabic ? 'تكلفة النقاط' : 'Cost'}</Text>
                  <Text style={[styles.summaryValue, transferCostPoints > 0 && styles.costWarning]}>
                    -{transferCostPoints} pts
                  </Text>
                </View>
              </View>

              {/* Staged Transfers Banner */}
              {stagedTransfers.length > 0 && (
                <View style={styles.stagedBanner}>
                  <Text style={styles.stagedTitle}>
                    {isArabic
                      ? `تم تحديد ${stagedTransfers.length} انتقالات:`
                      : `Staged Transfers (${stagedTransfers.length}):`}
                  </Text>
                  {stagedTransfers.map((staged, i) => (
                    <View key={i} style={styles.stagedItemRow}>
                      <Text style={styles.stagedItemText}>
                        🔴 {staged.element_out.web_name} ➔ 🟢 {staged.element_in.web_name}
                      </Text>
                      <TouchableOpacity onPress={() => handleCancelStagedTransfer(staged)}>
                        <MaterialIcons name="close" size={18} color={Colors.error} />
                      </TouchableOpacity>
                    </View>
                  ))}

                  <TouchableOpacity
                    style={styles.confirmTransfersBtn}
                    disabled={isSubmittingTransfers}
                    onPress={handleConfirmTransfers}
                  >
                    {isSubmittingTransfers ? (
                      <ActivityIndicator color={Colors.brandPurple} />
                    ) : (
                      <Text style={styles.confirmTransfersText}>
                        {isArabic ? 'تأكيد الانتقالات في FPL' : 'Confirm Transfers on FPL'}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}

              {/* Squad List for Transfer Selection */}
              <Text style={styles.sectionHeader}>{isArabic ? 'اختر لاعباً للاستبدال:' : 'Select a player to replace:'}</Text>
              {picks.map((pick, index) => (
                <View key={pick.element} style={styles.transferPlayerRow}>
                  <View style={styles.transferPlayerInfo}>
                    <View style={styles.posBadge}>
                      <Text style={styles.posBadgeText}>{POSITION_SHORT[pick.player?.element_type || 1]}</Text>
                    </View>
                    <View>
                      <Text style={styles.transferPlayerName}>{pick.player?.web_name || 'Player'}</Text>
                      <Text style={styles.transferPlayerTeam}>
                        {teamsMap.get(pick.player?.team || 0) || 'FPL'} • £{((pick.player?.now_cost || 0) / 10).toFixed(1)}m
                      </Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={styles.replaceBtn}
                    onPress={() => setTransferPickerPick({ pick, index })}
                  >
                    <MaterialIcons name="swap-horiz" size={18} color={Colors.brandPurple} />
                    <Text style={styles.replaceBtnText}>{isArabic ? 'استبدال' : 'Replace'}</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </>
          )}
        </ScrollView>
      )}

      {/* ── ACTION MODAL: Captain / Vice-Captain / Swap Sheet ── */}
      <Modal visible={!!actionMenuPick} transparent animationType="fade" onRequestClose={() => setActionMenuPick(null)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setActionMenuPick(null)}>
          <View style={styles.actionSheet}>
            <Text style={styles.actionSheetTitle}>{actionMenuPick?.pick.player?.web_name}</Text>

            <TouchableOpacity style={styles.actionSheetOption} onPress={() => handleMakeCaptain(actionMenuPick!.index)}>
              <MaterialIcons name="star" size={20} color="#FFD700" />
              <Text style={styles.actionSheetText}>{isArabic ? 'تعيين كابتن (C)' : 'Make Captain (C)'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionSheetOption} onPress={() => handleMakeViceCaptain(actionMenuPick!.index)}>
              <MaterialIcons name="star-half" size={20} color="#C0C0C0" />
              <Text style={styles.actionSheetText}>{isArabic ? 'تعيين نائب كابتن (V)' : 'Make Vice-Captain (V)'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionSheetOption}
              onPress={() => {
                const idx = actionMenuPick!.index;
                setActionMenuPick(null);
                setSelectedPickIndex(idx);
              }}
            >
              <MaterialIcons name="swap-vert" size={20} color={Colors.brandTeal} />
              <Text style={styles.actionSheetText}>{isArabic ? 'تبديل اللاعب' : 'Substitute Player'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionSheetCancel} onPress={() => setActionMenuPick(null)}>
              <Text style={styles.actionSheetCancelText}>{isArabic ? 'إلغاء' : 'Cancel'}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── REPLACEMENT PICKER MODAL: Replacement Player Search ── */}
      <Modal visible={!!transferPickerPick} animationType="slide" onRequestClose={() => setTransferPickerPick(null)}>
        <SafeAreaView style={styles.pickerRoot} edges={['top', 'bottom']}>
          <View style={styles.pickerHeader}>
            <View>
              <Text style={styles.pickerTitle}>
                {isArabic ? 'اختر بديل لـ:' : 'Replace:'} {transferPickerPick?.pick.player?.web_name}
              </Text>
              <Text style={styles.pickerSub}>
                {POSITION_NAMES[transferPickerPick?.pick.player?.element_type || 1]} • Bank: £{(calculatedBank / 10).toFixed(1)}m
              </Text>
            </View>
            <TouchableOpacity onPress={() => setTransferPickerPick(null)}>
              <MaterialIcons name="close" size={26} color={Colors.onSurface} />
            </TouchableOpacity>
          </View>

          {/* Search & Sort Controls */}
          <View style={styles.pickerSearchRow}>
            <TextInput
              value={pickerSearchQuery}
              onChangeText={setPickerSearchQuery}
              placeholder={isArabic ? 'بحث باسم اللاعب...' : 'Search player name...'}
              placeholderTextColor={Colors.onSurfaceVariant}
              style={styles.searchInput}
            />
          </View>

          <View style={styles.sortBar}>
            <TouchableOpacity
              style={[styles.sortBtn, pickerSortBy === 'points' && styles.sortBtnActive]}
              onPress={() => setPickerSortBy('points')}
            >
              <Text style={styles.sortBtnText}>{isArabic ? 'النقاط' : 'Points'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.sortBtn, pickerSortBy === 'form' && styles.sortBtnActive]}
              onPress={() => setPickerSortBy('form')}
            >
              <Text style={styles.sortBtnText}>{isArabic ? 'التركيز/الفورمة' : 'Form'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.sortBtn, pickerSortBy === 'cost' && styles.sortBtnActive]}
              onPress={() => setPickerSortBy('cost')}
            >
              <Text style={styles.sortBtnText}>{isArabic ? 'السعر' : 'Price'}</Text>
            </TouchableOpacity>
          </View>

          {/* Available Replacement Players FlatList */}
          <FlatList
            data={availableReplacements}
            keyExtractor={item => String(item.id)}
            contentContainerStyle={styles.pickerListContent}
            renderItem={({ item }) => {
              const sellingPrice = transferPickerPick?.pick.selling_price || transferPickerPick?.pick.player?.now_cost || 0;
              const costDiff = item.now_cost - sellingPrice;
              const isAffordable = costDiff <= calculatedBank;

              return (
                <TouchableOpacity
                  style={[styles.replacementCard, !isAffordable && styles.replacementDisabled]}
                  disabled={!isAffordable}
                  onPress={() => handleStageReplacement(item)}
                >
                  <View>
                    <Text style={styles.replacementName}>{item.web_name}</Text>
                    <Text style={styles.replacementTeam}>
                      {teamsMap.get(item.team) || 'FPL'} • Points: {item.total_points} • Form: {item.form}
                    </Text>
                  </View>

                  <View style={styles.replacementPriceCol}>
                    <Text style={styles.replacementPrice}>£{(item.now_cost / 10).toFixed(1)}m</Text>
                    <Text style={[styles.costDiffText, costDiff > 0 ? styles.costUp : styles.costDown]}>
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

// ── SUB-COMPONENT: Pitch Player Card ──────────────────────────────────────────
function PlayerCard({
  pick,
  isBench = false,
  isSelected = false,
  onPress,
  onLongPress,
}: {
  pick: FPLPick;
  isBench?: boolean;
  isSelected?: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const name = pick.player?.web_name || 'Player';
  const points = pick.player?.total_points ?? 0;

  return (
    <TouchableOpacity
      style={[
        styles.cardRoot,
        isBench && styles.cardBench,
        isSelected && styles.cardSelected,
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.8}
    >
      <View style={styles.jerseyBadge}>
        <Text style={styles.jerseyText}>{POSITION_SHORT[pick.player?.element_type || 1]}</Text>
        {pick.is_captain && <View style={styles.captainBadge}><Text style={styles.badgeLetter}>C</Text></View>}
        {pick.is_vice_captain && <View style={styles.viceBadge}><Text style={styles.badgeLetter}>V</Text></View>}
      </View>

      <View style={styles.nameTag}>
        <Text style={styles.playerNameText} numberOfLines={1}>{name}</Text>
        <Text style={styles.playerPointsText}>{points} pts</Text>
      </View>
    </TouchableOpacity>
  );
}

// ── STYLES ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.brandPurple },
  headerSafeArea: { backgroundColor: Colors.brandPurple },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
  },
  headerTitle: { color: Colors.onSurface, fontSize: 24, fontFamily: 'ArchivoNarrow_700' },
  headerSub: { color: Colors.onSurfaceVariant, fontSize: 13 },
  langToggle: { padding: 8, backgroundColor: Colors.surface, borderRadius: Radii.default },
  langText: { color: Colors.brandTeal, fontWeight: '700', fontSize: 12 },

  // Segmented Control
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    marginHorizontal: Spacing.md,
    marginBottom: 8,
    borderRadius: Radii.lg,
    padding: 4,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: Radii.default,
  },
  segmentBtnActive: { backgroundColor: Colors.brandTeal },
  segmentText: { color: Colors.onSurfaceVariant, fontWeight: '700', fontSize: 13 },
  segmentTextActive: { color: Colors.brandPurple },

  loadingCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: Colors.onSurfaceVariant, fontSize: 14 },
  scrollContent: { paddingHorizontal: Spacing.md, paddingBottom: 40 },

  readOnlyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,255,135,0.1)',
    padding: 10,
    borderRadius: Radii.default,
    marginBottom: 12,
  },
  readOnlyText: { color: Colors.brandTeal, fontSize: 12, flex: 1, lineHeight: 16 },

  // Pitch Grid
  pitchHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  pitchTitle: { color: Colors.brandTeal, fontWeight: '700', fontSize: 14 },
  pitchGrass: {
    backgroundColor: '#005826',
    borderRadius: Radii.lg,
    paddingVertical: 16,
    gap: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  pitchRow: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center' },

  // Player Pitch Card
  cardRoot: { alignItems: 'center', width: (SCREEN_W - 60) / 4, maxWidth: 85 },
  cardBench: { opacity: 0.9 },
  cardSelected: { transform: [{ scale: 1.1 }], borderWidth: 2, borderColor: Colors.brandTeal, borderRadius: Radii.default },
  jerseyBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.brandPurple,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    borderWidth: 1,
    borderColor: Colors.brandTeal,
    position: 'relative',
  },
  jerseyText: { color: Colors.brandTeal, fontWeight: '800', fontSize: 11 },
  captainBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#FFD700', width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  viceBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#C0C0C0', width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  badgeLetter: { color: '#000', fontSize: 10, fontWeight: '900' },
  nameTag: { backgroundColor: 'rgba(0,0,0,0.75)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, alignItems: 'center', width: '100%' },
  playerNameText: { color: '#FFF', fontSize: 10, fontWeight: '700' },
  playerPointsText: { color: Colors.brandTeal, fontSize: 9, fontWeight: '600' },

  // Bench
  benchContainer: { marginTop: 14, backgroundColor: Colors.surface, padding: 12, borderRadius: Radii.lg },
  benchHeader: { color: Colors.onSurfaceVariant, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 8 },
  benchRow: { flexDirection: 'row', justifyContent: 'space-around' },

  saveLineupBtn: { backgroundColor: Colors.brandTeal, padding: 16, borderRadius: Radii.lg, alignItems: 'center', marginTop: 16 },
  saveLineupText: { color: Colors.brandPurple, fontWeight: '900', fontSize: 16 },

  // Transfers Screen B Styles
  transferSummaryCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Radii.lg,
    padding: 14,
    justifyContent: 'space-around',
    alignItems: 'center',
    marginBottom: 16,
  },
  transferSummaryItem: { alignItems: 'center' },
  summaryLabel: { color: Colors.onSurfaceVariant, fontSize: 11 },
  summaryValue: { color: Colors.brandTeal, fontSize: 18, fontWeight: '800', marginTop: 2 },
  costWarning: { color: Colors.error },
  summaryDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.1)' },

  stagedBanner: { backgroundColor: Colors.surface, padding: 14, borderRadius: Radii.lg, marginBottom: 16, gap: 8 },
  stagedTitle: { color: Colors.onSurface, fontWeight: '700', fontSize: 14 },
  stagedItemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.brandPurple, padding: 8, borderRadius: Radii.default },
  stagedItemText: { color: Colors.onSurface, fontSize: 13 },
  confirmTransfersBtn: { backgroundColor: Colors.brandTeal, padding: 14, borderRadius: Radii.default, alignItems: 'center', marginTop: 4 },
  confirmTransfersText: { color: Colors.brandPurple, fontWeight: '900', fontSize: 15 },

  sectionHeader: { color: Colors.onSurfaceVariant, fontSize: 13, fontWeight: '700', marginBottom: 8 },
  transferPlayerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: 12,
    borderRadius: Radii.default,
    marginBottom: 8,
  },
  transferPlayerInfo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  posBadge: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.brandPurple, alignItems: 'center', justifyContent: 'center' },
  posBadgeText: { color: Colors.brandTeal, fontSize: 10, fontWeight: '800' },
  transferPlayerName: { color: Colors.onSurface, fontSize: 15, fontWeight: '700' },
  transferPlayerTeam: { color: Colors.onSurfaceVariant, fontSize: 12 },
  replaceBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.brandTeal, paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radii.default },
  replaceBtnText: { color: Colors.brandPurple, fontWeight: '800', fontSize: 13 },

  // Action Sheet Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  actionSheet: { backgroundColor: Colors.surface, borderTopLeftRadius: Radii.lg, borderTopRightRadius: Radii.lg, padding: 20, gap: 12 },
  actionSheetTitle: { color: Colors.onSurface, fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 4 },
  actionSheetOption: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  actionSheetText: { color: Colors.onSurface, fontSize: 16, fontWeight: '600' },
  actionSheetCancel: { paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  actionSheetCancelText: { color: Colors.error, fontSize: 16, fontWeight: '700' },

  // Replacement Picker Modal
  pickerRoot: { flex: 1, backgroundColor: Colors.brandPurple },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: Colors.surface },
  pickerTitle: { color: Colors.onSurface, fontSize: 18, fontWeight: '800' },
  pickerSub: { color: Colors.brandTeal, fontSize: 12, marginTop: 2 },
  pickerSearchRow: { padding: 14 },
  searchInput: { backgroundColor: Colors.surface, height: 46, borderRadius: Radii.default, paddingHorizontal: 14, color: Colors.onSurface, fontSize: 15 },
  sortBar: { flexDirection: 'row', paddingHorizontal: 14, gap: 8, marginBottom: 10 },
  sortBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', backgroundColor: Colors.surface, borderRadius: Radii.default },
  sortBtnActive: { backgroundColor: Colors.brandTeal },
  sortBtnText: { color: Colors.onSurface, fontSize: 12, fontWeight: '700' },
  pickerListContent: { paddingHorizontal: 14, paddingBottom: 30 },
  replacementCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.surface, padding: 14, borderRadius: Radii.default, marginBottom: 8 },
  replacementDisabled: { opacity: 0.4 },
  replacementName: { color: Colors.onSurface, fontSize: 16, fontWeight: '700' },
  replacementTeam: { color: Colors.onSurfaceVariant, fontSize: 12, marginTop: 2 },
  replacementPriceCol: { alignItems: 'flex-end' },
  replacementPrice: { color: Colors.brandTeal, fontSize: 16, fontWeight: '800' },
  costDiffText: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  costUp: { color: Colors.error },
  costDown: { color: Colors.brandTeal },
});
