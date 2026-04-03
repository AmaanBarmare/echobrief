import type { User } from '@supabase/supabase-js';

/** Display name from Supabase user_metadata (GoTrue uses both keys in different contexts). */
export function displayNameFromUserMetadata(user: User | null): string {
  if (!user?.user_metadata) return '';
  const m = user.user_metadata as Record<string, unknown>;
  const full = typeof m.full_name === 'string' ? m.full_name.trim() : '';
  const name = typeof m.name === 'string' ? m.name.trim() : '';
  return full || name || '';
}
