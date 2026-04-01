// ─── Warm Ember Design Tokens ───
// Matches the prototype exactly. Use these for inline styles across components.

export const T = {
  bg: "#0C0A09",
  bgCard: "#1C1917",
  bgCardH: "#292524",
  border: "#292524",
  borderL: "#44403C",
  text: "#FAFAF9",
  textS: "#A8A29E",
  textM: "#78716C",
  orange: "#F97316",
  amber: "#F59E0B",
  orangeL: "#FB923C",
  orangeD: "#EA580C",
  green: "#22C55E",
  blue: "#3B82F6",
  purple: "#A855F7",
  red: "#EF4444",
  gradient: "linear-gradient(135deg, #F97316, #F59E0B)",
} as const;

export type ThemeTokens = typeof T;
