/**
 * FPL Assistant – Login Screen
 *
 * Features:
 * - EN / AR language toggle (live, no reload)
 * - Controlled inputs with client-side validation
 * - Error state with styled message box
 * - Password visibility toggle
 * - Atmospheric background blobs
 * - Ambient teal glow on form card
 * - Active scale animation on submit button
 * - Navigates to /sign-up stub on footer link tap
 */

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { Colors, FontSizes, Radii, Spacing } from '@/constants/theme';

// ─── i18n strings ────────────────────────────────────────────────────────────
const STRINGS = {
  en: {
    appName: 'FPL Assistant',
    appSubheadline: 'Log in to manage your squad',
    welcomeBack: 'Welcome back',
    emailLabel: 'EMAIL',
    passwordLabel: 'PASSWORD',
    forgotPassword: 'Forgot password?',
    loginButton: 'Log In',
    orDivider: 'OR',
    footerText: "Don't have an account?",
    signUp: 'Sign up',
    errorMessage: 'Invalid email or password',
    toggleLang: 'عربي',
    activeLang: 'EN',
    emailPlaceholder: 'Enter your email',
    passwordPlaceholder: 'Enter your password',
  },
  ar: {
    appName: 'مساعد FPL',
    appSubheadline: 'سجل دخولك لإدارة فريقك',
    welcomeBack: 'أهلاً بعودتك',
    emailLabel: 'البريد الإلكتروني',
    passwordLabel: 'كلمة المرور',
    forgotPassword: 'نسيت كلمة المرور؟',
    loginButton: 'تسجيل الدخول',
    orDivider: 'أو',
    footerText: 'لسه معملتش حساب؟',
    signUp: 'سجل الآن',
    errorMessage: 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
    toggleLang: 'EN',
    activeLang: 'عربي',
    emailPlaceholder: 'أدخل بريدك الإلكتروني',
    passwordPlaceholder: 'أدخل كلمة المرور',
  },
} as const;

// ─── Email validation ─────────────────────────────────────────────────────────
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ─── Component ────────────────────────────────────────────────────────────────
export default function LoginScreen() {
  const router = useRouter();

  // Language state
  const [isArabic, setIsArabic] = useState(false);
  const lang = isArabic ? 'ar' : 'en';
  const t = STRINGS[lang];
  const isRTL = isArabic;

  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [emailError, setEmailError] = useState(false);
  const [passwordError, setPasswordError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Button animation
  const buttonScale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(buttonScale, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 30,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(buttonScale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
    }).start();
  };

  // Validation + submit
  const handleSubmit = () => {
    const emailInvalid = !email.trim() || !EMAIL_REGEX.test(email.trim());
    const passwordInvalid = !password.trim();

    if (emailInvalid || passwordInvalid) {
      setEmailError(emailInvalid);
      setPasswordError(passwordInvalid);
      setHasError(true);
      return;
    }

    // Clear errors
    setHasError(false);
    setEmailError(false);
    setPasswordError(false);

    // Simulate submit → navigate to onboarding
    setIsLoading(true);
    // Never log credentials. FPL authentication happens only on Connect Team.
    setTimeout(() => {
      setIsLoading(false);
      router.replace('/onboarding');
    }, 1000);
  };

  // Font helpers based on language
  const headlineFont = isArabic ? 'Cairo_700' : 'ArchivoNarrow_700';
  const headlineFontMd = isArabic ? 'Cairo_600' : 'ArchivoNarrow_600';
  const bodyFont = isArabic ? 'IBMPlexSansArabic' : 'HankenGrotesk';
  const labelFont = isArabic ? 'IBMPlexSansArabic_500' : 'JetBrainsMono_500';
  const textAlign = isRTL ? 'right' : 'left';
  const flexDir = isRTL ? 'row-reverse' : 'row';

  return (
    <View style={styles.root}>
      {/* ── Atmospheric background blobs ───────────────────────────── */}
      <View style={styles.blob1} pointerEvents="none" />
      <View style={styles.blob2} pointerEvents="none" />

      {/* ── Language Toggle ────────────────────────────────────────── */}
      <SafeAreaView style={styles.safeToggle} edges={['top']}>
        <TouchableOpacity
          style={styles.langToggle}
          onPress={() => setIsArabic(!isArabic)}
          activeOpacity={0.8}
        >
          <Text style={[styles.langActive, { fontFamily: labelFont }]}>
            {t.activeLang}
          </Text>
          <View style={styles.langDivider} />
          <Text style={[styles.langMuted, { fontFamily: labelFont }]}>
            {t.toggleLang}
          </Text>
        </TouchableOpacity>
      </SafeAreaView>

      {/* ── Scrollable content ─────────────────────────────────────── */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Header ───────────────────────────────────────────── */}
          <View style={styles.header}>
            {/* Logo box with teal glow */}
            <View style={styles.logoBox}>
              {/* Soccer ball icon as stand-in for the logo */}
              <MaterialIcons name="sports-soccer" size={40} color={Colors.brandTeal} />
            </View>

            <Text
              style={[
                styles.appName,
                { fontFamily: headlineFont, textAlign: 'center' },
              ]}
            >
              {t.appName}
            </Text>
            <Text
              style={[
                styles.appSubheadline,
                { fontFamily: bodyFont, textAlign: 'center' },
              ]}
            >
              {t.appSubheadline}
            </Text>
          </View>

          {/* ── Form Card ─────────────────────────────────────────── */}
          <View style={styles.card}>
            {/* Ambient teal glow (top-right of card) */}
            <View style={styles.cardGlow} pointerEvents="none" />

            <Text
              style={[
                styles.welcomeText,
                { fontFamily: headlineFontMd, textAlign },
              ]}
            >
              {t.welcomeBack}
            </Text>

            {/* ── Email Field ─────────────────────────────────────── */}
            <View style={styles.fieldGroup}>
              <Text
                style={[
                  styles.fieldLabel,
                  { fontFamily: labelFont, textAlign },
                  emailError && styles.fieldLabelError,
                ]}
              >
                {t.emailLabel}
              </Text>
              <View
                style={[
                  styles.inputWrapper,
                  emailError && styles.inputWrapperError,
                ]}
              >
                <View
                  style={[
                    styles.iconLeft,
                    isRTL && styles.iconRight,
                  ]}
                >
                  <MaterialIcons
                    name="mail"
                    size={20}
                    color={emailError ? Colors.error : Colors.onSurfaceVariant}
                  />
                </View>
                <TextInput
                  style={[
                    styles.input,
                    isRTL
                      ? { paddingRight: 44, paddingLeft: Spacing.md, textAlign: 'right' }
                      : { paddingLeft: 44, paddingRight: Spacing.md },
                    { fontFamily: bodyFont },
                    emailError && styles.inputError,
                  ]}
                  value={email}
                  onChangeText={(v) => {
                    setEmail(v);
                    if (emailError) setEmailError(false);
                    if (hasError) setHasError(false);
                  }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder={t.emailPlaceholder}
                  placeholderTextColor={Colors.onSurfaceVariant + '80'}
                  selectionColor={Colors.brandTeal}
                />
                {emailError && (
                  <View style={styles.iconRight}>
                    <MaterialIcons name="error" size={20} color={Colors.error} />
                  </View>
                )}
              </View>
            </View>

            {/* ── Password Field ──────────────────────────────────── */}
            <View style={styles.fieldGroup}>
              <View
                style={[
                  styles.passwordLabelRow,
                  { flexDirection: flexDir },
                ]}
              >
                <Text
                  style={[
                    styles.fieldLabel,
                    { fontFamily: labelFont },
                    passwordError && styles.fieldLabelError,
                  ]}
                >
                  {t.passwordLabel}
                </Text>
                <TouchableOpacity activeOpacity={0.7}>
                  <Text style={[styles.forgotLink, { fontFamily: labelFont }]}>
                    {t.forgotPassword}
                  </Text>
                </TouchableOpacity>
              </View>

              <View
                style={[
                  styles.inputWrapper,
                  passwordError && styles.inputWrapperError,
                ]}
              >
                <View
                  style={[
                    styles.iconLeft,
                    isRTL && styles.iconRight,
                  ]}
                >
                  <MaterialIcons
                    name="lock"
                    size={20}
                    color={passwordError ? Colors.error : Colors.onSurfaceVariant}
                  />
                </View>
                <TextInput
                  style={[
                    styles.input,
                    isRTL
                      ? { paddingRight: 44, paddingLeft: 44, textAlign: 'right' }
                      : { paddingLeft: 44, paddingRight: 44 },
                    { fontFamily: bodyFont },
                    passwordError && styles.inputError,
                  ]}
                  value={password}
                  onChangeText={(v) => {
                    setPassword(v);
                    if (passwordError) setPasswordError(false);
                    if (hasError) setHasError(false);
                  }}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder={t.passwordPlaceholder}
                  placeholderTextColor={Colors.onSurfaceVariant + '80'}
                  selectionColor={Colors.brandTeal}
                />
                <TouchableOpacity
                  style={isRTL ? styles.eyeButtonLeftRTL : styles.eyeButton}
                  onPress={() => setShowPassword(!showPassword)}
                  activeOpacity={0.7}
                >
                  <MaterialIcons
                    name={showPassword ? 'visibility' : 'visibility-off'}
                    size={20}
                    color={Colors.onSurfaceVariant}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* ── Error message box ────────────────────────────────── */}
            {hasError && (
              <View style={styles.errorBox}>
                <MaterialIcons name="warning" size={16} color={Colors.error} />
                <Text style={[styles.errorText, { fontFamily: labelFont }]}>
                  {t.errorMessage}
                </Text>
              </View>
            )}

            {/* ── Submit Button ─────────────────────────────────────── */}
            <View style={styles.submitWrapper}>
              <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
                <TouchableOpacity
                  style={styles.submitButton}
                  onPress={handleSubmit}
                  onPressIn={handlePressIn}
                  onPressOut={handlePressOut}
                  activeOpacity={1}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color={Colors.brandPurple} size="small" />
                  ) : (
                    <Text
                      style={[
                        styles.submitText,
                        { fontFamily: headlineFontMd },
                      ]}
                    >
                      {t.loginButton}
                    </Text>
                  )}
                </TouchableOpacity>
              </Animated.View>
            </View>

            {/* ── Divider ───────────────────────────────────────────── */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text
                style={[
                  styles.dividerText,
                  { fontFamily: labelFont },
                ]}
              >
                {t.orDivider}
              </Text>
              <View style={styles.dividerLine} />
            </View>
          </View>

          {/* ── Footer ────────────────────────────────────────────── */}
          <View style={styles.footer}>
            <Text
              style={[
                styles.footerText,
                { fontFamily: bodyFont },
              ]}
            >
              {t.footerText}{' '}
            </Text>
            <TouchableOpacity
              onPress={() => router.push('/sign-up')}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.signUpLink,
                  { fontFamily: isArabic ? 'Cairo_700' : 'HankenGrotesk_700' },
                ]}
              >
                {t.signUp}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.brandPurple,
    overflow: 'hidden',
  },

  // Atmospheric background (decorative blurred circles — approximated as low-opacity solid circles)
  blob1: {
    position: 'absolute',
    top: -80,
    left: -60,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: Colors.atmosphericPurple1,
    opacity: 0.25,
  },
  blob2: {
    position: 'absolute',
    bottom: -80,
    right: -60,
    width: 350,
    height: 350,
    borderRadius: 175,
    backgroundColor: Colors.atmosphericPurple2,
    opacity: 0.2,
  },

  // Language toggle (pinned top-right)
  safeToggle: {
    position: 'absolute',
    top: 0,
    right: Spacing.md,
    zIndex: 50,
  },
  langToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(51,53,53,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    borderRadius: Radii.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 12,
  },
  langActive: {
    color: Colors.onSurface,
    fontSize: FontSizes.labelMd,
    letterSpacing: 0.5,
  },
  langDivider: {
    width: 1,
    height: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  langMuted: {
    color: Colors.onSurfaceVariant,
    fontSize: FontSizes.labelMd,
    opacity: 0.7,
  },

  // Scroll content
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.md,
    paddingTop: 80, // clear the language toggle
    paddingBottom: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Header
  header: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
    width: '100%',
  },
  logoBox: {
    width: 80,
    height: 80,
    borderRadius: Radii.xxl,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    // Teal glow shadow
    shadowColor: Colors.brandTeal,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 12,
  },
  appName: {
    color: Colors.white,
    fontSize: FontSizes.displayLgMobile,
    lineHeight: FontSizes.displayLgMobile * 1.1,
    fontWeight: '700',
    marginBottom: Spacing.xs,
  },
  appSubheadline: {
    color: Colors.onSurfaceVariant,
    fontSize: FontSizes.bodyMd,
    lineHeight: FontSizes.bodyMd * 1.6,
    maxWidth: 280,
  },

  // Form card
  card: {
    width: '100%',
    backgroundColor: Colors.brandPurpleMid,
    borderRadius: Radii.xxl,
    padding: Spacing.cardPadding,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    overflow: 'hidden',
    // Shadow
    shadowColor: 'rgba(18,0,20,1)',
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.6,
    shadowRadius: 48,
    elevation: 16,
  },
  cardGlow: {
    position: 'absolute',
    top: -60,
    right: -60,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: Colors.brandTeal,
    opacity: 0.08,
  },

  welcomeText: {
    color: Colors.white,
    fontSize: FontSizes.headlineMd,
    lineHeight: FontSizes.headlineMd * 1.2,
    fontWeight: '600',
    marginBottom: Spacing.lg,
  },

  // Field
  fieldGroup: {
    marginBottom: Spacing.formFieldGap,
  },
  fieldLabel: {
    color: Colors.onSurfaceVariant,
    fontSize: 12,
    letterSpacing: 0.8,
    marginBottom: Spacing.xs,
    textTransform: 'uppercase',
  },
  fieldLabelError: {
    color: Colors.error,
  },
  passwordLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: Spacing.xs,
  },
  forgotLink: {
    color: Colors.brandTeal,
    fontSize: 12,
    letterSpacing: 0.5,
  },

  inputWrapper: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.inputBackground,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  inputWrapperError: {
    borderColor: Colors.error,
    shadowColor: Colors.error,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  iconLeft: {
    position: 'absolute',
    left: 12,
    zIndex: 1,
  },
  iconRight: {
    position: 'absolute',
    right: 12,
    zIndex: 1,
  },
  input: {
    flex: 1,
    color: Colors.white,
    fontSize: FontSizes.bodyMd,
    paddingVertical: 14,
    minHeight: 50,
  },
  inputError: {
    // border handled on wrapper
  },

  eyeButton: {
    position: 'absolute',
    right: 12,
    padding: 4,
    zIndex: 1,
  },
  eyeButtonLeftRTL: {
    position: 'absolute',
    left: 12,
    padding: 4,
    zIndex: 1,
  },

  // Error box
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: 'rgba(147,0,10,0.20)',
    borderWidth: 1,
    borderColor: 'rgba(255,180,171,0.30)',
    borderRadius: Radii.default,
    padding: Spacing.xs + 2,
    marginBottom: Spacing.sm,
    marginTop: -Spacing.sm,
  },
  errorText: {
    color: Colors.error,
    fontSize: FontSizes.labelMd,
    flex: 1,
    flexWrap: 'wrap',
  },

  // Submit
  submitWrapper: {
    marginTop: Spacing.xs,
  },
  submitButton: {
    backgroundColor: Colors.brandTeal,
    borderRadius: Radii.lg,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  submitText: {
    color: Colors.brandPurple,
    fontSize: FontSizes.bodyLg,
    fontWeight: '700',
  },

  // Divider
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.lg,
    gap: Spacing.sm,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  dividerText: {
    color: Colors.onSurfaceVariant,
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },

  // Footer
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.lg + Spacing.sm,
    flexWrap: 'wrap',
  },
  footerText: {
    color: Colors.onSurfaceVariant,
    fontSize: FontSizes.bodyMd,
  },
  signUpLink: {
    color: Colors.brandTeal,
    fontSize: FontSizes.bodyMd,
    fontWeight: '700',
  },
});
