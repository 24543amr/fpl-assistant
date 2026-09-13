import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Image,
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

export interface PlayerActionSheetProps {
  visible: boolean;
  pick: FPLPick | null;
  index: number;
  teamsMap: Map<number, string>;
  fixtures: FPLFixture[];
  targetGw: number;
  isArabic: boolean;
  onMakeCaptain: (index: number) => void;
  onMakeViceCaptain: (index: number) => void;
  onStartSwap: (index: number) => void;
  onClose: () => void;
}

const POSITION_NAMES_EN: Record<number, string> = {
  1: 'GK',
  2: 'DEF',
  3: 'MID',
  4: 'FWD',
};

const POSITION_NAMES_AR: Record<number, string> = {
  1: 'حارس',
  2: 'مدافع',
  3: 'وسط',
  4: 'مهاجم',
};

const POSITION_COLORS: Record<number, string> = {
  1: '#f6c343',
  2: '#60a5fa',
  3: '#34ff8c',
  4: '#ffb4ab',
};

export default function PlayerActionSheet({
  visible,
  pick,
  index,
  teamsMap,
  fixtures,
  targetGw,
  isArabic,
  onMakeCaptain,
  onMakeViceCaptain,
  onStartSwap,
  onClose,
}: PlayerActionSheetProps) {
  const [imgError, setImgError] = useState(false);

  if (!pick || !pick.player) return null;

  const player: FPLPlayer = pick.player;
  const isStarter = index < 11;
  const isCaptain = !!pick.is_captain;
  const isViceCaptain = !!pick.is_vice_captain;

  const teamName = teamsMap.get(player.team) || DEFAULT_TEAMS_MAP.get(player.team) || 'PL';
  const posName = isArabic
    ? POSITION_NAMES_AR[player.element_type] || 'لاعب'
    : POSITION_NAMES_EN[player.element_type] || 'Player';
  const posColor = POSITION_COLORS[player.element_type] || '#34ff8c';

  const nextFixtures = getTeamNextGwFixtures(player.team, fixtures, targetGw, teamsMap);
  const nextOpp = nextFixtures[0]
    ? `${nextFixtures[0].opponentCode} (${nextFixtures[0].isHome ? 'H' : 'A'})`
    : '-';

  const photoUrl = getPlayerPhotoUrl(player, pick.element);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.scrim}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
        />

        <View style={styles.sheet}>
          {/* Drag Handle Bar */}
          <View style={styles.dragHandle} />

          {/* Header Card */}
          <View style={styles.headerCard}>
            <View style={styles.avatarWrapper}>
              {imgError ? (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarFallbackText}>
                    {player.web_name.slice(0, 2).toUpperCase()}
                  </Text>
                </View>
              ) : (
                <Image
                  source={{ uri: photoUrl }}
                  style={styles.avatar}
                  onError={() => setImgError(true)}
                />
              )}
              {isCaptain && (
                <View style={styles.badgeCaptain}>
                  <Text style={styles.badgeCaptainText}>C</Text>
                </View>
              )}
              {isViceCaptain && !isCaptain && (
                <View style={styles.badgeVice}>
                  <Text style={styles.badgeViceText}>V</Text>
                </View>
              )}
            </View>

            <View style={styles.headerMeta}>
              <Text style={styles.playerName} numberOfLines={1}>
                {player.first_name} {player.second_name}
              </Text>
              <View style={styles.pillsRow}>
                <View style={[styles.posBadge, { backgroundColor: posColor }]}>
                  <Text style={styles.posBadgeText}>{posName}</Text>
                </View>
                <Text style={styles.teamClubText}>{teamName}</Text>
                <Text style={styles.dotSeparator}>•</Text>
                <Text style={styles.priceText}>
                  £{(player.now_cost / 10).toFixed(1)}m
                </Text>
              </View>
              <View style={styles.microStatsRow}>
                <Text style={styles.microStatText}>Next: {nextOpp}</Text>
                <Text style={styles.microStatText}>Form: {player.form}</Text>
                <Text style={styles.microStatText}>TSB: {player.selected_by_percent}%</Text>
              </View>
            </View>
          </View>

          {/* Actions List */}
          <View style={styles.actionsList}>
            {/* Action 1: Captain */}
            <TouchableOpacity
              style={[styles.actionRow, isCaptain && styles.actionRowActive]}
              onPress={() => onMakeCaptain(index)}
              activeOpacity={0.7}
            >
              <View style={styles.actionLeft}>
                <View style={[styles.actionIconBg, { backgroundColor: '#37003c' }]}>
                  <MaterialIcons name="star" size={22} color="#f6aff2" />
                </View>
                <View style={styles.actionTexts}>
                  <Text style={styles.actionTitle}>
                    {isCaptain
                      ? isArabic
                        ? 'تم تعيينه كابتن'
                        : 'Captain Assigned'
                      : isArabic
                      ? 'تعيين كابتن'
                      : 'Make Captain'}
                  </Text>
                  <Text style={styles.actionSubtitle}>
                    {isArabic
                      ? 'يحصل على ضعف النقاط (2x)'
                      : 'Scores double points (2x)'}
                  </Text>
                </View>
              </View>
              {isCaptain ? (
                <View style={styles.activePill}>
                  <Text style={styles.activePillText}>
                    {isArabic ? 'مفعل' : 'Active'}
                  </Text>
                </View>
              ) : (
                <MaterialIcons name="chevron-right" size={20} color="#9b8d97" />
              )}
            </TouchableOpacity>

            {/* Action 2: Vice-Captain */}
            <TouchableOpacity
              style={[styles.actionRow, isViceCaptain && styles.actionRowActive]}
              onPress={() => onMakeViceCaptain(index)}
              activeOpacity={0.7}
            >
              <View style={styles.actionLeft}>
                <View style={[styles.actionIconBg, { backgroundColor: '#002023' }]}>
                  <MaterialIcons name="verified" size={22} color="#00dbe9" />
                </View>
                <View style={styles.actionTexts}>
                  <Text style={styles.actionTitle}>
                    {isViceCaptain
                      ? isArabic
                        ? 'تم تعيينه نائب كابتن'
                        : 'Vice-Captain Assigned'
                      : isArabic
                      ? 'تعيين نائب كابتن'
                      : 'Make Vice-Captain'}
                  </Text>
                  <Text style={styles.actionSubtitle}>
                    {isArabic
                      ? 'بديل في حال غياب الكابتن'
                      : "Backup if Captain doesn't play"}
                  </Text>
                </View>
              </View>
              {isViceCaptain ? (
                <View style={styles.activePill}>
                  <Text style={styles.activePillText}>
                    {isArabic ? 'مفعل' : 'Active'}
                  </Text>
                </View>
              ) : (
                <MaterialIcons name="chevron-right" size={20} color="#9b8d97" />
              )}
            </TouchableOpacity>

            {/* Action 3: Triple Captain Chip */}
            <View style={styles.actionRow}>
              <View style={styles.actionLeft}>
                <View style={[styles.actionIconBg, { backgroundColor: '#1e2020' }]}>
                  <MaterialIcons name="bolt" size={22} color="#34ff8c" />
                </View>
                <View style={styles.actionTexts}>
                  <View style={styles.chipRow}>
                    <Text style={styles.actionTitle}>
                      {isArabic ? 'كابتن مضاعف 3x' : 'Triple Captain'}
                    </Text>
                    <View style={styles.chipPill}>
                      <Text style={styles.chipPillText}>
                        {isArabic ? 'متاح' : 'AVAILABLE'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.actionSubtitle}>
                    {isArabic
                      ? 'يحصل على 3 أضعاف النقاط لهذه الجولة'
                      : 'Player scores 3x points this Gameweek'}
                  </Text>
                </View>
              </View>
              <MaterialIcons name="play-circle" size={20} color="#34ff8c" />
            </View>

            {/* Action 4: Bench Boost Chip */}
            <View style={styles.actionRow}>
              <View style={styles.actionLeft}>
                <View style={[styles.actionIconBg, { backgroundColor: '#1e2020' }]}>
                  <MaterialIcons name="fitness-center" size={22} color="#00dbe9" />
                </View>
                <View style={styles.actionTexts}>
                  <View style={styles.chipRow}>
                    <Text style={styles.actionTitle}>
                      {isArabic ? 'تعزيز الدكة' : 'Bench Boost'}
                    </Text>
                    <View style={[styles.chipPill, { backgroundColor: 'rgba(0, 219, 233, 0.15)' }]}>
                      <Text style={[styles.chipPillText, { color: '#00dbe9' }]}>
                        {isArabic ? 'جاهز' : 'READY'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.actionSubtitle}>
                    {isArabic
                      ? 'تُحسب نقاط جميع الـ 15 لاعباً في التشكيلة'
                      : 'All 15 squad players count towards total'}
                  </Text>
                </View>
              </View>
              <MaterialIcons name="chevron-right" size={20} color="#9b8d97" />
            </View>

            {/* Action 5: Substitute / Swap */}
            <TouchableOpacity
              style={styles.actionRow}
              onPress={() => onStartSwap(index)}
              activeOpacity={0.7}
            >
              <View style={styles.actionLeft}>
                <View style={[styles.actionIconBg, { backgroundColor: '#333535' }]}>
                  <MaterialIcons name="swap-vertical-circle" size={22} color="#d2c2cd" />
                </View>
                <View style={styles.actionTexts}>
                  <Text style={styles.actionTitle}>
                    {isStarter
                      ? isArabic
                        ? 'نقل إلى الدكة (تبديل)'
                        : 'Move to Bench'
                      : isArabic
                      ? 'نقل إلى التشكيلة الأساسية'
                      : 'Move to Starting XI'}
                  </Text>
                  <Text style={styles.actionSubtitle}>
                    {isArabic
                      ? 'اختر لاعباً آخر للتبديل معه مباشرة'
                      : 'Select target player to swap'}
                  </Text>
                </View>
              </View>
              <MaterialIcons name="swap-vert" size={22} color="#9b8d97" />
            </TouchableOpacity>
          </View>

          {/* Cancel Button */}
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={onClose}
            activeOpacity={0.8}
          >
            <MaterialIcons name="close" size={18} color="#e2e2e2" />
            <Text style={styles.cancelBtnText}>
              {isArabic ? 'إلغاء' : 'Cancel'}
            </Text>
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
    paddingBottom: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 20,
    maxHeight: '85%',
  },
  dragHandle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignSelf: 'center',
    marginBottom: 14,
  },
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#242627',
    borderRadius: 16,
    padding: 12,
    gap: 12,
    marginBottom: 12,
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: '#34ff8c',
  },
  avatarFallback: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#37003c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    color: '#f6aff2',
    fontSize: 16,
    fontWeight: '700',
  },
  badgeCaptain: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#34ff8c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeCaptainText: {
    color: '#00210c',
    fontSize: 11,
    fontWeight: '900',
  },
  badgeVice: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#00dbe9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeViceText: {
    color: '#002022',
    fontSize: 11,
    fontWeight: '900',
  },
  headerMeta: {
    flex: 1,
    minWidth: 0,
  },
  playerName: {
    color: '#e2e2e2',
    fontSize: 18,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: -0.3,
  },
  pillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  posBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  posBadgeText: {
    color: '#00210c',
    fontSize: 10,
    fontWeight: '800',
  },
  teamClubText: {
    color: '#d2c2cd',
    fontSize: 12,
    fontWeight: '600',
  },
  dotSeparator: {
    color: '#9b8d97',
    fontSize: 12,
  },
  priceText: {
    color: '#34ff8c',
    fontSize: 13,
    fontWeight: '800',
  },
  microStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  microStatText: {
    color: '#9b8d97',
    fontSize: 10,
    fontWeight: '500',
  },
  actionsList: {
    gap: 6,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#202223',
    padding: 12,
    borderRadius: 14,
  },
  actionRowActive: {
    borderWidth: 1,
    borderColor: 'rgba(52, 255, 140, 0.4)',
  },
  actionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  actionIconBg: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTexts: {
    flex: 1,
  },
  actionTitle: {
    color: '#e2e2e2',
    fontSize: 14,
    fontWeight: '700',
  },
  actionSubtitle: {
    color: '#9b8d97',
    fontSize: 11,
    marginTop: 1,
  },
  activePill: {
    backgroundColor: 'rgba(52, 255, 140, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  activePillText: {
    color: '#34ff8c',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipPill: {
    backgroundColor: 'rgba(52, 255, 140, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  chipPillText: {
    color: '#34ff8c',
    fontSize: 9,
    fontWeight: '800',
  },
  cancelBtn: {
    marginTop: 12,
    width: '100%',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#282a2b',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  cancelBtnText: {
    color: '#e2e2e2',
    fontSize: 14,
    fontWeight: '700',
  },
});
