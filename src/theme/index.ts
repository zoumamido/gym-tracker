export const colors = {
  bg: '#0A0B10',
  surface: '#11131A',
  card: '#161923',
  cardAlt: '#1D2130',
  elevated: '#232838',
  border: '#262B3B',
  borderStrong: '#343A4E',
  text: '#F4F5F8',
  textDim: '#A3A9BC',
  textMuted: '#6B7189',
  primary: '#7C5CFF',
  primarySoft: 'rgba(124, 92, 255, 0.16)',
  primaryText: '#B4A3FF',
  accent: '#22D3EE',
  success: '#34D399',
  successSoft: 'rgba(52, 211, 153, 0.14)',
  warning: '#FBBF24',
  warningSoft: 'rgba(251, 191, 36, 0.14)',
  danger: '#F87171',
  dangerSoft: 'rgba(248, 113, 113, 0.14)',
  water: '#38BDF8',
  waterSoft: 'rgba(56, 189, 248, 0.14)',
  orange: '#FB923C',
  pink: '#F472B6',
  overlay: 'rgba(5, 6, 10, 0.72)',
} as const;

export const gradients = {
  primary: ['#8B5CF6', '#6366F1', '#3B82F6'] as const,
  water: ['#38BDF8', '#2563EB'] as const,
  success: ['#34D399', '#0D9488'] as const,
  fire: ['#FB923C', '#F43F5E'] as const,
  gold: ['#FDE68A', '#F59E0B'] as const,
  card: ['#1C2030', '#141721'] as const,
  hero: ['#2A1F5C', '#141728'] as const,
};

export const radius = { xs: 8, sm: 12, md: 16, lg: 22, xl: 28, pill: 999 } as const;

export const space = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 20, xl: 24, xxl: 32 } as const;

export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extrabold: 'Inter_800ExtraBold',
} as const;

export const type = {
  display: { fontFamily: fonts.extrabold, fontSize: 34, lineHeight: 40, letterSpacing: -0.8 },
  title: { fontFamily: fonts.bold, fontSize: 26, lineHeight: 32, letterSpacing: -0.5 },
  h2: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 26, letterSpacing: -0.3 },
  h3: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22, letterSpacing: -0.1 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  bodyMedium: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 22 },
  small: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16 },
  overline: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 1.2, textTransform: 'uppercase' as const },
  number: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 34, letterSpacing: -0.6, fontVariant: ['tabular-nums' as const] },
} as const;

export type TypeVariant = keyof typeof type;

/** Category colours used across coach/actions/charts. */
export const categoryColor = {
  nutrition: colors.orange,
  training: colors.primary,
  hydration: colors.water,
  recovery: colors.success,
  tracking: colors.accent,
  health: colors.pink,
} as const;
