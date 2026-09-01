import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';

// Archivo Narrow (EN headlines)
import {
  ArchivoNarrow_400Regular,
  ArchivoNarrow_500Medium,
  ArchivoNarrow_600SemiBold,
  ArchivoNarrow_700Bold,
} from '@expo-google-fonts/archivo-narrow';

// Hanken Grotesk (EN body)
import {
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
  HankenGrotesk_700Bold,
  HankenGrotesk_800ExtraBold,
  HankenGrotesk_900Black,
} from '@expo-google-fonts/hanken-grotesk';

// JetBrains Mono (EN labels)
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_700Bold,
} from '@expo-google-fonts/jetbrains-mono';

// Cairo (AR headlines)
import {
  Cairo_400Regular,
  Cairo_600SemiBold,
  Cairo_700Bold,
  Cairo_800ExtraBold,
} from '@expo-google-fonts/cairo';

// IBM Plex Sans Arabic (AR body/labels)
import {
  IBMPlexSansArabic_400Regular,
  IBMPlexSansArabic_500Medium,
  IBMPlexSansArabic_600SemiBold,
  IBMPlexSansArabic_700Bold,
} from '@expo-google-fonts/ibm-plex-sans-arabic';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    ArchivoNarrow: ArchivoNarrow_400Regular,
    ArchivoNarrow_500: ArchivoNarrow_500Medium,
    ArchivoNarrow_600: ArchivoNarrow_600SemiBold,
    ArchivoNarrow_700: ArchivoNarrow_700Bold,

    HankenGrotesk: HankenGrotesk_400Regular,
    HankenGrotesk_500: HankenGrotesk_500Medium,
    HankenGrotesk_600: HankenGrotesk_600SemiBold,
    HankenGrotesk_700: HankenGrotesk_700Bold,
    HankenGrotesk_800: HankenGrotesk_800ExtraBold,
    HankenGrotesk_900: HankenGrotesk_900Black,

    JetBrainsMono: JetBrainsMono_400Regular,
    JetBrainsMono_500: JetBrainsMono_500Medium,
    JetBrainsMono_700: JetBrainsMono_700Bold,

    Cairo: Cairo_400Regular,
    Cairo_600: Cairo_600SemiBold,
    Cairo_700: Cairo_700Bold,
    Cairo_800: Cairo_800ExtraBold,

    IBMPlexSansArabic: IBMPlexSansArabic_400Regular,
    IBMPlexSansArabic_500: IBMPlexSansArabic_500Medium,
    IBMPlexSansArabic_600: IBMPlexSansArabic_600SemiBold,
    IBMPlexSansArabic_700: IBMPlexSansArabic_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  // Permanently block execution in Expo Go client
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return (
      <View style={expoGoGuardStyles.container}>
        <MaterialIcons name="block" size={64} color={Colors.brandTeal} style={{ marginBottom: 16 }} />
        <Text style={expoGoGuardStyles.title}>Development Build Required</Text>
        <Text style={expoGoGuardStyles.body}>
          This app requires the FPL Assistant development build. Please open the installed app directly, not Expo Go.
        </Text>
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="sign-up" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="connect-team" />
        <Stack.Screen name="home" />
        <Stack.Screen name="squad" />
        <Stack.Screen name="news" />
        <Stack.Screen name="ai" />
        <Stack.Screen name="profile" />
      </Stack>
    </>
  );
}

const expoGoGuardStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#37003C',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    color: '#00FF87',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  body: {
    color: '#FFFFFF',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
});
