import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { displayNameFromUserMetadata } from '@/lib/userDisplayName';

/**
 * If auth has a display name but profiles.full_name is empty, copy it into profiles.
 * Fixes users who signed up before we synced both metadata keys / trigger handled `name`.
 */
async function syncProfileFullNameFromAuth(user: User): Promise<void> {
  const fromAuth = displayNameFromUserMetadata(user);
  if (!fromAuth) return;

  const { data: row, error } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error || !row) return;

  const existing = typeof row.full_name === 'string' ? row.full_name.trim() : '';
  if (existing) return;

  await supabase.from('profiles').update({ full_name: fromAuth }).eq('user_id', user.id);
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isPasswordRecovery: boolean;
  clearPasswordRecovery: () => void;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  /**
   * True when this session is aal1 but the account has a verified second
   * factor — i.e. the password was accepted and the code has not been given
   * yet. Supabase does not block that sign-in, so the app has to.
   */
  mfaRequired: boolean;
  /** Re-read the assurance level after a challenge is passed. */
  refreshMfaStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  /** True until we resolve the initial session (getSession + listener). Avoids routing before auth is known. */
  const [loading, setLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(() => {
    // Check URL synchronously before Supabase clears the hash
    const hash = window.location.hash;
    const search = window.location.search;
    return hash.includes('type=recovery') || search.includes('type=recovery');
  });
  const profileNameSyncedForUserId = useRef<string | null>(null);
  const [mfaRequired, setMfaRequired] = useState(false);

  const clearPasswordRecovery = () => setIsPasswordRecovery(false);

  /**
   * Ask Supabase what this session is worth.
   *
   * `nextLevel` is aal2 exactly when the account has a verified factor, so
   * "enrolled but not yet challenged" is currentLevel aal1 with nextLevel aal2.
   * On any error this resolves to NOT required: a network blip must not lock a
   * user out of their own account, and the database enforces the real boundary
   * regardless of what this flag says.
   */
  const refreshMfaStatus = useCallback(async () => {
    try {
      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (error || !data) {
        setMfaRequired(false);
        return;
      }
      setMfaRequired(data.nextLevel === 'aal2' && data.currentLevel !== 'aal2');
    } catch {
      setMfaRequired(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const applySession = (nextSession: Session | null) => {
      const nextUser = nextSession?.user ?? null;
      setSession(nextSession);
      setUser(nextUser);
      setLoading(false);

      if (nextUser && profileNameSyncedForUserId.current !== nextUser.id) {
        profileNameSyncedForUserId.current = nextUser.id;
        void syncProfileFullNameFromAuth(nextUser);
      }
      if (!nextUser) {
        profileNameSyncedForUserId.current = null;
        setMfaRequired(false);
      } else {
        void refreshMfaStatus();
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        if (!isMounted) return;
        if (event === 'PASSWORD_RECOVERY') {
          setIsPasswordRecovery(true);
        }
        applySession(nextSession);
      }
    );

    supabase.auth
      .getSession()
      .then(({ data: { session: initialSession } }) => {
        if (!isMounted) return;
        applySession(initialSession);
      })
      .catch((err) => {
        console.error('[auth] getSession failed:', err);
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string, fullName: string) => {
    const trimmed = fullName.trim();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // GoTrue / dashboards often use `name`; our DB trigger reads both `full_name` and `name`.
        data: {
          full_name: trimmed,
          name: trimmed,
        },
        emailRedirectTo: window.location.origin,
      },
    });
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, isPasswordRecovery, clearPasswordRecovery, signUp, signIn, signOut, mfaRequired, refreshMfaStatus }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
