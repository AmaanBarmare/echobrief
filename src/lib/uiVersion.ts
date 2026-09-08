/**
 * Which UI a session renders.
 *
 * Resolution order:
 *   1. `?ui=v2` / `?ui=v1` in the URL — persisted to sessionStorage and stripped
 *      from the address bar, so it survives client-side navigation for the tab.
 *   2. The sessionStorage override from an earlier `?ui=` in this tab.
 *   3. `profiles.ui_v2`.
 *   4. V1.
 *
 * The override always beats the profile column, in both directions: a tester on
 * V2 can fall back to `?ui=v1` without a write, and anyone can preview V2.
 */
export type UiVersion = "v1" | "v2";

const KEY = "eb.ui-version";

function readStorage(): UiVersion | null {
  try {
    const v = sessionStorage.getItem(KEY);
    return v === "v1" || v === "v2" ? v : null;
  } catch {
    return null; // private mode / blocked storage
  }
}

function writeStorage(v: UiVersion) {
  try {
    sessionStorage.setItem(KEY, v);
  } catch {
    /* ignore — the override just won't survive a reload */
  }
}

/** Reads `?ui=` once, stores it, and removes it from the URL. */
export function consumeUiOverride(): UiVersion | null {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  const raw = url.searchParams.get("ui");
  if (raw === "v1" || raw === "v2") {
    writeStorage(raw);
    url.searchParams.delete("ui");
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    return raw;
  }
  return readStorage();
}

export function resolveUiVersion(profileFlag: boolean | null | undefined): UiVersion {
  return readStorage() ?? (profileFlag ? "v2" : "v1");
}
