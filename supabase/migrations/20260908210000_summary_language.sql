-- Summary output language.
--
-- The transcript always stays in the language it was spoken in; this only picks
-- the language the SYNTHESISED prose is written in — summary_short,
-- summary_detailed, key_points, strategic insights and follow-up descriptions.
--
-- Decisions and action items are assembled deterministically from verbatim
-- quoted facts, so they remain in the language of the quote either way. That is
-- a deliberate limit, not an oversight: translating a quoted commitment would
-- make it no longer a quote.
--
-- 'en' is the default and the behaviour every existing meeting was produced
-- with, so this column changes nothing until a user turns it on.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS summary_language TEXT NOT NULL DEFAULT 'en';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_summary_language_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_summary_language_check
  CHECK (summary_language IN ('en', 'hi'));

COMMENT ON COLUMN public.profiles.summary_language IS
  'Language the synthesised summary prose is written in. en (default) or hi. Transcript language is unaffected.';
