import { useTheme } from '@/contexts/ThemeContext';

/** Warm Ember: dark dashboard / app chrome (Stone + ember accents) */
const dark = {
  bg: '#0C0A09',
  bgCard: '#1C1917',
  bgCardH: '#292524',
  border: '#292524',
  borderL: '#44403C',
  text: '#FAFAF9',
  textS: '#A8A29E',
  textM: '#78716C',
  orange: '#F97316',
  amber: '#F59E0B',
  orangeL: '#FB923C',
  orangeD: '#EA580C',
  green: '#22C55E',
  blue: '#3B82F6',
  purple: '#A855F7',
  red: '#EF4444',
  gradient: 'linear-gradient(135deg, #F97316, #F59E0B)',
} as const;

/** Light surfaces: warm paper, crisp borders (BRAND.md light lockup) */
const light = {
  bg: '#FAFAF9',
  bgCard: '#FFFFFF',
  bgCardH: '#F5F5F4',
  border: '#E7E5E4',
  borderL: '#D6D3D1',
  text: '#1C1917',
  textS: '#57534E',
  textM: '#78716C',
  orange: '#F97316',
  amber: '#F59E0B',
  orangeL: '#EA580C',
  orangeD: '#C2410C',
  green: '#22C55E',
  blue: '#3B82F6',
  purple: '#A855F7',
  red: '#EF4444',
  gradient: 'linear-gradient(135deg, #F97316, #F59E0B)',
} as const;

export type ThemeTokens = typeof dark;

export const themeTokens: Record<'light' | 'dark', ThemeTokens> = {
  dark,
  light,
};

/** @deprecated Prefer useThemeTokens() for theme-aware surfaces */
export const T = dark;

export function useThemeTokens(): ThemeTokens {
  const { resolvedTheme } = useTheme();
  return themeTokens[resolvedTheme];
}
