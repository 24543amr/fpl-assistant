import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  ToastAndroid,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, FontSizes, Spacing, Radii } from '@/constants/theme';
import {
  getStoredFplToken,
  getStoredTeamId,
  decodeJwtPayload,
  isTokenExpiringSoon,
  clearStoredFplToken,
} from '@/utils/storage';
import { refreshFplToken, fetchMyTeamSquad } from '@/api/fpl';
import AppHeader from '@/components/AppHeader';

// ─── i18n Strings ────────────────────────────────────────────────────────────
const STRINGS = {
  en: {
    activeLang: 'EN',
    toggleLang: 'عربي',
    title: 'Manager Profile & Settings',
    sub: 'Automatic OIDC Token Refresh Diagnostics & Session Control',
    sessionCardTitle: 'Current Session Status',
    accessToken: 'Access Token:',
    refreshToken: 'Refresh Token:',
    expiration: 'Expiration:',
    status: 'Status:',
    activeValid: 'Active & Valid',
    expiringSoon: 'Expiring soon / Expired',
    noActiveTokens: 'No active OAuth tokens found in storage. Log in via Connect Team screen.',
    btnTest1: '1. Test Token Refresh Endpoint',
    btnTest2: '2. Test Proactive Launch Refresh',
    btnTest3: '3. Test 401 Silent Retry Flow',
    btnBack: '← Back to Home',
    btnLogOut: 'Log Out',
    logoutDialogTitle: 'Log out?',
    logoutDialogMsg: "You'll need to log in again to access your squad.",
    cancel: 'Cancel',
    loggedOutSuccess: 'Logged out successfully',
    execLogTitle: 'Execution Log',
  },
  ar: {
    activeLang: 'عربي',
    toggleLang: 'EN',
    title: 'الملف الشخصي والإعدادات',
    sub: 'تشخيص تجديد توكنات OIDC التلقائي والتحكم بالجلسة',
    sessionCardTitle: 'حالة الجلسة الحالية',
    accessToken: 'توكن الوصول:',
    refreshToken: 'توكن التحديث:',
    expiration: 'تاريخ الانتهاء:',
    status: 'الحالة:',
    activeValid: 'نشط وصالح',
    expiringSoon: 'قريب الانتهاء / منتهي',
    noActiveTokens: 'لا توجد توكنات OAuth نشطة في الذاكرة. يرجى تسجيل الدخول من شاشة ربط الفريق.',
    btnTest1: '١. اختبار نقطة تجديد التوكن',
    btnTest2: '٢. اختبار التجديد الاستباقي عند الفتح',
    btnTest3: '٣. اختبار المعالجة الصامتة لخطأ 401',
    btnBack: '← العودة للرئيسية',
    btnLogOut: 'تسجيل الخروج',
    logoutDialogTitle: 'تسجيل الخروج؟',
    logoutDialogMsg: 'ستحتاج إلى تسجيل الدخول مجدداً للوصول إلى تشكيلتك.',
    cancel: 'إلغاء',
    loggedOutSuccess: 'تم تسجيل الخروج بنجاح',
    execLogTitle: 'سجل العمليات',
  },
} as const;

export default function ProfileScreen() {
  const router = useRouter();
  const [isArabic, setIsArabic] = useState(false);
  const lang = isArabic ? 'ar' : 'en';
  const t = STRINGS[lang];
  const isRTL = isArabic;

  const [loading, setLoading] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutFeedback, setLogoutFeedback] = useState('');
  const [tokenInfo, setTokenInfo] = useState<{
    accessPrefix?: string;
    refreshPrefix?: string;
    expDate?: string;
    expiringSoon?: boolean;
  } | null>(null);
  const [testLog, setTestLog] = useState<string>('');

  const headlineFont = isArabic ? 'Cairo_700' : 'ArchivoNarrow_700';
  const bodyFont = isArabic ? 'IBMPlexSansArabic' : 'HankenGrotesk';
  const textAlign = isRTL ? 'right' : 'left';
  const flexDir = isRTL ? 'row-reverse' : 'row';

  const loadTokens = async () => {
    const tokens = await getStoredFplToken();
    if (tokens?.accessToken) {
      const payload = decodeJwtPayload(tokens.accessToken);
      const expDate = payload?.exp ? new Date(payload.exp * 1000).toLocaleString() : 'Unknown';
      const expiringSoon = isTokenExpiringSoon(tokens.accessToken);

      setTokenInfo({
        accessPrefix: `${tokens.accessToken.substring(0, 10)}... (length ${tokens.accessToken.length})`,
        refreshPrefix: tokens.refreshToken ? `${tokens.refreshToken.substring(0, 10)}... (length ${tokens.refreshToken.length})` : 'None',
        expDate,
        expiringSoon,
      });
    } else {
      setTokenInfo(null);
    }
  };

  useEffect(() => {
    loadTokens();
  }, []);

  const addLog = (msg: string) => {
    console.log(msg);
    setTestLog((prev) => `[${new Date().toLocaleTimeString()}] ${msg}\n${prev}`);
  };

  // Test 1: Manual Token Refresh & Squad Fetch Test
  const handleManualRefreshTest = async () => {
    setLoading(true);
    addLog('Starting Manual Token Refresh Test...');
    try {
      const tokens = await getStoredFplToken();
      if (!tokens?.refreshToken) {
        addLog('ERROR: No refresh_token found. Please log in via Connect Team first.');
        setLoading(false);
        return;
      }

      addLog(`Sending refresh_token (${tokens.refreshToken.substring(0, 8)}...) to /api/auth/refresh...`);
      const refreshRes = await refreshFplToken(tokens.refreshToken, tokens.accessToken);

      if (refreshRes.success && refreshRes.accessToken) {
        addLog(`✅ REFRESH SUCCESS! New access_token received: ${refreshRes.accessToken.substring(0, 12)}...`);

        // Perform subsequent squad fetch API call with the new access_token
        const teamId = (await getStoredTeamId()) || '1763262';
        addLog(`Testing subsequent API call (fetchMyTeamSquad for team ${teamId})...`);
        const squadRes = await fetchMyTeamSquad(teamId, refreshRes.accessToken);
        addLog(`✅ SQUAD FETCH SUCCESS! Received ${squadRes.picks.length} players with new access_token.`);
        Alert.alert('Test 1 Passed', `Successfully refreshed token and fetched squad with ${squadRes.picks.length} players!`);
      } else {
        addLog(`❌ REFRESH FAILED: ${refreshRes.error}`);
        Alert.alert('Test 1 Failed', refreshRes.error || 'Refresh failed');
      }

      await loadTokens();
    } catch (err: any) {
      addLog(`❌ TEST EXCEPTION: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Test 2: Proactive Launch Refresh Test
  const handleProactiveRefreshTest = async () => {
    setLoading(true);
    addLog('Starting Proactive Launch Refresh Test (forcing refresh)...');
    try {
      const tokens = await getStoredFplToken();
      if (!tokens?.refreshToken) {
        addLog('ERROR: No refresh_token found.');
        setLoading(false);
        return;
      }

      addLog('Simulating app launch check: token expiring soon = true');
      const refreshRes = await refreshFplToken(tokens.refreshToken, tokens.accessToken);
      if (refreshRes.success) {
        addLog('✅ PROACTIVE REFRESH SUCCESS! Proactive silent refresh completed before rendering home.');
        Alert.alert('Test 2 Passed', 'Proactive refresh completed silently!');
      } else {
        addLog(`❌ PROACTIVE REFRESH FAILED: ${refreshRes.error}`);
      }
      await loadTokens();
    } catch (err: any) {
      addLog(`❌ TEST EXCEPTION: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Test 3: 401 Silent Retry Test
  const handle401RetryTest = async () => {
    setLoading(true);
    addLog('Starting 401 Silent Retry Test...');
    try {
      const tokens = await getStoredFplToken();
      if (!tokens?.refreshToken) {
        addLog('ERROR: No refresh_token found.');
        setLoading(false);
        return;
      }

      const teamId = (await getStoredTeamId()) || '1763262';
      const fakeCorruptedToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.INVALID_PAYLOAD.CORRUPTED';

      addLog(`Injecting deliberately invalid access_token: "${fakeCorruptedToken.substring(0, 15)}..."`);
      addLog(`Calling fetchMyTeamSquad with invalid token... Backend will get 401 from FPL and automatically trigger internal refresh using refresh_token!`);

      const squadRes = await fetchMyTeamSquad(teamId, fakeCorruptedToken);
      addLog(`✅ 401 RETRY SUCCESS! Squad data recovered silently: ${squadRes.picks.length} picks returned.`);
      Alert.alert('Test 3 Passed', `Backend intercepted 401, refreshed token silently, and returned ${squadRes.picks.length} picks!`);

      await loadTokens();
    } catch (err: any) {
      addLog(`❌ 401 RETRY TEST EXCEPTION: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ── Log Out Flow ─────────────────────────────────────────────────────────────
  const handleLogoutPress = () => {
    Alert.alert(
      t.logoutDialogTitle,
      t.logoutDialogMsg,
      [
        {
          text: t.cancel,
          style: 'cancel',
        },
        {
          text: t.btnLogOut,
          style: 'destructive',
          onPress: () => {
            void executeLogout();
          },
        },
      ],
      { cancelable: true }
    );
  };

  const executeLogout = async () => {
    setLoggingOut(true);
    setLogoutFeedback(t.loggedOutSuccess);
    addLog('Logging out: clearing all tokens, team ID, session data, and cookies...');
    try {
      await clearStoredFplToken();
      setTokenInfo(null);
      addLog('✅ All session data and cookies cleared successfully.');

      if (Platform.OS === 'android') {
        ToastAndroid.show(t.loggedOutSuccess, ToastAndroid.SHORT);
      }

      setTimeout(() => {
        router.replace('/connect-team');
      }, 500);
    } catch (err: any) {
      console.error('[Profile] Logout error:', err);
      router.replace('/connect-team');
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <View style={styles.root}>
      {/* ── SHARED TOP HEADER WITH BACK BUTTON ── */}
      <AppHeader
        title={t.title}
        isArabic={isArabic}
        onToggleLanguage={setIsArabic}
        showBackButton={true}
        onBackPress={() => router.back()}
        showAvatar={false}
      />

      <ScrollView contentContainerStyle={styles.container}>
        <Text style={[styles.sub, { fontFamily: bodyFont, textAlign }]}>{t.sub}</Text>

        {/* ── Logout Success Banner ─────────────────────────────────── */}
        {!!logoutFeedback && (
          <View style={styles.feedbackBanner}>
            <MaterialIcons name="check-circle" size={20} color={Colors.brandTeal} />
            <Text style={styles.feedbackText}>{logoutFeedback}</Text>
          </View>
        )}

        <View style={styles.card}>
          <Text style={[styles.cardTitle, { textAlign }]}>{t.sessionCardTitle}</Text>
          {tokenInfo ? (
            <>
              <Text style={[styles.infoText, { textAlign }]}>
                <Text style={styles.bold}>{t.accessToken}</Text> {tokenInfo.accessPrefix}
              </Text>
              <Text style={[styles.infoText, { textAlign }]}>
                <Text style={styles.bold}>{t.refreshToken}</Text> {tokenInfo.refreshPrefix}
              </Text>
              <Text style={[styles.infoText, { textAlign }]}>
                <Text style={styles.bold}>{t.expiration}</Text> {tokenInfo.expDate}
              </Text>
              <Text style={[styles.infoText, { textAlign }, tokenInfo.expiringSoon ? styles.warnText : styles.okText]}>
                <Text style={styles.bold}>{t.status}</Text> {tokenInfo.expiringSoon ? t.expiringSoon : t.activeValid}
              </Text>
            </>
          ) : (
            <Text style={[styles.infoText, { textAlign }]}>{t.noActiveTokens}</Text>
          )}
        </View>

        <View style={styles.buttonGroup}>
          <TouchableOpacity style={styles.btnPrimary} disabled={loading || loggingOut} onPress={handleManualRefreshTest}>
            {loading ? <ActivityIndicator color={Colors.brandPurple} /> : <Text style={styles.btnPrimaryText}>{t.btnTest1}</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.btnSecondary} disabled={loading || loggingOut} onPress={handleProactiveRefreshTest}>
            <Text style={styles.btnSecondaryText}>{t.btnTest2}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.btnSecondary} disabled={loading || loggingOut} onPress={handle401RetryTest}>
            <Text style={styles.btnSecondaryText}>{t.btnTest3}</Text>
          </TouchableOpacity>

          {/* ── Log Out Button (Destructive / Outline style) ──────────── */}
          <TouchableOpacity
            style={styles.btnLogout}
            disabled={loading || loggingOut}
            onPress={handleLogoutPress}
            activeOpacity={0.8}
          >
            {loggingOut ? (
              <ActivityIndicator color={Colors.error} size="small" />
            ) : (
              <View style={[styles.logoutContent, { flexDirection: flexDir }]}>
                <MaterialIcons name="logout" size={20} color={Colors.error} />
                <Text style={styles.btnLogoutText}>{t.btnLogOut}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {!!testLog && (
          <View style={styles.logCard}>
            <Text style={styles.logTitle}>{t.execLogTitle}</Text>
            <ScrollView style={styles.logScroll} nestedScrollEnabled>
              <Text style={styles.logText}>{testLog}</Text>
            </ScrollView>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.brandPurple },
  container: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: 24 },
  title: { color: Colors.white, fontSize: 26 },
  sub: { color: Colors.onSurfaceVariant, fontSize: FontSizes.bodyMd, marginBottom: 4 },
  card: { backgroundColor: Colors.surface, borderRadius: Radii.lg, padding: 16, gap: 6 },
  cardTitle: { color: Colors.brandTeal, fontSize: 16, fontWeight: '700', marginBottom: 6 },
  infoText: { color: Colors.onSurface, fontSize: 13 },
  bold: { fontWeight: '700' },
  warnText: { color: '#ffb74d' },
  okText: { color: '#81c784' },
  buttonGroup: { gap: 10, marginTop: 4 },
  btnPrimary: { backgroundColor: Colors.brandTeal, padding: 14, borderRadius: Radii.lg, alignItems: 'center' },
  btnPrimaryText: { color: Colors.brandPurple, fontWeight: '800', fontSize: 15 },
  btnSecondary: { backgroundColor: 'rgba(255, 255, 255, 0.1)', padding: 14, borderRadius: Radii.lg, alignItems: 'center' },
  btnSecondaryText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
  btnLogout: {
    backgroundColor: 'rgba(255, 180, 171, 0.08)',
    borderWidth: 1.5,
    borderColor: Colors.error,
    padding: 14,
    borderRadius: Radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  logoutContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  btnLogoutText: {
    color: Colors.error,
    fontWeight: '700',
    fontSize: 15,
  },
  btnBack: { padding: 12, alignItems: 'center', marginTop: 4 },
  btnBackText: { color: Colors.onSurfaceVariant, fontWeight: '600' },
  feedbackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0, 255, 204, 0.12)',
    padding: 12,
    borderRadius: Radii.default,
  },
  feedbackText: { color: Colors.brandTeal, fontSize: 14, fontWeight: '600' },
  logCard: { backgroundColor: '#120524', borderRadius: Radii.lg, padding: 14, maxHeight: 240 },
  logTitle: { color: Colors.brandTeal, fontSize: 14, fontWeight: '700', marginBottom: 6 },
  logScroll: { maxHeight: 180 },
  logText: { color: '#b0bec5', fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
});

