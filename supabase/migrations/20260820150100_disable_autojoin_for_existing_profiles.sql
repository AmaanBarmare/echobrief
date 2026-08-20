-- Auto-join was opt-out for every existing profile: the column defaulted to true
-- until 20260820120000 flipped the default to false, so every account created
-- before that date still has auto_join_enabled = true and receives bots it never
-- asked for. Combined with the missing responseStatus filter this is where the
-- bulk of the 219 failed/cancelled auto-join meetings came from.
--
-- Reset every existing profile to the new default. Users opt back in from
-- Settings; the column default already handles new signups.
UPDATE public.profiles
SET auto_join_enabled = false
WHERE auto_join_enabled IS DISTINCT FROM false;
