import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';

export type TabKey = 'home' | 'squad' | 'news' | 'ai' | 'leagues';

export interface BottomNavProps {
  activeTab: TabKey;
  isArabic?: boolean;
}

interface TabItemConfig {
  key: TabKey;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  labelEn: string;
  labelAr: string;
  route: string;
}

const TABS: TabItemConfig[] = [
  { key: 'home', icon: 'home', labelEn: 'Home', labelAr: 'الرئيسية', route: '/home' },
  { key: 'squad', icon: 'groups', labelEn: 'Squad', labelAr: 'تشكيلتي', route: '/squad' },
  { key: 'news', icon: 'article', labelEn: 'News', labelAr: 'الأخبار', route: '/news' },
  { key: 'ai', icon: 'psychology', labelEn: 'AI Assistant', labelAr: 'المساعد', route: '/ai' },
  { key: 'leagues', icon: 'emoji-events', labelEn: 'Leagues', labelAr: 'الدوريات', route: '/leagues' },
];

export default function BottomNav({ activeTab, isArabic = false }: BottomNavProps) {
  const router = useRouter();
  const labelFont = isArabic ? 'IBMPlexSansArabic_600' : 'JetBrainsMono_500';

  const handleTabPress = (item: TabItemConfig) => {
    if (activeTab === item.key) return;
    router.replace(item.route as any);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <View style={styles.bottomNav}>
        {TABS.map((item) => {
          const isActive = activeTab === item.key;
          const label = isArabic ? item.labelAr : item.labelEn;

          return (
            <TouchableOpacity
              key={item.key}
              style={styles.navItem}
              onPress={() => handleTabPress(item)}
              activeOpacity={0.7}
            >
              {isActive && <View style={styles.activeGlow} />}
              <MaterialIcons
                name={item.icon}
                size={22}
                color={isActive ? Colors.secondaryContainer : Colors.onSurfaceVariant}
              />
              <Text
                style={[
                  styles.navLabel,
                  {
                    fontFamily: labelFont,
                    color: isActive ? Colors.secondaryContainer : Colors.onSurfaceVariant,
                  },
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#1E0021',
  },
  bottomNav: {
    flexDirection: 'row',
    height: 56,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    backgroundColor: '#1E0021',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: Spacing.xs,
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    flex: 1,
    position: 'relative',
    gap: 2,
  },
  activeGlow: {
    position: 'absolute',
    top: 0,
    width: 20,
    height: 2,
    borderRadius: 1,
    backgroundColor: Colors.secondaryContainer,
  },
  navLabel: {
    fontSize: 10,
    letterSpacing: 0.2,
  },
});
