import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // supabase/functions is Deno code (Deno globals, deno test toolchain) owned
  // by the edge-function workflow — the browser-targeted ESLint config here
  // produces false positives on it (e.g. prefer-const on Deno destructuring).
  { ignores: ["dist", "supabase/functions"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // 200+ pre-existing `any`s. Downgraded so `npm run lint` gates on real
      // errors; burn these down over time rather than in one sweep.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
);
