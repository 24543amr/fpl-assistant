/**
 * FPL Assistant – Design Token Constants
 * Source: Stitch / Google Fonts exports (login_english_filled, login_arabic_filled, login_error_state)
 *
 * Import from any screen: import { Colors, Typography, Radii, Spacing } from '@/constants/theme'
 */

// ─── Color Palette ────────────────────────────────────────────────────────────
export const Colors = {
  // Brand
  brandPurple: '#37003C',       // Screen background
  brandPurpleMid: '#4A0E52',    // Form card background (brand-purple-light)
  brandTeal: '#00FF87',         // Accent / primary button / focus ring

  // Surface
  inputBackground: '#1E0021',   // Text input fill
  surface: '#121414',           // General surface
  surfaceVariant: '#333535',    // Toggle pill bg (50% opacity in use)
  surfaceContainerHighest: '#333535',

  // On-Surface (text)
  onSurface: '#E2E2E2',         // Primary text on dark bg (white-ish)
  onSurfaceVariant: '#D2C2CD',  // Secondary / muted text

  // Error
  error: '#FFB4AB',             // Error text / border
  errorContainer: '#93000A',    // Error box bg (used at ~20% opacity)
  onError: '#690005',

  // Misc
  white: '#FFFFFF',
  transparent: 'transparent',

  // Atmospheric / decorative
  atmosphericPurple1: '#69316B',  // Soft ambient glow circle 1
  atmosphericPurple2: '#4F1953',  // Soft ambient glow circle 2

  // Additional tokens (onboarding & dashboard)
  tertiary: '#00DBE9',            // Cyan accent — eyebrow / step labels
  secondaryContainer: '#34FF8C',  // Dashboard live teal accent
  surfaceContainerLowest: '#0C0F0F', // URL bar mockup bg
  surfaceContainer: '#1E2020',    // Modal header bg / browser header
  surfaceContainerHigh: '#282A2B', // Modal body bg
  outlineVariant: '#4F434D',      // Subtle dividers
} as const;

// ─── Typography ───────────────────────────────────────────────────────────────
export const Fonts = {
  // English / LTR fonts
  archivoNarrow: 'ArchivoNarrow',
  hankenGrotesk: 'HankenGrotesk',
  jetbrainsMono: 'JetBrainsMono',

  // Arabic / RTL fonts
  cairo: 'Cairo',
  ibmPlexSansArabic: 'IBMPlexSansArabic',
} as const;

export const FontSizes = {
  displayLgMobile: 36,   // App name headline
  displayLg: 48,
  headlineMd: 32,        // "Welcome back" / form section headline
  headlineSm: 24,        // Submit button text
  bodyLg: 18,
  bodyMd: 16,            // Subheadline, body copy, input text
  labelMd: 14,           // Input labels (uppercase mono)
  xs: 12,
} as const;

export const LineHeights = {
  displayLg: 1.1,
  headlineMd: 1.2,
  bodyMd: 1.6,
  labelMd: 1.4,
} as const;

export const LetterSpacings = {
  displayLg: -0.02,   // em equiv
  labelMd: 0.8,       // wide / tracking-wider (absolute px)
  labelWide: 1.0,
} as const;

// ─── Border Radii ─────────────────────────────────────────────────────────────
export const Radii = {
  default: 4,
  lg: 8,            // Inputs / buttons
  xl: 12,
  xxl: 20,          // Cards / logo
  full: 9999,       // Pills / toggle
} as const;

// ─── Spacing ──────────────────────────────────────────────────────────────────
export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 40,
  gutter: 20,
  cardPadding: 24,        // Card inner padding (md screens)
  cardPaddingLg: 32,      // Card inner padding (lg screens)
  formFieldGap: 20,       // Gap between form fields
} as const;
