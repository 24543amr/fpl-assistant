import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, FontSizes, Spacing, Radii } from '@/constants/theme';

export default function NewsScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.container}>
        <Text style={styles.title}>FPL News & Updates</Text>
        <Text style={styles.sub}>Latest injury updates, team news, and expert tips.</Text>
        <TouchableOpacity style={styles.btn} onPress={() => router.replace('/home')}>
          <Text style={styles.btnText}>← Back to Home</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.brandPurple },
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg, gap: Spacing.md },
  title: { color: Colors.white, fontSize: FontSizes.headlineMd, fontFamily: 'ArchivoNarrow_700' },
  sub: { color: Colors.onSurfaceVariant, fontSize: FontSizes.bodyMd, fontFamily: 'HankenGrotesk', textAlign: 'center' },
  btn: { backgroundColor: Colors.brandTeal, paddingHorizontal: Spacing.lg, paddingVertical: 12, borderRadius: Radii.lg, marginTop: Spacing.md },
  btnText: { color: Colors.brandPurple, fontFamily: 'HankenGrotesk_700', fontWeight: '700' },
});
