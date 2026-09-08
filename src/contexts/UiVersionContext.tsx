import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { consumeUiOverride, resolveUiVersion, type UiVersion } from "@/lib/uiVersion";

type Ctx = {
  ui: UiVersion;
  /** True while the profile flag is still being read. Callers render V1 meanwhile. */
  loading: boolean;
};

const UiVersionContext = createContext<Ctx>({ ui: "v1", loading: false });

/**
 * Resolves the Console (UI v2) flag once per session. Reading it does not block
 * the app: until the profile row arrives the session renders V1, which is what
 * an unflagged user sees anyway.
 *
 * Phase 0 only publishes the value — no route or shell reads it yet.
 */
export function UiVersionProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  // Read the ?ui= override before anything else so a preview link works even
  // for a signed-out visitor landing straight on a protected route.
  const [override] = useState<UiVersion | null>(() => consumeUiOverride());
  const [profileFlag, setProfileFlag] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setProfileFlag(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    supabase
      .from("profiles")
      .select("ui_v2")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setProfileFlag(data?.ui_v2 ?? false);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const value = useMemo<Ctx>(
    () => ({ ui: override ?? resolveUiVersion(profileFlag), loading: loading && !override }),
    [override, profileFlag, loading],
  );

  return <UiVersionContext.Provider value={value}>{children}</UiVersionContext.Provider>;
}

export function useUiVersion() {
  return useContext(UiVersionContext);
}
