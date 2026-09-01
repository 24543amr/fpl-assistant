/**
 * FPL Assistant – Sign Up Screen
 *
 * Features:
 * - EN / AR language toggle (live, no reload) — same pattern as Login
 * - Four controlled inputs: Full Name, Email, Password, Confirm Password
 * - Client-side validation with field-level error states
 * - Password strength check (min 8 chars) + confirm match
 * - Password visibility toggles on both password fields
 * - Active-scale animation on submit button
 * - Navigates back to /login
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
    appSubheadline: 'Create your account',
    headline: 'Create account',
    nameLabel: 'FULL NAME',
    emailLabel: 'EMAIL',
    passwordLabel: 'PASSWORD',
    confirmLabel: 'CONFIRM PASSWORD',
    namePlaceholder: 'Enter your full name',
    emailPlaceholder: 'Enter your email',
    passwordPlaceholder: 'Choose a password',
    confirmPlaceholder: 'Re-enter your password',
    submitButton: 'Sign Up',
    termsText: 'By signing up, you agree to our ',
    termsLink: 'Terms & Privacy Policy',
    footerText: 'Already have an account?',
    loginLink: 'Log in',
    toggleLang: 'عربي',
    activeLang: 'EN',
    errors: {
      required: 'This field is required',
      email: 'Please enter a valid email',
      passwordWeak: 'Password must be at least 8 characters',
      passwordMismatch: 'Passwords do not match',
    },
  },
  ar: {
    appName: 'مساعد FPL',
    appSubheadline: 'أنشئ حسابك',
    headline: 'إنشاء حساب',
    nameLabel: 'الاسم بالكامل',
    emailLabel: 'البريد الإلكتروني',
    passwordLabel: 'كلمة المرور',
    confirmLabel: 'تأكيد كلمة المرور',
    namePlaceholder: 'أدخل اسمك بالكامل',
    emailPlaceholder: 'أدخل بريدك الإلكتروني',
    passwordPlaceholder: 'اختر كلمة مرور',
    confirmPlaceholder: 'أعد إدخال كلمة المرور',
    submitButton: 'إنشاء حساب',
    termsText: 'بإنشائك للحساب، أنت توافق على ',
    termsLink: 'الشروط وسياسة الخصوصية',
    footerText: 'عندك حساب بالفعل؟',
    loginLink: 'تسجيل الدخول',
    toggleLang: 'EN',
    activeLang: 'عربي',
    errors: {
      required: 'هذا الحقل مطلوب',
      email: 'يرجى إدخال بريد إلكتروني صحيح',
      passwordWeak: 'يجب أن تكون كلمة المرور 8 أحرف على الأقل',
      passwordMismatch: 'كلمتا المرور غير متطابقتين',
    },
  },
} as const;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ─── Field error type ─────────────────────────────────────────────────────────
type FieldErrors = {
  name?: string;
  email?: string;
  password?: string;
  confirm?: string;
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function SignUpScreen() {
  const router = useRouter();

  // Language
  const [isArabic, setIsArabic] = useState(false);
  const lang = isArabic ? 'ar' : 'en';
  const t = STRINGS[lang];
  const isRTL = isArabic;
  const textAlign = isRTL ? 'right' : 'left';
  const flexDir = isRTL ? 'row-reverse' : 'row';

  // Font helpers
  const headlineFont = isArabic ? 'Cairo_700' : 'ArchivoNarrow_700';
  const bodyFont = isArabic ? 'IBMPlexSansArabic' : 'HankenGrotesk';
  const labelFont = isArabic ? 'IBMPlexSansArabic_500' : 'JetBrainsMono_500';

  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isLoading, setIsLoading] = useState(false);

  // Button press animation
  const buttonScale = useRef(new Animated.Value(1)).current;
  const handlePressIn = () =>
    Animated.spring(buttonScale, { toValue: 0.97, useNativeDriver: true, speed: 30 }).start();
  const handlePressOut = () =>
    Animated.spring(buttonScale, { toValue: 1, useNativeDriver: true, speed: 20 }).start();

  // ── Validation ──────────────────────────────────────────────────────────────
  const validate = (): FieldErrors => {
    const errs: FieldErrors = {};
    if (!name.trim()) errs.name = t.errors.required;
    if (!email.trim()) {
      errs.email = t.errors.required;
    } else if (!EMAIL_REGEX.test(email.trim())) {
      errs.email = t.errors.email;
    }
    if (!password.trim()) {
      errs.password = t.errors.required;
    } else if (password.length < 8) {
      errs.password = t.errors.passwordWeak;
    }
    if (!confirm.trim()) {
      errs.confirm = t.errors.required;
    } else if (confirm !== password) {
      errs.confirm = t.errors.passwordMismatch;
    }
    return errs;
  };

  const handleSubmit = () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});
    setIsLoading(true);
    console.log('[FPL Assistant] Sign Up submitted', { name, email, password });
    setTimeout(() => {
      setIsLoading(false);
      router.replace('/onboarding');
    }, 1000);
  };

  const clearError = (field: keyof FieldErrors) =>
    setFieldErrors((prev) => ({ ...prev, [field]: undefined }));

  const hasErrors = Object.values(fieldErrors).some(Boolean);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      {/* Atmospheric blobs */}
      <View style={styles.blob1} pointerEvents="none" />
      <View style={styles.blob2} pointerEvents="none" />

      {/* Language Toggle */}
      <SafeAreaView style={styles.safeToggle} edges={['top']}>
        <TouchableOpacity
          style={styles.langToggle}
          onPress={() => setIsArabic(!isArabic)}
          activeOpacity={0.8}
        >
          <Text style={[styles.langActive, { fontFamily: labelFont }]}>{t.activeLang}</Text>
          <View style={styles.langDivider} />
          <Text style={[styles.langMuted, { fontFamily: labelFont }]}>{t.toggleLang}</Text>
        </TouchableOpacity>
      </SafeAreaView>

      {/* Scrollable content */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Header ── */}
          <View style={styles.header}>
            <View style={styles.logoBox}>
              <MaterialIcons name="sports-soccer" size={40} color={Colors.brandTeal} />
            </View>
            <Text style={[styles.appName, { fontFamily: headlineFont, textAlign: 'center' }]}>
              {t.appName}
            </Text>
            <Text style={[styles.appSubheadline, { fontFamily: bodyFont, textAlign: 'center' }]}>
              {t.appSubheadline}
            </Text>
          </View>

          {/* ── Form Card ── */}
          <View style={styles.card}>
            {/* Ambient glow */}
            <View style={styles.cardGlow} pointerEvents="none" />

            <Text style={[styles.cardHeadline, { fontFamily: headlineFont, textAlign }]}>
              {t.headline}
            </Text>

            {/* Full Name */}
            <FieldInput
              label={t.nameLabel}
              placeholder={t.namePlaceholder}
              value={name}
              onChangeText={(v) => { setName(v); clearError('name'); }}
              iconName="person"
              error={fieldErrors.name}
              isRTL={isRTL}
              bodyFont={bodyFont}
              labelFont={labelFont}
              textAlign={textAlign}
              autoCapitalize="words"
            />

            {/* Email */}
            <FieldInput
              label={t.emailLabel}
              placeholder={t.emailPlaceholder}
              value={email}
              onChangeText={(v) => { setEmail(v); clearError('email'); }}
              iconName="mail"
              error={fieldErrors.email}
              isRTL={isRTL}
              bodyFont={bodyFont}
              labelFont={labelFont}
              textAlign={textAlign}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            {/* Password */}
            <FieldInput
              label={t.passwordLabel}
              placeholder={t.passwordPlaceholder}
              value={password}
              onChangeText={(v) => { setPassword(v); clearError('password'); }}
              iconName="lock"
              error={fieldErrors.password}
              isRTL={isRTL}
              bodyFont={bodyFont}
              labelFont={labelFont}
              textAlign={textAlign}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              showToggle
              toggleVisible={showPassword}
              onToggle={() => setShowPassword((s) => !s)}
            />

            {/* Confirm Password */}
            <FieldInput
              label={t.confirmLabel}
              placeholder={t.confirmPlaceholder}
              value={confirm}
              onChangeText={(v) => { setConfirm(v); clearError('confirm'); }}
              iconName="lock"
              error={fieldErrors.confirm}
              isRTL={isRTL}
              bodyFont={bodyFont}
              labelFont={labelFont}
              textAlign={textAlign}
              secureTextEntry={!showConfirm}
              autoCapitalize="none"
              showToggle
              toggleVisible={showConfirm}
              onToggle={() => setShowConfirm((s) => !s)}
            />

            {/* Error summary box */}
            {hasErrors && (
              <View style={styles.errorBox}>
                <MaterialIcons name="warning" size={16} color={Colors.error} />
                <Text style={[styles.errorBoxText, { fontFamily: labelFont }]}>
                  {Object.values(fieldErrors).find(Boolean)}
                </Text>
              </View>
            )}

            {/* Submit */}
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
                    <Text style={[styles.submitText, { fontFamily: isArabic ? 'Cairo_700' : 'ArchivoNarrow_700' }]}>
                      {t.submitButton}
                    </Text>
                  )}
                </TouchableOpacity>
              </Animated.View>
            </View>

            {/* Terms */}
            <View style={[styles.termsRow, { flexDirection: flexDir }]}>
              <Text style={[styles.termsText, { fontFamily: bodyFont }]}>{t.termsText}</Text>
              <Text style={[styles.termsLink, { fontFamily: bodyFont }]}>{t.termsLink}</Text>
            </View>
          </View>

          {/* ── Footer ── */}
          <View style={[styles.footer, { flexDirection: flexDir }]}>
            <Text style={[styles.footerText, { fontFamily: bodyFont }]}>
              {t.footerText}{' '}
            </Text>
            <TouchableOpacity onPress={() => router.replace('/login')} activeOpacity={0.7}>
              <Text style={[styles.loginLink, { fontFamily: isArabic ? 'Cairo_700' : 'HankenGrotesk_700' }]}>
                {t.loginLink}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Reusable Field Input ─────────────────────────────────────────────────────
type FieldInputProps = {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (v: string) => void;
  iconName: React.ComponentProps<typeof MaterialIcons>['name'];
  error?: string;
  isRTL: boolean;
  bodyFont: string;
  labelFont: string;
  textAlign: 'left' | 'right';
  keyboardType?: 'default' | 'email-address';
  autoCapitalize?: 'none' | 'words' | 'sentences' | 'characters';
  secureTextEntry?: boolean;
  autoCorrect?: boolean;
  showToggle?: boolean;
  toggleVisible?: boolean;
  onToggle?: () => void;
};

function FieldInput({
  label,
  placeholder,
  value,
  onChangeText,
  iconName,
  error,
  isRTL,
  bodyFont,
  labelFont,
  textAlign,
  keyboardType = 'default',
  autoCapitalize = 'sentences',
  secureTextEntry = false,
  showToggle = false,
  toggleVisible = false,
  onToggle,
}: FieldInputProps) {
  const hasError = Boolean(error);
  const rightPad = showToggle ? 44 : (hasError ? 44 : Spacing.md);
  const leftPad = 44;

  return (
    <View style={fieldStyles.group}>
      <Text
        style={[
          fieldStyles.label,
          { fontFamily: labelFont, textAlign },
          hasError && fieldStyles.labelError,
        ]}
      >
        {label}
      </Text>

      <View style={[fieldStyles.wrapper, hasError && fieldStyles.wrapperError]}>
        {/* Leading icon */}
        <View style={isRTL ? fieldStyles.iconRight : fieldStyles.iconLeft}>
          <MaterialIcons
            name={iconName}
            size={20}
            color={hasError ? Colors.error : Colors.onSurfaceVariant}
          />
        </View>

        <TextInput
          style={[
            fieldStyles.input,
            {
              fontFamily: bodyFont,
              paddingLeft: isRTL ? rightPad : leftPad,
              paddingRight: isRTL ? leftPad : rightPad,
              textAlign,
            },
          ]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={Colors.onSurfaceVariant + '70'}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          secureTextEntry={secureTextEntry}
          selectionColor={Colors.brandTeal}
        />

        {/* Trailing: eye toggle OR error icon */}
        {showToggle ? (
          <TouchableOpacity
            style={isRTL ? fieldStyles.iconLeft : fieldStyles.iconRight}
            onPress={onToggle}
            activeOpacity={0.7}
          >
            <MaterialIcons
              name={toggleVisible ? 'visibility' : 'visibility-off'}
              size={20}
              color={Colors.onSurfaceVariant}
            />
          </TouchableOpacity>
        ) : hasError ? (
          <View style={isRTL ? fieldStyles.iconLeft : fieldStyles.iconRight}>
            <MaterialIcons name="error" size={20} color={Colors.error} />
          </View>
        ) : null}
      </View>

      {/* Inline field error */}
      {hasError && (
        <Text style={[fieldStyles.fieldError, { fontFamily: labelFont, textAlign }]}>
          {error}
        </Text>
      )}
    </View>
  );
}

// ─── Field Styles ─────────────────────────────────────────────────────────────
const fieldStyles = StyleSheet.create({
  group: {
    marginBottom: Spacing.formFieldGap,
  },
  label: {
    color: Colors.onSurfaceVariant,
    fontSize: 12,
    letterSpacing: 0.8,
    marginBottom: Spacing.xs,
    textTransform: 'uppercase',
  },
  labelError: {
    color: Colors.error,
  },
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.inputBackground,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  wrapperError: {
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
  fieldError: {
    color: Colors.error,
    fontSize: 11,
    marginTop: 4,
    letterSpacing: 0.3,
  },
});

// ─── Screen Styles ────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.brandPurple,
    overflow: 'hidden',
  },

  // Decorative blobs
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

  // Language toggle
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

  // Scroll
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.md,
    paddingTop: 80,
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

  // Card
  card: {
    width: '100%',
    backgroundColor: Colors.brandPurpleMid,
    borderRadius: Radii.xxl,
    padding: Spacing.cardPadding,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    overflow: 'hidden',
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
  cardHeadline: {
    color: Colors.white,
    fontSize: FontSizes.headlineMd,
    lineHeight: FontSizes.headlineMd * 1.2,
    fontWeight: '700',
    marginBottom: Spacing.lg,
  },

  // Error summary box
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
  errorBoxText: {
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

  // Terms
  termsRow: {
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginTop: Spacing.md,
  },
  termsText: {
    color: Colors.onSurfaceVariant,
    fontSize: FontSizes.xs,
    lineHeight: FontSizes.xs * 1.6,
    opacity: 0.8,
    textAlign: 'center',
  },
  termsLink: {
    color: Colors.brandTeal,
    fontSize: FontSizes.xs,
    lineHeight: FontSizes.xs * 1.6,
    textDecorationLine: 'underline',
    textDecorationColor: Colors.brandTeal,
  },

  // Footer
  footer: {
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.lg + Spacing.sm,
    flexWrap: 'wrap',
  },
  footerText: {
    color: Colors.onSurfaceVariant,
    fontSize: FontSizes.bodyMd,
  },
  loginLink: {
    color: Colors.brandTeal,
    fontSize: FontSizes.bodyMd,
    fontWeight: '700',
  },
});
