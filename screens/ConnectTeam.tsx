import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { Colors, Radii, Spacing } from '@/constants/theme';
import { resolveFplSession, verifyTeamId } from '@/api/fpl';
import { setSavedTeamId, clearStoredFplToken, setStoredFplToken } from '@/utils/storage';

type Tab = 'login' | 'teamId';

/** Starting URL — loads fantasy.premierleague.com which redirects to OAuth if not signed in */
const FPL_LOGIN_URL = 'https://fantasy.premierleague.com/';

/**
 * JavaScript injected into the WebView after we detect successful OAuth completion.
 * Searches localStorage for the oidc.user:* key used by PingOne/PingFederate
 * and document.cookie for csrftoken, then posts them back to React Native.
 */
const EXTRACT_OIDC_TOKEN_JS = `
(function() {
  try {
    var nowSec = Math.floor(Date.now() / 1000);
    var bestToken = null;
    var bestExp = 0;
    var totalFound = 0;
    var expiredFound = 0;

    function getExp(token, objExp) {
      if (typeof objExp === 'number' && objExp > 0) return objExp;
      try {
        var parts = token.split('.');
        if (parts.length === 3) {
          var b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
          while (b64.length % 4) b64 += '=';
          var json = atob(b64);
          var p = JSON.parse(json);
          return p.exp || 0;
        }
      } catch (_) {}
      return 0;
    }

    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (key && key.indexOf('oidc.user:') === 0) {
        totalFound++;
        try {
          var raw = localStorage.getItem(key);
          if (raw) {
            var parsed = JSON.parse(raw);
            if (parsed && parsed.access_token) {
              var exp = getExp(parsed.access_token, parsed.expires_at);
              // Only consider tokens that are NOT expired (exp > nowSec)
              if (exp > nowSec) {
                if (exp >= bestExp) {
                  bestExp = exp;
                  bestToken = raw;
                }
              } else {
                expiredFound++;
              }
            }
          }
        } catch (_) {}
      }
    }

    var csrfToken = null;
    try {
      var match = document.cookie.match(/(?:^|;\\s*)csrftoken=([^;]+)/);
      if (match && match[1]) csrfToken = match[1];
    } catch (_) {}

    if (bestToken) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'OIDC_TOKEN',
        payload: bestToken,
        csrfToken: csrfToken,
        expRemaining: bestExp - nowSec,
        totalFound: totalFound
      }));
    } else {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'OIDC_NOT_FOUND',
        totalFound: totalFound,
        expiredFound: expiredFound,
        nowSec: nowSec
      }));
    }
  } catch (e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'OIDC_ERROR',
      error: String(e)
    }));
  }
})();
true; // required by injectJavaScript
`;

export default function ConnectTeam() {
  const router = useRouter();
  const params = useLocalSearchParams<{ expired?: string }>();
  const webViewRef = useRef<WebView>(null);
  // Default directly to 'login' (FPL OAuth flow is primary)
  const [tab, setTab] = useState<Tab>('login');
  const [teamId, setTeamId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [infoMsg, setInfoMsg] = useState(params.expired === '1' ? 'Your session expired — please log in again' : '');
  const [confirmation, setConfirmation] = useState('');
  const [showWebView, setShowWebView] = useState(false);
  const [loginStatus, setLoginStatus] = useState<'idle' | 'awaiting_login' | 'finalizing'>('idle');

  const hasVisitedAuthPage = useRef(false);
  const isExtractingToken = useRef(false);
  const extractRetryCount = useRef(0);

  const connectVerifiedTeam = useCallback(async (candidate: string) => {
    setLoading(true); setError('');
    try {
      const entry = await verifyTeamId(candidate);
      await setSavedTeamId(candidate);
      setConfirmation(`Connected: ${entry.name}`);
      setTimeout(() => router.replace('/home'), 1000);
    } catch (cause) {
      setError(cause instanceof Error && cause.message === 'TEAM_NOT_FOUND'
        ? "This Team ID doesn't exist. Please check and try again."
        : 'Could not reach the backend. Keep your phone and computer on the same Wi-Fi, then try again.');
    } finally { setLoading(false); }
  }, [router]);

  const connectTeamId = () => {
    const candidate = teamId.trim();
    if (!/^\d+$/.test(candidate)) { setError('Please enter a valid Team ID number'); return; }
    void clearStoredFplToken();
    console.log(`[ConnectTeam] Connected via Team ID tab: ${candidate}`);
    void connectVerifiedTeam(candidate);
  };

  const completeSession = useCallback(async (accessToken: string, refreshToken?: string, csrfToken?: string) => {
    setShowWebView(false); setLoading(true); setError('');

    if (typeof accessToken !== 'string' || !accessToken.trim()) {
      console.error('[ConnectTeam] Token extraction returned null/empty for: accessToken');
      setLoading(false);
      setError('Login failed: Could not extract authentication token. Please try signing in again.');
      setTab('login');
      return;
    }

    const cleanAccess = accessToken.trim();
    const cleanRefresh = typeof refreshToken === 'string' && refreshToken.trim() ? refreshToken.trim() : undefined;
    const cleanCsrf = typeof csrfToken === 'string' && csrfToken.trim() ? csrfToken.trim() : undefined;

    console.log(`[ConnectTeam] Extracted accessToken (prefix: "${cleanAccess.substring(0, 20)}...", length: ${cleanAccess.length})`);
    if (cleanRefresh) console.log(`[ConnectTeam] Extracted refreshToken (prefix: "${cleanRefresh.substring(0, 15)}...")`);
    if (cleanCsrf) console.log(`[ConnectTeam] Extracted csrfToken (length: ${cleanCsrf.length})`);

    try {
      // Store the fresh tokens & CSRF immediately before calling session verification
      await setStoredFplToken({ accessToken: cleanAccess, refreshToken: cleanRefresh, csrfToken: cleanCsrf });
      console.log('[ConnectTeam] Fresh OIDC tokens stored. Resolving OIDC session via backend...');

      const session = await resolveFplSession(cleanAccess);
      console.log(`[ConnectTeam] OAuth session verified! Resolved Team ID: ${session.teamId} | CSRF present: ${!!cleanCsrf}`);
      await connectVerifiedTeam(session.teamId);
    } catch (err: any) {
      console.error('[ConnectTeam] Session resolution error:', err?.message);
      await clearStoredFplToken();
      setLoading(false);
      setError(err?.message || 'Login failed. Could not verify FPL session. Try entering your Team ID directly.');
      setTab('teamId');
    }
  }, [connectVerifiedTeam]);

  /**
   * Called on every navigation state change.
   * Tracks when the user is on PingOne, and triggers extraction ONLY after redirect back.
   */
  const handleNavigationStateChange = useCallback((state: { url: string }) => {
    const { url } = state;
    console.log(`[OAuth WebView Navigation] ${url}`);

    // 1. While on the OAuth login page (PingOne / account.premierleague.com)
    if (url.includes('account.premierleague.com') || url.includes('auth.pingone') || url.includes('/as/authorize')) {
      hasVisitedAuthPage.current = true;
      isExtractingToken.current = false;
      setLoginStatus('awaiting_login');
      console.log('[OAuth WebView] On PingOne auth page — waiting for user to enter credentials (no polling timer running)...');
      return;
    }

    // 2. Post-Auth Redirect: user finished logging in and is redirected back to fantasy.premierleague.com
    const isPostAuth = url.includes('fantasy.premierleague.com') && (
      url.includes('code=') ||
      (hasVisitedAuthPage.current && (
        url.includes('/my-team') ||
        url.includes('/entry') ||
        url.includes('/transfers') ||
        url.includes('/event') ||
        url === 'https://fantasy.premierleague.com/' ||
        url.endsWith('fantasy.premierleague.com/')
      ))
    );

    if (!isPostAuth || isExtractingToken.current) return;

    isExtractingToken.current = true;
    extractRetryCount.current = 0;
    setLoginStatus('finalizing');
    console.log('[OAuth WebView] Post-auth return detected! Starting token extraction polling...');
    setTimeout(() => {
      webViewRef.current?.injectJavaScript(EXTRACT_OIDC_TOKEN_JS);
    }, 1000);
  }, []);

  /**
   * Receives messages posted from the injected JavaScript.
   */
  const handleWebViewMessage = useCallback(async (event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      console.log('[OAuth WebView Message] type:', msg.type);

      if (msg.type === 'OIDC_TOKEN') {
        const oidcData = JSON.parse(msg.payload);
        const accessToken: string = oidcData.access_token;
        const refreshToken: string | undefined = oidcData.refresh_token;
        let csrfToken: string | undefined = msg.csrfToken;

        if (!accessToken) {
          throw new Error('OIDC payload found but access_token is missing.');
        }

        // Native fallback for CSRF cookie if JS extraction didn't get it
        if (!csrfToken) {
          try {
            const rawModule = require('@react-native-cookies/cookies');
            const CookieManager = rawModule?.default || rawModule;
            if (CookieManager?.get) {
              const cookies = await CookieManager.get('https://fantasy.premierleague.com');
              if (cookies?.csrftoken?.value) {
                csrfToken = cookies.csrftoken.value;
              }
            }
          } catch (cookieErr) {
            console.warn('[ConnectTeam] Native cookie extract warning:', cookieErr);
          }
        }

        console.log(`[OAuth Token] access_token extracted (expires in ${msg.expRemaining || 'unknown'}s), refresh_token present: ${!!refreshToken}, csrf_token present: ${!!csrfToken}`);
        void completeSession(accessToken, refreshToken, csrfToken);

      } else if (msg.type === 'OIDC_NOT_FOUND') {
        if (!isExtractingToken.current) {
          // If we haven't reached the post-auth stage yet, ignore
          return;
        }

        extractRetryCount.current += 1;
        console.log(`[OAuth WebView] Token exchange in progress (attempt ${extractRetryCount.current}/45, stored keys: ${msg.totalFound}, expired: ${msg.expiredFound}). Polling again in 1s...`);

        if (extractRetryCount.current < 45) {
          setTimeout(() => {
            if (isExtractingToken.current) {
              webViewRef.current?.injectJavaScript(EXTRACT_OIDC_TOKEN_JS);
            }
          }, 1000);
        } else {
          console.warn('[OAuth WebView] Token exchange timed out after 45s.');
          isExtractingToken.current = false;
          setShowWebView(false);
          setError('Sign-in timed out waiting for FPL session. Please try again.');
          setTab('login');
        }

      } else if (msg.type === 'OIDC_ERROR') {
        console.error('[OAuth WebView] JS extraction error:', msg.error);
        isExtractingToken.current = false;
        setShowWebView(false);
        setError('Could not extract FPL session. Please try again.');
        setTab('login');
      }
    } catch (e: any) {
      console.error('[OAuth WebView] Failed to parse message:', e.message);
      isExtractingToken.current = false;
    }
  }, [completeSession]);

  const openWebView = () => {
    hasVisitedAuthPage.current = false;
    isExtractingToken.current = false;
    extractRetryCount.current = 0;
    setLoginStatus('awaiting_login');
    setShowWebView(true);
  };

  const closeWebView = () => {
    hasVisitedAuthPage.current = false;
    isExtractingToken.current = false;
    setShowWebView(false);
    setError('Login cancelled.');
    setTab('login');
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.content}>
          <MaterialIcons name="sports-soccer" size={42} color={Colors.brandTeal} />
          <Text style={styles.title}>Connect your team</Text>
          <Text style={styles.subtitle}>Sign in with official FPL OAuth or enter your Team ID directly.</Text>

          <View style={styles.tabs}>
            <TouchableOpacity style={[styles.tab, tab === 'login' && styles.activeTab]} onPress={() => { setTab('login'); setError(''); }}>
              <Text style={styles.tabText}>Log in with FPL (OAuth)</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tab, tab === 'teamId' && styles.activeTab]} onPress={() => { setTab('teamId'); setError(''); }}>
              <Text style={styles.tabText}>Team ID (Read-only)</Text>
            </TouchableOpacity>
          </View>

          {tab === 'login' ? (
            <>
              <Text style={styles.note}>Sign in securely via official FPL OAuth 2.0 (account.premierleague.com). Your credentials are handled directly by Premier League.</Text>
              <TouchableOpacity style={styles.button} disabled={loading} onPress={openWebView}>
                {loading ? <ActivityIndicator color={Colors.brandPurple} /> : <Text style={styles.buttonText}>Sign In with FPL</Text>}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.label}>TEAM ID</Text>
              <TextInput value={teamId} onChangeText={setTeamId} keyboardType="number-pad" placeholder="e.g. 1234567" placeholderTextColor={Colors.onSurfaceVariant} style={styles.input} />
              <TouchableOpacity style={styles.button} disabled={loading} onPress={connectTeamId}>
                {loading ? <ActivityIndicator color={Colors.brandPurple} /> : <Text style={styles.buttonText}>Connect Team ID</Text>}
              </TouchableOpacity>
            </>
          )}

          {!!infoMsg && <Text style={styles.infoBanner}>{infoMsg}</Text>}
          {!!error && <Text style={styles.error}>{error}</Text>}
          {!!confirmation && <Text style={styles.confirmation}>{confirmation}</Text>}
        </View>
      </KeyboardAvoidingView>

      <Modal visible={showWebView} animationType="slide" onRequestClose={closeWebView}>
        <SafeAreaView style={styles.webRoot} edges={['top', 'bottom']}>
          <View style={styles.webHeader}>
            <View style={styles.webHeaderLeft}>
              <Text style={styles.webTitle}>
                {loginStatus === 'finalizing' ? 'Finishing sign-in...' : 'FPL OAuth Secure Login'}
              </Text>
              {loginStatus === 'finalizing' && (
                <ActivityIndicator size="small" color={Colors.brandTeal} style={{ marginLeft: 8 }} />
              )}
            </View>
            <TouchableOpacity onPress={closeWebView}><MaterialIcons name="close" size={26} color={Colors.onSurface} /></TouchableOpacity>
          </View>
          <WebView
            ref={webViewRef}
            source={{ uri: FPL_LOGIN_URL }}
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            domStorageEnabled
            javaScriptEnabled
            onNavigationStateChange={handleNavigationStateChange}
            onMessage={handleWebViewMessage}
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.brandPurple },
  flex: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', padding: Spacing.lg, gap: 12 },
  title: { color: Colors.onSurface, fontSize: 34, fontFamily: 'ArchivoNarrow_700' },
  subtitle: { color: Colors.onSurfaceVariant, fontSize: 15, marginBottom: 12 },
  tabs: { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: Radii.lg, padding: 4 },
  tab: { flex: 1, padding: 12, alignItems: 'center', borderRadius: Radii.default },
  activeTab: { backgroundColor: Colors.brandTeal },
  tabText: { color: Colors.onSurface, fontWeight: '700', fontSize: 13 },
  label: { color: Colors.onSurfaceVariant, fontSize: 12, letterSpacing: 1, marginTop: 4 },
  input: { height: 52, color: Colors.onSurface, backgroundColor: Colors.surface, borderRadius: Radii.default, paddingHorizontal: 14, fontSize: 16 },
  note: { color: Colors.onSurfaceVariant, fontSize: 12, lineHeight: 18 },
  button: { height: 52, borderRadius: Radii.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.brandTeal, marginTop: 8 },
  buttonText: { color: Colors.brandPurple, fontSize: 18, fontWeight: '800' },
  error: { color: Colors.error, textAlign: 'center', marginTop: 8 },
  infoBanner: { color: Colors.brandTeal, backgroundColor: 'rgba(0, 255, 204, 0.1)', padding: 12, borderRadius: Radii.default, textAlign: 'center', fontSize: 14, fontWeight: '600', marginTop: 8 },
  confirmation: { color: Colors.brandTeal, textAlign: 'center', fontSize: 16, fontWeight: '700' },
  webRoot: { flex: 1, backgroundColor: Colors.brandPurple },
  webHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, backgroundColor: Colors.surface },
  webHeaderLeft: { flexDirection: 'row', alignItems: 'center' },
  webTitle: { color: Colors.onSurface, fontSize: 18, fontWeight: '700' },
});
