import { useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { SidebarV2 } from "./SidebarV2";
import { HeaderV2 } from "./HeaderV2";

/**
 * The Console frame — DESIGN_SPEC §1. Fixed 232px sidebar, 60px header, content
 * padded 16/32/32.
 *
 * Phase 1 renders V1 pages inside it unchanged, so those pages still draw their
 * own headings and padding; each page sheds them when it moves to V2. The frame
 * is light-only, as every mockup is — dark mode is unresolved for V2 and is a
 * decision for the Settings page in Phase 2.
 */
export function AppShellV2({ children }: { children: ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="relative min-h-screen bg-eb-bg text-eb-text">
      <a href="#main-content" className="skip-to-content">
        Skip to content
      </a>

      {/* Desktop rail */}
      <aside className="fixed bottom-0 left-0 top-0 z-40 hidden lg:block">
        <SidebarV2 />
      </aside>

      {/* Below lg the rail becomes a drawer, reached from the header. */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-[232px] border-0 bg-eb-sidebar p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">EchoBrief sections</SheetDescription>
          <SidebarV2 onNavigate={() => setMobileNavOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="min-h-screen lg:ml-[232px]">
        <HeaderV2 onMenuClick={() => setMobileNavOpen(true)} />
        <main id="main-content" key={location.pathname} className="px-5 pb-8 pt-4 md:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
