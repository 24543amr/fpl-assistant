import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native';
import {
  FPLPick,
  FPLFixture,
  getPlayerPhotoUrl,
  getTeamNextGwFixtures,
  DEFAULT_TEAMS_MAP,
} from '@/api/fpl';

export interface SquadBenchCardProps {
  pick: FPLPick;
  benchIndex: number;
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

export default function SquadBenchCard({
  pick,
  benchIndex,
  teamsMap,
  fixtures,
  targetGw,
  isArabic,
  badgeMode = 'fixture',
  points,
  isSelected = false,
  isNewlyStaged = false,
  onPress,
}: SquadBenchCardProps) {
  const [imgError, setImgError] = useState(false);
  const player = pick.player;
  const name = player?.web_name || 'Sub';
  const photoUrl = getPlayerPhotoUrl(player, pick.element);

  const teamFixtures = useMemo(
    () => getTeamNextGwFixtures(player?.team || 0, fixtures, targetGw, teamsMap),
    [player?.team, fixtures, targetGw, teamsMap]
  );

  const posShort = isArabic
    ? POSITION_SHORT_AR[player?.element_type || 1] || 'لاعب'
    : POSITION_SHORT[player?.element_type || 1] || 'SUB';

  const subLabel = `${benchIndex}. ${posShort}`;

  const primaryFixture = teamFixtures[0];
  const fdr = primaryFixture?.difficulty || 3;
  const fdrColor = fdr <= 2 ? '#34ff8c' : fdr === 3 ? '#f6c343' : '#ffb4ab';

  const pts = points ?? (player?.total_points || 0);
  const isHigh = pts >= 7;
  const isMed = pts >= 3 && pts < 7;
  const ptsBg = isHigh ? '#34ff8c' : isMed ? '#333535' : 'rgba(147, 0, 10, 0.7)';
  const ptsColor = isHigh ? '#003919' : isMed ? '#e2e2e2' : '#ffdad6';

  return (
    <TouchableOpacity
      style={[
        styles.card,
        isSelected && styles.cardSelected,
        isNewlyStaged && styles.cardStaged,
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {/* Bench Position Header */}
      <Text style={styles.subIndexText}>{subLabel}</Text>

      {/* Photo */}
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

        {isNewlyStaged && (
          <View style={styles.inBadge}>
            <Text style={styles.inBadgeText}>{isArabic ? 'جديد' : 'IN'}</Text>
          </View>
        )}
      </View>

      {/* Name */}
      <Text style={styles.nameText} numberOfLines={1}>
        {name}
      </Text>

      {/* Badge Mode */}
      {badgeMode === 'points' ? (
        <View style={[styles.pointsPill, { backgroundColor: ptsBg }]}>
          <Text style={[styles.pointsPillText, { color: ptsColor }]}>
            {pts} {isArabic ? 'ن' : 'pts'}
          </Text>
        </View>
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
                {primaryFixture.opponentCode}
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
    flex: 1,
    backgroundColor: '#1e2020',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 2,
    marginHorizontal: 3,
    overflow: 'hidden',
  },
  cardSelected: {
    borderColor: '#34ff8c',
    borderWidth: 2,
    transform: [{ scale: 1.04 }],
    shadowColor: '#34ff8c',
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 5,
  },
  cardStaged: {
    borderColor: '#00dbe9',
    borderWidth: 2,
  },
  subIndexText: {
    color: '#9b8d97',
    fontSize: 9,
    fontWeight: '700',
    marginBottom: 4,
  },
  photoContainer: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#282a2b',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  photo: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  avatarFallback: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#37003c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    color: '#f6aff2',
    fontSize: 11,
    fontWeight: '700',
  },
  inBadge: {
    position: 'absolute',
    top: -2,
    right: -4,
    backgroundColor: '#34ff8c',
    paddingHorizontal: 3,
    paddingVertical: 0.5,
    borderRadius: 4,
  },
  inBadgeText: {
    color: '#00210c',
    fontSize: 7,
    fontWeight: '800',
  },
  nameText: {
    color: '#e2e2e2',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 3,
    textAlign: 'center',
    marginHorizontal: 1,
  },
  pointsPill: {
    width: '100%',
    paddingVertical: 1.5,
    alignItems: 'center',
    marginTop: 3,
    borderRadius: 4,
  },
  pointsPillText: {
    fontSize: 10,
    fontWeight: '800',
  },
  pricePill: {
    width: '100%',
    backgroundColor: '#282a2b',
    paddingVertical: 1.5,
    alignItems: 'center',
    marginTop: 3,
    borderRadius: 4,
  },
  pricePillText: {
    color: '#d2c2cd',
    fontSize: 9.5,
    fontWeight: '700',
  },
  fixturePill: {
    width: '100%',
    backgroundColor: '#121414',
    paddingVertical: 1.5,
    alignItems: 'center',
    marginTop: 3,
    borderRadius: 4,
  },
  fixtureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
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
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});
