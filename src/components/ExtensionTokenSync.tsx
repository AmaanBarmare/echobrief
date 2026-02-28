import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Syncs the Supabase session token to the EchoBrief Chrome extension
 * so it can authenticate uploads. The content script must be injected
 * into the web app to receive this.
 */
export function ExtensionTokenSync() {
  const { session } = useAuth();

  useEffect(() => {
    if (session?.access_token) {
      window.postMessage(
        { type: 'ECHOBRIEF_SET_TOKEN', token: session.access_token },
        '*'
      );
    }
  }, [session?.access_token]);

  return null;
}
