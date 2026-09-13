import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Image,
  TextInput,
  ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import {
  FPLPick,
  FPLPlayer,
  getPlayerPhotoUrl,
  DEFAULT_TEAMS_MAP,
  FPLFixture,
  getTeamNextGwFixtures,
} from '@/api/fpl';

export interface TransferComparisonModalProps {
  visible: boolean;
  outgoingPick: { pick: FPLPick; index: number } | null;
  allElements: FPLPlayer[];
  currentSquadPicks: FPLPick[];
  teamsMap: Map<number, string>;
  fixtures: FPLFixture[];
  targetGw: number;
  currentBank: number; // in £0.1m units (e.g. 10 = £1.0m)
  isArabic: boolean;
  onStageTransfer: (newPlayer: FPLPlayer) => void;
  onClose: () => void;
}

type SortOption = 'form' | 'points' | 'price' | 'fdr';

export default function TransferComparisonModal({
  visible,
  outgoingPick,
  allElements,
  currentSquadPicks,
  teamsMap,
  fixtures,
  targetGw,
  currentBank,
  isArabic,
  onStageTransfer,
  onClose,
}: TransferComparisonModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('form');

  if (!outgoingPick || !outgoingPick.pick.player) return null;

  const outgoingPlayer = outgoingPick.pick.player;
  const sellingPrice = outgoingPick.pick.selling_price || outgoingPlayer.now_cost;
  const targetElementType = outgoingPlayer.element_type;

  const outTeamName = teamsMap.get(outgoingPlayer.team) || DEFAULT_TEAMS_MAP.get(outgoingPlayer.team) || 'PL';
  const outNextFixtures = getTeamNextGwFixtures(outgoingPlayer.team, fixtures, targetGw, teamsMap);
  const outPrimaryFixture = outNextFixtures[0];
  const outFdr = outPrimaryFixture?.difficulty || 3;
  const outFdrColor = outFdr <= 2 ? '#34ff8c' : outFdr === 3 ? '#f6c343' : '#ffb4ab';

  // Filter & Sort Candidates
  const squadElementIds = new Set(currentSquadPicks.map(p => p.element));
  const candidates = useMemo(() => {
    let list = allElements.filter(
      p => p.element_type === targetElementType && !squadElementIds.has(p.id)
    );

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        p =>
          p.web_name.toLowerCase().includes(q) ||
          p.first_name.toLowerCase().includes(q) ||
          p.second_name.toLowerCase().includes(q)
      );
    }

    if (sortBy === 'form') {
      list.sort((a, b) => parseFloat(b.form || '0') - parseFloat(a.form || '0'));
    } else if (sortBy === 'points') {
      list.sort((a, b) => (b.total_points || 0) - (a.total_points || 0));
    } else if (sortBy === 'price') {
      list.sort((a, b) => (b.now_cost || 0) - (a.now_cost || 0));
    } else if (sortBy === 'fdr') {
      list.sort((a, b) => {
        const fdrA = getTeamNextGwFixtures(a.team, fixtures, targetGw, teamsMap)[0]?.difficulty || 3;
        const fdrB = getTeamNextGwFixtures(b.team, fixtures, targetGw, teamsMap)[0]?.difficulty || 3;
        return fdrA - fdrB;
      });
    }

    return list.slice(0, 50); // limit to top 50 for smooth rendering
  }, [allElements, targetElementType, squadElementIds, searchQuery, sortBy, fixtures, targetGw, teamsMap]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.scrim}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
        />

        <View style={styles.sheet}>
          {/* Grab Notch */}
          <View style={styles.grabNotch} />

          {/* Header Row */}
          <View style={styles.sheetHeaderRow}>
            <View style={styles.sheetHeaderTitleGroup}>
              <MaterialIcons name="sync-alt" size={20} color="#f6aff2" />
              <Text style={styles.sheetTitle}>
                {isArabic ? 'مركز تبديل اللاعبين' : 'PLAYER SWAP HUB'}
              </Text>
            </View>
            <View style={styles.liveAuditPill}>
              <Text style={styles.liveAuditText}>LIVE AUDIT</Text>
            </View>
          </View>

          <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
            {/* SECTION 1: SELLING PLAYER (OUT) */}
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionBadgeGroup}>
                <View style={[styles.badgePill, { backgroundColor: 'rgba(147, 0, 10, 0.7)' }]}>
                  <Text style={[styles.badgePillText, { color: '#ffb4ab' }]}>OUT</Text>
                </View>
                <Text style={styles.sectionTitleText}>
                  {isArabic ? 'اللاعب المغادر' : 'SELLING PLAYER'}
                </Text>
              </View>
              <Text style={styles.sectionSubtitle}>
                {isArabic ? 'تم اختياره من التشكيلة' : 'Selected from Pitch'}
              </Text>
            </View>

            {/* Outgoing Player Card */}
            <View style={styles.outCard}>
              <View style={styles.cardLeft}>
                <Image
                  source={{ uri: getPlayerPhotoUrl(outgoingPlayer, outgoingPlayer.id) }}
                  style={styles.cardAvatar}
                />
                <View style={styles.cardMeta}>
                  <View style={styles.nameRow}>
                    <Text style={styles.cardPlayerName} numberOfLines={1}>
                      {outgoingPlayer.web_name}
                    </Text>
                    <View style={styles.posPillSmall}>
                      <Text style={styles.posPillSmallText}>
                        {outgoingPlayer.element_type === 1 ? 'GK' : outgoingPlayer.element_type === 2 ? 'DEF' : outgoingPlayer.element_type === 3 ? 'MID' : 'FWD'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.cardSubText}>
                    £{(sellingPrice / 10).toFixed(1)}m | {outTeamName}
                  </Text>
                </View>
              </View>

              <View style={styles.cardRight}>
                <View style={styles.statMiniCol}>
                  <Text style={styles.statMiniLabel}>Form / Pts</Text>
                  <Text style={styles.statMiniVal}>
                    <Text style={{ color: '#34ff8c' }}>{outgoingPlayer.form}</Text> / {outgoingPlayer.total_points}
                  </Text>
                </View>
                <View style={styles.fixtureBadgeMini}>
                  <Text style={styles.fixtureMiniLabel}>Next</Text>
                  <View style={styles.fixtureMiniRow}>
                    <Text style={styles.fixtureMiniText}>
                      {outPrimaryFixture ? outPrimaryFixture.opponentCode : '-'}
                    </Text>
                    <View style={[styles.fdrDotMini, { backgroundColor: outFdrColor }]} />
                  </View>
                </View>
              </View>
            </View>

            {/* SECTION 2: REPLACEMENT OPTIONS (IN) */}
            <View style={[styles.sectionHeaderRow, { marginTop: 14 }]}>
              <View style={styles.sectionBadgeGroup}>
                <View style={[styles.badgePill, { backgroundColor: 'rgba(52, 255, 140, 0.2)' }]}>
                  <Text style={[styles.badgePillText, { color: '#34ff8c' }]}>IN</Text>
                </View>
                <Text style={styles.sectionTitleText}>
                  {isArabic ? 'خيارات الاستبدال' : 'REPLACEMENT OPTIONS'}
                </Text>
              </View>
              <Text style={styles.candidatesCountText}>
                {candidates.length} {isArabic ? 'مرشح' : 'Candidates'}
              </Text>
            </View>

            {/* Search Box */}
            <View style={styles.searchBox}>
              <MaterialIcons name="search" size={18} color="#9b8d97" />
              <TextInput
                style={styles.searchInput}
                placeholder={isArabic ? 'بحث بالاسم...' : 'Search by player name...'}
                placeholderTextColor="#9b8d97"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {!!searchQuery && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <MaterialIcons name="close" size={16} color="#9b8d97" />
                </TouchableOpacity>
              )}
            </View>

            {/* Sorting Filter Chips */}
            <View style={styles.sortChipsRow}>
              <TouchableOpacity
                style={[styles.sortChip, sortBy === 'form' && styles.sortChipActive]}
                onPress={() => setSortBy('form')}
              >
                <Text style={[styles.sortChipText, sortBy === 'form' && styles.sortChipTextActive]}>
                  {isArabic ? 'الفورم' : 'Form'}
                </Text>
                {sortBy === 'form' && (
                  <MaterialIcons name="arrow-downward" size={12} color="#002022" />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.sortChip, sortBy === 'points' && styles.sortChipActive]}
                onPress={() => setSortBy('points')}
              >
                <Text style={[styles.sortChipText, sortBy === 'points' && styles.sortChipTextActive]}>
                  {isArabic ? 'النقاط' : 'Points'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.sortChip, sortBy === 'price' && styles.sortChipActive]}
                onPress={() => setSortBy('price')}
              >
                <Text style={[styles.sortChipText, sortBy === 'price' && styles.sortChipTextActive]}>
                  {isArabic ? 'السعر' : 'Price'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.sortChip, sortBy === 'fdr' && styles.sortChipActive]}
                onPress={() => setSortBy('fdr')}
              >
                <Text style={[styles.sortChipText, sortBy === 'fdr' && styles.sortChipTextActive]}>
                  {isArabic ? 'سهولة المباريات' : 'Fix FDR'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Candidates Stack */}
            <View style={styles.candidatesList}>
              {candidates.map(candidate => {
                const costDiff = candidate.now_cost - sellingPrice;
                const isOverBudget = costDiff > currentBank;
                const bankDeltaStr = costDiff <= 0
                  ? `+£${(Math.abs(costDiff) / 10).toFixed(1)}m Bank`
                  : `-£${(costDiff / 10).toFixed(1)}m Bank`;

                const candTeam = teamsMap.get(candidate.team) || DEFAULT_TEAMS_MAP.get(candidate.team) || 'PL';
                const candFixtures = getTeamNextGwFixtures(candidate.team, fixtures, targetGw, teamsMap);
                const candPrimaryFix = candFixtures[0];
                const candFdr = candPrimaryFix?.difficulty || 3;
                const candFdrColor = candFdr <= 2 ? '#34ff8c' : candFdr === 3 ? '#f6c343' : '#ffb4ab';

                return (
                  <View
                    key={candidate.id}
                    style={[styles.candidateCard, isOverBudget && styles.candidateCardDisabled]}
                  >
                    <View style={styles.candidateTopRow}>
                      <View style={styles.candLeftGroup}>
                        <Image
                          source={{ uri: getPlayerPhotoUrl(candidate, candidate.id) }}
                          style={[styles.candAvatar, isOverBudget && { opacity: 0.6 }]}
                        />
                        <View style={styles.candMeta}>
                          <View style={styles.candNameRow}>
                            <Text style={styles.candNameText} numberOfLines={1}>
                              {candidate.web_name}
                            </Text>
                            {isOverBudget ? (
                              <View style={styles.overBudgetPill}>
                                <Text style={styles.overBudgetText}>
                                  £{((costDiff - currentBank) / 10).toFixed(1)}m over budget
                                </Text>
                              </View>
                            ) : (
                              <View style={styles.bankDeltaPill}>
                                <Text style={styles.bankDeltaText}>{bankDeltaStr}</Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.candPriceText}>
                            £{(candidate.now_cost / 10).toFixed(1)}m | {candTeam}
                          </Text>
                        </View>
                      </View>

                      {/* Stage Button */}
                      <TouchableOpacity
                        style={[styles.stageBtn, isOverBudget && styles.stageBtnDisabled]}
                        disabled={isOverBudget}
                        onPress={() => onStageTransfer(candidate)}
                        activeOpacity={0.8}
                      >
                        <MaterialIcons
                          name={isOverBudget ? 'block' : 'add-circle'}
                          size={15}
                          color={isOverBudget ? '#9b8d97' : '#002022'}
                        />
                        <Text style={[styles.stageBtnText, isOverBudget && { color: '#9b8d97' }]}>
                          {isArabic ? 'اختيار' : 'Stage'}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* Micro Analytics Row */}
                    <View style={styles.candidateAnalyticsRow}>
                      <View style={styles.analyticsGroup}>
                        <Text style={styles.analyticsLabel}>Form:</Text>
                        <Text style={[styles.analyticsVal, { color: '#34ff8c' }]}>{candidate.form}</Text>
                        <Text style={[styles.analyticsLabel, { marginLeft: 8 }]}>Pts:</Text>
                        <Text style={styles.analyticsVal}>{candidate.total_points}</Text>
                      </View>
                      <View style={styles.candFixGroup}>
                        <Text style={styles.candFixLabel}>Next:</Text>
                        <Text style={styles.candFixText}>
                          {candPrimaryFix ? `${candPrimaryFix.opponentCode} (${candPrimaryFix.isHome ? 'H' : 'A'})` : '-'}
                        </Text>
                        <View style={[styles.fdrDotMini, { backgroundColor: candFdrColor }]} />
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>

          {/* Close Button */}
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.8}>
            <Text style={styles.closeBtnText}>{isArabic ? 'إغلاق' : 'Close'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(12, 15, 15, 0.85)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#181a1b',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 24,
    maxHeight: '88%',
  },
  grabNotch: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignSelf: 'center',
    marginBottom: 10,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sheetHeaderTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sheetTitle: {
    color: '#e2e2e2',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  liveAuditPill: {
    backgroundColor: '#37003c',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  liveAuditText: {
    color: '#f6aff2',
    fontSize: 9.5,
    fontWeight: '800',
  },
  scrollArea: {
    maxHeight: 520,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  sectionBadgeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  badgePill: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  badgePillText: {
    fontSize: 10,
    fontWeight: '900',
  },
  sectionTitleText: {
    color: '#d2c2cd',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  sectionSubtitle: {
    color: '#9b8d97',
    fontSize: 10,
  },
  candidatesCountText: {
    color: '#00dbe9',
    fontSize: 11,
    fontWeight: '700',
  },
  outCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#202223',
    borderRadius: 14,
    padding: 10,
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  cardAvatar: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#282a2b',
  },
  cardMeta: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardPlayerName: {
    color: '#e2e2e2',
    fontSize: 15,
    fontWeight: '800',
  },
  posPillSmall: {
    backgroundColor: '#282a2b',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  posPillSmallText: {
    color: '#d2c2cd',
    fontSize: 9,
    fontWeight: '700',
  },
  cardSubText: {
    color: '#9b8d97',
    fontSize: 11,
    marginTop: 2,
  },
  cardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statMiniCol: {
    alignItems: 'flex-end',
  },
  statMiniLabel: {
    color: '#9b8d97',
    fontSize: 9,
  },
  statMiniVal: {
    color: '#e2e2e2',
    fontSize: 12,
    fontWeight: '700',
  },
  fixtureBadgeMini: {
    backgroundColor: '#282a2b',
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 6,
    alignItems: 'center',
  },
  fixtureMiniLabel: {
    color: '#9b8d97',
    fontSize: 8,
  },
  fixtureMiniRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 1,
  },
  fixtureMiniText: {
    color: '#e2e2e2',
    fontSize: 10,
    fontWeight: '700',
  },
  fdrDotMini: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#202223',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 8,
    marginVertical: 8,
  },
  searchInput: {
    flex: 1,
    color: '#e2e2e2',
    fontSize: 13,
    padding: 0,
  },
  sortChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  sortChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: '#242627',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  sortChipActive: {
    backgroundColor: '#00dbe9',
  },
  sortChipText: {
    color: '#d2c2cd',
    fontSize: 11,
    fontWeight: '600',
  },
  sortChipTextActive: {
    color: '#002022',
    fontWeight: '800',
  },
  candidatesList: {
    gap: 8,
    paddingBottom: 16,
  },
  candidateCard: {
    backgroundColor: '#202223',
    borderRadius: 12,
    padding: 8,
  },
  candidateCardDisabled: {
    opacity: 0.55,
  },
  candidateTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  candLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  candAvatar: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#282a2b',
  },
  candMeta: {
    flex: 1,
  },
  candNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  candNameText: {
    color: '#e2e2e2',
    fontSize: 14,
    fontWeight: '700',
  },
  bankDeltaPill: {
    backgroundColor: 'rgba(52, 255, 140, 0.15)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  bankDeltaText: {
    color: '#34ff8c',
    fontSize: 10,
    fontWeight: '800',
  },
  overBudgetPill: {
    backgroundColor: 'rgba(147, 0, 10, 0.5)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  overBudgetText: {
    color: '#ffb4ab',
    fontSize: 9.5,
    fontWeight: '700',
  },
  candPriceText: {
    color: '#9b8d97',
    fontSize: 11,
    marginTop: 1,
  },
  stageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#00dbe9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  stageBtnDisabled: {
    backgroundColor: '#282a2b',
  },
  stageBtnText: {
    color: '#002022',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  candidateAnalyticsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(12, 15, 15, 0.5)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 6,
  },
  analyticsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  analyticsLabel: {
    color: '#9b8d97',
    fontSize: 10,
  },
  analyticsVal: {
    color: '#e2e2e2',
    fontSize: 10,
    fontWeight: '700',
  },
  candFixGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  candFixLabel: {
    color: '#9b8d97',
    fontSize: 10,
  },
  candFixText: {
    color: '#e2e2e2',
    fontSize: 10,
    fontWeight: '700',
  },
  closeBtn: {
    marginTop: 6,
    width: '100%',
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#242627',
    borderRadius: 10,
  },
  closeBtnText: {
    color: '#e2e2e2',
    fontSize: 13,
    fontWeight: '700',
  },
});
