import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Colors, FontSizes, Spacing, Radii } from '@/constants/theme';
import AppHeader from '@/components/AppHeader';
import BottomNav from '@/components/BottomNav';

export default function NewsScreen() {
  const [isArabic, setIsArabic] = useState(false);
  const headlineFont = isArabic ? 'Cairo_700' : 'ArchivoNarrow_700';
  const bodyFont = isArabic ? 'IBMPlexSansArabic' : 'HankenGrotesk';

  return (
    <View style={styles.root}>
      {/* ── SHARED TOP HEADER ── */}
      <AppHeader
        title={isArabic ? 'الأخبار والتحديثات' : 'FPL News & Updates'}
        isArabic={isArabic}
        onToggleLanguage={setIsArabic}
      />

      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.card}>
          <Text style={[styles.title, { fontFamily: headlineFont }]}>
            {isArabic ? 'آخر أخبار وإصابات الفانتاسي' : 'Latest FPL News & Insights'}
          </Text>
          <Text style={[styles.sub, { fontFamily: bodyFont }]}>
            {isArabic
              ? 'تابع هنا أحدث أخبار المؤتمرات الصحفية، تقارير الإصابات، ومواعيد المباريات وتحديثات الجولات المزدوجة أولاً بأول.'
              : 'Stay tuned for live press conferences, injury updates, double gameweek announcements, and tactical scouting.'}
          </Text>
        </View>
      </ScrollView>

      {/* ── SHARED BOTTOM NAVIGATION BAR ── */}
      <BottomNav activeTab="news" isArabic={isArabic} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.brandPurple },
  container: { flex: 1, padding: Spacing.lg, justifyContent: 'center' },
  card: {
    backgroundColor: Colors.surface,
    padding: Spacing.xl,
    borderRadius: Radii.xl,
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  title: { color: Colors.white, fontSize: FontSizes.headlineMd, textAlign: 'center' },
  sub: { color: Colors.onSurfaceVariant, fontSize: FontSizes.bodyMd, textAlign: 'center', lineHeight: 22 },
});

