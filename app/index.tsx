import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { getStoredTeamId, getStoredFplToken, isTokenExpiringSoon, clearStoredFplToken } from '@/utils/storage';
import { refreshFplToken } from '@/api/fpl';
import { Colors } from '@/constants/theme';

export default function Index() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function checkAuthAndNavigate() {
      try {
        const teamId = await getStoredTeamId();
        const tokens = await getStoredFplToken();

        if (tokens?.accessToken) {
          const expiring = isTokenExpiringSoon(tokens.accessToken);
          console.log(`[Index Launch Check] Stored OIDC token found. Expiring soon: ${expiring}`);

          if (expiring && tokens.refreshToken) {
            console.log('[Index Launch Check] Token is expired or expiring soon. Performing proactive silent refresh...');
            const refreshResult = await refreshFplToken(tokens.refreshToken, tokens.accessToken);

            if (!refreshResult.success) {
              console.warn('[Index Launch Check] Proactive refresh failed — refresh token expired. Redirecting to connect-team.');
              await clearStoredFplToken();
              router.replace({ pathname: '/connect-team', params: { expired: '1' } });
              return;
            } else {
              console.log('[Index Launch Check] Proactive refresh SUCCESS! New token saved. Redirecting to /home');
            }
          }

          router.replace('/home');
        } else if (teamId) {
          console.log('[Index Launch Check] Stored Team ID found. Redirecting to /home');
          router.replace('/home');
        } else {
          console.log('[Index Launch Check] No stored session found. Redirecting to /connect-team');
          router.replace('/connect-team');
        }
      } catch (e) {
        console.warn('[Index Launch Check] Check auth failed:', e);
        router.replace('/connect-team');
      } finally {
        setChecking(false);
      }
    }

    checkAuthAndNavigate();
  }, [router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={Colors.brandTeal} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.brandPurple,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
