import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Menu, Mic, Search } from "lucide-react";
import { GlobalSearch } from "@/components/dashboard/GlobalSearch";
import { RecordingButton } from "@/components/dashboard/RecordingButton";
import { SplitButton } from "@/ui";

/**
 * Routes whose primary action is Record. Settings has no primary action, and
 * Action items gets "Add item" when that page moves to V2 — a button that opens
 * nothing is worse than no button, so it is not drawn yet.
 *
 * DESIGN_SPEC §1 also puts a notifications bell here. There is no notifications
 * surface in the product, so that is deliberately absent too.
 */
const RECORD_ROUTES = ["/dashboard", "/meeting", "/calendar", "/contacts", "/coaching", "/chat", "/workspace"];

export function HeaderV2({ onMenuClick }: { onMenuClick?: () => void }) {
  const location = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const showRecord = RECORD_ROUTES.some((r) => location.pathname.startsWith(r));

  return (
    <>
      <header className="sticky top-0 z-30 flex h-[60px] items-center justify-between gap-3 border-b border-eb-border bg-eb-bg/90 px-4 backdrop-blur md:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <button
            type="button"
            onClick={onMenuClick}
            aria-label="Open navigation menu"
            className="-ml-1 inline-flex h-9 w-9 flex-none items-center justify-center rounded-pill text-eb-secondary hover:bg-eb-row-hover lg:hidden"
          >
            <Menu size={18} strokeWidth={1.75} />
          </button>

          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="inline-flex h-9 w-full max-w-[360px] items-center gap-2.5 rounded-pill border border-eb-border bg-eb-card px-3.5 text-left shadow-eb-btn hover:bg-eb-row-hover"
          >
            <Search size={15} strokeWidth={1.75} className="flex-none text-eb-muted" />
            <span className="flex-1 truncate font-dmsans text-[13px] text-eb-muted">Search meetings…</span>
            <span className="hidden flex-none rounded-md bg-eb-chip px-1.5 py-0.5 font-mono text-[11px] text-eb-secondary sm:inline">
              ⌘K
            </span>
          </button>
        </div>

        {showRecord && (
          <RecordingButton
            renderTrigger={(open) => (
              <SplitButton icon={<Mic size={15} strokeWidth={2} />} onMain={open} onMenu={open}>
                Record
              </SplitButton>
            )}
          />
        )}
      </header>

      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}
