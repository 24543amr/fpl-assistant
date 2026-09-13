import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native';
import { Colors } from '@/constants/theme';
import {
  FPLPick,
  FPLFixture,
  getPlayerPhotoUrl,
  getTeamNextGwFixtures,
  DEFAULT_TEAMS_MAP,
} from '@/api/fpl';

export interface SquadPitchCardProps {
  pick: FPLPick;
  teamsMap: Map<number, string>;
  fixtures: FPLFixture[];
  targetGw: number;
  isArabic: boolean;
  badgeMode?: 'fixture' | 'points' | 'price';
  points?: number;
  isSelected?: boolean;
  isNewlyStaged?: boolean;
  onPress: () => void;
}

const POSITION_SHORT: Record<number, string> = {
  1: 'GK',
  2: 'DEF',
  3: 'MID',
  4: 'FWD',
};

const POSITION_SHORT_AR: Record<number, string> = {
  1: 'حارس',
  2: 'دفاع',
  3: 'وسط',
  4: 'هجوم',
};

export default function SquadPitchCard({
  pick,
  teamsMap,
  fixtures,
  targetGw,
  isArabic,
  badgeMode = 'fixture',
  points,
  isSelected = false,
  isNewlyStaged = false,
  onPress,
}: SquadPitchCardProps) {
  const [imgError, setImgError] = useState(false);
  const player = pick.player;
  const name = player?.web_name || 'Player';
  const teamCode = player?.team
    ? teamsMap.get(player.team) || DEFAULT_TEAMS_MAP.get(player.team) || 'PL'
    : 'PL';
  const photoUrl = getPlayerPhotoUrl(player, pick.element);

  const teamFixtures = useMemo(
    () => getTeamNextGwFixtures(player?.team || 0, fixtures, targetGw, teamsMap),
    [player?.team, fixtures, targetGw, teamsMap]
  );

  const isDoubtful =
    player?.chance_of_playing_next_round !== null &&
    player?.chance_of_playing_next_round !== undefined &&
    player?.chance_of_playing_next_round < 100;

  const posShort = isArabic
    ? POSITION_SHORT_AR[player?.element_type || 1] || 'لاعب'
    : POSITION_SHORT[player?.element_type || 1] || 'PL';

  // Primary fixture info
  const primaryFixture = teamFixtures[0];
  const fdr = primaryFixture?.difficulty || 3;
  const fdrColor = fdr <= 2 ? '#34ff8c' : fdr === 3 ? '#f6c343' : '#ffb4ab';

  // Points color styling
  const pts = points ?? (player?.total_points || 0);
  const isHigh = pts >= 7;
  const isMed = pts >= 3 && pts < 7;
  const isLow = pts < 3;

  const ptsBg = isHigh ? '#34ff8c' : isMed ? '#333535' : 'rgba(147, 0, 10, 0.7)';
  const ptsColor = isHigh ? '#003919' : isMed ? '#e2e2e2' : '#ffdad6';
  const stripColor = isHigh ? '#34ff8c' : isMed ? '#e5b800' : '#ffb4ab';

  return (
    <TouchableOpacity
      style={[
        styles.card,
        isSelected && styles.cardSelected,
        isNewlyStaged && styles.cardStaged,
        pick.is_captain && styles.cardCaptain,
      ]}
      onPress={onPress}
      activeOpacity={0.82}
    >
      {/* Newly Staged Tag */}
      {isNewlyStaged && (
        <View style={styles.inBadge}>
          <Text style={styles.inBadgeText}>{isArabic ? 'جديد ✨' : 'IN ✨'}</Text>
        </View>
      )}

      {/* Photo & Overlay Badges */}
      <View style={styles.photoContainer}>
        {imgError ? (
          <View style={styles.avatarFallback}>
            <Text style={styles.avatarFallbackText}>
              {name.slice(0, 2).toUpperCase()}
            </Text>
          </View>
        ) : (
          <Image
            source={{ uri: photoUrl }}
            style={styles.photo}
            onError={() => setImgError(true)}
          />
        )}

        {/* Position Badge */}
        <View style={styles.positionBadge}>
          <Text style={styles.positionBadgeText}>{posShort}</Text>
        </View>

        {/* Captain Badge */}
        {pick.is_captain && (
          <View style={styles.captainBadge}>
            <Text style={styles.captainBadgeText}>{isArabic ? 'ك' : 'C'}</Text>
          </View>
        )}

        {/* Vice-Captain Badge */}
        {pick.is_vice_captain && !pick.is_captain && (
          <View style={styles.vcBadge}>
            <Text style={styles.vcBadgeText}>{isArabic ? 'ن' : 'V'}</Text>
          </View>
        )}

        {/* Doubt Badge */}
        {isDoubtful && (
          <View style={styles.doubtBadge}>
            <Text style={styles.doubtBadgeText}>{player?.chance_of_playing_next_round}%</Text>
          </View>
        )}
      </View>

      {/* Player Name */}
      <Text style={styles.nameText} numberOfLines={1}>
        {name}
      </Text>

      {/* Badge Mode */}
      {badgeMode === 'points' ? (
        <>
          <View style={[styles.pointsPill, { backgroundColor: ptsBg }]}>
            <Text style={[styles.pointsPillText, { color: ptsColor }]}>
              {pts} {isArabic ? 'ن' : 'pts'}
            </Text>
            {pick.is_captain && pick.multiplier === 2 && (
              <Text style={[styles.multiplierText, { color: ptsColor }]}>
                ({pts / 2}x2)
              </Text>
            )}
          </View>
          <View style={[styles.performanceStrip, { backgroundColor: stripColor }]} />
        </>
      ) : badgeMode === 'price' ? (
        <View style={styles.pricePill}>
          <Text style={styles.pricePillText}>
            £{((player?.now_cost || 0) / 10).toFixed(1)}m
          </Text>
        </View>
      ) : (
        <View style={styles.fixturePill}>
          {primaryFixture ? (
            <View style={styles.fixtureRow}>
              <Text style={styles.fixtureText} numberOfLines={1}>
                {primaryFixture.opponentCode} ({primaryFixture.isHome ? 'H' : 'A'})
              </Text>
              <View style={[styles.fdrDot, { backgroundColor: fdrColor }]} />
            </View>
          ) : (
            <Text style={styles.fixtureTextMuted}>-</Text>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 74,
    backgroundColor: 'rgba(18, 20, 20, 0.92)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    paddingTop: 6,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 3,
  },
  cardSelected: {
    borderColor: '#34ff8c',
    borderWidth: 2,
    transform: [{ scale: 1.05 }],
    shadowColor: '#34ff8c',
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 6,
  },
  cardStaged: {
    borderColor: '#00dbe9',
    borderWidth: 2,
    shadowColor: '#00dbe9',
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 6,
  },
  cardCaptain: {
    borderColor: 'rgba(246, 195, 67, 0.5)',
  },
  inBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    zIndex: 10,
    backgroundColor: '#34ff8c',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 6,
  },
  inBadgeText: {
    color: '#00210c',
    fontSize: 8,
    fontWeight: '800',
  },
  photoContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#282a2b',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photo: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#37003c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    color: '#f6aff2',
    fontSize: 12,
    fontWeight: '700',
  },
  positionBadge: {
    position: 'absolute',
    bottom: -2,
    right: -3,
    backgroundColor: '#282a2b',
    paddingHorizontal: 3,
    paddingVertical: 0.5,
    borderRadius: 3,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  positionBadgeText: {
    color: '#d2c2cd',
    fontSize: 8,
    fontWeight: '700',
  },
  captainBadge: {
    position: 'absolute',
    top: -2,
    left: -3,
    width: 17,
    height: 17,
    borderRadius: 8.5,
    backgroundColor: '#f6c343',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 2,
  },
  captainBadgeText: {
    color: '#2b1800',
    fontSize: 10,
    fontWeight: '900',
  },
  vcBadge: {
    position: 'absolute',
    top: -2,
    left: -3,
    width: 17,
    height: 17,
    borderRadius: 8.5,
    backgroundColor: '#00dbe9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vcBadgeText: {
    color: '#002022',
    fontSize: 10,
    fontWeight: '900',
  },
  doubtBadge: {
    position: 'absolute',
    top: -2,
    right: -4,
    backgroundColor: '#e5b800',
    borderRadius: 4,
    paddingHorizontal: 2.5,
    paddingVertical: 0.5,
  },
  doubtBadgeText: {
    color: '#2b1800',
    fontSize: 7.5,
    fontWeight: '800',
  },
  nameText: {
    color: '#e2e2e2',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 3,
    marginHorizontal: 2,
    textAlign: 'center',
  },
  pointsPill: {
    width: '100%',
    paddingVertical: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 3,
  },
  pointsPillText: {
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 12,
  },
  multiplierText: {
    fontSize: 8,
    fontWeight: '600',
    lineHeight: 9,
  },
  performanceStrip: {
    width: '100%',
    height: 2,
  },
  pricePill: {
    width: '100%',
    backgroundColor: '#282a2b',
    paddingVertical: 2,
    alignItems: 'center',
    marginTop: 3,
  },
  pricePillText: {
    color: '#d2c2cd',
    fontSize: 10,
    fontWeight: '700',
  },
  fixturePill: {
    width: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    paddingVertical: 2,
    paddingHorizontal: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 3,
  },
  fixtureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  fixtureText: {
    color: '#d2c2cd',
    fontSize: 9,
    fontWeight: '600',
  },
  fixtureTextMuted: {
    color: '#9b8d97',
    fontSize: 9,
  },
  fdrDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
});
