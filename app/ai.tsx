import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, FontSizes, Spacing, Radii } from '@/constants/theme';
import { getStoredTeamId } from '@/utils/storage';
import { fetchFullAiInsightDetails, FullAiInsightResponse } from '@/api/fpl';

export default function AiScreen() {
  const router = useRouter();
  const [isArabic, setIsArabic] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<FullAiInsightResponse | null>(null);

  const headlineFont = isArabic ? 'Cairo_700' : 'ArchivoNarrow_700';
  const bodyFont = isArabic ? 'IBMPlexSansArabic_400' : 'HankenGrotesk_400';
  const labelFont = isArabic ? 'IBMPlexSansArabic_600' : 'HankenGrotesk_600';

  const loadInsight = useCallback(async (force = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);
    setError('');

    try {
      const teamId = await getStoredTeamId();
      const res = await fetchFullAiInsightDetails(teamId || undefined, force);
      setData(res);
    } catch (err: any) {
      console.error('[AiScreen] Error loading AI insight:', err?.message);
      setError(
        isArabic
          ? 'تعذر تحميل التحليل الذكي. تأكد من الاتصال بالإنترنت وحاول مجدداً.'
          : 'Could not fetch AI insight. Please check connection and try again.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isArabic]);

  useEffect(() => {
    void loadInsight(false);
  }, [loadInsight]);

  const captain = data?.structuredData?.captain;
  const transfer = data?.structuredData?.transfer;
  const injuries = data?.structuredData?.injuries || [];

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" />

      {/* ── TOP HEADER ── */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <MaterialIcons name="auto-awesome" size={24} color={Colors.brandTeal} />
          <Text style={[styles.headerTitle, { fontFamily: headlineFont }]}>
            {isArabic ? 'المساعد الذكي (AI)' : 'AI Assistant'}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.langToggle}
          onPress={() => setIsArabic(!isArabic)}
          activeOpacity={0.8}
        >
          <Text style={[styles.langText, { fontFamily: labelFont }]}>
            {isArabic ? 'EN' : 'عربي'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── MAIN SCROLL AREA ── */}
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.brandTeal} />
            <Text style={[styles.loadingText, { fontFamily: bodyFont }]}>
              {isArabic ? 'جاري تحليل تشكيلتك بواسطة الـ AI...' : 'Analyzing your squad with AI...'}
            </Text>
          </View>
        ) : error ? (
          <View style={styles.errorCard}>
            <MaterialIcons name="error-outline" size={32} color={Colors.error} />
            <Text style={[styles.errorText, { fontFamily: bodyFont }]}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => loadInsight(true)}>
              <Text style={[styles.retryBtnText, { fontFamily: labelFont }]}>
                {isArabic ? 'إعادة المحاولة' : 'Retry'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* 1. DAILY AI TACTICAL SUMMARY BANNER */}
            <View style={styles.summaryCard}>
              <View style={styles.summaryHeader}>
                <View style={styles.badgeRow}>
                  <MaterialIcons name="psychology" size={20} color={Colors.brandTeal} />
                  <Text style={[styles.summaryTitle, { fontFamily: headlineFont }]}>
                    {isArabic ? 'الملخص التكتيكي اليومي' : 'Daily Tactical Summary'}
                  </Text>
                </View>

                <View style={styles.metaRow}>
                  <View style={styles.sourceBadge}>
                    <Text style={styles.sourceBadgeText}>
                      {data?.source === 'groq' ? 'Groq Llama-3.3' : 'Rule Engine'}
                    </Text>
                  </View>
                  {data?.cached && (
                    <View style={styles.cachedBadge}>
                      <Text style={styles.cachedBadgeText}>
                        {isArabic ? 'مخزن 24 ساعة' : '24h Cached'}
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              <Text style={[styles.summaryText, { fontFamily: bodyFont }]}>
                {isArabic ? (data?.insightAr || data?.insightEn) : data?.insightEn}
              </Text>
            </View>

            {/* 2. STRUCTURED CAPTAIN RECOMMENDATION CARD */}
            <View style={styles.sectionCard}>
              <View style={styles.cardHeaderRow}>
                <MaterialIcons name="star" size={22} color="#FFD700" />
                <Text style={[styles.cardTitle, { fontFamily: headlineFont }]}>
                  {isArabic ? 'ترشيح الكابتن' : 'Captain Recommendation'}
                </Text>
              </View>

              {captain ? (
                <View style={styles.captainBody}>
                  <View style={styles.captainHeader}>
                    <Text style={[styles.captainName, { fontFamily: headlineFont }]}>
                      {captain.name}
                    </Text>
                    <View style={styles.captainBadge}>
                      <Text style={styles.captainBadgeText}>C</Text>
                    </View>
                  </View>

                  <View style={styles.metricsRow}>
                    <View style={styles.metricItem}>
                      <Text style={styles.metricLabel}>{isArabic ? 'الفورم' : 'Form'}</Text>
                      <Text style={styles.metricValue}>{captain.form}</Text>
                    </View>

                    <View style={styles.metricItem}>
                      <Text style={styles.metricLabel}>{isArabic ? 'صعوبة المواجهة' : 'Fixture Diff'}</Text>
                      <View
                        style={[
                          styles.diffBadge,
                          {
                            backgroundColor:
                              (captain.fixtureDiff || 3) <= 2
                                ? 'rgba(52,255,140,0.2)'
                                : (captain.fixtureDiff || 3) === 3
                                ? 'rgba(255,215,0,0.2)'
                                : 'rgba(255,180,171,0.2)',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.diffText,
                            {
                              color:
                                (captain.fixtureDiff || 3) <= 2
                                  ? Colors.secondaryContainer
                                  : (captain.fixtureDiff || 3) === 3
                                  ? '#FFD700'
                                  : Colors.error,
                            },
                          ]}
                        >
                          {captain.fixtureDiff || 3}/5
                        </Text>
                      </View>
                    </View>

                    {captain.totalPoints !== undefined && (
                      <View style={styles.metricItem}>
                        <Text style={styles.metricLabel}>{isArabic ? 'النقاط' : 'Points'}</Text>
                        <Text style={styles.metricValue}>{captain.totalPoints} pts</Text>
                      </View>
                    )}
                  </View>
                </View>
              ) : (
                <Text style={[styles.emptyText, { fontFamily: bodyFont }]}>
                  {isArabic ? 'لا توجد بيانات كافية للكابتن.' : 'No captain recommendation available.'}
                </Text>
              )}
            </View>

            {/* 3. STRUCTURED TRANSFER SUGGESTION CARD */}
            <View style={styles.sectionCard}>
              <View style={styles.cardHeaderRow}>
                <MaterialIcons name="swap-horiz" size={22} color={Colors.tertiary} />
                <Text style={[styles.cardTitle, { fontFamily: headlineFont }]}>
                  {isArabic ? 'مقترح الانتقالات' : 'Transfer Suggestion'}
                </Text>
              </View>

              {transfer ? (
                <View style={styles.transferBody}>
                  <View style={styles.swapRow}>
                    <View style={styles.transferBoxOut}>
                      <Text style={styles.transferBoxLabel}>{isArabic ? 'بيع (OUT)' : 'SELL (OUT)'}</Text>
                      <Text style={[styles.transferBoxName, { fontFamily: headlineFont }]}>
                        {transfer.outName}
                      </Text>
                    </View>

                    <MaterialIcons name="arrow-forward" size={20} color={Colors.brandTeal} />

                    <View style={styles.transferBoxIn}>
                      <Text style={styles.transferBoxLabel}>{isArabic ? 'شراء (IN)' : 'BUY (IN)'}</Text>
                      <Text style={[styles.transferBoxName, { fontFamily: headlineFont }]}>
                        {transfer.inName}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.transferSubRow}>
                    <Text style={[styles.transferSubText, { fontFamily: bodyFont }]}>
                      {isArabic
                        ? `فورم ${transfer.inName}: ${transfer.inForm || 'N/A'} • السعر: £${transfer.inCost || '0.0'}m`
                        : `Target Form: ${transfer.inForm || 'N/A'} • Price: £${transfer.inCost || '0.0'}m`}
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={styles.noTransferBox}>
                  <MaterialIcons name="check-circle-outline" size={20} color={Colors.secondaryContainer} />
                  <Text style={[styles.noTransferText, { fontFamily: bodyFont }]}>
                    {isArabic
                      ? 'لا داعي لعمل تغييرات هذا الأسبوع — تأجيل التغيير يمنحك مرونة أعلى.'
                      : 'No transfer needed this week — roll your free transfer for flexibility.'}
                  </Text>
                </View>
              )}
            </View>

            {/* 4. INJURY & AVAILABILITY ALERTS CARD */}
            <View style={styles.sectionCard}>
              <View style={styles.cardHeaderRow}>
                <MaterialIcons name="medical-services" size={20} color={Colors.error} />
                <Text style={[styles.cardTitle, { fontFamily: headlineFont }]}>
                  {isArabic ? 'تنبيهات الإصابات والغيابات' : 'Availability & Injury Alerts'}
                </Text>
              </View>

              {injuries.length > 0 ? (
                <View style={styles.injuriesList}>
                  {injuries.map((item, idx) => (
                    <View key={idx} style={styles.injuryItem}>
                      <View style={styles.injuryHeaderRow}>
                        <Text style={[styles.injuryName, { fontFamily: headlineFont }]}>
                          {item.name}
                        </Text>
                        {item.chance !== null && item.chance !== undefined && (
                          <View style={styles.chanceBadge}>
                            <Text style={styles.chanceBadgeText}>{item.chance}% chance</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.injuryNews, { fontFamily: bodyFont }]}>
                        {item.news}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.noInjuriesBox}>
                  <MaterialIcons name="check-circle" size={20} color={Colors.secondaryContainer} />
                  <Text style={[styles.noInjuriesText, { fontFamily: bodyFont }]}>
                    {isArabic
                      ? 'جميع لاعبي تشكيلتك الـ 15 جاهزون للعب!'
                      : 'All 15 players in your squad are fully available!'}
                  </Text>
                </View>
              )}
            </View>

            {/* 5. FORCE REFRESH BUTTON */}
            <TouchableOpacity
              style={styles.refreshBtn}
              onPress={() => loadInsight(true)}
              disabled={refreshing}
              activeOpacity={0.8}
            >
              {refreshing ? (
                <ActivityIndicator size="small" color={Colors.brandPurple} />
              ) : (
                <>
                  <MaterialIcons name="refresh" size={20} color={Colors.brandPurple} />
                  <Text style={[styles.refreshBtnText, { fontFamily: labelFont }]}>
                    {isArabic ? 'تحديث التحليل الآن (تخطي التخزين)' : 'Refresh Insight (Bypass Cache)'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {/* ── BOTTOM NAVIGATION BAR ── */}
      <View style={styles.bottomNav}>
        <NavItem
          icon="home"
          label={isArabic ? 'الرئيسية' : 'Home'}
          labelFont={labelFont}
          onPress={() => router.replace('/home')}
        />
        <NavItem
          icon="groups"
          label={isArabic ? 'تشكيلتي' : 'Squad'}
          labelFont={labelFont}
          onPress={() => router.replace('/squad')}
        />
        <NavItem
          icon="article"
          label={isArabic ? 'الأخبار' : 'News'}
          labelFont={labelFont}
          onPress={() => router.replace('/news')}
        />
        <NavItem
          icon="psychology"
          label={isArabic ? 'الـ AI' : 'AI Assistant'}
          active
          labelFont={labelFont}
          onPress={() => {}}
        />
        <NavItem
          icon="person"
          label={isArabic ? 'حسابي' : 'Profile'}
          labelFont={labelFont}
          onPress={() => router.replace('/profile')}
        />
      </View>
    </SafeAreaView>
  );
}

function NavItem({
  icon,
  label,
  active = false,
  labelFont,
  onPress,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  active?: boolean;
  labelFont: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.navItem} onPress={onPress} activeOpacity={0.7}>
      <MaterialIcons
        name={icon}
        size={24}
        color={active ? Colors.brandTeal : Colors.onSurfaceVariant}
      />
      <Text
        style={[
          styles.navLabel,
          { fontFamily: labelFont, color: active ? Colors.brandTeal : Colors.onSurfaceVariant },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.brandPurple },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { color: Colors.white, fontSize: 24 },
  langToggle: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radii.full,
  },
  langText: { color: Colors.brandTeal, fontSize: 12, fontWeight: '700' },

  scrollContent: { padding: Spacing.md, paddingBottom: 100, gap: Spacing.md },

  loadingContainer: {
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: { color: Colors.onSurfaceVariant, fontSize: 14 },

  errorCard: {
    backgroundColor: 'rgba(255,180,171,0.1)',
    borderRadius: Radii.xl,
    padding: Spacing.lg,
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,180,171,0.3)',
  },
  errorText: { color: Colors.error, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  retryBtn: {
    backgroundColor: Colors.brandTeal,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: Radii.lg,
  },
  retryBtnText: { color: Colors.brandPurple, fontSize: 13, fontWeight: '700' },

  // Summary Card
  summaryCard: {
    backgroundColor: 'rgba(79,25,83,0.5)',
    borderRadius: Radii.xl,
    padding: Spacing.lg,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,255,135,0.2)',
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  summaryTitle: { color: Colors.brandTeal, fontSize: 18 },
  metaRow: { flexDirection: 'row', gap: 6 },
  sourceBadge: {
    backgroundColor: 'rgba(0,219,233,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radii.full,
  },
  sourceBadgeText: { color: Colors.tertiary, fontSize: 10, fontWeight: '700' },
  cachedBadge: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radii.full,
  },
  cachedBadgeText: { color: Colors.onSurfaceVariant, fontSize: 10 },
  summaryText: { color: Colors.white, fontSize: 15, lineHeight: 22 },

  // Section Cards
  sectionCard: {
    backgroundColor: 'rgba(18,20,20,0.6)',
    borderRadius: Radii.xl,
    padding: Spacing.md,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { color: Colors.white, fontSize: 18 },

  emptyText: { color: Colors.onSurfaceVariant, fontSize: 13 },

  // Captain Body
  captainBody: {
    backgroundColor: 'rgba(79,25,83,0.4)',
    borderRadius: Radii.lg,
    padding: Spacing.md,
    gap: 12,
  },
  captainHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  captainName: { color: Colors.white, fontSize: 20 },
  captainBadge: {
    backgroundColor: Colors.brandPurple,
    borderWidth: 1.5,
    borderColor: Colors.secondaryContainer,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captainBadgeText: { color: Colors.white, fontSize: 14, fontWeight: '800' },

  metricsRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  metricItem: { alignItems: 'center', gap: 4 },
  metricLabel: { color: Colors.onSurfaceVariant, fontSize: 11 },
  metricValue: { color: Colors.brandTeal, fontSize: 15, fontWeight: '700' },
  diffBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radii.full },
  diffText: { fontSize: 13, fontWeight: '700' },

  // Transfer Body
  transferBody: {
    backgroundColor: 'rgba(79,25,83,0.4)',
    borderRadius: Radii.lg,
    padding: Spacing.md,
    gap: 10,
  },
  swapRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  transferBoxOut: {
    flex: 1,
    backgroundColor: 'rgba(255,180,171,0.1)',
    borderRadius: Radii.lg,
    padding: 10,
    alignItems: 'center',
    gap: 2,
  },
  transferBoxIn: {
    flex: 1,
    backgroundColor: 'rgba(52,255,140,0.1)',
    borderRadius: Radii.lg,
    padding: 10,
    alignItems: 'center',
    gap: 2,
  },
  transferBoxLabel: { color: Colors.onSurfaceVariant, fontSize: 10, fontWeight: '700' },
  transferBoxName: { color: Colors.white, fontSize: 16 },
  transferSubRow: { alignItems: 'center' },
  transferSubText: { color: Colors.onSurfaceVariant, fontSize: 12 },

  noTransferBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(52,255,140,0.08)',
    padding: Spacing.md,
    borderRadius: Radii.lg,
  },
  noTransferText: { color: Colors.secondaryContainer, fontSize: 13, flex: 1, lineHeight: 18 },

  // Injuries List
  injuriesList: { gap: 8 },
  injuryItem: {
    backgroundColor: 'rgba(255,180,171,0.08)',
    borderRadius: Radii.lg,
    padding: 10,
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,180,171,0.15)',
  },
  injuryHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  injuryName: { color: Colors.white, fontSize: 15 },
  chanceBadge: {
    backgroundColor: 'rgba(255,180,171,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radii.full,
  },
  chanceBadgeText: { color: Colors.error, fontSize: 11, fontWeight: '700' },
  injuryNews: { color: Colors.onSurfaceVariant, fontSize: 12, lineHeight: 16 },

  noInjuriesBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(52,255,140,0.08)',
    padding: Spacing.md,
    borderRadius: Radii.lg,
  },
  noInjuriesText: { color: Colors.secondaryContainer, fontSize: 13, flex: 1 },

  // Refresh Button
  refreshBtn: {
    backgroundColor: Colors.brandTeal,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: Radii.xl,
    marginTop: 8,
  },
  refreshBtnText: { color: Colors.brandPurple, fontSize: 14, fontWeight: '700' },

  // Bottom Navigation
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: '#1E0021',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  navLabel: { fontSize: 10 },
});
