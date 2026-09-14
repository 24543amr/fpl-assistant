import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, Radii } from '@/constants/theme';
import { ReferencedPlayer, getPlayerPhotoUrl } from '@/api/fpl';

const POSITION_NAMES: Record<number, string> = {
  1: 'GK',
  2: 'DEF',
  3: 'MID',
  4: 'FWD',
};

export interface PlayerCardProps {
  player: ReferencedPlayer;
  isRTL?: boolean;
  isArabic?: boolean;
  headlineFont?: string;
  monoFont?: string;
  labelFont?: string;
  onViewSquad?: () => void;
}

export const PlayerCard = React.memo(function PlayerCard({
  player,
  isRTL = false,
  isArabic = false,
  headlineFont = 'ArchivoNarrow_700',
  monoFont = 'JetBrainsMono_500',
  labelFont = 'HankenGrotesk_600',
  onViewSquad,
}: PlayerCardProps) {
  const router = useRouter();
  const [imageError, setImageError] = useState(false);

  // Directly construct the unique Premier League CDN photo URL with player's specific code
  const photoCode = player.photo_code || player.code;
  const plCdnUrl = `https://resources.premierleague.com/premierleague/photos/players/110x140/p${photoCode}.png`;
  const fallbackUrl = getPlayerPhotoUrl(player as any, player.code);
  const imageUrl = imageError ? fallbackUrl : plCdnUrl;

  const playerName = player.name || player.web_name || 'Player';

  // Required diagnostic logging to verify distinct photo_code and URL per rendered player
  console.log('PlayerCard rendering:', playerName, 'photo_code:', player.code, 'URL:', imageUrl);

  const flexDir = isRTL ? 'row-reverse' : 'row';
  const posName = POSITION_NAMES[player.element_type] || 'MID';
  const costFormatted = ((player.now_cost || 0) / 10).toFixed(1);

  const handlePress = () => {
    if (onViewSquad) {
      onViewSquad();
    } else {
      router.push('/squad');
    }
  };

  return (
    <View style={styles.embeddedCard}>
      <View style={[styles.playerCardRow, { flexDirection: flexDir }]}>
        {/* Photo with direct PL CDN URL and fallback */}
        <Image
          source={{ uri: imageUrl }}
          style={styles.playerAvatar}
          onError={() => {
            if (!imageError) setImageError(true);
          }}
        />

        {/* Player Info */}
        <View style={[styles.playerInfoCol, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
          <Text style={[styles.playerName, { fontFamily: headlineFont }]}>
            {player.web_name || player.name}
          </Text>
          <Text style={[styles.playerMeta, { fontFamily: monoFont }]}>
            {posName} • {player.team_short || 'PL'}
          </Text>

          <View style={[styles.tagsRow, { flexDirection: flexDir }]}>
            <View style={styles.formTag}>
              <Text style={[styles.formTagText, { fontFamily: monoFont }]}>
                {isArabic ? `فورم: ${player.form}` : `Form: ${player.form}`}
              </Text>
            </View>
            <View style={styles.costTag}>
              <Text style={[styles.costTagText, { fontFamily: monoFont }]}>
                £{costFormatted}m
              </Text>
            </View>
          </View>
        </View>

        {/* View Squad Button */}
        <TouchableOpacity
          style={[styles.viewBtn, { flexDirection: flexDir }]}
          onPress={handlePress}
          activeOpacity={0.7}
        >
          <Text style={[styles.viewBtnText, { fontFamily: labelFont }]}>
            {isArabic ? 'عرض' : 'View'}
          </Text>
          <MaterialIcons
            name={isRTL ? 'arrow-back' : 'arrow-forward'}
            size={14}
            color={Colors.brandPurple}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}, (prevProps, nextProps) => {
  // Deep/shallow check for memoization to eliminate frame drops
  return (
    prevProps.player.id === nextProps.player.id &&
    prevProps.player.code === nextProps.player.code &&
    prevProps.player.form === nextProps.player.form &&
    prevProps.player.now_cost === nextProps.player.now_cost &&
    prevProps.isRTL === nextProps.isRTL &&
    prevProps.isArabic === nextProps.isArabic &&
    prevProps.headlineFont === nextProps.headlineFont &&
    prevProps.monoFont === nextProps.monoFont &&
    prevProps.labelFont === nextProps.labelFont
  );
});

export default PlayerCard;

const styles = StyleSheet.create({
  embeddedCard: {
    marginTop: 12,
    backgroundColor: 'rgba(26, 3, 29, 0.7)',
    borderRadius: Radii.lg,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 135, 0.2)',
  },
  playerCardRow: {
    alignItems: 'center',
    gap: 10,
  },
  playerAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#2A0530',
    borderWidth: 1,
    borderColor: Colors.brandTeal,
  },
  playerInfoCol: {
    flex: 1,
    gap: 2,
  },
  playerName: {
    color: Colors.white,
    fontSize: 15,
  },
  playerMeta: {
    color: Colors.onSurfaceVariant,
    fontSize: 11,
  },
  tagsRow: {
    gap: 6,
    marginTop: 4,
  },
  formTag: {
    backgroundColor: 'rgba(0, 255, 135, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 135, 0.25)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radii.default,
  },
  formTagText: {
    color: Colors.brandTeal,
    fontSize: 10,
    fontWeight: '700',
  },
  costTag: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radii.default,
  },
  costTagText: {
    color: Colors.onSurfaceVariant,
    fontSize: 10,
  },
  viewBtn: {
    backgroundColor: Colors.brandTeal,
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radii.full,
  },
  viewBtnText: {
    color: Colors.brandPurple,
    fontSize: 11,
    fontWeight: '700',
  },
});
