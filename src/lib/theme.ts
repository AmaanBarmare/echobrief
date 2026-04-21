import { useTheme } from '@/contexts/ThemeContext';

/** Warm Dispatch — dark (warm charcoal, never pure black) */
const dark = {
  bg: '#1A1612',           // char
  bgCard: '#26201A',        // char-card
  bgCardH: '#2F2920',       // char-raised hover
  border: '#3A3127',        // rule-dark
  borderL: '#4A4035',
  text: '#ECE3D2',          // bone
  textS: '#B8AD9C',         // bone-mid
  textM: '#897E6E',         // bone-soft
  orange: '#E8430A',        // ember dark-mode per brand kit
  amber: '#F5C842',         // gold per brand kit
  orangeL: '#FF6B35',
  orangeD: '#C23508',
  green: '#3FBE6C',
  blue: '#4B8BD9',
  purple: '#B07AD8',
  red: '#E8654B',
  // Gradient retained only for non-text uses (buttons where solid looks flat)
  gradient: 'linear-gradient(135deg, #E85C1A, #E8A431)',
} as const;

/** Warm Dispatch — light (warm paper, never pure white) */
const light = {
  bg: '#F6F2EB',
  bgCard: '#FCFAF5',
  bgCardH: '#EFEADE',
  border: '#E3DCCD',
  borderL: '#D5CCBA',
  text: '#1D1712',
  textS: '#5B4F44',
  textM: '#8C7F71',
  orange: '#D93F0B',        // ember light-mode per brand kit
  amber: '#D4900A',         // gold-deep per brand kit
  orangeL: '#E84D1A',
  orangeD: '#B83508',
  green: '#2E8E52',
  blue: '#3B6FB8',
  purple: '#8A5AC0',
  red: '#C94330',
  gradient: 'linear-gradient(135deg, #D94D0B, #D48E0A)',
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
