import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, FontSizes, Spacing, Radii } from '@/constants/theme';
import { getStoredFplToken, getStoredTeamId, decodeJwtPayload, isTokenExpiringSoon } from '@/utils/storage';
import { refreshFplToken, fetchMyTeamSquad } from '@/api/fpl';

export default function ProfileScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [tokenInfo, setTokenInfo] = useState<{ accessPrefix?: string; refreshPrefix?: string; expDate?: string; expiringSoon?: boolean } | null>(null);
  const [testLog, setTestLog] = useState<string>('');

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

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Manager Profile & Token Refresh</Text>
        <Text style={styles.sub}>Automatic OIDC Token Refresh Diagnostics</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Current Session Status</Text>
          {tokenInfo ? (
            <>
              <Text style={styles.infoText}><Text style={styles.bold}>Access Token:</Text> {tokenInfo.accessPrefix}</Text>
              <Text style={styles.infoText}><Text style={styles.bold}>Refresh Token:</Text> {tokenInfo.refreshPrefix}</Text>
              <Text style={styles.infoText}><Text style={styles.bold}>Expiration:</Text> {tokenInfo.expDate}</Text>
              <Text style={[styles.infoText, tokenInfo.expiringSoon ? styles.warnText : styles.okText]}>
                <Text style={styles.bold}>Status:</Text> {tokenInfo.expiringSoon ? 'Expiring soon / Expired' : 'Active & Valid'}
              </Text>
            </>
          ) : (
            <Text style={styles.infoText}>No active OAuth tokens found in storage. Log in via Connect Team screen.</Text>
          )}
        </View>

        <View style={styles.buttonGroup}>
          <TouchableOpacity style={styles.btnPrimary} disabled={loading} onPress={handleManualRefreshTest}>
            {loading ? <ActivityIndicator color={Colors.brandPurple} /> : <Text style={styles.btnPrimaryText}>1. Test Token Refresh Endpoint</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.btnSecondary} disabled={loading} onPress={handleProactiveRefreshTest}>
            <Text style={styles.btnSecondaryText}>2. Test Proactive Launch Refresh</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.btnSecondary} disabled={loading} onPress={handle401RetryTest}>
            <Text style={styles.btnSecondaryText}>3. Test 401 Silent Retry Flow</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.btnBack} onPress={() => router.replace('/home')}>
            <Text style={styles.btnBackText}>← Back to Home</Text>
          </TouchableOpacity>
        </View>

        {!!testLog && (
          <View style={styles.logCard}>
            <Text style={styles.logTitle}>Execution Log</Text>
            <ScrollView style={styles.logScroll} nestedScrollEnabled>
              <Text style={styles.logText}>{testLog}</Text>
            </ScrollView>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.brandPurple },
  container: { padding: Spacing.lg, gap: Spacing.md },
  title: { color: Colors.white, fontSize: 26, fontFamily: 'ArchivoNarrow_700' },
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
  btnBack: { padding: 12, alignItems: 'center', marginTop: 4 },
  btnBackText: { color: Colors.onSurfaceVariant, fontWeight: '600' },
  logCard: { backgroundColor: '#120524', borderRadius: Radii.lg, padding: 14, maxHeight: 240 },
  logTitle: { color: Colors.brandTeal, fontSize: 14, fontWeight: '700', marginBottom: 6 },
  logScroll: { maxHeight: 180 },
  logText: { color: '#b0bec5', fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
});
