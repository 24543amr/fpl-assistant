import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, FontSizes, Radii, Spacing } from '@/constants/theme';

export interface AppHeaderProps {
  title?: string;
  subtitle?: string;
  isArabic?: boolean;
  onToggleLanguage?: (newVal: boolean) => void;
  showBackButton?: boolean;
  onBackPress?: () => void;
  showNotificationBell?: boolean;
  showAvatar?: boolean;
  avatarUrl?: string;
  onAvatarPress?: () => void;
  icon?: React.ReactNode;
  rightAction?: React.ReactNode;
}

export default function AppHeader({
  title,
  subtitle,
  isArabic = false,
  onToggleLanguage,
  showBackButton = false,
  onBackPress,
  showNotificationBell = false,
  showAvatar = true,
  avatarUrl,
  onAvatarPress,
  icon,
  rightAction,
}: AppHeaderProps) {
  const router = useRouter();
  const headlineFont = isArabic ? 'Cairo_700' : 'ArchivoNarrow_700';
  const labelFont = isArabic ? 'IBMPlexSansArabic_600' : 'JetBrainsMono_500';
  const flexDir = isArabic ? 'row-reverse' : 'row';
  const textAlign = isArabic ? 'right' : 'left';

  const defaultTitle = isArabic ? 'مساعد FPL' : 'FPL ASSISTANT';
  const displayTitle = title || defaultTitle;

  const handleBack = () => {
    if (onBackPress) {
      onBackPress();
    } else {
      router.replace('/home');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={[styles.header, { flexDirection: flexDir }]}>
        {/* ── Left / Brand / Back Group ── */}
        <View style={[styles.leftGroup, { flexDirection: flexDir }]}>
          {showBackButton ? (
            <TouchableOpacity
              style={styles.backBtn}
              onPress={handleBack}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MaterialIcons
                name={isArabic ? 'arrow-forward' : 'arrow-back'}
                size={24}
                color={Colors.onSurface}
              />
            </TouchableOpacity>
          ) : icon ? (
            icon
          ) : (
            <MaterialCommunityIcons name="soccer" size={24} color={Colors.tertiary} />
          )}

          <View style={styles.titleColumn}>
            <Text
              style={[
                styles.title,
                { fontFamily: headlineFont, textAlign },
                !title && styles.brandTitle,
              ]}
              numberOfLines={1}
            >
              {displayTitle}
            </Text>
            {!!subtitle && (
              <Text style={[styles.subtitle, { textAlign }]} numberOfLines={1}>
                {subtitle}
              </Text>
            )}
          </View>
        </View>

        {/* ── Right / Actions Group ── */}
        <View style={[styles.rightGroup, { flexDirection: flexDir }]}>
          {rightAction}

          {showNotificationBell && (
            <TouchableOpacity style={styles.iconBtn} activeOpacity={0.7}>
              <MaterialIcons name="notifications-none" size={22} color={Colors.onSurface} />
              <View style={styles.unreadDot} />
            </TouchableOpacity>
          )}

          {onToggleLanguage && (
            <TouchableOpacity
              style={styles.langToggle}
              onPress={() => onToggleLanguage(!isArabic)}
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
          )}

          {showAvatar && !showBackButton && (
            <TouchableOpacity
              style={styles.avatarBtn}
              onPress={onAvatarPress || (() => router.push('/profile'))}
              activeOpacity={0.8}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <MaterialIcons name="person" size={18} color={Colors.brandTeal} />
                </View>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
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
  leftGroup: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  backBtn: {
    padding: 4,
  },
  titleColumn: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: '700',
  },
  brandTitle: {
    color: Colors.tertiary,
    letterSpacing: 1.5,
  },
  subtitle: {
    color: Colors.onSurfaceVariant,
    fontSize: 11,
    marginTop: -2,
  },
  rightGroup: {
    alignItems: 'center',
    gap: 10,
  },
  iconBtn: {
    padding: 6,
    position: 'relative',
  },
  unreadDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.secondaryContainer,
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
  avatarBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: Colors.brandTeal,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4A0E52',
  },
});
