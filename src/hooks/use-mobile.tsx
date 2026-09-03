import * as React from "react";

const MOBILE_BREAKPOINT = 768;

/**
 * Subscribes to a media query.
 *
 * The initial value is read synchronously from `matchMedia` rather than being
 * filled in by an effect — otherwise every consumer renders one frame in the
 * desktop layout before correcting itself, which on a phone shows up as a
 * visible flash.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = React.useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(query).matches
      : false,
  );

  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** True below the given breakpoint (defaults to Tailwind's `md`, 768px). */
export function useIsMobile(breakpoint: number = MOBILE_BREAKPOINT): boolean {
  return useMediaQuery(`(max-width: ${breakpoint - 1}px)`);
}
